import {
  BaseCommand,
  BaseContextMenuItem,
  BasePlugin,
} from "../core/baseClasses.js";

class RemoveLinkCommand extends BaseCommand {
  static commandId = "container:remove-link";
  static label = "Remove Link";
  static modes = {
    edit: {
      tools: { arrange: {} },
    },
  };

  execute(id) {
    this.plugin.removeLink(id);
  }
}

class ConnectContainerCommand extends BaseCommand {
  static commandId = "container:connect";
  static label = "Connect to Container";
  static modes = {
    edit: {
      tools: { arrange: {} },
    },
  };

  execute(sourceId) {
    this.plugin.startConnecting(sourceId);
  }
}

class ConnectContainerMenuItem extends BaseContextMenuItem {
  static itemId = "container:connect-menu";
  static label = "Link to Container...";
  static modes = {
    edit: {
      tools: { arrange: {} },
    },
  };

  condition(node) {
    return node?.getAttr("componentType") === "container";
  }

  execute(node) {
    this.app.commands.execute("container:connect", node.id());
  }
}

class RemoveLinkMenuItem extends BaseContextMenuItem {
  static itemId = "container:remove-link-menu";
  static label = "Remove Link";
  static modes = {
    edit: {
      tools: { arrange: {} },
    },
  };

  condition(node) {
    return node?.getAttr("componentType") === "container" && !!node.getAttr("nextContainerId");
  }

  execute(node) {
    this.app.commands.execute("container:remove-link", node.id());
  }
}

class ClearAllConnectionsMenuItem extends BaseContextMenuItem {
  static itemId = "container:clear-all-links-menu";
  static label = "Clear All Connections";
  static modes = {
    edit: {
      tools: { arrange: {} },
    },
  };

  condition(node) {
    if (node?.getAttr("componentType") !== "container") return false;
    // Check if any container has a link
    return this.plugin.getContainers().some(c => !!c.getAttr("nextContainerId"));
  }

  execute() {
    this.plugin.getContainers().forEach(c => {
      c.setAttr("nextContainerId", null);
    });
    this.plugin.updateConnections();
  }
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

  commands() {
    return [ConnectContainerCommand, RemoveLinkCommand];
  }

  menuItems() {
    return [ConnectContainerMenuItem, RemoveLinkMenuItem, ClearAllConnectionsMenuItem];
  }

  onSetup() {
    this.layer = this.app.mainLayer;
    this.connectingFromId = null;

    // Layer for connections
    this.connectionLayer = new window.Konva.Layer({
      name: "connection-layer",
      listening: false,
    });
    this.app.stage.add(this.connectionLayer);
    
    // Ensure connectionLayer is above grid but below main content
    this.connectionLayer.moveToBottom();
    this.connectionLayer.moveUp(); // Move it one step above the grid layer (which is at index 0)

    // Capture/Release logic
    this.app.stage.on("dragend.containers", (e) => this.handleDragEnd(e));
    this.app.stage.on("dragmove.containers transform.containers", () => {
      this.updateConnections();
    });

    this.listen("node:added", ({ node }) => {
      this.handleCapture(node);
    });
    
    this.listen("node:removed", () => {
      this.updateConnections();
    });

    this.listen("node:changed", () => {
      this.updateConnections();
    });
  }

  getContainers() {
    return this.layer.find(node => node.hasName("container-root") || node.getAttr("componentType") === "container");
  }

