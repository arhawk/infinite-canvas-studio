import { BasePlugin, BaseTool } from "../core/baseClasses.js";
import { Konva } from "../lib/konva.js";

class BrushTool extends BaseTool {
  static toolId = "brush";
  static label = "Brush";
}

export class DrawingPlugin extends BasePlugin {
  static pluginId = "drawing";
  static modes = {
    edit: {
      tools: {
        brush: {},
      },
    },
  };

  tools() {
    return [BrushTool];
  }

  onSetup() {
    this.stage = this.app.stage;
    this.layer = this.app.drawLayer;
    this.currentLine = null;
    this.isDrawing = false;
    this.stroke = { color: "#1f6feb", width: 4 };

    this.listen("stroke:change", (stroke) => {
      this.stroke = stroke;
    });

    this.stage.on("mousedown.drawing touchstart.drawing", (event) => this.handlePointerDown(event));
    this.stage.on("mousemove.drawing touchmove.drawing", () => this.handlePointerMove());
    this.stage.on("mouseup.drawing touchend.drawing", () => this.handlePointerUp());
    this.cleanups.push(() => this.stage.off(".drawing"));
  }

  onModeEnter() {
    this.app.setCursorOverride("crosshair");
  }

  onModeExit() {
    this.isDrawing = false;
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

  handlePointerDown(event) {
    if (!this.isEnabled() || !this.canStartDrawing(event.target)) return;
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
  }

  handlePointerMove() {
    if (!this.isEnabled() || !this.isDrawing || !this.currentLine) return;
    const point = this.pointerToCanvas();
    if (!point) return;
    this.currentLine.points([...this.currentLine.points(), point.x, point.y]);
    this.layer.batchDraw();
  }

  handlePointerUp() {
    const finishedLine = this.currentLine;
    this.isDrawing = false;
    this.currentLine = null;
    if (finishedLine) {
      this.layer.batchDraw();
      this.app.events.emit("draw:added", { node: finishedLine });
    }
  }
}
