import {
  BaseCommand,
  BaseContextMenuItem,
  BasePlugin,
} from "../core/baseClasses.js";
import { getCanvasTheme } from "../theme/canvasTheme.js";
import {
  DEFAULT_LINE_OPACITY,
  DEFAULT_STROKE,
  getDefaultConnectionStroke,
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
const AUTO_CONNECT_PREVIEW_MIN_OPACITY = 0.08;
const AUTO_CONNECT_PREVIEW_MAX_OPACITY = 0.3;
const AUTO_CONNECT_PREVIEW_DURATION_MS = 1800;

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

function isPageNode(node) {
  return node?.getAttr?.("componentType") === "page";
}

function isTextNode(node) {
  return node?.getAttr?.("componentType") === "text";
}

function getPageSize(node) {
  const background = node?.findOne?.(".page-bg") ?? node?.findOne?.(".container-bg");
  return {
    width: Number.isFinite(background?.width?.())
      ? background.width()
      : (Number.isFinite(node?.width?.()) ? node.width() : 960),
    height: Number.isFinite(background?.height?.())
      ? background.height()
      : (Number.isFinite(node?.height?.()) ? node.height() : 540),
  };
}

function readOffset(offset) {
  return {
    x: Number.isFinite(offset?.x) ? offset.x : 0,
    y: Number.isFinite(offset?.y) ? offset.y : 0,
  };
}

function isPointInsideRect(point, rect) {
  return Boolean(
    point &&
    rect &&
    point.x >= rect.x &&
    point.x <= rect.x + rect.width &&
    point.y >= rect.y &&
    point.y <= rect.y + rect.height,
  );
}

function getStackIndex(node) {
  if (!node) return -1;
  const absoluteIndex = node.getAbsoluteZIndex?.();
  if (Number.isFinite(absoluteIndex)) return absoluteIndex;
  return node.zIndex?.() ?? -1;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function getRectCenter(box) {
  return {
    x: box.x + box.width / 2,
    y: box.y + box.height / 2,
  };
}

function getRectAnchorToward(box, point) {
  const center = getRectCenter(box);
  const halfWidth = Math.max(box.width / 2, 1);
  const halfHeight = Math.max(box.height / 2, 1);
  const dx = point.x - center.x;
  const dy = point.y - center.y;

  if (Math.abs(dx) / halfWidth >= Math.abs(dy) / halfHeight) {
    const direction = dx >= 0 ? 1 : -1;
    const ratio = Math.abs(dx) < 0.001 ? 0 : halfWidth / Math.abs(dx);
    return {
      point: {
        x: center.x + direction * halfWidth,
        y: clamp(center.y + dy * ratio, box.y, box.y + box.height),
      },
      normal: { x: direction, y: 0 },
    };
  }

  const direction = dy >= 0 ? 1 : -1;
  const ratio = Math.abs(dy) < 0.001 ? 0 : halfHeight / Math.abs(dy);
  return {
    point: {
      x: clamp(center.x + dx * ratio, box.x, box.x + box.width),
      y: center.y + direction * halfHeight,
    },
    normal: { x: 0, y: direction },
  };
}

function getDistance(a, b) {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

function alignControlToNormal(anchor, control, normal) {
  const projectedDistance = Math.max(
    24,
    (control.x - anchor.x) * normal.x + (control.y - anchor.y) * normal.y,
  );
  return {
    x: anchor.x + normal.x * projectedDistance,
    y: anchor.y + normal.y * projectedDistance,
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

class CreateNextPageCommand extends BaseCommand {
  static commandId = "page:create-next";
  static label = "Create Next Page";
  static modes = {
    edit: {
      tools: { arrange: {} },
    },
  };

  execute(sourceId) {
    return this.plugin.createNextPage(sourceId);
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

class CreateNextPageMenuItem extends BaseContextMenuItem {
  static itemId = "page:create-next-menu";
  static label = "Create Next Page";
  static modes = {
    edit: {
      tools: { arrange: {} },
    },
  };

  condition(node) {
    return isPageNode(node);
  }

  execute(node) {
    this.app.commands.execute("page:create-next", node.id());
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
    return [ConnectNodesCommand, CreateNextPageCommand, DeleteConnectionCommand];
  }

  menuItems() {
    return [ConnectNodesMenuItem, CreateNextPageMenuItem, DeleteConnectionMenuItem];
  }

  onSetup() {
    this.layer = this.app.mainLayer;
    this.overlayLayer = this.app.overlayLayer;
    this.uiLayer = this.app.uiLayer;
    this.connectingFromId = null;
    this.selectedConnection = null;
    this.selectedNodes = [];
    this.termdefRemovingIds = new Set();
    this.transparentPulseConnectionIds = new Set();
    this.transparentPulseAnimation = null;
    this.connectingMode = null;
    this.autoConnectStartFrame = null;
    this.autoConnectCancelFrame = null;
    this.autoConnectPreviewAnimation = null;

    this.autoConnectPreviewLine = new Konva.Arrow({
      points: [0, 0, 0, 0, 0, 0, 0, 0],
      stroke: getDefaultConnectionStroke(),
      fill: getDefaultConnectionStroke(),
      strokeWidth: 3,
      opacity: 0,
      pointerLength: 10,
      pointerWidth: 10,
      lineCap: "round",
      lineJoin: "round",
      bezier: true,
      listening: false,
      visible: false,
      name: "connection-auto-preview",
    });
    this.overlayLayer.add(this.autoConnectPreviewLine);

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
      this.syncAutomaticButtonConnect();
    });
    this.listen("zoom:change", () => this.syncSelectedConnectionControls());
    this.listen("document:load:start", () => {
      this.selectedNodes = [];
      this.setTransparentPulseConnections([]);
      this.cancelConnecting();
    });

    this.listenDom(window, "keydown", (event) => {
      if (event.key === "Escape") {
        this.cancelConnecting();
      }
    });

    this.cleanups.push(() => {
      this.cancelConnecting();
      this.cancelScheduledAutomaticButtonConnect();
      this.setTransparentPulseConnections([]);
      this.stopTransparentPulseAnimation();
      this.stopAutoConnectPreviewAnimation();
      this.autoConnectPreviewLine.destroy();
      this.controlHandleGroup.destroy();
    });
  }

  createControlHandle(offsetKey) {
    const handleTheme = getCanvasTheme().connectionHandle;
    const handle = new Konva.Circle({
      radius: CONTROL_HANDLE_RADIUS,
      fill: handleTheme?.fill ?? "#fffaf2",
      stroke: handleTheme?.stroke ?? "#d7612f",
      strokeWidth: 2,
      shadowColor: handleTheme?.shadowColor ?? "rgba(54, 41, 25, 0.18)",
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

    handle.on("contextmenu", (event) => {
      event.evt?.preventDefault?.();
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

  findConnectionBetween(sourceId, targetId) {
    if (!sourceId || !targetId || sourceId === targetId) return null;
    return this.getConnections().find((connectionNode) => {
      const existingSourceId = connectionNode.getAttr("sourceNodeId");
      const existingTargetId = connectionNode.getAttr("targetNodeId");
      return (
        (existingSourceId === sourceId && existingTargetId === targetId) ||
        (existingSourceId === targetId && existingTargetId === sourceId)
      );
    }) ?? null;
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
    const sourceCenter = getRectCenter(sourceBox);
    const targetCenter = getRectCenter(targetBox);
    const sourceAnchor = getRectAnchorToward(sourceBox, targetCenter);
    const targetAnchor = getRectAnchorToward(targetBox, sourceCenter);
    const start = sourceAnchor.point;
    const end = targetAnchor.point;
    const controlDistance = Math.max(60, getDistance(start, end) / 2);
    const cp1 = {
      x: start.x + sourceAnchor.normal.x * controlDistance,
      y: start.y + sourceAnchor.normal.y * controlDistance,
    };
    const cp2 = {
      x: end.x + targetAnchor.normal.x * controlDistance,
      y: end.y + targetAnchor.normal.y * controlDistance,
    };

    return {
      start,
      end,
      baseCp1: cp1,
      baseCp2: cp2,
      sourceNormal: sourceAnchor.normal,
      targetNormal: targetAnchor.normal,
    };
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

    const cp1 = {
      x: baseGeometry.baseCp1.x + startOffset.x,
      y: baseGeometry.baseCp1.y + startOffset.y,
    };
    const rawCp2 = {
      x: baseGeometry.baseCp2.x + endOffset.x,
      y: baseGeometry.baseCp2.y + endOffset.y,
    };

    return {
      ...baseGeometry,
      cp1,
      cp2: alignControlToNormal(baseGeometry.end, rawCp2, baseGeometry.targetNormal),
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
        line.listening(true);
        return;
      }

      const { stroke, hiddenUntilEndpointSelected } = getConnectionConfiguredStyle(connectionNode);
      line.stroke(stroke);
      line.fill(stroke);
      if (hiddenUntilEndpointSelected) {
        line.opacity(0);
        line.listening(false);
      } else if (kind === CONNECTION_KIND_TERMDEF) {
        line.opacity(isSelected ? 1 : TERMDEF_LINE_OPACITY);
        line.listening(true);
      } else {
        line.opacity(isSelected ? 1 : DEFAULT_LINE_OPACITY);
        line.listening(true);
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

  buttonHasAnyConnection(buttonId) {
    if (!buttonId) return false;
    return this.getConnections().some((connectionNode) => (
      connectionNode.getAttr("sourceNodeId") === buttonId ||
      connectionNode.getAttr("targetNodeId") === buttonId
    ));
  }

  getAutomaticButtonConnectSource(nodes = this.selectedNodes) {
    if (!this.app.modeManager.matches({ mode: "edit", editorTool: "arrange" })) {
      return null;
    }
    if (nodes.length !== 1) return null;

    const candidate = nodes[0];
    if (!isButtonNode(candidate) || !this.isConnectable(candidate)) return null;
    if (this.buttonHasAnyConnection(candidate.id())) return null;
    return candidate;
  }

  cancelScheduledAutomaticButtonConnect() {
    if (this.autoConnectStartFrame != null) {
      window.cancelAnimationFrame(this.autoConnectStartFrame);
      this.autoConnectStartFrame = null;
    }
    if (this.autoConnectCancelFrame != null) {
      window.cancelAnimationFrame(this.autoConnectCancelFrame);
      this.autoConnectCancelFrame = null;
    }
  }

  scheduleAutomaticButtonConnect(sourceId) {
    if (!sourceId || this.autoConnectStartFrame != null) return;

    this.autoConnectStartFrame = window.requestAnimationFrame(() => {
      this.autoConnectStartFrame = null;
      const source = this.getAutomaticButtonConnectSource();
      if (!source || source.id() !== sourceId || this.connectingFromId) return;
      this.startConnecting(sourceId, { automatic: true });
    });
  }

  scheduleAutomaticButtonConnectCancel(sourceId) {
    if (!sourceId || this.autoConnectCancelFrame != null) return;

    this.autoConnectCancelFrame = window.requestAnimationFrame(() => {
      this.autoConnectCancelFrame = null;
      if (this.connectingMode !== "auto" || this.connectingFromId !== sourceId) return;

      const source = this.getAutomaticButtonConnectSource();
      if (!source || source.id() !== sourceId) {
        this.cancelConnecting();
      }
    });
  }

  syncAutomaticButtonConnect(nodes = this.selectedNodes) {
    const source = this.getAutomaticButtonConnectSource(nodes);
    if (source) {
      if (this.connectingFromId === source.id()) return;
      if (!this.connectingFromId) {
        this.scheduleAutomaticButtonConnect(source.id());
      }
      return;
    }

    if (this.autoConnectStartFrame != null) {
      window.cancelAnimationFrame(this.autoConnectStartFrame);
      this.autoConnectStartFrame = null;
    }
    if (this.connectingMode === "auto" && this.connectingFromId) {
      this.scheduleAutomaticButtonConnectCancel(this.connectingFromId);
    }
  }

  startAutoConnectPreviewAnimation() {
    if (this.autoConnectPreviewAnimation) return;

    this.autoConnectPreviewAnimation = new Konva.Animation((frame) => {
      if (!this.autoConnectPreviewLine.visible()) return;

      const time = frame?.time ?? 0;
      const pulse = (Math.sin((time / AUTO_CONNECT_PREVIEW_DURATION_MS) * Math.PI * 2 - Math.PI / 2) + 1) / 2;
      const opacity =
        AUTO_CONNECT_PREVIEW_MIN_OPACITY +
        (AUTO_CONNECT_PREVIEW_MAX_OPACITY - AUTO_CONNECT_PREVIEW_MIN_OPACITY) * pulse;
      this.autoConnectPreviewLine.opacity(opacity);
    }, this.overlayLayer);

    this.autoConnectPreviewAnimation.start();
  }

  stopAutoConnectPreviewAnimation() {
    if (!this.autoConnectPreviewAnimation) return;
    this.autoConnectPreviewAnimation.stop();
    this.autoConnectPreviewAnimation = null;
  }

  showAutoConnectPreview() {
    const theme = getCanvasTheme();
    const previewStroke = theme.buttonConnectionPreview?.stroke ?? theme.buttonConnection?.stroke ?? getDefaultConnectionStroke();
    this.autoConnectPreviewLine.stroke(previewStroke);
    this.autoConnectPreviewLine.fill(previewStroke);
    this.autoConnectPreviewLine.visible(true);
    this.autoConnectPreviewLine.opacity(AUTO_CONNECT_PREVIEW_MAX_OPACITY);
    this.syncAutoConnectPreview();
    this.startAutoConnectPreviewAnimation();
    this.overlayLayer.batchDraw();
  }

  hideAutoConnectPreview() {
    this.stopAutoConnectPreviewAnimation();
    this.autoConnectPreviewLine.visible(false);
    this.autoConnectPreviewLine.opacity(0);
    this.overlayLayer.batchDraw();
  }

  findAutoConnectPreviewTarget(pointer) {
    if (!pointer || !this.connectingFromId) return null;

    const directTarget = resolveSelectable(this.app.stage.getIntersection?.(pointer));
    if (
      directTarget &&
      directTarget.id() !== this.connectingFromId &&
      this.isConnectable(directTarget)
    ) {
      return directTarget;
    }

    const canvasPoint = this.app.stageApi.screenToCanvas(pointer);
    const candidates = this.layer
      .find(".selectable")
      .filter((node) => (
        node.id() !== this.connectingFromId &&
        this.isConnectable(node) &&
        isPointInsideRect(canvasPoint, this.getNodeBounds(node))
      ))
      .sort((a, b) => getStackIndex(b) - getStackIndex(a));

    return candidates[0] ?? null;
  }

  syncAutoConnectPreview() {
    if (this.connectingMode !== "auto" || !this.connectingFromId) {
      this.hideAutoConnectPreview();
      return;
    }

    const source = this.findNodeById(this.connectingFromId);
    const sourceBox = this.getNodeBounds(source);
    if (!this.isConnectable(source) || !sourceBox) {
      this.cancelConnecting();
      return;
    }

    const pointer = this.app.stage.getPointerPosition();
    const fallbackPoint = {
      x: sourceBox.x + sourceBox.width + 120,
      y: sourceBox.y + sourceBox.height / 2,
    };
    const pointerCanvasPoint = pointer
      ? this.app.stageApi.screenToCanvas(pointer)
      : fallbackPoint;
    const target = pointer ? this.findAutoConnectPreviewTarget(pointer) : null;
    const targetBox = target
      ? this.getNodeBounds(target)
      : {
          x: pointerCanvasPoint.x,
          y: pointerCanvasPoint.y,
          width: 1,
          height: 1,
        };

    const geometry = targetBox ? this.calculateConnectionPoints(sourceBox, targetBox) : null;
    if (!geometry) return;

    this.autoConnectPreviewLine.points([
      geometry.start.x,
      geometry.start.y,
      geometry.baseCp1.x,
      geometry.baseCp1.y,
      geometry.baseCp2.x,
      geometry.baseCp2.y,
      geometry.end.x,
      geometry.end.y,
    ]);
    this.autoConnectPreviewLine.moveToTop();
    this.overlayLayer.batchDraw();
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

    // Connection groups render their curve in stage coordinates, so any
    // residual group position becomes an extra visual offset.
    if (connectionNode.x() !== 0 || connectionNode.y() !== 0) {
      connectionNode.position({ x: 0, y: 0 });
    }

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
    this.syncAutomaticButtonConnect();
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
      this.syncAutomaticButtonConnect();
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
    this.syncAutomaticButtonConnect();
  }

  handleNodeChanged(node) {
    const selectable = resolveSelectable(node) ?? node;
    if (!selectable) return;

    if (isConnectionNode(selectable)) {
      applyConnectionKindStyle(selectable, { kind: getConnectionKind(selectable) });
      this.updateConnection(selectable);
      this.syncTransparentConnectionPulse();
      this.syncConnectionAppearance();
      this.syncAutomaticButtonConnect();
      return;
    }

    this.syncTransparentConnectionPulse();
    this.updateConnections();
    if (this.connectingFromId) {
      this.syncAutoConnectPreview();
    }
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
    this.syncAutomaticButtonConnect(nodes);
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

    const handleTheme = getCanvasTheme().connectionHandle;
    Object.values(this.controlHandles).forEach((h) => {
      h.fill(handleTheme?.fill ?? "#fffaf2");
      h.stroke(handleTheme?.stroke ?? "#d7612f");
      h.shadowColor(handleTheme?.shadowColor ?? "rgba(54, 41, 25, 0.18)");
    });

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

    const existingConnection = this.findConnectionBetween(sourceId, targetId);
    if (existingConnection) {
      this.updateConnection(existingConnection);
      this.layer.batchDraw();
      if (isButtonNode(source)) {
        this.app.getPlugin("selection")?.setSelected?.([source]);
      } else {
        this.app.getPlugin("selection")?.setSelected?.([existingConnection]);
      }
      return existingConnection;
    }

    if (isButtonNode(source)) {
      this.getConnections()
        .filter((connectionNode) => connectionNode.getAttr("sourceNodeId") === sourceId)
        .forEach((connectionNode) => this.removeConnection(connectionNode));
    }

    const buttonStroke = isButtonNode(source)
      ? (getCanvasTheme().buttonConnection?.stroke ?? getDefaultConnectionStroke())
      : undefined;
    const connection = await this.app.addComponent("connection", {
      sourceNodeId: sourceId,
      targetNodeId: targetId,
      hiddenUntilEndpointSelected: isButtonNode(source),
      ...(buttonStroke != null ? { stroke: buttonStroke } : {}),
    });

    if (!connection) return null;

    this.updateConnection(connection);
    this.layer.batchDraw();

    if (isButtonNode(source)) {
      this.app.getPlugin("selection")?.setSelected?.([source]);
    }

    return connection;
  }

  async createNextPage(sourceId) {
    const source = this.findNodeById(sourceId);
    if (!isPageNode(source)) return null;

    const sourceSize = getPageSize(source);

    const nextPage = await this.app.addComponent("page", {
      x: source.x() + sourceSize.width + 120,
      y: source.y(),
      width: sourceSize.width,
      height: sourceSize.height,
    });
    if (!nextPage) return null;

    const connection = await this.createConnection(source.id(), nextPage.id());
    this.app.getPlugin("selection")?.setSelected?.([nextPage]);
    this.layer.batchDraw();

    return { page: nextPage, connection };
  }

  startConnecting(sourceId, { automatic = false } = {}) {
    const source = this.findNodeById(sourceId);
    if (!this.isConnectable(source)) return;

    this.cancelScheduledAutomaticButtonConnect();
    this.cancelConnecting();
    this.connectingFromId = sourceId;
    this.connectingMode = automatic ? "auto" : "manual";
    this.app.setCursorOverride("crosshair");
    this.app.events.emit("connection:pick:start", { sourceId });

    if (automatic) {
      this.showAutoConnectPreview();
      this.app.stage.on("mousemove.connectionCreate touchmove.connectionCreate", () => {
        this.syncAutoConnectPreview();
      });
    }

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
    this.connectingMode = null;
    this.app.stage.off(".connectionCreate");
    this.hideAutoConnectPreview();
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