  handleCapture(node) {
    if (!node.hasName("selectable") || node.hasName("container-root")) return;

    // Use absolute position of the node center for check
    const box = node.getClientRect();
    const center = {
      x: box.x + box.width / 2,
      y: box.y + box.height / 2,
    };

    const containers = this.getContainers();
    let targetContainer = null;

    for (const container of containers) {
      // Use the background rect for the hit area to avoid inflated group bounds
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
        const absPos = node.getAbsolutePosition();
        node.moveTo(targetContainer);
        node.setAbsolutePosition(absPos);
        this.layer.batchDraw();
      }
    } else if (currentParent !== this.layer && currentParent !== this.app.drawLayer) {
      // If not in a container and not in main/draw layer, move back to main layer
      const absPos = node.getAbsolutePosition();
      node.moveTo(this.layer);
      node.setAbsolutePosition(absPos);
      this.layer.batchDraw();
    }
  }

  handleDragEnd(e) {
    this.handleCapture(e.target);
  }

  startConnecting(sourceId) {
    this.connectingFromId = sourceId;
    this.app.setCursorOverride("crosshair");

    const cleanup = () => {
      this.app.stage.off("click.connect tap.connect");
      this.connectingFromId = null;
      this.app.clearCursorOverride();
    };

    this.app.stage.on("click.connect tap.connect", (e) => {
      const target = e.target.findAncestor(node => node.hasName("container-root") || node.getAttr("componentType") === "container", true);
      
      if (target && target.id() !== this.connectingFromId) {
        const source = this.layer.findOne(`#${this.connectingFromId}`);
        if (source) {
          source.setAttr("nextContainerId", target.id());
          this.updateConnections();
        }
      } else if (!target) {
        // Canceled by clicking elsewhere
      } else if (target.id() === this.connectingFromId) {
        // Ignore clicking same container
        return;
      }
      cleanup();
    });
  }

  removeLink(id) {
    const node = this.layer.findOne(`#${id}`);
    if (node) {
      node.setAttr("nextContainerId", null);
      this.updateConnections();
    }
  }

  updateConnections() {
    this.connectionLayer.destroyChildren();
    const containers = this.getContainers();

    containers.forEach((source) => {
      const nextId = source.getAttr("nextContainerId");
      if (nextId) {
        const target = this.layer.findOne(`#${nextId}`);
        if (target) {
          // Find the background rects to get the most accurate boundary hit areas
          const sBg = source.findOne(".container-bg") || source;
          const tBg = target.findOne(".container-bg") || target;

          // Use coordinates relative to the stage to avoid double-transform issues
          const sBox = sBg.getClientRect({ relativeTo: this.app.stage });
          const tBox = tBg.getClientRect({ relativeTo: this.app.stage });

          // Calculate connection points on boundaries
          const { start, end, cp1, cp2 } = this.calculateConnectionPoints(
            sBox,
            tBox
          );

          const curve = new window.Konva.Arrow({
            points: [start.x, start.y, cp1.x, cp1.y, cp2.x, cp2.y, end.x, end.y],
            stroke: "#d7612f",
            fill: "#d7612f",
            strokeWidth: 3,
            opacity: 0.8,
            pointerLength: 8,
            pointerWidth: 8,
            tension: 0.5,
            lineCap: "round",
            lineJoin: "round",
            bezier: true,
            shadowColor: "#000",
            shadowBlur: 2,
            shadowOffset: { x: 1, y: 1 },
            shadowOpacity: 0.1,
          });
          this.connectionLayer.add(curve);
        }
      }
    });
    this.connectionLayer.batchDraw();
  }

  calculateConnectionPoints(sBox, tBox) {
    // Centers
    const sCenter = { x: sBox.x + sBox.width / 2, y: sBox.y + sBox.height / 2 };
    const tCenter = { x: tBox.x + tBox.width / 2, y: tBox.y + tBox.height / 2 };

    let start, end, cp1, cp2;

    // Simple heuristic: connect Right-to-Left if target is to the right,
    // otherwise connect Left-to-Right.
    if (tCenter.x > sCenter.x + sBox.width / 2) {
      // Source Right to Target Left
      start = { x: sBox.x + sBox.width, y: sCenter.y };
      end = { x: tBox.x, y: tCenter.y };
      const dx = Math.max(50, (end.x - start.x) / 2);
      cp1 = { x: start.x + dx, y: start.y };
      cp2 = { x: end.x - dx, y: end.y };
    } else if (tCenter.x < sCenter.x - sBox.width / 2) {
      // Source Left to Target Right
      start = { x: sBox.x, y: sCenter.y };
      end = { x: tBox.x + tBox.width, y: tCenter.y };
      const dx = Math.max(50, (start.x - end.x) / 2);
      cp1 = { x: start.x - dx, y: start.y };
      cp2 = { x: end.x + dx, y: end.y };
    } else {
      // Vertically aligned-ish: use Top/Bottom
      if (tCenter.y > sCenter.y) {
        // Source Bottom to Target Top
        start = { x: sCenter.x, y: sBox.y + sBox.height };
        end = { x: tCenter.x, y: tBox.y };
        const dy = Math.max(50, (end.y - start.y) / 2);
        cp1 = { x: start.x, y: start.y + dy };
        cp2 = { x: end.x, y: end.y - dy };
      } else {
        // Source Top to Target Bottom
        start = { x: sCenter.x, y: sBox.y };
        end = { x: tCenter.x, y: tBox.y + tBox.height };
        const dy = Math.max(50, (start.y - end.y) / 2);
        cp1 = { x: start.x, y: start.y - dy };
        cp2 = { x: end.x, y: end.y + dy };
      }
    }

    return { start, end, cp1, cp2 };
  }
}
