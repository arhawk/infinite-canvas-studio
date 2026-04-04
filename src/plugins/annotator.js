import { BasePlugin } from "../core/baseClasses.js";
import { Konva } from "../lib/konva.js";
import { renderIcons } from "../lib/icons.js";

/**
 * AnnotatorPlugin — One-line diagram annotator
 *
 * Features:
 * - highlight: semi-transparent color block for text highlighting
 * - straight: plain straight line
 * - wavy: wavy line effect
 * - dashed: dashed line
 * - circle: ellipse outline
 * - arrow: line with arrowhead
 *
 * Toggle via the highlighter toolbar button. Does not affect existing canvas modes.
 * Clear all annotations with the "Clear" button.
 */

function generateWavyPoints(x1, y1, x2, y2, amplitude = 6, frequency = 20) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy);
  const steps = Math.max(2, Math.floor(len / frequency));
  const nx = -dy / len;
  const ny = dx / len;
  const points = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const wave = Math.sin(t * Math.PI * 2 * (len / frequency)) * amplitude;
    points.push(x1 + dx * t + nx * wave, y1 + dy * t + ny * wave);
  }
  return points;
}

export class AnnotatorPlugin extends BasePlugin {
  static pluginId = "annotator";

  onSetup() {
    const {
      toggleEl,
      controlsEl,
      colorEl,
      shapeEl,
      widthEl,
      widthValueEl,
      clearEl,
    } = this.options;

    this.ui = { toggleEl, controlsEl, colorEl, shapeEl, widthEl, widthValueEl, clearEl };
    this.isActive = false;
    this.isDrawing = false;
    this.currentShape = null;
    this.startPoint = null;

    // Dedicated Konva layer for annotations (above everything)
    this.annotLayer = new Konva.Layer({ listening: false });
    this.app.stage.add(this.annotLayer);

    renderIcons(toggleEl, { width: 18, height: 18, "stroke-width": 2 });

    // Toggle annotator on/off
    this.listenDom(toggleEl, "click", () => this.toggle());

    // Sync width output
    this.listenDom(widthEl, "input", () => {
      widthValueEl.value = widthEl.value;
    });

    // Clear all annotations
    this.listenDom(clearEl, "click", () => {
      this.annotLayer.destroyChildren();
      this.annotLayer.batchDraw();
    });

    // Drawing events on the Konva stage
    this.app.stage.on("mousedown.annotator touchstart.annotator", (e) =>
      this.handlePointerDown(e),
    );
    this.app.stage.on("mousemove.annotator touchmove.annotator", (e) =>
      this.handlePointerMove(e),
    );
    this.app.stage.on(
      "mouseup.annotator touchend.annotator touchcancel.annotator",
      () => this.handlePointerUp(),
    );

    this.cleanups.push(() => {
      this.app.stage.off(".annotator");
      this.annotLayer.destroy();
    });

    this.syncUi();
  }

  toggle() {
    this.isActive = !this.isActive;
    this.syncUi();
  }

  syncUi() {
    const { toggleEl, controlsEl } = this.ui;
    toggleEl.setAttribute("aria-pressed", String(this.isActive));
    toggleEl.classList.toggle("is-active", this.isActive);
    controlsEl.hidden = !this.isActive;

    // Change cursor when annotator is on
    if (this.isActive) {
      this.app.setCursorOverride("crosshair");
    } else {
      this.app.clearCursorOverride();
    }
  }

  getOptions() {
    const { colorEl, shapeEl, widthEl } = this.ui;
    return {
      color: colorEl.value,
      shape: shapeEl.value,
      width: Number(widthEl.value),
    };
  }

  pointerToCanvas() {
    const pointer = this.app.stage.getPointerPosition();
    if (!pointer) return null;
    return this.app.stageApi.screenToCanvas(pointer);
  }

  handlePointerDown(event) {
    if (!this.isActive) return;
    // Only left mouse / touch
    if (event.evt.button != null && event.evt.button !== 0) return;

    const point = this.pointerToCanvas();
    if (!point) return;

    this.isDrawing = true;
    this.startPoint = point;
    this.currentShape = this.createShape(point, point);
    if (this.currentShape) {
      this.annotLayer.add(this.currentShape);
      this.annotLayer.batchDraw();
    }

    // Suppress stage drag while annotating
    event.cancelBubble = true;
  }

