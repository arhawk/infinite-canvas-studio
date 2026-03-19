import {
  BaseCommand,
  BaseContextMenuItem,
  BasePlugin,
} from "../core/baseClasses.js";
import { ConnectionComponent } from "../component/connection.js";
import { Konva } from "../lib/konva.js";

const CONTROL_HANDLE_RADIUS = 8;

function resolveSelectable(node) {
  if (!node) return null;
  return node.findAncestor?.(".selectable", true) ?? (node.hasName?.("selectable") ? node : null);
}

function isConnectionNode(node) {
  return node?.getAttr?.("componentType") === "connection";
}

function readOffset(offset) {
  return {
    x: Number.isFinite(offset?.x) ? offset.x : 0,
    y: Number.isFinite(offset?.y) ? offset.y : 0,
  };
}

class ConnectNodesCommand extends BaseCommand {
  static commandId = "connection:connect";
  static label = "Connect to...";
  static modes = {
    edit: {
      tools: { arrange: {} },
    },
  };

  execute(sourceId) {
    this.plugin.startConnecting(sourceId);
  }
}

class DeleteConnectionCommand extends BaseCommand {
  static commandId = "connection:delete";
  static label = "Delete Connection";
  static modes = {
    edit: {
      tools: { arrange: {} },
    },
  };

  execute(connectionId) {
    const connectionNode = this.plugin.findNodeById(connectionId);
    if (!isConnectionNode(connectionNode)) return;
    this.plugin.removeConnection(connectionNode);
  }
}

class ConnectNodesMenuItem extends BaseContextMenuItem {
  static itemId = "connection:connect-menu";
  static label = "Connect to...";
  static modes = {
    edit: {
      tools: { arrange: {} },
    },
  };

  condition(node) {
    return this.plugin.isConnectable(node);
  }

  execute(node) {
    this.app.commands.execute("connection:connect", node.id());
  }
}

class DeleteConnectionMenuItem extends BaseContextMenuItem {
  static itemId = "connection:delete-menu";
  static label = "Delete Connection";
  static modes = {
    edit: {
      tools: { arrange: {} },
    },
  };

  condition(node) {
    return isConnectionNode(node);
  }

  execute(node) {
    this.app.commands.execute("connection:delete", node.id());
  }
}

export class ConnectionsPlugin extends BasePlugin {
  static pluginId = "connections";
  static modes = {
    presentation: {},
    edit: {
      tools: {
        arrange: {},
        brush: {},
      },
    },
  };

  components() {
    return [ConnectionComponent];
  }

  commands() {
    return [ConnectNodesCommand, DeleteConnectionCommand];
  }

  menuItems() {
    return [ConnectNodesMenuItem, DeleteConnectionMenuItem];
  }

  onSetup() {
    this.layer = this.app.mainLayer;
    this.uiLayer = this.app.uiLayer;
    this.connectingFromId = null;
    this.selectedConnection = null;

    this.controlHandleGroup = new Konva.Group({
      visible: false,
      name: "connection-controls",
    });

    this.controlHandles = {
      controlOffsetStart: this.createControlHandle("controlOffsetStart"),
      controlOffsetEnd: this.createControlHandle("controlOffsetEnd"),
    };

    this.controlHandleGroup.add(
      this.controlHandles.controlOffsetStart,
      this.controlHandles.controlOffsetEnd,
    );
    this.uiLayer.add(this.controlHandleGroup);

    this.listen("node:added", ({ node }) => this.handleNodeAdded(node));
    this.listen("node:removed", ({ node }) => this.handleNodeRemoved(node));
    this.listen("node:changed", ({ node }) => this.handleNodeChanged(node));
    this.listen("selection:change", ({ nodes }) => this.handleSelectionChange(nodes));
    this.listen("interaction:change", () => {
      if (!this.app.modeManager.matches({ mode: "edit", editorTool: "arrange" })) {
        this.hideControlHandles();
      } else {
        this.syncSelectedConnectionControls();
      }
    });
    this.listen("zoom:change", () => this.syncSelectedConnectionControls());

    this.listenDom(window, "keydown", (event) => {
      if (event.key === "Escape") {
        this.cancelConnecting();
      }
    });

    this.cleanups.push(() => {
      this.cancelConnecting();
      this.controlHandleGroup.destroy();
    });
  }

