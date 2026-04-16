import { BasePlugin, BaseTool } from "../core/baseClasses.js";
import { Konva } from "../lib/konva.js";
import { renderIcons } from "../lib/icons.js";

/**
 * AnnotatorPlugin — One-line diagram annotator (2.5)
 *
 * ════════════════════════════════════════════════
 *  HOW IT DIFFERS FROM 2.2 DrawingPlugin
 * ════════════════════════════════════════════════
 *
 *  2.2 DrawingPlugin        │  2.5 AnnotatorPlugin
 *  ─────────────────────────┼──────────────────────────────
 *  Draw anywhere on canvas  │  Only works ON a content node
 *  Free brush strokes       │  Structured marks only
 *  Pen/Pencil/Highlighter   │  Underline/Highlight/Circle/Arrow
 *  Eraser removes strokes   │  Eraser removes annotations only
 *
 * ════════════
 *  WORKFLOW
 * ════════════
 *  1. Click the annotator toolbar button to enter annotator mode.
 *  2. Choose Shape + Color + Width.
 *  3. Click-drag directly ON a Page / Text / Sticky / Container node.
 *     → The annotation attaches to whatever node is under the pointer.
 *     → Dragging on empty canvas does nothing.
 *  4. Switch Shape to "🧹 Eraser" → click an annotation to delete it.
 *  5. "Clear" removes all annotations at once.
 *  6. Click the button again or switch to another tool to exit.
 */

// ─── Tool registrations ──────────────────────────────────────────────────────

class AnnotateTool extends BaseTool {
  static toolId = "annotate";
  static label  = "Annotate";
}

class AnnotateEraserTool extends BaseTool {
  static toolId = "annotate-eraser";
  static label  = "Annotation Eraser";
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function generateWavyPoints(x1, y1, x2, y2, amplitude, frequency) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy);
  if (len < 1) return [x1, y1, x2, y2];
  const steps = Math.max(2, Math.floor(len / frequency));
  const nx = -dy / len;
  const ny =  dx / len;
  const pts = [];
  for (let i = 0; i <= steps; i++) {
    const t    = i / steps;
    const wave = Math.sin(t * Math.PI * 2 * (len / frequency)) * amplitude;
    pts.push(x1 + dx * t + nx * wave, y1 + dy * t + ny * wave);
  }
  return pts;
}

/**
 * Find the topmost content node under the pointer position (canvas coords).
 * Walks up from the Konva event target to find a "selectable" node.
 */
function getNodeUnderPointer(eventTarget) {
  if (!eventTarget) return null;
  // Stage itself = empty canvas
  if (eventTarget.getType?.() === "Stage") return null;
  // Walk up to find a selectable node
  let node = eventTarget;
  while (node) {
    if (node.hasName?.("selectable")) return node;
    node = node.getParent?.() ?? null;
  }
  return null;
}

// ─── Plugin ───────────────────────────────────────────────────────────────────

export class AnnotatorPlugin extends BasePlugin {
  static pluginId = "annotator";

  static modes = {
    edit: {
      tools: {
        "annotate":        {},
        "annotate-eraser": {},
      },
    },
  };

  tools() {
    return [AnnotateTool, AnnotateEraserTool];
  }

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

    this.isDrawing    = false;
    this.currentShape = null;
    this.startPoint   = null;

    // Dedicated annotation layer — above everything else.
    this.annotLayer = new Konva.Layer({ listening: true });
    this.app.stage.add(this.annotLayer);

    // Status hint label
    this._statusEl = document.createElement("span");
    this._statusEl.style.cssText =
      "font-size:11px;opacity:0.6;margin-left:6px;white-space:nowrap;";
    this._statusEl.textContent = "Draw on any node";
    controlsEl.appendChild(this._statusEl);

    renderIcons(toggleEl, { width: 18, height: 18, "stroke-width": 2 });

    // Toolbar button → toggle annotate tool
    this.listenDom(toggleEl, "click", () => {
      const current = this.app.getEditorTool();
      if (current === "annotate" || current === "annotate-eraser") {
        this.app.setEditorTool("arrange");
      } else {
        this.app.setEditorTool("annotate");
      }
    });

