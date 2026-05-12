import { BaseCommand, BasePlugin, BaseTool } from "../core/baseClasses.js";
import { Konva } from "../lib/konva.js";

function distanceToSegment(point, start, end) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSq = dx * dx + dy * dy;

  if (lengthSq === 0) {
    return Math.hypot(point.x - start.x, point.y - start.y);
  }

  let t = ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSq;
  t = Math.max(0, Math.min(1, t));

  const projX = start.x + t * dx;
  const projY = start.y + t * dy;
  return Math.hypot(point.x - projX, point.y - projY);
}

function isPointNearLine(point, linePoints, radius) {
  if (!Array.isArray(linePoints) || linePoints.length < 2) return false;

  if (linePoints.length === 2) {
    return Math.hypot(point.x - linePoints[0], point.y - linePoints[1]) <= radius;
  }

  for (let index = 0; index < linePoints.length - 2; index += 2) {
    const start = {
      x: linePoints[index],
      y: linePoints[index + 1],
    };
    const end = {
      x: linePoints[index + 2],
      y: linePoints[index + 3],
    };

    if (distanceToSegment(point, start, end) <= radius) {
      return true;
    }
  }

  return false;
}

class PenTool extends BaseTool {
  static toolId = "pen";
  static label = "Pen";
}

class PencilTool extends BaseTool {
  static toolId = "pencil";
  static label = "Pencil";
}

class HighlighterTool extends BaseTool {
  static toolId = "highlighter";
  static label = "Highlighter";
}

class EraserTool extends BaseTool {
  static toolId = "eraser";
  static label = "Erase Stroke";
}

class ClearStrokesCommand extends BaseCommand {
  static commandId = "drawing:clear-strokes";
  static label = "Clear All Strokes";
  static modes = {
    edit: {
      tools: {
        eraser: {},
      },
    },
    presentation: {},
  };

  execute() {
    return this.plugin.clearAllDrawings();
  }
}

export class DrawingPlugin extends BasePlugin {
  static pluginId = "drawing";
  static modes = {
    edit: {
      tools: {
        pen: {},
        pencil: {},
        highlighter: {},
        eraser: {},
      },
    },
    presentation: {},
  };

  tools() {
    return [PenTool, PencilTool, HighlighterTool, EraserTool];
  }

  commands() {
    return [ClearStrokesCommand];
  }

  onSetup() {
    this.stage = this.app.stage;
    this.layer = this.app.drawLayer;
    this.currentLine = null;
    this.isDrawing = false;
    this.isErasing = false;
    this.toolStyles = {
      pen: {
        color: "#1f6feb",
        width: 4,
        opacity: 1,
      },
      pencil: {
        color: "#4a4a4a",
        width: 3,
        opacity: 0.55,
      },
      highlighter: {
        color: "#f6d32d",
        width: 16,
        opacity: 0.25,
      },
    };
    this.eraserStyle = {
      radius: 12,
    };

    this.listen("stroke:change", (stroke = {}) => {
      const { toolId } = stroke;

      if (toolId === "eraser") {
        this.eraserStyle.radius = Number.isFinite(stroke.radius)
          ? stroke.radius
          : this.eraserStyle.radius;
        this.updateEraserPreview();
        return;
      }

      if (!toolId || !this.toolStyles[toolId]) return;

      this.toolStyles[toolId] = {
        ...this.toolStyles[toolId],
        color: stroke.color ?? this.toolStyles[toolId].color,
        width: Number.isFinite(stroke.width) ? stroke.width : this.toolStyles[toolId].width,
        opacity: Number.isFinite(stroke.opacity) ? stroke.opacity : this.toolStyles[toolId].opacity,
      };
    });
    this.listen("interaction:change", () => {
      this.syncCursorOverride();
      this.syncEraserPreviewVisibility();
      this.updateEraserPreview();
    });

    this.stage.on("mousedown.drawing touchstart.drawing", (event) => this.handlePointerDown(event));
    this.stage.on("mousemove.drawing touchmove.drawing", (event) => this.handlePointerMove(event));
    this.stage.on("mouseup.drawing touchend.drawing touchcancel.drawing", () => this.handlePointerUp());

    this.eraserPreview = new Konva.Circle({
      visible: false,
      listening: false,
      stroke: "rgba(215, 97, 47, 0.95)",
      fill: "rgba(215, 97, 47, 0.12)",
      dash: [6, 4],
    });
    this.app.overlayLayer.add(this.eraserPreview);

    this.cleanups.push(() => {
      this.stage.off(".drawing");
      this.eraserPreview?.destroy();
    });
  }

