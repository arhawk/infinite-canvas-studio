import { BasePlugin } from "../core/baseClasses.js";

function resolveSelectable(target) {
  if (!target) return null;
  return target.findAncestor?.(".selectable", true)
    ?? (target.hasName?.("selectable") ? target : null);
}

export class InlineEditBridgePlugin extends BasePlugin {
  static pluginId = "inline-edit-bridge";
  static modes = {
    edit: {
      tools: {
        arrange: {},
      },
    },
  };

  onSetup() {
    this.selectedNodes = [];
    this.listen("selection:change", ({ nodes }) => {
      this.selectedNodes = Array.isArray(nodes) ? nodes : [];
    });

    this.app.stage.on("dblclick.inlineEditBridge dbltap.inlineEditBridge", (event) => {
      if (!this.isEnabled()) return;
      if (event?.evt && typeof this.app.stage?.setPointersPositions === "function") {
        this.app.stage.setPointersPositions(event.evt);
      }

      const button = event?.evt?.button;
      if (button != null && button !== 0) return;

      let target = event?.target;
      if (target === this.app.stage && typeof this.app.stage?.getIntersection === "function") {
        const pointer = this.app.stage.getPointerPosition?.();
        const intersection = pointer ? this.app.stage.getIntersection(pointer) : null;
        const selectable = resolveSelectable(intersection);
        if (selectable?.listening?.() !== false) {
          target = intersection;
        }
      }

      const selectable = resolveSelectable(target);
      const type = selectable?.getAttr?.("componentType");
      if (type === "shape") {
        selectable.openInlineEditor?.(event);
        return;
      }
      if (type === "text") {
        selectable.openInlineEditor?.(event);
        return;
      }
      if (type === "sticky") {
        selectable.findOne?.(".sticky-text")?.openInlineEditor?.(event);
        return;
      }
      if (type === "button") {
        selectable.openInlineEditor?.(event);
        return;
      }
      if (type === "page") {
        selectable.findOne?.(".page-label")?.openInlineEditor?.(event);
        return;
      }

      const selectedText = this.findSelectedTextAtPointer();
      if (selectedText) {
        selectedText.openInlineEditor?.(event);
      }
    });

    this.cleanups.push(() => {
      this.app.stage.off(".inlineEditBridge");
    });
  }

  findSelectedTextAtPointer() {
    const pointer = this.app.stage.getPointerPosition?.();
    const textNode = this.selectedNodes.length === 1
      && this.selectedNodes[0]?.getAttr?.("componentType") === "text"
      ? this.selectedNodes[0]
      : null;

    if (!pointer || !textNode?.getStage?.()) return null;

    const point = this.app.stageApi.screenToCanvas(pointer);
    const box = textNode.getClientRect({
      relativeTo: this.app.stage,
      skipShadow: true,
      skipStroke: true,
    });

    const inside = (
      point.x >= box.x
      && point.x <= box.x + box.width
      && point.y >= box.y
      && point.y <= box.y + box.height
    );

    return inside ? textNode : null;
  }
}