  createControlHandle(offsetKey) {
    const handle = new Konva.Circle({
      radius: CONTROL_HANDLE_RADIUS,
      fill: "#fffaf2",
      stroke: "#d7612f",
      strokeWidth: 2,
      shadowColor: "rgba(54, 41, 25, 0.18)",
      shadowBlur: 10,
      shadowOpacity: 0.35,
      draggable: true,
      visible: false,
      name: "connection-control",
    });

    handle.setAttr("offsetKey", offsetKey);

    handle.on("mouseenter", () => {
      this.app.setCursorOverride("grab");
    });

    handle.on("mouseleave", () => {
      if (!handle.isDragging()) {
        this.app.clearCursorOverride();
      }
    });

    handle.on("mousedown touchstart click tap", (event) => {
      event.cancelBubble = true;
    });

    handle.on("dragstart", (event) => {
      event.cancelBubble = true;
      this.app.setCursorOverride("grabbing");
    });

    handle.on("dragmove", (event) => {
      event.cancelBubble = true;
      this.handleControlHandleDrag(offsetKey);
    });

    handle.on("dragend", (event) => {
      event.cancelBubble = true;
      this.app.clearCursorOverride();
      if (this.selectedConnection) {
        this.app.events.emit("node:changed", { node: this.selectedConnection });
      }
    });

    return handle;
  }

  isConnectable(node) {
    return !!node?.hasName?.("selectable") && !isConnectionNode(node);
  }

  getConnections() {
    return this.layer.find((node) => isConnectionNode(node));
  }

  findNodeById(id) {
    return id ? this.layer.findOne(`#${id}`) : null;
  }

  getAttachmentNode(node) {
    if (!node) return null;
    return node.findOne?.(".container-bg") ?? node;
  }

  getNodeBounds(node) {
    const attachmentNode = this.getAttachmentNode(node);
    return attachmentNode?.getClientRect({ relativeTo: this.app.stage }) ?? null;
  }

  calculateConnectionPoints(sourceBox, targetBox) {
    const sourceCenter = {
      x: sourceBox.x + sourceBox.width / 2,
      y: sourceBox.y + sourceBox.height / 2,
    };
    const targetCenter = {
      x: targetBox.x + targetBox.width / 2,
      y: targetBox.y + targetBox.height / 2,
    };

    let start;
    let end;
    let cp1;
    let cp2;

    if (targetCenter.x > sourceCenter.x + sourceBox.width / 2) {
      start = { x: sourceBox.x + sourceBox.width, y: sourceCenter.y };
      end = { x: targetBox.x, y: targetCenter.y };
      const dx = Math.max(60, (end.x - start.x) / 2);
      cp1 = { x: start.x + dx, y: start.y };
      cp2 = { x: end.x - dx, y: end.y };
    } else if (targetCenter.x < sourceCenter.x - sourceBox.width / 2) {
      start = { x: sourceBox.x, y: sourceCenter.y };
      end = { x: targetBox.x + targetBox.width, y: targetCenter.y };
      const dx = Math.max(60, (start.x - end.x) / 2);
      cp1 = { x: start.x - dx, y: start.y };
      cp2 = { x: end.x + dx, y: end.y };
    } else if (targetCenter.y >= sourceCenter.y) {
      start = { x: sourceCenter.x, y: sourceBox.y + sourceBox.height };
      end = { x: targetCenter.x, y: targetBox.y };
      const dy = Math.max(60, (end.y - start.y) / 2);
      cp1 = { x: start.x, y: start.y + dy };
      cp2 = { x: end.x, y: end.y - dy };
    } else {
      start = { x: sourceCenter.x, y: sourceBox.y };
      end = { x: targetCenter.x, y: targetBox.y + targetBox.height };
      const dy = Math.max(60, (start.y - end.y) / 2);
      cp1 = { x: start.x, y: start.y - dy };
      cp2 = { x: end.x, y: end.y + dy };
    }

    return { start, end, baseCp1: cp1, baseCp2: cp2 };
  }

