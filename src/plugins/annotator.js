import { BasePlugin } from "../core/baseClasses.js";
import { Konva } from "../lib/konva.js";
import { renderIcons } from "../lib/icons.js";

/**
 * AnnotatorPlugin — One-line diagram annotator (2.5)
 *
 * KEY DISTINCTION from 2.2 DrawingPlugin (freehand whiteboard):
 *   - 2.2: free brush strokes anywhere on canvas
 *   - 2.5: structured marks (underline, highlight, circle, arrow) that only
 *     start when the pointer is over a selectable content node (text, page,
 *     sticky, container…). Dragging on empty canvas does nothing.
 *
 * Shape modes:
 *   highlight  — semi-transparent colour block (text highlight)
 *   straight   — solid underline
 *   wavy       — wavy underline
 *   dashed     — dashed underline
 *   circle     — ellipse outline (encircle a word/phrase)
 *   arrow      — directional arrow
 *   eraser     — click an annotation to delete it (never affects canvas nodes)
 */

function generateWavyPoints(x1, y1, x2, y2, amplitude = 6, frequency = 20) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy);
  if (len < 1) return [x1, y1, x2, y2];
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

/** True when the Konva event target sits on a selectable content node. */
function isOverContentNode(target) {
  if (!target) return false;
  if (target.getType?.() === "Stage") return false;
  return Boolean(
    target.hasName?.("selectable") ||
    target.findAncestor?.(".selectable", true),
  );
}

export class AnnotatorPlugin extends BasePlugin {
  static pluginId = "annotator";

  onSetup() {
    const { toggleEl, controlsEl, colorEl, shapeEl, widthEl, widthValueEl, clearEl } =
      this.options;

    this.ui = { toggleEl, controlsEl, colorEl, shapeEl, widthEl, widthValueEl, clearEl };
    this.isActive = false;
    this.isDrawing = false;
    this.currentShape = null;
    this.startPoint = null;

    // Dedicated layer — above mainLayer/drawLayer.
    // listening:true so eraser can hit-test annotation shapes.
    this.annotLayer = new Konva.Layer({ listening: true });
    this.app.stage.add(this.annotLayer);

    renderIcons(toggleEl, { width: 18, height: 18, "stroke-width": 2 });

    this.listenDom(toggleEl, "click", () => this.toggle());

    // Escape exits annotator mode
    this.listenDom(window, "keydown", (e) => {
      if (e.key === "Escape" && this.isActive) this.deactivate();
    });

    this.listenDom(widthEl, "input", () => {
      widthValueEl.value = widthEl.value;
    });

    this.listenDom(shapeEl, "change", () => {
      if (this.isActive) this._applyCursor();
    });

    this.listenDom(clearEl, "click", () => {
      this.annotLayer.destroyChildren();
      this.annotLayer.batchDraw();
    });

    this.app.stage.on("mousedown.annotator touchstart.annotator", (e) =>
      this._onPointerDown(e),
    );
    this.app.stage.on("mousemove.annotator touchmove.annotator", () =>
      this._onPointerMove(),
    );
    this.app.stage.on(
      "mouseup.annotator touchend.annotator touchcancel.annotator",
      () => this._onPointerUp(),
    );

    this.cleanups.push(() => {
      this.app.stage.off(".annotator");
      this.annotLayer.destroy();
    });

    this._syncUi();
  }

  // ─── Activation ──────────────────────────────────────────────────────────

  toggle() {
    this.isActive ? this.deactivate() : this.activate();
  }

  activate() {
    this.isActive = true;
    this._syncUi();
  }

  deactivate() {
    this.isActive = false;
    this.isDrawing = false;
    this.currentShape = null;
    this.startPoint = null;
    this._syncUi();
  }

  _syncUi() {
    const { toggleEl, controlsEl } = this.ui;
    toggleEl.setAttribute("aria-pressed", String(this.isActive));
    toggleEl.classList.toggle("is-active", this.isActive);
    controlsEl.hidden = !this.isActive;
    if (this.isActive) {
      this._applyCursor();
      this.annotLayer.listening(true);
    } else {
      this.app.clearCursorOverride();
      this.annotLayer.listening(false);
    }
  }

  _applyCursor() {
    this.app.setCursorOverride(
      this.ui.shapeEl.value === "eraser" ? "pointer" : "crosshair",
    );
  }

  // ─── Options ─────────────────────────────────────────────────────────────

  _getOptions() {
    const { colorEl, shapeEl, widthEl } = this.ui;
    return {
      color: colorEl.value,
      shape: shapeEl.value,
      width: Number(widthEl.value),
    };
  }

  _pointerToCanvas() {
    const pointer = this.app.stage.getPointerPosition();
    if (!pointer) return null;
    return this.app.stageApi.screenToCanvas(pointer);
  }

  // ─── Pointer handlers ────────────────────────────────────────────────────