  onModeEnter() {
    this.syncCursorOverride();
    this.syncEraserPreviewVisibility();
    this.updateEraserPreview();
  }

  onModeChange() {
    this.syncCursorOverride();
    this.syncEraserPreviewVisibility();
    this.updateEraserPreview();
  }

  onModeExit() {
    this.isDrawing = false;
    this.isErasing = false;
    this.currentLine = null;
    if (this.eraserPreview) {
      this.eraserPreview.visible(false);
      this.app.overlayLayer.batchDraw();
    }
    this.app.clearCursorOverride();
  }

  syncCursorOverride() {
    const shouldUseCrosshair = this.isDrawingActive() || this.isEraserActive();
    if (shouldUseCrosshair) {
      this.app.setCursorOverride("crosshair");
      return;
    }

    if (this.app.cursorOverride === "crosshair") {
      this.app.clearCursorOverride();
    }
  }

  pointerToCanvas() {
    const pointer = this.stage.getPointerPosition();
    if (!pointer) return null;
    return this.app.stageApi.screenToCanvas(pointer);
  }

  canStartDrawing(target) {
    if (!target) return false;
    if (target === this.stage) return true;

    const layer = target.getLayer?.();
    return layer === this.app.mainLayer || layer === this.app.drawLayer;
  }

  getActiveDrawingToolId() {
    const toolId = this.app.getEditorTool();
    return ["pen", "pencil", "highlighter"].includes(toolId) ? toolId : null;
  }

  isDrawingActive() {
    return this.isEnabled() && Boolean(this.getActiveDrawingToolId());
  }

  getActiveToolStyle() {
    const toolId = this.getActiveDrawingToolId();
    if (!toolId) return null;
    return this.toolStyles[toolId] ?? null;
  }

  getPointWithToolEffect(point) {
    const toolId = this.getActiveDrawingToolId();
    if (!point) return null;

    if (toolId === "pencil") {
      const jitterAmount = 1;
      return {
        x: point.x + (Math.random() - 0.5) * jitterAmount,
        y: point.y + (Math.random() - 0.5) * jitterAmount,
      };
    }

    return point;
  }

  isEraserActive() {
    return this.isEnabled() && this.app.getEditorTool() === "eraser";
  }

  getActiveEraserRadius() {
    return this.eraserStyle.radius ?? 12;
  }

  isPointNearDrawable(point, drawable) {
    if (!point || !drawable?.hasName?.("drawable")) return false;

    const hitRadius =
      this.getActiveEraserRadius() + (drawable.strokeWidth?.() ?? 0) / 2;

    return isPointNearLine(point, drawable.points?.() ?? [], hitRadius);
  }

  getDrawableNearPoint(point) {
    if (!point) return null;

    const drawables = this.layer.find(".drawable");
    for (let index = drawables.length - 1; index >= 0; index -= 1) {
      const drawable = drawables[index];
      if (this.isPointNearDrawable(point, drawable)) {
        return drawable;
      }
    }

    return null;
  }

  syncEraserPreviewVisibility() {
    if (!this.eraserPreview) return;

    this.eraserPreview.visible(this.isEraserActive());
    this.app.overlayLayer.batchDraw();
  }

