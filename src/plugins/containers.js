import { BasePlugin } from "../core/baseClasses.js";

function resolveSelectable(node) {
  if (!node) return null;
  if (node.hasName?.("selectable")) return node;
  return node.findAncestor?.(".selectable", true) ?? null;
}

function isContainerNode(node) {
  return node?.hasName?.("page-root") || node?.getAttr?.("componentType") === "page";
}

function isConnectionNode(node) {
  return node?.getAttr?.("componentType") === "connection";
}

function isInsideRankingNode(node) {
  return Boolean(node?.findAncestor?.(".ranking-box-root"));
}

function isInsideRankingItem(node) {
  return Boolean(node?.hasName?.("ranking-item-card") || node?.findAncestor?.(".ranking-item-card", true));
}

export class ContainersPlugin extends BasePlugin {
  static pluginId = "containers";
  static modes = {
    presentation: {},
    edit: {
      tools: {
        arrange: {},
        brush: {},
      },
    },
  };

  onSetup() {
    this.layer = this.app.mainLayer;

    this.app.stage.on("dragend.containers", (event) => this.handleDragEnd(event));

    this.listen("node:added", ({ node }) => {
      this.handleCapture(node);
    });

    this.cleanups.push(() => {
      this.app.stage.off(".containers");
    });
  }

  getContainers() {
    return this.layer.find((node) => isContainerNode(node) && !isInsideRankingNode(node));
  }

  handleDragEnd(event) {
    if (isInsideRankingItem(event.target)) return;
    this.finalizeCaptureForNode(event.target);
  }

  finalizeCaptureForNode(node) {
    if (isInsideRankingItem(node)) return;
    this.handleCapture(node);
  }

  handleCapture(node) {
    const selectable = resolveSelectable(node);
    if (
      this.app.isReplayingHistory ||
      this.app.isRestoringDocument ||
      !selectable?.getStage?.() ||
      selectable?.getAttr?.("rankingBoxConsumedDrop") ||
      isContainerNode(selectable) ||
      isConnectionNode(selectable)
    ) {
      return;
    }

    const box = selectable.getClientRect();
    const center = {
      x: box.x + box.width / 2,
      y: box.y + box.height / 2,
    };

    let targetContainer = null;

    for (const container of this.getContainers()) {
      const bg = container.findOne(".container-bg");
      if (!bg) continue;

      const bgBox = bg.getClientRect();
      if (
        center.x >= bgBox.x &&
        center.x <= bgBox.x + bgBox.width &&
        center.y >= bgBox.y &&
        center.y <= bgBox.y + bgBox.height
      ) {
        targetContainer = container;
        break;
      }
    }

    const currentParent = selectable.getParent();

    if (targetContainer) {
      if (currentParent !== targetContainer) {
        const absolutePosition = selectable.getAbsolutePosition();
        selectable.moveTo(targetContainer);
        selectable.setAbsolutePosition(absolutePosition);
        this.layer.batchDraw();
        this.app.events.emit("node:changed", { node: selectable });
      }
      return;
    }

    if (currentParent !== this.layer && currentParent !== this.app.drawLayer) {
      const absolutePosition = selectable.getAbsolutePosition();
      selectable.moveTo(this.layer);
      selectable.setAbsolutePosition(absolutePosition);
      this.layer.batchDraw();
      this.app.events.emit("node:changed", { node: selectable });
    }
  }
}