    // Width slider sync
    this.listenDom(widthEl, "input", () => {
      widthValueEl.value = widthEl.value;
    });

    // Clear all annotations
    this.listenDom(clearEl, "click", () => {
      this.annotLayer.destroyChildren();
      this.annotLayer.batchDraw();
    });

    // Shape selector: switch between annotate / annotate-eraser
    this.listenDom(shapeEl, "change", () => {
      if (!this._isAnnotatorActive()) return;
      if (shapeEl.value === "eraser") {
        this.app.setEditorTool("annotate-eraser");
      } else {
        this.app.setEditorTool("annotate");
      }
    });

    // React to tool changes
    this.listen("tool:change",        () => this._syncUi());
    this.listen("interaction:change", () => this._syncUi());

    // Stage pointer events
    this.app.stage.on(
      "mousedown.annotator touchstart.annotator",
      (e) => this._onPointerDown(e),
    );
    this.app.stage.on(
      "mousemove.annotator touchmove.annotator",
      () => this._onPointerMove(),
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

  onModeEnter() {
    this.annotLayer.listening(true);
    this._syncUi();
    this._applyCursor();
  }

  onModeChange() {
    this._syncUi();
    this._applyCursor();
  }

  onModeExit() {
    this.isDrawing    = false;
    this.currentShape = null;
    this.startPoint   = null;
    this.annotLayer.listening(false);
    this.app.clearCursorOverride();
    this._syncUi();
  }

  // ─── State ────────────────────────────────────────────────────────────────

  _isAnnotatorActive() {
    const t = this.app.getEditorTool();
    return t === "annotate" || t === "annotate-eraser";
  }

  _isEraserActive() {
    return this.app.getEditorTool() === "annotate-eraser";
  }

  _syncUi() {
    const { toggleEl, controlsEl, shapeEl } = this.ui;
    const active = this._isAnnotatorActive();

    toggleEl.setAttribute("aria-pressed", String(active));
    toggleEl.classList.toggle("is-active", active);
    controlsEl.hidden = !active;

    if (active) {
      // Sync shape dropdown to current tool
      if (this._isEraserActive() && shapeEl.value !== "eraser") {
        shapeEl.value = "eraser";
      } else if (!this._isEraserActive() && shapeEl.value === "eraser") {
        shapeEl.value = "highlight";
      }
      this._applyCursor();
    }
  }

  _applyCursor() {
    if (!this._isAnnotatorActive()) {
      this.app.clearCursorOverride();
      return;
    }
    this.app.setCursorOverride(this._isEraserActive() ? "pointer" : "crosshair");
  }

  // ─── Options ─────────────────────────────────────────────────────────────

  _getOptions() {
    const { colorEl, shapeEl, widthEl } = this.ui;
    return {
      color : colorEl.value,
      shape : shapeEl.value,
      width : Number(widthEl.value),
    };
  }

  _pointerToCanvas() {
    const pointer = this.app.stage.getPointerPosition();
    if (!pointer) return null;
    return this.app.stageApi.screenToCanvas(pointer);
  }

  // ─── Pointer handlers ────────────────────────────────────────────────────

  _onPointerDown(event) {
    if (!this._isAnnotatorActive()) return;
    if (event.evt.button != null && event.evt.button !== 0) return;

    // ── Eraser: delete clicked annotation ──
    if (this._isEraserActive()) {
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

    // ── Draw: check pointer is over a content node ──
    const contentNode = getNodeUnderPointer(event.target);
    if (!contentNode) {
      // Clicked on empty canvas — ignore
      return;
    }

    const point = this._pointerToCanvas();
    if (!point) return;

    this.isDrawing    = true;
    this.startPoint   = point;
    this.currentShape = this._createShape(point, point);
    if (this.currentShape) {
      this.annotLayer.add(this.currentShape);
      this.annotLayer.batchDraw();
    }
    event.cancelBubble = true;
  }

  _onPointerMove() {
    if (!this._isAnnotatorActive() || !this.isDrawing || !this.currentShape || !this.startPoint) return;
    const point = this._pointerToCanvas();
    if (!point) return;
    this._updateShape(this.currentShape, this.startPoint, point);
    this.annotLayer.batchDraw();
  }

  _onPointerUp() {
    if (!this._isAnnotatorActive() || !this.isDrawing) return;
    // Discard tiny accidental marks (< 5 screen-px)
    if (this.currentShape && this.startPoint) {
      const ptr   = this._pointerToCanvas();
      const scale = this.app.stageApi.getScale();
      if (ptr) {
        const dist =
          Math.hypot(ptr.x - this.startPoint.x, ptr.y - this.startPoint.y) * scale;
        if (dist < 5) {
          this.currentShape.destroy();
          this.annotLayer.batchDraw();
        }
      }
    }
    this.isDrawing    = false;
    this.currentShape = null;
    this.startPoint   = null;
  }

  // ─── Shape factory ───────────────────────────────────────────────────────

  _createShape(start, end) {
    const { color, shape, width } = this._getOptions();
    const scale = this.app.stageApi.getScale();
    const sw    = width / scale;
    const hitSw = Math.max(sw, 12 / scale);

    switch (shape) {
      case "highlight":
        return new Konva.Rect({
          x: start.x, y: start.y,
          width:  end.x - start.x,
          height: Math.max(sw * 4, 20 / scale),
          fill: color, opacity: 0.35,
          listening: true, name: "annotation",
        });

      case "straight":
        return new Konva.Line({
          points: [start.x, start.y, end.x, end.y],
          stroke: color, strokeWidth: sw, lineCap: "round",
          hitStrokeWidth: hitSw, listening: true, name: "annotation",
        });

      case "wavy":
        return new Konva.Line({
          points: generateWavyPoints(
            start.x, start.y, end.x, end.y, 6 / scale, 20 / scale,
          ),
          stroke: color, strokeWidth: sw,
          lineCap: "round", lineJoin: "round", tension: 0.4,
          hitStrokeWidth: hitSw, listening: true, name: "annotation",
        });

      case "dashed":
        return new Konva.Line({
          points: [start.x, start.y, end.x, end.y],
          stroke: color, strokeWidth: sw,
          dash: [10 / scale, 6 / scale], lineCap: "round",
          hitStrokeWidth: hitSw, listening: true, name: "annotation",
        });

      case "circle":
        return new Konva.Ellipse({
          x: (start.x + end.x) / 2,
          y: (start.y + end.y) / 2,
          radiusX: Math.abs(end.x - start.x) / 2,
          radiusY: Math.abs(end.y - start.y) / 2,
          stroke: color, strokeWidth: sw, fill: "transparent",
          hitStrokeWidth: hitSw, listening: true, name: "annotation",
        });

      case "arrow": {
        const group = new Konva.Group({ listening: true, name: "annotation" });
        const line  = new Konva.Arrow({
          points: [start.x, start.y, end.x, end.y],
          stroke: color, fill: color, strokeWidth: sw,
          pointerLength: 10 / scale, pointerWidth: 8 / scale,
          lineCap: "round",
          hitStrokeWidth: hitSw, listening: true,
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
    const sw    = width / scale;

    switch (shapeType) {
      case "highlight":
        shape.setAttrs({
          x:      Math.min(start.x, end.x),
          y:      start.y,
          width:  Math.abs(end.x - start.x),
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
          x:       (start.x + end.x) / 2,
          y:       (start.y + end.y) / 2,
          radiusX: Math.abs(end.x - start.x) / 2,
          radiusY: Math.abs(end.y - start.y) / 2,
        });
        break;
      case "arrow":
        if (shape._line) {
          shape._line.points([start.x, start.y, end.x, end.y]);
          shape._line.strokeWidth(sw);
          shape._line.pointerLength(10 / scale);
          shape._line.pointerWidth(8  / scale);
        }
        break;
    }
  }
}
