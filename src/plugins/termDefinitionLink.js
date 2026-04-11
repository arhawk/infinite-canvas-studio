import { BaseContextMenuItem, BasePlugin } from "../core/baseClasses.js";
import { Konva } from "../lib/konva.js";

function isTextNode(node) {
  return node?.getAttr?.("componentType") === "text";
}

function isConnectionNode(node) {
  return node?.getAttr?.("componentType") === "connection";
}

function resolveSelectable(node) {
  if (!node) return null;
  return node.findAncestor?.(".selectable", true) ?? (node.hasName?.("selectable") ? node : null);
}

function readTermDef(node) {
  return {
    peerId: node?.getAttr?.("termDefPeerId") ?? null,
    pairId: node?.getAttr?.("termDefPairId") ?? null,
    required: node?.getAttr?.("termDefRequired") === true,
  };
}

function getTrimmedText(node) {
  const value = node?.text?.();
  return (typeof value === "string" ? value : "").trim();
}

function nextPairId() {
  return `termdef-${Math.random().toString(36).slice(2, 10)}-${Date.now().toString(36)}`;
}

class LinkTermDefinitionMenuItem extends BaseContextMenuItem {
  static itemId = "termdef:link";
  static modes = {
    edit: { tools: { arrange: {} } },
  };

  getLabel(node) {
    const peerId = node?.getAttr?.("termDefPeerId");
    return peerId ? "Unlink (term/def)" : "Link (term/def)";
  }

  condition(node) {
    return isTextNode(node);
  }

  execute(node) {
    const selected = this.plugin.getSelectedTextNodes();
    if (selected.length === 2) {
      this.plugin.togglePair(selected[0], selected[1]);
      return;
    }
    this.plugin.toggleLinkingFrom(node);
  }
}

export class TermDefinitionLinkPlugin extends BasePlugin {
  static pluginId = "termdef-link";
  static modes = {
    edit: { tools: { arrange: {} } },
  };

  menuItems() {
    return [LinkTermDefinitionMenuItem];
  }

  onSetup() {
    this.layer = this.app.mainLayer;
    this.uiLayer = this.app.uiLayer;

    this.linkingFromId = null;
    this.removingIds = new Set();
    this.lastNonEmptyText = new Map();
    this.isRevertingEmpty = new Set();

    this.linkingPreviewLine = new Konva.Line({
      name: "termdef-link-preview",
      stroke: "rgba(215, 97, 47, 0.75)",
      strokeWidth: 2,
      dash: [6, 6],
      visible: false,
      listening: false,
      perfectDrawEnabled: false,
    });
    this.uiLayer.add(this.linkingPreviewLine);

    this.listen("node:added", ({ node }) => this.handleNodeAdded(node));
    this.listen("node:removed", ({ node }) => this.handleNodeRemoved(node));
    this.listen("node:change:start", ({ node }) => this.handleNodeChangeStart(node));
    this.listen("node:changed", ({ node }) => this.handleNodeChanged(node));
    this.listen("document:load:start", () => this.cancelLinking());
    this.listen("document:load:end", () => void this.syncTermDefConnections());

    this.listenDom(window, "keydown", (event) => {
      if (event.key === "Escape") this.cancelLinking();
    });

    this.cleanups.push(() => {
      this.cancelLinking();
      this.linkingPreviewLine.destroy();
    });
  }

  getSelectionPlugin() {
    return this.app.getPlugin("selection");
  }

  getSelectedTextNodes() {
    const selection = this.getSelectionPlugin();
    const nodes = selection?.getSelectedNodes?.() ?? [];
    return nodes.filter((node) => isTextNode(node));
  }

  findNodeById(id) {
    if (!id) return null;
    return this.layer.findOne(`#${id}`) ?? null;
  }

  findTermDefConnectionByPairId(pairId) {
    if (!pairId) return null;
    return this.layer.find((node) => (
      isConnectionNode(node)
      && node.getAttr("connectionKind") === "termdef"
      && node.getAttr("termDefPairId") === pairId
    ))[0] ?? null;
  }

  getTermDefConnections() {
    return this.layer.find((node) => (
      isConnectionNode(node) && node.getAttr("connectionKind") === "termdef"
    ));
  }

  getNodeCenter(node) {
    const box = node.getClientRect({ skipTransform: false, relativeTo: this.layer });
    return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  }

