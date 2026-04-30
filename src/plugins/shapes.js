import { BasePlugin, BaseTool } from "../core/baseClasses.js";
import {
  DEFAULT_SHAPE_FILL,
  DEFAULT_SHAPE_FILL_OPACITY,
  DEFAULT_SHAPE_LINE_HEIGHT,
  DEFAULT_SHAPE_STROKE,
  MIN_SHAPE_HEIGHT,
  MIN_SHAPE_LINE_HEIGHT,
  MIN_SHAPE_WIDTH,
  applyShapeStyle,
  normalizeShapeType,
} from "../component/shape.js";

const DRAG_THRESHOLD = 4;

class ShapeTool extends BaseTool {
  static toolId = "shape";
  static label = "Shape";
}

function normalizePoint(value = {}) {
  return {
    x: Number.isFinite(value.x) ? value.x : 0,
    y: Number.isFinite(value.y) ? value.y : 0,
  };
}

function radiansToDegrees(value) {
  return value * (180 / Math.PI);
}

function isTransformerTarget(target) {
  let node = target;
  while (node) {
    if (node.getClassName?.() === "Transformer" || node.hasName?.("_anchor")) {
      return true;
    }
    node = node.getParent?.();
  }
  return false;
}

function getShapeBounds(startPoint, endPoint, {
  shapeType,
  constrain = false,
  style = {},
} = {}) {
  const start = normalizePoint(startPoint);
  const end = normalizePoint(endPoint);
  const normalizedType = normalizeShapeType(shapeType);
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const dragDistance = Math.hypot(dx, dy);

  if (dragDistance < DRAG_THRESHOLD) {
    return null;
  }

  if (normalizedType === "line") {
    const lineHeight = Math.max(
      MIN_SHAPE_LINE_HEIGHT,
      Number.isFinite(style.height) ? style.height : DEFAULT_SHAPE_LINE_HEIGHT,
    );

    const angle = Math.atan2(dy, dx);
    const offsetX = -Math.sin(angle) * lineHeight / 2;
    const offsetY = Math.cos(angle) * lineHeight / 2;

    return {
      x: start.x - offsetX,
      y: start.y - offsetY,
      width: Math.max(MIN_SHAPE_WIDTH, dragDistance),
      height: lineHeight,
      rotation: radiansToDegrees(angle),
    };
  }

  let width = Math.abs(dx);
  let height = Math.abs(dy);
  let x = Math.min(start.x, end.x);
  let y = Math.min(start.y, end.y);

  if (constrain) {
    const size = Math.max(width, height);
    width = size;
    height = size;
    x = dx < 0 ? start.x - size : start.x;
    y = dy < 0 ? start.y - size : start.y;
  }

  return {
    x,
    y,
    width: Math.max(MIN_SHAPE_WIDTH, width),
    height: Math.max(MIN_SHAPE_HEIGHT, height),
    rotation: 0,
  };
}

export class ShapesPlugin extends BasePlugin {
  static pluginId = "shapes";
  static modes = {
    edit: {
      tools: {
        shape: {},
      },
    },
  };

  tools() {
    return [ShapeTool];
  }

  onSetup() {
    this.stage = this.app.stage;
    this.previewNode = null;
    this.isDrawing = false;
    this.startPoint = null;
    this.currentPoint = null;
    this.startTarget = null;
    this.style = {
      shapeType: "rectangle",
      fill: DEFAULT_SHAPE_FILL,
      fillOpacity: DEFAULT_SHAPE_FILL_OPACITY,
      stroke: DEFAULT_SHAPE_STROKE,
      strokeWidth: 2,
    };

    this.listen("shape:style-change", (style = {}) => {
      this.style = {
        ...this.style,
        ...style,
        shapeType: normalizeShapeType(style.shapeType ?? this.style.shapeType),
        strokeWidth: Number.isFinite(style.strokeWidth) ? style.strokeWidth : this.style.strokeWidth,
        fillOpacity: Number.isFinite(style.fillOpacity) ? style.fillOpacity : this.style.fillOpacity,
      };
      if (style.applyToSelection === true) {
        this.applyStyleToSelectedShapes(this.style);
      }
      this.updatePreview();
    });

    this.listen("interaction:change", () => {
      this.syncCursorOverride();
      if (!this.isEnabled()) {
        this.cancelPreview();
      }
    });

    this.stage.on("mousedown.shapes touchstart.shapes", (event) => this.handlePointerDown(event));
    this.stage.on("mousemove.shapes touchmove.shapes", (event) => this.handlePointerMove(event));
    this.stage.on("mouseup.shapes touchend.shapes touchcancel.shapes", (event) => {
      void this.handlePointerUp(event);
    });

    this.cleanups.push(() => {
      this.stage.off(".shapes");
      this.cancelPreview();
    });
  }

  onModeEnter() {
    this.syncCursorOverride();
  }

  onModeChange() {
    this.syncCursorOverride();
  }

  onModeExit() {
    this.cancelPreview();
    if (this.app.cursorOverride === "crosshair") {
      this.app.clearCursorOverride();
    }
  }

