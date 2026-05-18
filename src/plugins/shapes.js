import { BasePlugin, BaseTool } from "../core/baseClasses.js";
import {
  DEFAULT_SHAPE_FILL,
  DEFAULT_SHAPE_FILL_OPACITY,
  DEFAULT_SHAPE_STROKE,
  MIN_SHAPE_HEIGHT,
  MIN_SHAPE_WIDTH,
  applyShapeStyle,
  normalizeShapeType,
} from "../component/shape.js";

const DRAG_THRESHOLD = 4;
const ROTATION_HIT_RADIUS = 18;
const ROTATION_HANDLE_DEAD_ZONE = 9;
const ROTATION_SNAP_TOLERANCE = 5;
const ROTATION_SNAP_ANGLES = [0, 45, 90, 135, 180, 225, 270, 315];

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

function normalizeDegrees(value) {
  const normalized = value % 360;
  return normalized < 0 ? normalized + 360 : normalized;
}

function angleDistance(a, b) {
  const diff = Math.abs(normalizeDegrees(a) - normalizeDegrees(b));
  return Math.min(diff, 360 - diff);
}

function snapRotation(value) {
  const normalized = normalizeDegrees(value);
  const closest = ROTATION_SNAP_ANGLES
    .map((angle) => ({ angle, distance: angleDistance(normalized, angle) }))
    .sort((a, b) => a.distance - b.distance)[0];
  if (!closest || closest.distance > ROTATION_SNAP_TOLERANCE) return value;
  const turns = Math.round(value / 360);
  return closest.angle + turns * 360;
}