  handlePointerMove() {
    if (!this.isActive || !this.isDrawing || !this.currentShape || !this.startPoint) return;
    const point = this.pointerToCanvas();
    if (!point) return;

    this.updateShape(this.currentShape, this.startPoint, point);
    this.annotLayer.batchDraw();
  }

  handlePointerUp() {
    if (!this.isActive || !this.isDrawing) return;
    this.isDrawing = false;
    this.currentShape = null;
    this.startPoint = null;
  }

  createShape(start, end) {
    const { color, shape, width } = this.getOptions();
    const scale = this.app.stageApi.getScale();
    const scaledWidth = width / scale;

    switch (shape) {
      case "highlight":
        return new Konva.Rect({
          x: start.x,
          y: start.y,
          width: end.x - start.x,
          height: Math.max(scaledWidth * 4, 20 / scale),
          fill: color,
          opacity: 0.35,
          listening: false,
        });

      case "straight":
        return new Konva.Line({
          points: [start.x, start.y, end.x, end.y],
          stroke: color,
          strokeWidth: scaledWidth,
          lineCap: "round",
          listening: false,
        });

      case "wavy":
        return new Konva.Line({
          points: generateWavyPoints(start.x, start.y, end.x, end.y, 6 / scale, 20 / scale),
          stroke: color,
          strokeWidth: scaledWidth,
          lineCap: "round",
          lineJoin: "round",
          tension: 0.4,
          listening: false,
        });

      case "dashed":
        return new Konva.Line({
          points: [start.x, start.y, end.x, end.y],
          stroke: color,
          strokeWidth: scaledWidth,
          dash: [10 / scale, 6 / scale],
          lineCap: "round",
          listening: false,
        });

      case "circle":
        return new Konva.Ellipse({
          x: (start.x + end.x) / 2,
          y: (start.y + end.y) / 2,
          radiusX: Math.abs(end.x - start.x) / 2,
          radiusY: Math.abs(end.y - start.y) / 2,
          stroke: color,
          strokeWidth: scaledWidth,
          fill: "transparent",
          listening: false,
        });

      case "arrow": {
        const group = new Konva.Group({ listening: false });
        const line = new Konva.Arrow({
          points: [start.x, start.y, end.x, end.y],
          stroke: color,
          fill: color,
          strokeWidth: scaledWidth,
          pointerLength: 10 / scale,
          pointerWidth: 8 / scale,
          lineCap: "round",
          listening: false,
        });
        group.add(line);
        group._annotatorType = "arrow";
        group._line = line;
        return group;
      }

      default:
        return null;
    }
  }

  updateShape(shape, start, end) {
    const { color, shape: shapeType, width } = this.getOptions();
    const scale = this.app.stageApi.getScale();
    const scaledWidth = width / scale;

    switch (shapeType) {
      case "highlight":
        shape.setAttrs({
          x: Math.min(start.x, end.x),
          y: start.y,
          width: Math.abs(end.x - start.x),
          height: Math.max(scaledWidth * 4, 20 / scale),
        });
        break;

      case "straight":
      case "dashed":
        shape.points([start.x, start.y, end.x, end.y]);
        break;

      case "wavy":
        shape.points(
          generateWavyPoints(start.x, start.y, end.x, end.y, 6 / scale, 20 / scale),
        );
        break;

      case "circle":
        shape.setAttrs({
          x: (start.x + end.x) / 2,
          y: (start.y + end.y) / 2,
          radiusX: Math.abs(end.x - start.x) / 2,
          radiusY: Math.abs(end.y - start.y) / 2,
        });
        break;

      case "arrow":
        if (shape._line) {
          shape._line.points([start.x, start.y, end.x, end.y]);
          shape._line.strokeWidth(scaledWidth);
          shape._line.pointerLength(10 / scale);
          shape._line.pointerWidth(8 / scale);
        }
        break;
    }
  }
}
