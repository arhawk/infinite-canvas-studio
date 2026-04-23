import {
  BaseCommand,
  BaseContextMenuItem,
  BasePlugin,
} from "../core/baseClasses.js";
import {
  DEFAULT_LINE_OPACITY,
  CONNECTION_KIND_DIRECTED,
  CONNECTION_KIND_TERMDEF,
  TERMDEF_LINE_OPACITY,
  applyConnectionKindStyle,
  getConnectionConfiguredStyle,
  getConnectionKind,
  getConnectionLine,
} from "../component/connection.js";
import { Konva } from "../lib/konva.js";

const CONTROL_HANDLE_RADIUS = 8;
const TRANSPARENT_PULSE_STROKE = "#ef4444";
const TRANSPARENT_PULSE_DURATION_MS = 1400;

function resolveSelectable(node) {
  if (!node) return null;
  return node.findAncestor?.(".selectable", true) ?? (node.hasName?.("selectable") ? node : null);
}

function isConnectionNode(node) {
  return node?.getAttr?.("componentType") === "connection";
}

function isRankingBoxNode(node) {
  return node?.getAttr?.("componentType") === "rankingBox";
}

function isButtonNode(node) {
  return node?.getAttr?.("componentType") === "button";
}

function isTextNode(node) {
  return node?.getAttr?.("componentType") === "text";
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
    this.selectedNodes = [];
    this.termdefRemovingIds = new Set();
    this.transparentPulseConnectionIds = new Set();
    this.transparentPulseAnimation = null;

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
    this.listen("node:changing", ({ node }) => this.handleNodeChanged(node));
    this.listen("node:changed", ({ node }) => this.handleNodeChanged(node));
    this.listen("selection:change", ({ nodes }) => this.handleSelectionChange(nodes));
    this.listen("interaction:change", () => {
      if (!this.app.modeManager.matches({ mode: "edit", editorTool: "arrange" })) {
        this.hideControlHandles();
      } else {
        this.syncSelectedConnectionControls();
      }
      this.syncTransparentConnectionPulse();
    });
    this.listen("zoom:change", () => this.syncSelectedConnectionControls());
    this.listen("document:load:start", () => {
      this.selectedNodes = [];
      this.setTransparentPulseConnections([]);
    });

    this.listenDom(window, "keydown", (event) => {
      if (event.key === "Escape") {
        this.cancelConnecting();
      }
    });

    this.cleanups.push(() => {
      this.cancelConnecting();
      this.setTransparentPulseConnections([]);
      this.stopTransparentPulseAnimation();
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
      if (this.selectedConnection) {
        this.app.events.emit("node:change:start", { node: this.selectedConnection });
      }
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
    return !!node?.hasName?.("selectable") && !isConnectionNode(node) && !isRankingBoxNode(node);
  }

  getConnections() {
    return this.layer.find((node) => isConnectionNode(node));
  }

  isTermdefConnection(connectionNode) {
    return isConnectionNode(connectionNode) && getConnectionKind(connectionNode) === CONNECTION_KIND_TERMDEF;
  }

  isPulseEligibleConnection(connectionNode) {
    return isConnectionNode(connectionNode) && connectionNode?.hasName?.("selectable");
  }

  isTransparentConnection(connectionNode) {
    return getConnectionConfiguredStyle(connectionNode).hiddenUntilEndpointSelected === true;
  }

  findNodeById(id) {
    return id ? this.layer.findOne(`#${id}`) : null;
  }

  getTermdefPeerId(textNodeId) {
    if (!textNodeId) return null;
    const match = this.getConnections().find((connectionNode) => (
      this.isTermdefConnection(connectionNode) &&
      (
        connectionNode.getAttr("sourceNodeId") === textNodeId ||
        connectionNode.getAttr("targetNodeId") === textNodeId
      )
    )) ?? null;
    if (!match) return null;

    const sourceId = match.getAttr("sourceNodeId");
    const targetId = match.getAttr("targetNodeId");
    return sourceId === textNodeId ? targetId : sourceId;
  }

  removeOtherTermdefConnectionsForEndpoints(endpointIds = [], exceptConnectionId = null) {
    const ids = new Set((endpointIds ?? []).filter(Boolean));
    if (!ids.size) return;

    this.getConnections().forEach((connectionNode) => {
      if (!this.isTermdefConnection(connectionNode)) return;
      if (exceptConnectionId && connectionNode.id() === exceptConnectionId) return;
      const a = connectionNode.getAttr("sourceNodeId");
      const b = connectionNode.getAttr("targetNodeId");
      if (ids.has(a) || ids.has(b)) {
        this.removeConnection(connectionNode);
      }
    });
  }

  setConnectionKind(connectionNode, nextKind, { fromEditor = false } = {}) {
    if (!isConnectionNode(connectionNode) || !connectionNode.getStage?.()) return false;

    const targetKind = nextKind === CONNECTION_KIND_TERMDEF
      ? CONNECTION_KIND_TERMDEF
      : CONNECTION_KIND_DIRECTED;

    const sourceId = connectionNode.getAttr("sourceNodeId");
    const targetId = connectionNode.getAttr("targetNodeId");
    const source = this.findNodeById(sourceId);
    const target = this.findNodeById(targetId);

    if (targetKind === CONNECTION_KIND_TERMDEF) {
      if (!isTextNode(source) || !isTextNode(target)) return false;
      const ids = [sourceId, targetId].filter(Boolean).sort();
      if (ids.length !== 2 || ids[0] === ids[1]) return false;

      this.removeOtherTermdefConnectionsForEndpoints(ids, connectionNode.id());

      if (!fromEditor) this.app.events.emit("node:change:start", { node: connectionNode });
      connectionNode.setAttrs({
        sourceNodeId: ids[0],
        targetNodeId: ids[1],
        connectionKind: CONNECTION_KIND_TERMDEF,
      });
      applyConnectionKindStyle(connectionNode, { kind: CONNECTION_KIND_TERMDEF });
      this.updateConnection(connectionNode);
      if (!fromEditor) this.app.events.emit("node:changed", { node: connectionNode });
      this.syncConnectionAppearance();
      return true;
    }

    if (!fromEditor) this.app.events.emit("node:change:start", { node: connectionNode });
    connectionNode.setAttr("connectionKind", CONNECTION_KIND_DIRECTED);
    applyConnectionKindStyle(connectionNode, { kind: CONNECTION_KIND_DIRECTED });
    this.updateConnection(connectionNode);
    if (!fromEditor) this.app.events.emit("node:changed", { node: connectionNode });
    this.syncConnectionAppearance();
    return true;
  }

  getAttachmentNode(node) {
    if (!node) return null;
    return node.findOne?.(".container-bg") ?? node.findOne?.(".button-bg") ?? node;
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
      const line = getConnectionLine(connectionNode);
      if (!line) return;

      const kind = getConnectionKind(connectionNode);

      const isSelected = connectionNode === this.selectedConnection;
      line.shadowBlur(isSelected ? 8 : 2);
      line.shadowOpacity(isSelected ? 0.22 : 0.08);

      if (this.transparentPulseConnectionIds.has(connectionNode.id())) {
        return;
      }

      const { stroke, hiddenUntilEndpointSelected } = getConnectionConfiguredStyle(connectionNode);
      line.stroke(stroke);
      line.fill(stroke);
      if (hiddenUntilEndpointSelected) {
        line.opacity(0);
      } else if (kind === CONNECTION_KIND_TERMDEF) {
        line.opacity(isSelected ? 1 : TERMDEF_LINE_OPACITY);
      } else {
        line.opacity(isSelected ? 1 : DEFAULT_LINE_OPACITY);
      }
    });

    this.layer.batchDraw();
  }

  startTransparentPulseAnimation() {
    if (this.transparentPulseAnimation) return;

    this.transparentPulseAnimation = new Konva.Animation((frame) => {
      const time = frame?.time ?? 0;
      const pulseOpacity = (Math.sin((time / TRANSPARENT_PULSE_DURATION_MS) * Math.PI * 2 - Math.PI / 2) + 1) / 2;

      this.transparentPulseConnectionIds.forEach((connectionId) => {
        const connectionNode = this.findNodeById(connectionId);
        const line = getConnectionLine(connectionNode);
        if (!connectionNode?.getStage?.() || !line) return;

        line.stroke(TRANSPARENT_PULSE_STROKE);
        line.fill(TRANSPARENT_PULSE_STROKE);
        line.opacity(pulseOpacity);
      });
    }, this.layer);

    this.transparentPulseAnimation.start();
  }

  stopTransparentPulseAnimation() {
    if (!this.transparentPulseAnimation) return;
    this.transparentPulseAnimation.stop();
    this.transparentPulseAnimation = null;
  }

  getTransparentPulseConnections(nodes = this.selectedNodes) {
    const selectedConnectionIds = new Set(
      (nodes ?? [])
        .filter((node) => isConnectionNode(node))
        .map((node) => node.id()),
    );
    const selectedEndpointIds = new Set(
      (nodes ?? [])
        .filter((node) => node && !isConnectionNode(node))
        .map((node) => node.id()),
    );

    if (!selectedEndpointIds.size && !selectedConnectionIds.size) return [];

    return this.getConnections().filter((connectionNode) => (
      this.isPulseEligibleConnection(connectionNode) &&
      this.isTransparentConnection(connectionNode) &&
      (
        selectedConnectionIds.has(connectionNode.id()) ||
        selectedEndpointIds.has(connectionNode.getAttr("sourceNodeId")) ||
        selectedEndpointIds.has(connectionNode.getAttr("targetNodeId"))
      )
    ));
  }

  setTransparentPulseConnections(connectionNodes = []) {
    const nextIds = new Set(connectionNodes.map((node) => node.id()));
    const currentIds = [...this.transparentPulseConnectionIds];
    const changed =
      currentIds.length !== nextIds.size ||
      currentIds.some((id) => !nextIds.has(id));

    if (!changed) return;

    this.getConnections().forEach((connectionNode) => {
      connectionNode.setAttr("transparentPulseActive", nextIds.has(connectionNode.id()));
    });

    this.transparentPulseConnectionIds = nextIds;

    if (nextIds.size) {
      this.startTransparentPulseAnimation();
    } else {
      this.stopTransparentPulseAnimation();
    }

    this.syncConnectionAppearance();
  }

  syncTransparentConnectionPulse() {
    this.setTransparentPulseConnections(this.getTransparentPulseConnections());
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
    applyConnectionKindStyle(node, { kind: getConnectionKind(node) });
    this.updateConnection(node);
    node.setAttr("transparentPulseActive", false);
    this.syncTransparentConnectionPulse();
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
      selectable.setAttr("transparentPulseActive", false);
      this.syncTransparentConnectionPulse();
      this.syncConnectionAppearance();
      return;
    }

    if (
      isTextNode(selectable) &&
      !this.app.isReplayingHistory &&
      !this.app.isRestoringDocument &&
      !this.termdefRemovingIds.has(selectable.id())
    ) {
      const peerId = this.getTermdefPeerId(selectable.id());
      const peer = peerId ? this.findNodeById(peerId) : null;
      const selectionNodes = this.app.getPlugin("selection")?.getSelectedNodes?.() ?? [];
      const peerSelectedForDeletion = selectionNodes.some((entry) => entry?.id?.() === peerId);

      if (isTextNode(peer) && !peerSelectedForDeletion) {
        this.termdefRemovingIds.add(selectable.id());
        this.termdefRemovingIds.add(peerId);

        try {
          this.app.events.emit("node:removed", { node: peer });
          peer.destroy();
        } finally {
          this.termdefRemovingIds.delete(selectable.id());
          this.termdefRemovingIds.delete(peerId);
        }
      }
    }

    this.getConnections()
      .filter((connectionNode) => (
        connectionNode.getAttr("sourceNodeId") === selectable.id() ||
        connectionNode.getAttr("targetNodeId") === selectable.id()
      ))
      .forEach((connectionNode) => this.removeConnection(connectionNode));

    this.syncTransparentConnectionPulse();
    this.updateConnections();
  }

  handleNodeChanged(node) {
    const selectable = resolveSelectable(node) ?? node;
    if (!selectable) return;

    if (isConnectionNode(selectable)) {
      applyConnectionKindStyle(selectable, { kind: getConnectionKind(selectable) });
      this.updateConnection(selectable);
      this.syncTransparentConnectionPulse();
      this.syncConnectionAppearance();
      return;
    }

    this.syncTransparentConnectionPulse();
    this.updateConnections();
  }

  handleSelectionChange(nodes) {
    this.selectedNodes = nodes;
    this.selectedConnection =
      nodes.length === 1 && isConnectionNode(nodes[0]) ? nodes[0] : null;

    if (!this.app.modeManager.matches({ mode: "edit", editorTool: "arrange" })) {
      this.hideControlHandles();
    } else {
      this.syncSelectedConnectionControls();
    }

    this.syncTransparentConnectionPulse();
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

    if (isButtonNode(source)) {
      this.getConnections()
        .filter((connectionNode) => connectionNode.getAttr("sourceNodeId") === sourceId)
        .forEach((connectionNode) => this.removeConnection(connectionNode));
    }

    const connection = await this.app.addComponent("connection", {
      sourceNodeId: sourceId,
      targetNodeId: targetId,
      hiddenUntilEndpointSelected: isButtonNode(source),
    });

    if (!connection) return null;

    this.updateConnection(connection);
    this.layer.batchDraw();

    if (isButtonNode(source)) {
      this.app.getPlugin("selection")?.setSelected?.([source]);
    }

    return connection;
  }

  startConnecting(sourceId) {
    const source = this.findNodeById(sourceId);
    if (!this.isConnectable(source)) return;

    this.cancelConnecting();
    this.connectingFromId = sourceId;
    this.app.setCursorOverride("crosshair");
    this.app.events.emit("connection:pick:start", { sourceId });

    this.app.stage.on("click.connectionCreate tap.connectionCreate", async (event) => {
      const target = resolveSelectable(event.target);
      await this.completeConnectingTo(target);
    });
  }

  async completeConnectingTo(target) {
    if (!this.connectingFromId) return false;

    const targetNode = typeof target === "string"
      ? this.findNodeById(target)
      : resolveSelectable(target);

    if (!targetNode) {
      this.cancelConnecting();
      return false;
    }

    if (!this.isConnectable(targetNode)) {
      this.cancelConnecting();
      return false;
    }

    if (targetNode.id() === this.connectingFromId) {
      return true;
    }

    await this.createConnection(this.connectingFromId, targetNode.id());
    this.cancelConnecting();
    return true;
  }

  cancelConnecting() {
    if (!this.connectingFromId) return;
    const sourceId = this.connectingFromId;
    this.connectingFromId = null;
    this.app.stage.off(".connectionCreate");
    this.app.clearCursorOverride();
    this.app.events.emit("connection:pick:end", { sourceId });
  }

  removeConnection(connectionNode) {
    if (!connectionNode?.getStage?.()) return;
    if (connectionNode === this.selectedConnection) {
      this.selectedConnection = null;
      this.hideControlHandles();
    }
    this.app.events.emit("node:removed", { node: connectionNode });
    connectionNode.destroy();
    this.syncTransparentConnectionPulse();
    this.syncConnectionAppearance();
    this.layer.batchDraw();
  }
}
