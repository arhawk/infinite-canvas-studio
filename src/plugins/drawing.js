import { BasePlugin, BaseTool } from "../core/baseClasses.js";
import { Konva } from "../lib/konva.js";

class BrushTool extends BaseTool {
  static toolId = "brush";
  static label = "Brush";
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
        brush: {},
        eraser: {},
      },
    },
  };

  tools() {
    return [BrushTool, EraserTool];
  }

  onSetup() {
    this.stage = this.app.stage;
    this.layer = this.app.drawLayer;
    this.currentLine = null;
    this.isDrawing = false;
    this.isErasing = false;
    this.stroke = { color: "#1f6feb", width: 4 };

    this.listen("stroke:change", (stroke) => {
      this.stroke = stroke;
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

  isBrushActive() {
    return this.isEnabled() && this.app.getEditorTool() === "brush";
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
    if (this.isBrushActive()) {
      if (!this.canStartDrawing(event.target)) return;
      const point = this.pointerToCanvas();
      if (!point) return;

      this.isDrawing = true;
      this.currentLine = new Konva.Line({
        points: [point.x, point.y],
        stroke: this.stroke.color,
        strokeWidth: this.stroke.width,
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
    if (this.isBrushActive()) {
      if (!this.isDrawing || !this.currentLine) return;
      const point = this.pointerToCanvas();
      if (!point) return;
      this.currentLine.points([...this.currentLine.points(), point.x, point.y]);
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