  syncCursorOverride() {
    if (this.isEnabled()) {
      this.app.setCursorOverride("crosshair");
      return;
    }

    if (this.app.cursorOverride === "crosshair") {
      this.app.clearCursorOverride();
    }
  }

  pointerToCanvas(event = null) {
    const nativeEvent = event?.evt ?? event;
    if (nativeEvent && typeof this.stage.setPointersPositions === "function") {
      this.stage.setPointersPositions(nativeEvent);
    }

    const pointer = this.stage.getPointerPosition();
    if (!pointer) return null;
    return this.app.stageApi.screenToCanvas(pointer);
  }

  canStartShape(target) {
    if (!target) return false;
    if (target === this.stage) return true;
    if (isTransformerTarget(target)) {
      return false;
    }

    const layer = target.getLayer?.();
    return layer === this.app.mainLayer || layer === this.app.drawLayer;
  }

  getShapeComponent() {
    return this.app.components.get("shape") ?? null;
  }

  getShapeTarget(target) {
    const selectable = target?.hasName?.("selectable")
      ? target
      : target?.findAncestor?.(".selectable", true);
    return selectable?.getAttr?.("componentType") === "shape" ? selectable : null;
  }

  handleShapeClickTarget(target, event) {
    const shape = this.getShapeTarget(target);
    if (!shape) return false;

    const selection = this.app.getPlugin("selection");
    const selectedNodes = selection?.getSelectedNodes?.() ?? [];
    if (selectedNodes.length === 1 && selectedNodes[0] === shape) {
      shape.openInlineEditor?.(event);
      return true;
    }

    selection?.setSelected?.([shape]);
    return true;
  }

  applyStyleToSelectedShapes(style) {
    if (this.app.getMode() !== "edit" || this.app.getEditorTool() !== "shape") return;
    const selectedShapes = this.app
      .getPlugin("selection")
      ?.getSelectedNodes?.()
      ?.filter((node) => node?.getAttr?.("componentType") === "shape") ?? [];
    if (!selectedShapes.length) return;

    for (const node of selectedShapes) {
      this.app.events.emit("node:change:start", { node });
      applyShapeStyle(node, style);
      this.app.events.emit("node:changed", { node });
    }
    this.app.mainLayer.batchDraw();
  }

  buildPayload(point = this.currentPoint, event = null) {
    if (!this.startPoint || !point) return null;

    const bounds = getShapeBounds(this.startPoint, point, {
      shapeType: this.style.shapeType,
      constrain: event?.evt?.shiftKey === true,
      style: this.style,
    });
    if (!bounds) return null;

    return {
      ...bounds,
      shapeType: this.style.shapeType,
      fill: this.style.fill,
      fillOpacity: this.style.fillOpacity,
      stroke: this.style.stroke,
      strokeWidth: this.style.strokeWidth,
    };
  }

  async ensurePreview(payload) {
    if (this.previewNode) return this.previewNode;
    const component = this.getShapeComponent();
    if (!component?.createPreviewNode) return null;

    this.previewNode = await component.createPreviewNode(payload);
    this.previewNode?.opacity(0.82);
    if (this.previewNode) {
      this.app.overlayLayer.add(this.previewNode);
      this.previewNode.moveToTop();
    }
    return this.previewNode;
  }

  async updatePreview(event = null) {
    if (!this.isDrawing || !this.startPoint || !this.currentPoint) return;
    const payload = this.buildPayload(this.currentPoint, event);
    if (!payload) return;

    const preview = await this.ensurePreview(payload);
    if (!preview) return;

    const component = this.getShapeComponent();
    preview.setAttrs({
      x: payload.x,
      y: payload.y,
      rotation: payload.rotation,
      opacity: 0.82,
    });
    await component?.applySerializedData?.(preview, payload);
    this.app.overlayLayer.batchDraw();
  }

  cancelPreview() {
    this.isDrawing = false;
    this.startPoint = null;
    this.currentPoint = null;
    this.startTarget = null;
    this.previewNode?.destroy();
    this.previewNode = null;
    this.app.overlayLayer.batchDraw();
  }

  handlePointerDown(event) {
    if (!this.isEnabled()) return;
    if (event.evt?.button != null && event.evt.button !== 0) return;
    if (!this.canStartShape(event.target)) return;

    const point = this.pointerToCanvas(event);
    if (!point) return;

    event.cancelBubble = true;
    event.evt?.preventDefault?.();

    this.isDrawing = true;
    this.startPoint = point;
    this.currentPoint = point;
    this.startTarget = event.target;
    void this.updatePreview(event);
  }

  handlePointerMove(event) {
    if (!this.isDrawing) return;
    const point = this.pointerToCanvas(event);
    if (!point) return;
    this.currentPoint = point;
    void this.updatePreview(event);
  }

  async handlePointerUp(event) {
    if (!this.isDrawing) return;

    const point = this.pointerToCanvas(event) ?? this.currentPoint;
    const startTarget = this.startTarget;
    const payload = this.buildPayload(point, event);
    this.cancelPreview();
    if (!payload) {
      this.handleShapeClickTarget(startTarget, event);
      return;
    }

    await this.app.addComponent("shape", payload);
  }
}