function rotateVector(point, degrees) {
  const radians = degrees * (Math.PI / 180);
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  return {
    x: point.x * cos - point.y * sin,
    y: point.x * sin + point.y * cos,
  };
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
    this.rotationState = null;
    this.moveState = null;
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
        this.cancelRotation(false);
        this.cancelMove(false);
      }
    });

    this.listen("selection:change", ({ nodes = [] } = {}) => {
      const sel = this.app.getPlugin("selection");
      if (!sel?.transformer) return;
      const isShapeOnly =
        nodes.length === 1 && nodes[0]?.getAttr?.("componentType") === "shape";
      sel.transformer.rotationSnaps(isShapeOnly ? ROTATION_SNAP_ANGLES : []);
      sel.transformer.rotationSnapTolerance(isShapeOnly ? 8 : 0);
    });

    this.stage.on("mousedown.shapes touchstart.shapes", (event) => this.handlePointerDown(event));
    this.stage.on("mousemove.shapes touchmove.shapes", (event) => this.handlePointerMove(event));
    this.stage.on("mouseup.shapes touchend.shapes touchcancel.shapes", (event) => {
      void this.handlePointerUp(event);
    });

    this.cleanups.push(() => {
      this.stage.off(".shapes");
      this.cancelPreview();
      this.cancelRotation(false);
      this.cancelMove(false);
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
    this.cancelRotation(false);
    this.cancelMove(false);
    if (["crosshair", "move", "grab", "grabbing"].includes(this.app.cursorOverride)) {
      this.app.clearCursorOverride();
    }
  }

  syncCursorOverride(target = null, event = null) {
    if (this.isEnabled()) {
      if (this.rotationState) {
        this.app.setCursorOverride("grabbing");
        return;
      }
      if (this.moveState) {
        this.app.setCursorOverride(this.moveState.started ? "grabbing" : "move");
        return;
      }
      if (this.getRotationHit(event)) {
        this.app.setCursorOverride("grab");
        return;
      }
      if (this.getShapeTarget(target)) {
        this.app.setCursorOverride("move");
        return;
      }
      this.app.setCursorOverride("crosshair");
      return;
    }

    if (["crosshair", "move", "grab", "grabbing"].includes(this.app.cursorOverride)) {
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
    if (isTransformerTarget(target)) return false;
    // Existing shapes stay movable while the shape tool is active.
    const selectable = target?.hasName?.("selectable")
      ? target
      : target?.findAncestor?.(".selectable", true);
    if (selectable?.getAttr?.("componentType") === "shape") return false;
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
    if (selectedNodes.length === 1 && selectedNodes[0] === shape) return true;

    selection?.setSelected?.([shape]);
    return true;
  }

  maybeSwitchToArrangeAfterShapeClickTarget(targetOrHit) {
    const hitShape = typeof targetOrHit === "boolean" ? targetOrHit : Boolean(this.getShapeTarget(targetOrHit));
    if (!hitShape) return;
    if (!this.isEnabled()) return;
    if (this.app.getMode() !== "edit") return;
    if (this.app.getEditorTool() !== "shape") return;
    this.app.setEditorTool("arrange");
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

  getSelectedShape() {
    const selectedNodes = this.app.getPlugin("selection")?.getSelectedNodes?.() ?? [];
    return selectedNodes.length === 1 && selectedNodes[0]?.getAttr?.("componentType") === "shape"
      ? selectedNodes[0]
      : null;
  }

  getRotationHit(event = null) {
    if (!this.isEnabled()) return null;
    if (event?.target && isTransformerTarget(event.target)) return null;

    const node = this.getSelectedShape();
    if (!node?.getStage?.() || node.getAttr("inlineEditing")) return null;

    const point = this.pointerToCanvas(event);
    if (!point) return null;

    const width = Number(node.width?.());
    const height = Number(node.height?.());
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
      return null;
    }
    const scale = this.app.stageApi?.getScale?.() ?? this.stage.scaleX?.() ?? 1;
    const radius = ROTATION_HIT_RADIUS / Math.max(scale, 0.001);
    const deadZone = ROTATION_HANDLE_DEAD_ZONE / Math.max(scale, 0.001);
    const transform = node.getAbsoluteTransform?.(this.stage)?.copy?.();
    if (!transform?.point) return null;

    const corners = [
      transform.point({ x: 0, y: 0 }),
      transform.point({ x: width, y: 0 }),
      transform.point({ x: 0, y: height }),
      transform.point({ x: width, y: height }),
    ];
    const nearCorner = corners.some((corner) => (
      Math.hypot(point.x - corner.x, point.y - corner.y) <= radius &&
      Math.hypot(point.x - corner.x, point.y - corner.y) > deadZone
    ));
    if (!nearCorner) return null;

    const localCenter = { x: width / 2, y: height / 2 };
    const center = transform.point(localCenter);
    const centerInParent = node.getTransform?.()?.copy?.()?.point?.(localCenter) ?? {
      x: node.x() + localCenter.x,
      y: node.y() + localCenter.y,
    };

    return {
      node,
      point,
      center,
      centerInParent,
      localCenter,
    };
  }

  beginRotation(event) {
    const hit = this.getRotationHit(event);
    if (!hit) return false;

    event.cancelBubble = true;
    event.evt?.preventDefault?.();
    event.evt?.stopPropagation?.();

    const { node, point, center } = hit;
    node.stopDrag?.();
    this.rotationState = {
      node,
      center,
      centerInParent: hit.centerInParent,
      localCenter: hit.localCenter,
      startAngle: radiansToDegrees(Math.atan2(point.y - center.y, point.x - center.x)),
      startRotation: node.rotation?.() ?? 0,
    };
    this.app.events.emit("node:change:start", { node });
    this.syncCursorOverride(event.target, event);
    return true;
  }

  updateRotation(event) {
    const state = this.rotationState;
    if (!state?.node?.getStage?.()) return;

    const point = this.pointerToCanvas(event);
    if (!point) return;

    event.cancelBubble = true;
    event.evt?.preventDefault?.();
    const angle = radiansToDegrees(Math.atan2(point.y - state.center.y, point.x - state.center.x));
    const nextRotation = snapRotation(state.startRotation + angle - state.startAngle);
    const rotatedCenter = rotateVector(state.localCenter, nextRotation);
    state.node.position({
      x: state.centerInParent.x - rotatedCenter.x,
      y: state.centerInParent.y - rotatedCenter.y,
    });
    state.node.rotation(nextRotation);
    this.app.events.emit("node:changing", { node: state.node });
    this.app.getPlugin("selection")?.transformer?.forceUpdate?.();
    state.node.getLayer?.()?.batchDraw?.();
    this.app.overlayLayer?.batchDraw?.();
  }

  cancelRotation(commit = true) {
    const state = this.rotationState;
    if (!state) return;
    this.rotationState = null;
    if (commit && state.node?.getStage?.()) {
      this.app.events.emit("node:changed", { node: state.node });
    }
    this.syncCursorOverride();
  }

  beginMove(event) {
    if (event?.target && isTransformerTarget(event.target)) return false;
    const node = this.getShapeTarget(event.target);
    if (!node?.getStage?.() || node.getAttr("inlineEditing")) return false;

    const point = this.pointerToCanvas(event);
    if (!point) return false;

    this.app.getPlugin("selection")?.setSelected?.([node]);
    this.moveState = {
      node,
      startPoint: point,
      startPosition: { x: node.x(), y: node.y() },
      started: false,
    };
    return true;
  }

  updateMove(event) {
    const state = this.moveState;
    if (!state?.node?.getStage?.()) return;

    const point = this.pointerToCanvas(event);
    if (!point) return;

    const dx = point.x - state.startPoint.x;
    const dy = point.y - state.startPoint.y;
    if (!state.started && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;

    event.cancelBubble = true;
    event.evt?.preventDefault?.();
    if (!state.started) {
      state.started = true;
      this.app.events.emit("node:change:start", { node: state.node });
    }
    state.node.position({
      x: state.startPosition.x + dx,
      y: state.startPosition.y + dy,
    });
    this.app.events.emit("node:changing", { node: state.node });
    this.app.getPlugin("selection")?.transformer?.forceUpdate?.();
    state.node.getLayer?.()?.batchDraw?.();
    this.app.overlayLayer?.batchDraw?.();
  }

  cancelMove(commit = true) {
    const state = this.moveState;
    if (!state) return;
    this.moveState = null;
    if (commit && state.started && state.node?.getStage?.()) {
      this.app.events.emit("node:changed", { node: state.node });
    }
    this.syncCursorOverride();
  }

  handlePointerDown(event) {
    if (!this.isEnabled()) return;
    if (event.evt?.button != null && event.evt.button !== 0) return;
    if (this.beginRotation(event)) return;
    if (this.beginMove(event)) return;
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
    if (this.rotationState) {
      this.updateRotation(event);
      return;
    }
    if (this.moveState) {
      this.updateMove(event);
      return;
    }
    if (!this.isDrawing) {
      this.syncCursorOverride(event.target, event);
      return;
    }
    const point = this.pointerToCanvas(event);
    if (!point) return;
    this.currentPoint = point;
    void this.updatePreview(event);
  }

  async handlePointerUp(event) {
    if (this.rotationState) {
      this.cancelRotation(true);
      return;
    }
    if (this.moveState) {
      const clickedShape = this.moveState.started ? null : this.moveState.node;
      this.cancelMove(true);
      this.maybeSwitchToArrangeAfterShapeClickTarget(clickedShape);
      return;
    }
    if (!this.isDrawing) return;

    const point = this.pointerToCanvas(event) ?? this.currentPoint;
    const startTarget = this.startTarget;
    const payload = this.buildPayload(point, event);
    this.cancelPreview();
    if (!payload) {
      const hitShape = this.handleShapeClickTarget(startTarget, event);
      this.maybeSwitchToArrangeAfterShapeClickTarget(hitShape);
      return;
    }

    const node = await this.app.addComponent("shape", payload);
    if (node) {
      this.app.getPlugin("selection")?.setSelected?.([node]);
    }
  }
}
