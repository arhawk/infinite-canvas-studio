import { BasePlugin, BaseTool } from "../core/baseClasses.js";
import { Konva } from "../lib/konva.js";

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
  };

  tools() {
    return [PenTool, PencilTool, HighlighterTool, EraserTool];
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

    this.listen("stroke:change", (stroke = {}) => {
      const { toolId } = stroke;
      if (!toolId || !this.toolStyles[toolId]) return;

      this.toolStyles[toolId] = {
        ...this.toolStyles[toolId],
        color: stroke.color ?? this.toolStyles[toolId].color,
        width: Number.isFinite(stroke.width) ? stroke.width : this.toolStyles[toolId].width,
        opacity: Number.isFinite(stroke.opacity) ? stroke.opacity : this.toolStyles[toolId].opacity,
      };
    });

    this.stage.on("mousedown.drawing touchstart.drawing", (event) => this.handlePointerDown(event));
    this.stage.on("mousemove.drawing touchmove.drawing", (event) => this.handlePointerMove(event));
    this.stage.on("mouseup.drawing touchend.drawing touchcancel.drawing", () => this.handlePointerUp());
    this.cleanups.push(() => this.stage.off(".drawing"));
  }

  onModeEnter() {
    this.app.setCursorOverride("crosshair");
  }

  onModeChange() {
    this.app.setCursorOverride("crosshair");
  }

  onModeExit() {
    this.isDrawing = false;
    this.isErasing = false;
    this.currentLine = null;
    this.app.clearCursorOverride();
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

  getDrawableTarget(target = null) {
    const candidate = target?.findAncestor?.(".drawable", true) ?? target;
    if (candidate?.hasName?.("drawable")) {
      return candidate;
    }

    const pointer = this.stage.getPointerPosition();
    if (!pointer) return null;

    const intersected = this.stage.getIntersection(pointer);
    const hovered = intersected?.findAncestor?.(".drawable", true) ?? intersected;
    return hovered?.hasName?.("drawable") ? hovered : null;
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

  handlePointerDown(event) {
    if (this.isDrawingActive()) {
      if (!this.canStartDrawing(event.target)) return;
      const point = this.pointerToCanvas();
      if (!point) return;

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
        globalCompositeOperation: "source-over",
      });
      this.layer.add(this.currentLine);
      return;
    }

    if (!this.isEraserActive()) return;

    this.isErasing = true;
    this.eraseDrawable(this.getDrawableTarget(event.target));
  }

  handlePointerMove(event) {
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
    this.eraseDrawable(this.getDrawableTarget(event?.target));
  }

  handlePointerUp() {
    const finishedLine = this.currentLine;
    this.isDrawing = false;
    this.isErasing = false;
    this.currentLine = null;
    if (finishedLine) {
      this.layer.batchDraw();
      this.app.events.emit("draw:added", { node: finishedLine });
    }
  }
}
