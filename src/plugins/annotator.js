import { BasePlugin, BaseTool } from "../core/baseClasses.js";
import {
  createTextAnnotation,
  getAnnotatableTextTargets,
  getHighlightRectsForRange,
  getNodeTextAnnotations,
  getTextAnnotationColor,
  getTextIndexAtLocalPoint,
  resolveAnnotatableTextTarget,
  setNodeTextAnnotations,
} from "../lib/textAnnotations.js";
import { Konva } from "../lib/konva.js";

const TEXT_MARK_OPACITY = 0.7;
const TEXT_MARK_PREVIEW_OPACITY = 0.48;
const TEXT_MARK_STROKE_WIDTH = 1.8;
const DEFAULT_ERASER_RADIUS = 12;
const TEXT_MARK_HIT_THICKNESS = 10;

class AnnotateTool extends BaseTool {
  static toolId = "annotate";
  static label = "Mark Text";
}

function isTextAnnotationTarget(node) {
  return Boolean(node?.getAttr?.("textAnnotationId"));
}

function pointInRect(point, rect) {
  return (
    point.x >= rect.x &&
    point.x <= rect.x + rect.width &&
    point.y >= rect.y &&
    point.y <= rect.y + rect.height
  );
}

function applyNodeTransformToGroup(group, textNode, relativeTo) {
  const transform = textNode.getAbsoluteTransform(relativeTo).decompose();
  group.setAttrs({
    x: transform.x,
    y: transform.y,
    rotation: transform.rotation,
    scaleX: transform.scaleX,
    scaleY: transform.scaleY,
    skewX: transform.skewX,
    skewY: transform.skewY,
    opacity: textNode.opacity?.() ?? 1,
    visible: textNode.isVisible?.() ?? true,
  });
}

function getTextMarkLinePoints(rect) {
  const width = Math.max(rect.width, 2);
  const inset = Math.min(2, width * 0.08);
  const baselineY = rect.y + rect.height - 2;

  return [
    rect.x + inset,
    baselineY,
    rect.x + width - inset,
    baselineY,
  ];
}

function getTextMarkHitRect(rect, radius = 0) {
  const baselineY = rect.y + rect.height - 2;
  const hitHalfThickness = TEXT_MARK_HIT_THICKNESS / 2 + radius;

  return {
    x: rect.x - radius,
    y: baselineY - hitHalfThickness,
    width: rect.width + radius * 2,
    height: hitHalfThickness * 2,
  };
}

export class AnnotatorPlugin extends BasePlugin {
  static pluginId = "annotator";
  static modes = {
    edit: {
      tools: {
        annotate: {},
        eraser: {},
      },
    },
  };

  tools() {
    return [AnnotateTool];
  }

  onSetup() {
    this.stage = this.app.stage;
    this.layer = this.app.mainLayer;
    this.uiLayer = this.app.uiLayer;
    this.previewLayerGroup = new Konva.Group({
      listening: false,
      name: "text-annotation-preview-layer",
    });
    this.previewGroup = new Konva.Group({ listening: false });
    this.renderedGroups = [];
    this.activeSelection = null;
    this.isErasing = false;
    this.eraserRadius = DEFAULT_ERASER_RADIUS;
    this.syncScheduled = false;

    this.previewLayerGroup.add(this.previewGroup);
    this.uiLayer.add(this.previewLayerGroup);
    this.previewLayerGroup.zIndex(0);

    this.listen("interaction:change", () => {
      this.syncCursor();
      this.clearPreview();
      this.syncAnnotations();
    });
    this.listen("node:added", ({ node }) => {
      if (getAnnotatableTextTargets(node).length) {
        this.syncAnnotations();
      }
    });
    this.listen("node:removed", () => this.scheduleSyncAnnotations());
    this.listen("node:changing", ({ node }) => {
      if (getAnnotatableTextTargets(node).length) {
        this.syncAnnotations();
      }
    });
    this.listen("node:changed", ({ node }) => {
      if (getAnnotatableTextTargets(node).length) {
        this.syncAnnotations();
      }
    });
    this.listen("stroke:change", ({ toolId, radius }) => {
      if (toolId !== "eraser" || !Number.isFinite(radius)) return;
      this.eraserRadius = radius;
      if (this.isEraseToolActive()) {
        this.syncAnnotations();
      }
    });
    this.listen("document:load:start", () => {
      this.activeSelection = null;
      this.isErasing = false;
      this.clearPreview();
      this.destroyRenderedGroups();
    });

    this.stage.on("mousedown.annotator touchstart.annotator", (event) => this.handlePointerDown(event));
    this.stage.on("mousemove.annotator touchmove.annotator", (event) => this.handlePointerMove(event));
    this.stage.on("mouseup.annotator touchend.annotator touchcancel.annotator", () => this.handlePointerUp());

    this.cleanups.push(() => {
      this.stage.off(".annotator");
      this.destroyRenderedGroups();
      this.previewLayerGroup.destroy();
    });

    this.syncCursor();
    this.syncAnnotations();
  }