  _onPointerDown(event) {
    if (!this.isActive) return;
    if (event.evt.button != null && event.evt.button !== 0) return;

    const { shape } = this._getOptions();

    // ── Eraser mode ──
    if (shape === "eraser") {
      let node = event.target;
      while (node && node.getParent() !== this.annotLayer) {
        node = node.getParent?.() ?? null;
      }
      if (node && node !== this.annotLayer) {
        node.destroy();
        this.annotLayer.batchDraw();
      }
      event.cancelBubble = true;
      return;
    }

    // ── Draw mode: must start on a content node (text/page/sticky/…) ──
    if (!isOverContentNode(event.target)) return;

    const point = this._pointerToCanvas();
    if (!point) return;

    this.isDrawing = true;
    this.startPoint = point;
    this.currentShape = this._createShape(point, point);
    if (this.currentShape) {
      this.annotLayer.add(this.currentShape);
      this.annotLayer.batchDraw();
    }
    event.cancelBubble = true;
  }

  _onPointerMove() {
    if (!this.isActive || !this.isDrawing || !this.currentShape || !this.startPoint) return;
    const point = this._pointerToCanvas();
    if (!point) return;
    this._updateShape(this.currentShape, this.startPoint, point);
    this.annotLayer.batchDraw();
  }

  _onPointerUp() {
    if (!this.isActive || !this.isDrawing) return;
    // Discard tiny accidental marks (< 5 screen-px)
    if (this.currentShape && this.startPoint) {
      const ptr = this._pointerToCanvas();
      if (ptr) {
        const scale = this.app.stageApi.getScale();
        const dist =
          Math.hypot(ptr.x - this.startPoint.x, ptr.y - this.startPoint.y) * scale;
        if (dist < 5) {
          this.currentShape.destroy();
          this.annotLayer.batchDraw();
        }
      }
    }
    this.isDrawing = false;
    this.currentShape = null;
    this.startPoint = null;
  }

  // ─── Shape factory ───────────────────────────────────────────────────────

  _createShape(start, end) {
    const { color, shape, width } = this._getOptions();
    const scale = this.app.stageApi.getScale();
    const sw = width / scale;
    const hitSw = Math.max(sw, 12 / scale);

    switch (shape) {
      case "highlight":
        return new Konva.Rect({
          x: start.x,
          y: start.y,
          width: end.x - start.x,
          height: Math.max(sw * 4, 20 / scale),
          fill: color,
          opacity: 0.35,
          listening: true,
          name: "annotation",
        });

      case "straight":
        return new Konva.Line({
          points: [start.x, start.y, end.x, end.y],
          stroke: color,
          strokeWidth: sw,
          lineCap: "round",
          hitStrokeWidth: hitSw,
          listening: true,
          name: "annotation",
        });

      case "wavy":
        return new Konva.Line({
          points: generateWavyPoints(start.x, start.y, end.x, end.y, 6 / scale, 20 / scale),
          stroke: color,
          strokeWidth: sw,
          lineCap: "round",
          lineJoin: "round",
          tension: 0.4,
          hitStrokeWidth: hitSw,
          listening: true,
          name: "annotation",
        });

      case "dashed":
        return new Konva.Line({
          points: [start.x, start.y, end.x, end.y],
          stroke: color,
          strokeWidth: sw,
          dash: [10 / scale, 6 / scale],
          lineCap: "round",
          hitStrokeWidth: hitSw,
          listening: true,
          name: "annotation",
        });

      case "circle":
        return new Konva.Ellipse({
          x: (start.x + end.x) / 2,
          y: (start.y + end.y) / 2,
          radiusX: Math.abs(end.x - start.x) / 2,
          radiusY: Math.abs(end.y - start.y) / 2,
          stroke: color,
          strokeWidth: sw,
          fill: "transparent",
          hitStrokeWidth: hitSw,
          listening: true,
          name: "annotation",
        });

      case "arrow": {
        const group = new Konva.Group({ listening: true, name: "annotation" });
        const line = new Konva.Arrow({
          points: [start.x, start.y, end.x, end.y],
          stroke: color,
          fill: color,
          strokeWidth: sw,
          pointerLength: 10 / scale,
          pointerWidth: 8 / scale,
          lineCap: "round",
          hitStrokeWidth: hitSw,
          listening: true,
        });
        group.add(line);
        group._line = line;
        return group;
      }

      default:
        return null;
    }
  }

  // ─── Shape updater ───────────────────────────────────────────────────────

  _updateShape(shape, start, end) {
    const { shape: shapeType, width } = this._getOptions();
    const scale = this.app.stageApi.getScale();
    const sw = width / scale;

    switch (shapeType) {
      case "highlight":
        shape.setAttrs({
          x: Math.min(start.x, end.x),
          y: start.y,
          width: Math.abs(end.x - start.x),
          height: Math.max(sw * 4, 20 / scale),
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
          shape._line.strokeWidth(sw);
          shape._line.pointerLength(10 / scale);
          shape._line.pointerWidth(8 / scale);
        }
        break;
    }
  }
}