  handleNodeAdded(node) {
    if (!isTextNode(node)) return;
    const current = node.text();
    if (typeof current === "string" && current.trim()) {
      this.lastNonEmptyText.set(node.id(), current);
    }
  }

  handleNodeChangeStart(node) {
    if (!isTextNode(node)) return;
    const current = node.text();
    if (typeof current === "string" && current.trim()) {
      this.lastNonEmptyText.set(node.id(), current);
    }
  }

  handleNodeChanged(node) {
    if (!isTextNode(node)) return;

    const { peerId, required } = readTermDef(node);
    if (!peerId || !required) return;

    const peer = this.findNodeById(peerId);
    if (!peer || !isTextNode(peer)) {
      this.unpairNode(node);
      return;
    }

    // Rule Y: linked texts cannot be empty. If a linked node is cleared, revert it.
    if (!getTrimmedText(node)) {
      this.revertEmptyLinkedText(node);
      return;
    }

    const current = node.text();
    if (typeof current === "string" && current.trim()) {
      this.lastNonEmptyText.set(node.id(), current);
    }
  }

  revertEmptyLinkedText(node) {
    if (!node?.getStage?.()) return;
    const id = node.id();
    if (this.isRevertingEmpty.has(id)) return;
    this.isRevertingEmpty.add(id);

    try {
      const fallback = this.lastNonEmptyText.get(id) ?? "Text";
      node.text(fallback.trim().length ? fallback : "Text");
      // Do not emit node:changed here. This handler runs before HistoryPlugin's
      // node:changed listener (plugin order in main.js), so the history snapshot
      // will capture the reverted non-empty value in the same operation.
      this.layer.batchDraw();
    } finally {
      this.isRevertingEmpty.delete(id);
    }
  }

  togglePair(a, b) {
    if (!isTextNode(a) || !isTextNode(b)) return;
    const aPeerId = a.getAttr("termDefPeerId") ?? null;
    const bPeerId = b.getAttr("termDefPeerId") ?? null;
    if (aPeerId === b.id() && bPeerId === a.id()) {
      this.breakExistingPair(a);
      return;
    }
    this.pairNodes(a, b);
  }

  toggleLinkingFrom(node) {
    if (!isTextNode(node)) return;
    const { peerId } = readTermDef(node);
    if (peerId) {
      this.breakExistingPair(node);
      return;
    }
    this.startLinking(node);
  }

  startLinking(node) {
    if (!isTextNode(node)) return;
    this.linkingFromId = node.id();
    this.app.setCursorOverride("crosshair");
    this.syncPreviewLine();

    const stage = this.app.stage;
    stage.off(".termdefLink");
    stage.on("click.termdefLink tap.termdefLink", (event) => {
      const selectable = resolveSelectable(event.target);
      if (!selectable || !isTextNode(selectable)) return;
      if (!this.linkingFromId) return;
      if (selectable.id() === this.linkingFromId) return;
      this.finishLinking(this.linkingFromId, selectable.id());
    });

    stage.on("mousemove.termdefLink touchmove.termdefLink", () => {
      this.syncPreviewLine();
    });
  }

  cancelLinking() {
    if (!this.linkingFromId) return;
    this.linkingFromId = null;
    this.app.clearCursorOverride();
    this.app.stage.off(".termdefLink");
    this.linkingPreviewLine.visible(false);
    this.uiLayer.batchDraw();
  }

  syncPreviewLine() {
    if (!this.linkingFromId) return;
    const source = this.findNodeById(this.linkingFromId);
    const pointer = this.app.stage.getPointerPosition();
    if (!isTextNode(source) || !pointer) return;

    const from = this.getNodeCenter(source);
    const to = this.app.stageApi.screenToCanvas(pointer);
    this.linkingPreviewLine.points([from.x, from.y, to.x, to.y]);
    this.linkingPreviewLine.visible(true);
    this.uiLayer.batchDraw();
  }

  finishLinking(sourceId, targetId) {
    const source = this.findNodeById(sourceId);
    const target = this.findNodeById(targetId);
    if (!source || !target) {
      this.cancelLinking();
      return;
    }

    this.pairNodes(source, target);
    this.cancelLinking();
  }

  unpairNode(node) {
    if (!node?.setAttr) return;
    node.setAttr("termDefPeerId", null);
    node.setAttr("termDefPairId", null);
    node.setAttr("termDefRequired", null);
  }