  onModeEnter() {
    this.syncCursor();
    this.syncAnnotations();
  }

  onModeChange() {
    this.syncCursor();
    this.syncAnnotations();
  }

  onModeExit() {
    this.activeSelection = null;
    this.isErasing = false;
    this.clearPreview();
    this.app.clearCursorOverride();
    this.syncAnnotations();
  }

  isHighlightToolActive() {
    return this.isEnabled() && this.app.getEditorTool() === "annotate";
  }

  isEraseToolActive() {
    return this.isEnabled() && this.app.getEditorTool() === "eraser";
  }

  syncCursor() {
    if (!this.isEnabled()) {
      this.app.clearCursorOverride();
      return;
    }

    this.app.setCursorOverride(this.isEraseToolActive() ? "crosshair" : "text");
  }

  getPointerPosition() {
    const pointer = this.stage.getPointerPosition();
    return pointer ? this.app.stageApi.screenToCanvas(pointer) : null;
  }

  getActiveEraserRadius() {
    return Number.isFinite(this.eraserRadius) ? this.eraserRadius : DEFAULT_ERASER_RADIUS;
  }

  scheduleSyncAnnotations() {
    if (this.syncScheduled) return;
    this.syncScheduled = true;
    queueMicrotask(() => {
      this.syncScheduled = false;
      this.syncAnnotations();
    });
  }

  destroyRenderedGroups() {
    this.renderedGroups.forEach((group) => group.destroy());
    this.renderedGroups = [];
    this.layer.batchDraw();
  }

  syncRenderGroupOrder(group, textNode) {
    const parent = textNode?.getParent?.();
    if (!group || !parent || textNode.getParent() !== parent) return;
    group.zIndex(textNode.zIndex() + 1);
  }

  findAnnotationTargetNearPoint(point) {
    if (!point) return null;

    const targets = this.layer.find(".text-annotation-highlight");
    for (let index = targets.length - 1; index >= 0; index -= 1) {
      const target = targets[index];
      const box = target.getClientRect({
        relativeTo: this.stage,
        skipShadow: true,
        skipStroke: true,
      });
      if (pointInRect(point, box)) {
        return target;
      }
    }

    return null;
  }

  getActiveEraserRadius() {
    return Number.isFinite(this.eraserRadius) ? this.eraserRadius : DEFAULT_ERASER_RADIUS;
  }

  scheduleSyncAnnotations() {
    if (this.syncScheduled) return;
    this.syncScheduled = true;
    queueMicrotask(() => {
      this.syncScheduled = false;
      this.syncAnnotations();
    });
  }

  destroyRenderedGroups() {
    this.renderedGroups.forEach((group) => group.destroy());
    this.renderedGroups = [];
    this.layer.batchDraw();
  }

  syncRenderGroupOrder(group, textNode) {
    const parent = textNode?.getParent?.();
    if (!group || !parent || textNode.getParent() !== parent) return;
    group.zIndex(textNode.zIndex() + 1);
  }

  findAnnotationTargetNearPoint(point) {
    if (!point) return null;

    const targets = this.layer.find(".text-annotation-highlight");
    for (let index = targets.length - 1; index >= 0; index -= 1) {
      const target = targets[index];
      const box = target.getClientRect({
        relativeTo: this.stage,
        skipShadow: true,
        skipStroke: true,
      });
      if (pointInRect(point, box)) {
        return target;
      }
    }

    return null;
  }

  toLocalPoint(textNode, pointer) {
    if (!pointer) return null;
    const transform = textNode.getAbsoluteTransform(this.stage).copy();
    transform.invert();
    return transform.point(pointer);
  }

  clearPreview() {
    this.previewGroup.destroyChildren();
    this.uiLayer.batchDraw();
  }

  renderPreview() {
    this.previewGroup.destroyChildren();

    if (!this.activeSelection) {
      this.uiLayer.batchDraw();
      return;
    }

    const {
      textNode,
      start,
      end,
    } = this.activeSelection;
    const rects = getHighlightRectsForRange(textNode, start, end);
    if (!rects.length) {
      this.uiLayer.batchDraw();
      return;
    }

    const group = new Konva.Group({ listening: false });
    applyNodeTransformToGroup(group, textNode, this.stage);

    rects.forEach((rect) => {
      group.add(new Konva.Line({
        points: getTextMarkLinePoints(rect),
        stroke: getTextAnnotationColor(),
        strokeWidth: TEXT_MARK_STROKE_WIDTH,
        opacity: TEXT_MARK_PREVIEW_OPACITY,
        lineCap: "round",
        lineJoin: "round",
        listening: false,
        perfectDrawEnabled: false,
      }));
    });

    this.previewGroup.add(group);
    this.uiLayer.batchDraw();
  }