  getConnectionGeometry(connectionNode) {
    const source = this.findNodeById(connectionNode.getAttr("sourceNodeId"));
    const target = this.findNodeById(connectionNode.getAttr("targetNodeId"));
    if (!source || !target || source === target) return null;

    const sourceBox = this.getNodeBounds(source);
    const targetBox = this.getNodeBounds(target);
    if (!sourceBox || !targetBox) return null;

    const baseGeometry = this.calculateConnectionPoints(sourceBox, targetBox);
    const startOffset = readOffset(connectionNode.getAttr("controlOffsetStart"));
    const endOffset = readOffset(connectionNode.getAttr("controlOffsetEnd"));

    return {
      ...baseGeometry,
      cp1: {
        x: baseGeometry.baseCp1.x + startOffset.x,
        y: baseGeometry.baseCp1.y + startOffset.y,
      },
      cp2: {
        x: baseGeometry.baseCp2.x + endOffset.x,
        y: baseGeometry.baseCp2.y + endOffset.y,
      },
    };
  }

  syncConnectionAppearance() {
    this.getConnections().forEach((connectionNode) => {
      const line = connectionNode.findOne(".connection-line");
      if (!line) return;

      const isSelected = connectionNode === this.selectedConnection;
      line.shadowBlur(isSelected ? 8 : 2);
      line.shadowOpacity(isSelected ? 0.22 : 0.08);
      line.opacity(isSelected ? 1 : 0.9);
    });

    this.layer.batchDraw();
  }

  updateConnection(connectionNode) {
    if (!connectionNode?.getStage?.()) return false;
    const geometry = this.getConnectionGeometry(connectionNode);
    if (!geometry) {
      this.removeConnection(connectionNode);
      return false;
    }

    const line = connectionNode.findOne(".connection-line");
    if (!line) return false;

    line.points([
      geometry.start.x,
      geometry.start.y,
      geometry.cp1.x,
      geometry.cp1.y,
      geometry.cp2.x,
      geometry.cp2.y,
      geometry.end.x,
      geometry.end.y,
    ]);

    // Keep connections above page/container backgrounds so links stay visible
    // when endpoints are captured inside those groups.
    connectionNode.moveToTop();

    if (connectionNode === this.selectedConnection) {
      this.syncSelectedConnectionControls();
    }

    return true;
  }

  updateConnections() {
    this.getConnections().forEach((connectionNode) => {
      this.updateConnection(connectionNode);
    });
    this.syncConnectionAppearance();
    this.syncSelectedConnectionControls();
  }

  handleNodeAdded(node) {
    if (!isConnectionNode(node)) return;
    this.updateConnection(node);
    this.syncConnectionAppearance();
  }

  handleNodeRemoved(node) {
    const selectable = resolveSelectable(node) ?? node;
    if (!selectable) return;

    if (isConnectionNode(selectable)) {
      if (selectable === this.selectedConnection) {
        this.selectedConnection = null;
        this.hideControlHandles();
      }
      this.syncConnectionAppearance();
      return;
    }

    this.getConnections()
      .filter((connectionNode) => (
        connectionNode.getAttr("sourceNodeId") === selectable.id() ||
        connectionNode.getAttr("targetNodeId") === selectable.id()
      ))
      .forEach((connectionNode) => this.removeConnection(connectionNode));

    this.updateConnections();
  }

  handleNodeChanged(node) {
    const selectable = resolveSelectable(node) ?? node;
    if (!selectable) return;

    if (isConnectionNode(selectable)) {
      this.updateConnection(selectable);
      this.syncConnectionAppearance();
      return;
    }

    this.updateConnections();
  }

