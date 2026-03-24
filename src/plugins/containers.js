import { BasePlugin } from "../core/baseClasses.js";

function isContainerNode(node) {
  return node?.hasName?.("container-root") || node?.getAttr?.("componentType") === "container";
}

function isConnectionNode(node) {
  return node?.getAttr?.("componentType") === "connection";
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
    return this.layer.find((node) => isContainerNode(node));
  }

  handleDragEnd(event) {
    this.handleCapture(event.target);
  }

  handleCapture(node) {
    if (
      this.app.isReplayingHistory ||
      !node?.hasName?.("selectable") ||
      isContainerNode(node) ||
      isConnectionNode(node)
    ) {
      return;
    }

    const box = node.getClientRect();
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

    const currentParent = node.getParent();

    if (targetContainer) {
      if (currentParent !== targetContainer) {
        const absolutePosition = node.getAbsolutePosition();
        node.moveTo(targetContainer);
        node.setAbsolutePosition(absolutePosition);
        this.layer.batchDraw();
        this.app.events.emit("node:changed", { node });
      }
      return;
    }

    if (currentParent !== this.layer && currentParent !== this.app.drawLayer) {
      const absolutePosition = node.getAbsolutePosition();
      node.moveTo(this.layer);
      node.setAbsolutePosition(absolutePosition);
      this.layer.batchDraw();
      this.app.events.emit("node:changed", { node });
    }
  }
}