  syncAnnotations() {
    const allowHitTesting = this.isEraseToolActive();
    const eraserRadius = allowHitTesting ? this.getActiveEraserRadius() : 0;
    const nodes = this.layer.find(".selectable");

    this.destroyRenderedGroups();

    nodes.forEach((node) => {
      const annotations = getNodeTextAnnotations(node);
      if (!annotations.length) return;

      getAnnotatableTextTargets(node).forEach(({ targetKey, textNode }) => {
        const targetAnnotations = annotations.filter((annotation) => annotation.target === targetKey);
        if (!targetAnnotations.length) return;

        const parent = textNode.getParent?.() ?? this.layer;
        const group = new Konva.Group({ listening: allowHitTesting });
        applyNodeTransformToGroup(group, textNode, parent);

        targetAnnotations.forEach((annotation) => {
          const rects = getHighlightRectsForRange(textNode, annotation.start, annotation.end);
          rects.forEach((rect) => {
            group.add(new Konva.Rect({
              ...getTextMarkHitRect(rect, eraserRadius),
              fill: "#000000",
              opacity: 0.001,
              listening: allowHitTesting,
              name: "text-annotation-highlight",
              textAnnotationId: annotation.id,
              textAnnotationOwnerId: node.id(),
            }));
            group.add(new Konva.Line({
              points: getTextMarkLinePoints(rect),
              stroke: annotation.color,
              strokeWidth: TEXT_MARK_STROKE_WIDTH,
              opacity: TEXT_MARK_OPACITY,
              lineCap: "round",
              lineJoin: "round",
              listening: false,
              perfectDrawEnabled: false,
            }));
          });
        });

        if (group.getChildren().length) {
          parent.add(group);
          this.syncRenderGroupOrder(group, textNode);
          this.renderedGroups.push(group);
        } else {
          group.destroy();
        }
      });
    });

    this.layer.batchDraw();
  }

  removeAnnotation(ownerNode, annotationId) {
    const annotations = getNodeTextAnnotations(ownerNode);
    const remaining = annotations.filter((annotation) => annotation.id !== annotationId);
    if (remaining.length === annotations.length) {
      return false;
    }

    this.app.events.emit("node:change:start", { node: ownerNode });
    setNodeTextAnnotations(ownerNode, remaining);
    this.app.events.emit("node:changed", { node: ownerNode });
    return true;
  }

  addAnnotation(ownerNode, targetKey, start, end) {
    const annotations = getNodeTextAnnotations(ownerNode);
    const annotation = createTextAnnotation({
      target: targetKey,
      start,
      end,
      color: getTextAnnotationColor(),
    });

    this.app.events.emit("node:change:start", { node: ownerNode });
    setNodeTextAnnotations(ownerNode, [...annotations, annotation]);
    this.app.events.emit("node:changed", { node: ownerNode });
    return annotation;
  }

  eraseAtEventTarget(target) {
    if (!isTextAnnotationTarget(target)) return false;

    const ownerNode = this.layer.findOne(`#${target.getAttr("textAnnotationOwnerId")}`);
    const annotationId = target.getAttr("textAnnotationId");
    if (!ownerNode || typeof annotationId !== "string") return false;

    return this.removeAnnotation(ownerNode, annotationId);
  }

  handlePointerDown(event) {
    if (event.evt.button != null && event.evt.button !== 0) return;

    if (this.isEraseToolActive()) {
      this.isErasing = true;
      const pointer = this.getPointerPosition();
      const fallbackTarget = this.findAnnotationTargetNearPoint(pointer);
      this.eraseAtEventTarget(event.target) || this.eraseAtEventTarget(fallbackTarget);
      event.cancelBubble = true;
      return;
    }

    if (!this.isHighlightToolActive()) return;

    const target = resolveAnnotatableTextTarget(event.target);
    if (!target) return;

    const pointer = this.getPointerPosition();
    const localPoint = this.toLocalPoint(target.textNode, pointer);
    if (!localPoint) return;

    const index = getTextIndexAtLocalPoint(target.textNode, localPoint);
    this.activeSelection = {
      ownerNode: target.ownerNode,
      targetKey: target.targetKey,
      textNode: target.textNode,
      start: index,
      end: index,
    };
    this.renderPreview();
    event.cancelBubble = true;
  }

  handlePointerMove(event) {
    if (this.isEraseToolActive() && this.isErasing) {
      const pointer = this.getPointerPosition();
      const fallbackTarget = this.findAnnotationTargetNearPoint(pointer);
      this.eraseAtEventTarget(event.target) || this.eraseAtEventTarget(fallbackTarget);
      return;
    }

    if (!this.activeSelection || !this.isHighlightToolActive()) return;

    const pointer = this.getPointerPosition();
    const localPoint = this.toLocalPoint(this.activeSelection.textNode, pointer);
    if (!localPoint) return;

    this.activeSelection.end = getTextIndexAtLocalPoint(this.activeSelection.textNode, localPoint);
    this.renderPreview();
  }

  handlePointerUp() {
    this.isErasing = false;

    if (!this.activeSelection || !this.isHighlightToolActive()) return;

    const { ownerNode, targetKey, start, end } = this.activeSelection;
    this.activeSelection = null;
    this.clearPreview();

    if (end === start) {
      return;
    }

    this.addAnnotation(ownerNode, targetKey, start, end);
  }
}