  async ensureTermDefConnection(pairId, aId, bId) {
    const existing = this.findTermDefConnectionByPairId(pairId);
    if (existing?.getStage?.()) return existing;

    const connection = await this.app.addComponent("connection", {
      sourceNodeId: aId,
      targetNodeId: bId,
    });
    if (!connection) return null;

    connection.setAttrs({
      connectionKind: "termdef",
      termDefPairId: pairId,
    });

    // Keep term/def connections non-interactive and excluded from document + history.
    connection.listening(false);
    connection.removeName?.("selectable");

    const line = connection.findOne?.(".connection-line") ?? null;
    if (line) {
      line.dash([8, 6]);
      line.pointerLength(0);
      line.pointerWidth(0);
      line.shadowBlur(0);
      line.shadowOpacity(0);
      line.opacity(0.35);
      line.hitStrokeWidth(0);
    }

    this.layer.batchDraw();
    return connection;
  }

  removeDanglingTermDefConnections(validPairIds = new Set()) {
    this.getTermDefConnections().forEach((node) => {
      const pairId = node.getAttr("termDefPairId");
      if (typeof pairId === "string" && validPairIds.has(pairId)) return;
      node.destroy();
    });
    this.layer.batchDraw();
  }

  pairNodes(a, b) {
    if (!isTextNode(a) || !isTextNode(b)) return;
    if (a.id() === b.id()) return;

    // Rule Y: do not allow linking empty texts.
    if (!getTrimmedText(a) || !getTrimmedText(b)) return;

    // Enforce 1:1 mapping: if either node is already paired, break old pair first.
    this.breakExistingPair(a);
    this.breakExistingPair(b);

    this.app.events.emit("node:change:start", { node: a });
    this.app.events.emit("node:change:start", { node: b });

    const pairId = nextPairId();
    a.setAttr("termDefPeerId", b.id());
    b.setAttr("termDefPeerId", a.id());
    a.setAttr("termDefPairId", pairId);
    b.setAttr("termDefPairId", pairId);
    a.setAttr("termDefRequired", true);
    b.setAttr("termDefRequired", true);

    this.app.events.emit("node:changed", { node: a });
    this.app.events.emit("node:changed", { node: b });

    void this.syncTermDefConnections();
  }

  breakExistingPair(node) {
    if (!isTextNode(node)) return;
    const { peerId, pairId } = readTermDef(node);
    if (!peerId || !pairId) return;

    const peer = this.findNodeById(peerId);

    this.app.events.emit("node:change:start", { node });
    if (peer) this.app.events.emit("node:change:start", { node: peer });

    this.unpairNode(node);
    if (peer && isTextNode(peer)) this.unpairNode(peer);

    void this.syncTermDefConnections();

    if (peer && isTextNode(peer)) {
      this.app.events.emit("node:changed", { node: peer });
    }
    this.app.events.emit("node:changed", { node });
  }

  handleNodeRemoved(node) {
    if (!isTextNode(node)) return;

    const { peerId, pairId } = readTermDef(node);
    if (!peerId || !pairId) return;

    const peer = this.findNodeById(peerId);
    if (!peer || !isTextNode(peer)) return;

    if (this.removingIds.has(node.id()) || this.removingIds.has(peer.id())) return;
    this.removingIds.add(node.id());
    this.removingIds.add(peer.id());

    this.app.events.emit("node:change:start", { node: peer });
    this.unpairNode(peer);
    this.app.events.emit("node:changed", { node: peer });

    void this.syncTermDefConnections();

    this.app.events.emit("node:removed", { node: peer });
    peer.destroy();
    this.layer.batchDraw();
  }

  async syncTermDefConnections() {
    const textNodes = this.layer.find((node) => isTextNode(node));
    const nodesById = new Map(textNodes.map((node) => [node.id(), node]));

    const seenPairIds = new Set();
    for (const node of textNodes) {
      const { peerId, pairId, required } = readTermDef(node);
      if (!peerId || !pairId || !required) continue;
      const peer = nodesById.get(peerId);
      if (!peer || !isTextNode(peer)) continue;
      if (seenPairIds.has(pairId)) continue;
      seenPairIds.add(pairId);

      // Connections are purely visual (non-selectable), so we always derive them
      // from the paired text nodes.
      const ids = [node.id(), peer.id()].sort();
      await this.ensureTermDefConnection(pairId, ids[0], ids[1]);
    }

    this.removeDanglingTermDefConnections(seenPairIds);
  }
}