  handleSelectionChange(nodes) {
    this.selectedConnection =
      nodes.length === 1 && isConnectionNode(nodes[0]) ? nodes[0] : null;

    if (!this.app.modeManager.matches({ mode: "edit", editorTool: "arrange" })) {
      this.hideControlHandles();
    } else {
      this.syncSelectedConnectionControls();
    }

    this.syncConnectionAppearance();
  }

  hideControlHandles() {
    this.controlHandleGroup.visible(false);
    Object.values(this.controlHandles).forEach((handle) => handle.visible(false));
    this.uiLayer.batchDraw();
  }

  syncSelectedConnectionControls() {
    if (
      !this.selectedConnection ||
      !this.selectedConnection.getStage?.() ||
      !this.app.modeManager.matches({ mode: "edit", editorTool: "arrange" })
    ) {
      this.hideControlHandles();
      return;
    }

    const geometry = this.getConnectionGeometry(this.selectedConnection);
    if (!geometry) {
      this.hideControlHandles();
      return;
    }

    const inverseScale = 1 / this.app.stageApi.getScale();
    this.controlHandleGroup.visible(true);

    this.controlHandles.controlOffsetStart.setAttrs({
      x: geometry.cp1.x,
      y: geometry.cp1.y,
      scaleX: inverseScale,
      scaleY: inverseScale,
      visible: true,
    });

    this.controlHandles.controlOffsetEnd.setAttrs({
      x: geometry.cp2.x,
      y: geometry.cp2.y,
      scaleX: inverseScale,
      scaleY: inverseScale,
      visible: true,
    });

    this.uiLayer.batchDraw();
  }

  handleControlHandleDrag(offsetKey) {
    if (!this.selectedConnection) return;

    const geometry = this.getConnectionGeometry(this.selectedConnection);
    const pointer = this.app.stage.getPointerPosition();
    if (!geometry || !pointer) return;

    const canvasPoint = this.app.stageApi.screenToCanvas(pointer);
    const basePoint = offsetKey === "controlOffsetStart" ? geometry.baseCp1 : geometry.baseCp2;

    this.selectedConnection.setAttr(offsetKey, {
      x: canvasPoint.x - basePoint.x,
      y: canvasPoint.y - basePoint.y,
    });

    this.updateConnection(this.selectedConnection);
    this.layer.batchDraw();
  }

  async createConnection(sourceId, targetId) {
    if (sourceId === targetId) return null;

    const source = this.findNodeById(sourceId);
    const target = this.findNodeById(targetId);
    if (!this.isConnectable(source) || !this.isConnectable(target)) return null;

    const connection = await this.app.addComponent("connection", {
      sourceNodeId: sourceId,
      targetNodeId: targetId,
    });

    if (!connection) return null;

    this.updateConnection(connection);
    this.layer.batchDraw();
    return connection;
  }

  startConnecting(sourceId) {
    const source = this.findNodeById(sourceId);
    if (!this.isConnectable(source)) return;

    this.cancelConnecting();
    this.connectingFromId = sourceId;
    this.app.setCursorOverride("crosshair");

    this.app.stage.on("click.connectionCreate tap.connectionCreate", async (event) => {
      const target = resolveSelectable(event.target);

      if (!target) {
        this.cancelConnecting();
        return;
      }

      if (!this.isConnectable(target)) {
        this.cancelConnecting();
        return;
      }

      if (target.id() === this.connectingFromId) {
        return;
      }

      await this.createConnection(this.connectingFromId, target.id());
      this.cancelConnecting();
    });
  }

  cancelConnecting() {
    if (!this.connectingFromId) return;
    this.connectingFromId = null;
    this.app.stage.off(".connectionCreate");
    this.app.clearCursorOverride();
  }

  removeConnection(connectionNode) {
    if (!connectionNode?.getStage?.()) return;
    if (connectionNode === this.selectedConnection) {
      this.selectedConnection = null;
      this.hideControlHandles();
    }
    this.app.events.emit("node:removed", { node: connectionNode });
    connectionNode.destroy();
    this.layer.batchDraw();
  }
}