  updateEraserPreview() {
    if (!this.eraserPreview) return;

    if (!this.isEraserActive()) {
      this.eraserPreview.visible(false);
      this.app.overlayLayer.batchDraw();
      return;
    }

    const point = this.pointerToCanvas();
    if (!point) {
      this.eraserPreview.visible(false);
      this.app.overlayLayer.batchDraw();
      return;
    }

    const scale = this.app.stageApi.getScale();
    this.eraserPreview.position(point);
    this.eraserPreview.radius(this.getActiveEraserRadius());
    this.eraserPreview.strokeWidth(1 / scale);
    this.eraserPreview.dash([6 / scale, 4 / scale]);
    this.eraserPreview.visible(true);
    this.app.overlayLayer.batchDraw();
  }

  eraseDrawable(target) {
    if (!target?.hasName?.("drawable") || !target.getStage?.()) {
      return false;
    }

    this.app.events.emit("draw:removed", { node: target });
    target.destroy();
    this.layer.batchDraw();
    return true;
  }

  hasDrawings() {
    return this.layer.find(".drawable").length > 0;
  }

  clearAllDrawings() {
    const drawables = this.layer.find(".drawable");
    if (!drawables.length) return false;

    drawables.forEach((drawable) => {
      if (!drawable?.getStage?.()) return;
      this.app.events.emit("draw:removed", { node: drawable });
      drawable.destroy();
    });

    this.layer.batchDraw();
    return true;
  }

  isDrawLayerVisible() {
    return this.layer.visible();
  }

  setDrawLayerVisible(visible) {
    const nextVisible = visible !== false;
    this.layer.visible(nextVisible);
    this.layer.batchDraw();
    return nextVisible;
  }

  toggleDrawLayerVisibility() {
    return this.setDrawLayerVisible(!this.isDrawLayerVisible());
  }

  handlePointerDown(event) {
    if (this.isDrawingActive()) {
      if (!this.canStartDrawing(event.target)) return;
      const point = this.pointerToCanvas();
      if (!point) return;

      const toolId = this.getActiveDrawingToolId();
      const style = this.getActiveToolStyle();
      if (!style) return;

      const startPoint = this.getPointWithToolEffect(point);
      if (!startPoint) return;

      this.isDrawing = true;
      this.currentLine = new Konva.Line({
        points: [startPoint.x, startPoint.y],
        stroke: style.color,
        strokeWidth: style.width,
        opacity: style.opacity,
        lineCap: "round",
        lineJoin: "round",
        draggable: false,
        name: "drawable",
        drawingToolId: toolId,
        globalCompositeOperation: "source-over",
      });
      this.layer.add(this.currentLine);
      return;
    }

    if (!this.isEraserActive()) return;

    this.isErasing = true;
    const point = this.pointerToCanvas();
    this.eraseDrawable(this.getDrawableNearPoint(point));
  }

  handlePointerMove(event) {
    this.updateEraserPreview();

    if (this.isDrawingActive()) {
      if (!this.isDrawing || !this.currentLine) return;
      const point = this.pointerToCanvas();
      if (!point) return;

      const adjustedPoint = this.getPointWithToolEffect(point);
      if (!adjustedPoint) return;

      this.currentLine.points([
        ...this.currentLine.points(),
        adjustedPoint.x,
        adjustedPoint.y,
      ]);
      this.layer.batchDraw();
      return;
    }

    if (!this.isEraserActive() || !this.isErasing) return;
    const point = this.pointerToCanvas();
    this.eraseDrawable(this.getDrawableNearPoint(point));
  }

  handlePointerUp() {
    const finishedLine = this.currentLine;
    this.isDrawing = false;
    this.isErasing = false;
    this.currentLine = null;
    if (finishedLine) {
      this.layer.batchDraw();
      this.app.events.emit("draw:added", {
        node: finishedLine,
        toolId: finishedLine.getAttr("drawingToolId"),
        color: finishedLine.stroke(),
      });
    }
  }
}
