import {
  BaseCommand,
  BaseContextMenuItem,
  BasePlugin,
  BaseTool,
} from "../core/baseClasses.js";
import { Konva } from "../lib/konva.js";

const GUIDE_TOLERANCE = 6;
const MARQUEE_THRESHOLD = 4;
const CLIPBOARD_KIND = "mind-map-selection";
const CLIPBOARD_VERSION = 1;
const PASTE_OFFSET = 32;
const IMAGE_PASTE_WIDTH = 220;
const IMAGE_PASTE_HEIGHT = 150;

class ArrangeTool extends BaseTool {
  static toolId = "arrange";
  static label = "Move / Zoom / Add";
}

class DeleteSelectionCommand extends BaseCommand {
  static commandId = "selection:delete";
  static label = "Delete Selected";
  static modes = {
    edit: {
      tools: {
        arrange: {},
      },
    },
  };

  execute() {
    this.plugin.deleteSelection();
  }
}

class CopySelectionCommand extends BaseCommand {
  static commandId = "selection:copy";
  static label = "Copy Selected";
  static modes = {
    edit: {
      tools: {
        arrange: {},
      },
    },
  };

  execute() {
    return this.plugin.copySelectionToClipboard();
  }
}

class PasteSelectionCommand extends BaseCommand {
  static commandId = "selection:paste";
  static label = "Paste Components";
  static modes = {
    edit: {
      tools: {
        arrange: {},
      },
    },
  };

  execute() {
    return this.plugin.pasteSelectionFromClipboard();
  }
}

class BringForwardCommand extends BaseCommand {
  static commandId = "selection:bring-forward";
  static label = "Bring Forward";
  static modes = {
    edit: {
      tools: {
        arrange: {},
      },
    },
  };

  execute(target = null) {
    return this.plugin.bringForward(target);
  }
}

class BringToFrontCommand extends BaseCommand {
  static commandId = "selection:bring-to-front";
  static label = "Bring to Front";
  static modes = {
    edit: {
      tools: {
        arrange: {},
      },
    },
  };

  execute(target = null) {
    return this.plugin.bringToFront(target);
  }
}

class SendBackwardCommand extends BaseCommand {
  static commandId = "selection:send-backward";
  static label = "Send Backward";
  static modes = {
    edit: {
      tools: {
        arrange: {},
      },
    },
  };

  execute(target = null) {
    return this.plugin.sendBackward(target);
  }
}

class SendToBackCommand extends BaseCommand {
  static commandId = "selection:send-to-back";
  static label = "Send to Back";
  static modes = {
    edit: {
      tools: {
        arrange: {},
      },
    },
  };

  execute(target = null) {
    return this.plugin.sendToBack(target);
  }
}

function clonePlainData(value) {
  if (value == null) return value;
  return JSON.parse(JSON.stringify(value));
}

function readBlobAsDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error ?? new Error("Failed to read clipboard image."));
    reader.readAsDataURL(blob);
  });
}

function isRankingItemInteractionTarget(target) {
  return Boolean(
    target?.findAncestor?.(".ranking-item-card", true) ||
    target?.findAncestor?.(".ranking-item-delete", true),
  );
}

function isTextNode(node) {
  return node?.getAttr?.("componentType") === "text";
}

function isSelectableNode(node) {
  return !!node?.hasName?.("selectable");
}

function resolveSelectableNode(target) {
  if (!target) return null;
  return target.findAncestor?.(".selectable", true) ?? (target.hasName?.("selectable") ? target : null);
}

function buildLayerAccessory(label, iconText, disabled, execute) {
  return {
    label,
    iconText,
    disabled,
    execute,
  };
}

class BringForwardMenuItem extends BaseContextMenuItem {
  static itemId = "selection:bring-forward-menu";
  static label = "Bring Forward";
  static modes = {
    edit: {
      tools: {
        arrange: {},
      },
    },
  };

  condition(node) {
    return this.plugin.canAdjustLayer(node);
  }

  isDisabled(node) {
    return !this.plugin.canBringForward(node);
  }

  getAccessories(node) {
    return [
      buildLayerAccessory(
        "Bring to Front",
        "↑",
        !this.plugin.canBringToFront(node),
        () => this.app.commands.execute("selection:bring-to-front", node),
      ),
    ];
  }

  execute(node) {
    this.app.commands.execute("selection:bring-forward", node);
  }
}

class SendBackwardMenuItem extends BaseContextMenuItem {
  static itemId = "selection:send-backward-menu";
  static label = "Send Backward";
  static modes = {
    edit: {
      tools: {
        arrange: {},
      },
    },
  };

  condition(node) {
    return this.plugin.canAdjustLayer(node);
  }

  isDisabled(node) {
    return !this.plugin.canSendBackward(node);
  }

  getAccessories(node) {
    return [
      buildLayerAccessory(
        "Send to Back",
        "↓",
        !this.plugin.canSendToBack(node),
        () => this.app.commands.execute("selection:send-to-back", node),
      ),
    ];
  }

  execute(node) {
    this.app.commands.execute("selection:send-backward", node);
  }
}

function isConnectionSnapshot(snapshot) {
  return snapshot?.type === "connection";
}

function normalizePoint(value = {}, fallback = { x: 0, y: 0 }) {
  return {
    x: Number.isFinite(value.x) ? value.x : fallback.x,
    y: Number.isFinite(value.y) ? value.y : fallback.y,
  };
}

function rectsIntersect(a, b) {
  return (
    a.x <= b.x + b.width &&
    a.x + a.width >= b.x &&
    a.y <= b.y + b.height &&
    a.y + a.height >= b.y
  );
}

function hasSelectedAncestor(node, selectedSet) {
  let parent = node?.getParent?.();
  while (parent) {
    if (selectedSet.has(parent)) return true;
    parent = parent.getParent?.();
  }
  return false;
}

function getEditablePasteElement(target) {
  if (target instanceof Element) return target;
  if (target?.parentElement instanceof Element) return target.parentElement;
  return null;
}

function isEditablePasteTarget(target) {
  const element = getEditablePasteElement(target);
  if (!element) return false;
  if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) return true;
  if (element instanceof HTMLSelectElement) return true;
  if (element.closest("input, textarea, select")) return true;
  return element.isContentEditable || Boolean(element.closest("[contenteditable=''], [contenteditable='true'], [contenteditable='plaintext-only']"));
}

function getImageFileFromClipboardData(clipboardData) {
  const item = Array.from(clipboardData?.items ?? []).find((entry) => (
    entry.kind === "file" && typeof entry.type === "string" && entry.type.startsWith("image/")
  ));
  const file = item?.getAsFile?.() ?? null;
  if (file instanceof File || file instanceof Blob) return file;
  return Array.from(clipboardData?.files ?? []).find((entry) => (
    entry instanceof File && entry.type.startsWith("image/")
  )) ?? null;
}

export class SelectionPlugin extends BasePlugin {
  static pluginId = "selection";
  static modes = {
    edit: {
      tools: {
        arrange: {},
      },
    },
  };

  tools() {
    return [ArrangeTool];
  }

  commands() {
    return [
      DeleteSelectionCommand,
      CopySelectionCommand,
      PasteSelectionCommand,
      BringForwardCommand,
      BringToFrontCommand,
      SendBackwardCommand,
      SendToBackCommand,
    ];
  }

  menuItems() {
    return [BringForwardMenuItem, SendBackwardMenuItem];
  }

  onSetup() {
    const { stage, mainLayer: layer, overlayLayer } = this.app;
    this.stage = stage;
    this.layer = layer;
    this.overlayLayer = overlayLayer;

    this.transformer = new Konva.Transformer({
      rotateEnabled: true,
      ignoreStroke: true,
      borderDash: [6, 4],
      anchorCornerRadius: 8,
      anchorSize: 10,
      keepRatio: true,
      flipEnabled: false,
      enabledAnchors: ["top-left", "top-right", "bottom-left", "bottom-right"],
    });

    this.guideLineVertical = new Konva.Line({
      stroke: "#d7612f",
      strokeWidth: 1,
      dash: [6, 6],
      visible: false,
      listening: false,
    });

    this.guideLineHorizontal = new Konva.Line({
      stroke: "#d7612f",
      strokeWidth: 1,
      dash: [6, 6],
      visible: false,
      listening: false,
    });

    this.selectedNodes = [];
    this.lastTextClick = null;
    this.documentMarqueeListenersBound = false;
    this.marquee = {
      active: false,
      selecting: false,
      start: null,
      rect: null,
      additive: false,
    };
    this.suppressNextSelectionClick = false;
    this.handleDocumentPointerMove = (event) => this.forwardDocumentPointerMove(event);
    this.handleDocumentPointerUp = (event) => this.forwardDocumentPointerUp(event);

    this.marqueeRect = new Konva.Rect({
      fill: "rgba(31, 111, 235, 0.08)",
      stroke: "#1f6feb",
      strokeWidth: 1,
      dash: [6, 4],
      visible: false,
      listening: false,
    });

    this.layer.find(".selectable").forEach((node) => {
      this.syncNodeInteractivity(node);
      this.bindNodeChangeSync(node);
    });

    layer.add(this.transformer);
    overlayLayer.add(
      this.guideLineVertical,
      this.guideLineHorizontal,
      this.marqueeRect,
    );

    this.app.keybindings.register("Delete", "selection:delete");
    this.app.keybindings.register("Backspace", "selection:delete");
    this.app.keybindings.register("Mod+C", "selection:copy");
    this.app.keybindings.register("Mod+V", "selection:paste");
    this.cleanups.push(() => this.app.keybindings.unregister("Delete"));
    this.cleanups.push(() => this.app.keybindings.unregister("Backspace"));
    this.cleanups.push(() => this.app.keybindings.unregister("Mod+C"));
    this.cleanups.push(() => this.app.keybindings.unregister("Mod+V"));

    this.listen("node:added", ({ node }) => {
      this.syncNodeInteractivity(node);
      this.bindNodeChangeSync(node);
      if (this.app.isReplayingHistory || this.app.isRestoringDocument) {
        return;
      }
      this.setSelected([node]);
      if (this.app.getMode() !== "edit") {
        this.app.setMode("edit");
      }
      if (this.app.getEditorTool() !== "arrange") {
        this.app.setEditorTool("arrange");
      }
    });

    this.listen("node:removed", ({ node }) => {
      if (!this.selectedNodes.includes(node)) return;
      this.setSelected(this.selectedNodes.filter((selectedNode) => selectedNode !== node));
    });

    this.listen("node:changed", ({ node }) => {
      if (!this.selectedNodes.includes(node)) return;
      this.syncTransformer();
      this.transformer.forceUpdate();
      this.layer.batchDraw();
    });

    this.listen("document:load:start", () => {
      this.clearSelection();
      this.hideGuides();
    });

    this.listen("interaction:change", () => this.syncMode());
    this.listenDom(window, "paste", (event) => {
      void this.handleNativePaste(event);
    });

    stage.on("click.selection tap.selection", (event) => this.handleClick(event));
    stage.on("mousedown.selection touchstart.selection", (event) => this.handlePointerDown(event));
    stage.on("mousemove.selection touchmove.selection", () => this.handlePointerMove());
    stage.on("mouseup.selection touchend.selection", () => this.handlePointerUp());
    stage.on("dragmove.snapGuides transform.snapGuides", (event) => this.handleSnapMove(event));
    stage.on("dragend.snapGuides transformend.snapGuides", () => this.hideGuides());

    this.cleanups.push(() => {
      stage.off(".selection");
      stage.off(".snapGuides");
      this.unbindDocumentMarqueeListeners();
    });
  }

  syncMode() {
    const enabled = this.isEnabled();
    if (!enabled && this.selectedNodes.length) {
      this.clearSelection();
    }
    if (!enabled) {
      this.hideGuides();
      this.cancelMarquee();
      this.overlayLayer.batchDraw();
    }
    this.layer.find(".selectable").forEach((node) => this.syncNodeInteractivity(node));
    this.layer.batchDraw();
  }

  getSelectable(target) {
    if (!target || target === this.stage) return null;
    if (target.hasName?.("selectable")) return target;
    return target.findAncestor(".selectable", true);
  }

  getSelectedNodes() {
    return this.selectedNodes;
  }

  isPointerInsideNode(node) {
    const pointer = this.stage.getPointerPosition();
    if (!pointer || !node?.getStage?.()) return false;

    const point = this.app.stageApi.screenToCanvas(pointer);
    const box = node.getClientRect({
      relativeTo: this.stage,
      skipShadow: true,
      skipStroke: true,
    });

    return (
      point.x >= box.x &&
      point.x <= box.x + box.width &&
      point.y >= box.y &&
      point.y <= box.y + box.height
    );
  }

  getTextClickTarget(target) {
    const selectable = this.getSelectable(target);
    if (isTextNode(selectable)) return selectable;

    const selectedText = this.selectedNodes.length === 1 && isTextNode(this.selectedNodes[0])
      ? this.selectedNodes[0]
      : null;
    return selectedText && this.isPointerInsideNode(selectedText) ? selectedText : null;
  }

  maybeOpenInlineTextEditor(event, textNode) {
    if (!isTextNode(textNode)) {
      this.lastTextClick = null;
      return false;
    }

    const pointer = this.stage.getPointerPosition();
    const now = window.performance?.now?.() ?? Date.now();
    const previous = this.lastTextClick;
    const distance = previous && pointer
      ? Math.hypot(pointer.x - previous.pointer.x, pointer.y - previous.pointer.y)
      : Number.POSITIVE_INFINITY;
    const isRepeatedClick =
      previous?.id === textNode.id() &&
      now - previous.time < 500 &&
      distance < 8;
    const isBrowserDoubleClick = (event.evt?.detail ?? 0) >= 2;

    if (isRepeatedClick || isBrowserDoubleClick) {
      textNode.openInlineEditor?.(event);
      this.lastTextClick = null;
      return true;
    }

    this.lastTextClick = pointer
      ? {
          id: textNode.id(),
          time: now,
          pointer: { x: pointer.x, y: pointer.y },
        }
      : null;
    return false;
  }

  getTransformableNodes(nodes) {
    return nodes.filter((node) => node.getAttr("componentType") !== "connection");
  }

  syncTransformer() {
    const transformableNodes = this.getTransformableNodes(this.selectedNodes);
    const primaryNode = transformableNodes[0] ?? null;
    const transformLocked = Boolean(primaryNode?.getAttr("transformLocked"));
    const primaryType = primaryNode?.getAttr("componentType");
    const isFreeResizeNode = (
      primaryType === "rankingBox" ||
      primaryType === "text" ||
      primaryType === "button" ||
      primaryType === "sticky" ||
      primaryType === "page" ||
      primaryType === "iframe" ||
      primaryType === "javascriptEditor"
    );
    const isMultiSelection = transformableNodes.length > 1;

    this.transformer.rotateEnabled(!transformLocked && !isMultiSelection);
    this.transformer.keepRatio(!isFreeResizeNode || isMultiSelection);
    this.transformer.enabledAnchors(
      transformLocked || isMultiSelection
        ? []
        : isFreeResizeNode
          ? [
              "top-left",
              "top-center",
              "top-right",
              "middle-left",
              "middle-right",
              "bottom-left",
              "bottom-center",
              "bottom-right",
            ]
          : ["top-left", "top-right", "bottom-left", "bottom-right"],
    );
    this.transformer.nodes(transformableNodes);
    this.transformer.moveToTop();
    this.transformer.forceUpdate();
  }

  setSelected(nodes) {
    const unique = [];
    const seen = new Set();
    (nodes || []).filter(Boolean).forEach((node) => {
      const id = node?.id?.();
      if (!id || seen.has(id)) return;
      seen.add(id);
      unique.push(node);
    });
    this.selectedNodes = unique;
    this.syncTransformer();
    this.layer.batchDraw();
    this.app.events.emit("selection:change", { nodes: this.selectedNodes });
  }

  clearSelection() {
    this.setSelected([]);
  }

  resolveLayerTarget(target = null) {
    const selectable = typeof target === "string"
      ? this.layer.findOne(`#${target}`)
      : resolveSelectableNode(target);
    if (isSelectableNode(selectable)) {
      return selectable;
    }
    return this.selectedNodes.length === 1 ? this.selectedNodes[0] : null;
  }

  canAdjustLayer(target = null) {
    return isSelectableNode(this.resolveLayerTarget(target));
  }

  canBringForward(target = null) {
    const node = this.resolveLayerTarget(target);
    if (!node) return false;
    return this.app.getSelectableIndex(node) < this.app.getSelectableSiblingCount(node) - 1;
  }

  canBringToFront(target = null) {
    return this.canBringForward(target);
  }

  canSendBackward(target = null) {
    const node = this.resolveLayerTarget(target);
    if (!node) return false;
    return this.app.getSelectableIndex(node) > 0;
  }

  canSendToBack(target = null) {
    return this.canSendBackward(target);
  }

  reorderLayer(target, canReorder, applyReorder) {
    const node = this.resolveLayerTarget(target);
    if (!node || !canReorder.call(this, node)) return false;

    this.app.events.emit("node:change:start", { node });
    const changed = applyReorder.call(this.app, node);
    if (!changed) {
      return false;
    }

    this.app.events.emit("node:changed", { node });
    this.layer.batchDraw();
    return true;
  }

  bringForward(target = null) {
    return this.reorderLayer(target, this.canBringForward, this.app.bringNodeForward);
  }

  bringToFront(target = null) {
    return this.reorderLayer(target, this.canBringToFront, this.app.bringNodeToFront);
  }

  sendBackward(target = null) {
    return this.reorderLayer(target, this.canSendBackward, this.app.sendNodeBackward);
  }

  sendToBack(target = null) {
    return this.reorderLayer(target, this.canSendToBack, this.app.sendNodeToBack);
  }

  deleteSelection() {
    if (!this.isEnabled()) return;
    const nodes = this.getSelectedNodes();
    if (!nodes.length) return;
    nodes.forEach((node) => {
      this.app.events.emit("node:removed", { node });
      node.destroy();
    });
    this.clearSelection();
    this.layer.batchDraw();
  }

  getSelectableParentId(node) {
    const parent = node?.getParent?.();
    return isSelectableNode(parent) ? parent.id() : null;
  }

  snapshotNode(node, parentId = this.getSelectableParentId(node)) {
    if (!isSelectableNode(node)) return null;
    const component = this.app.components.getByNode(node);
    return component?.serialize?.(node, { parentId }) ?? null;
  }

  getSelectedRootNodes() {
    const selectedSet = new Set(this.selectedNodes);
    return this.selectedNodes.filter((node) => !hasSelectedAncestor(node, selectedSet));
  }

  createClipboardPayload(nodes = this.selectedNodes) {
    const selectedSet = new Set(nodes);
    const roots = nodes.filter((node) => !hasSelectedAncestor(node, selectedSet));
    const snapshots = [];
    const copiedIds = new Set();

    const visit = (node, parentId = this.getSelectableParentId(node)) => {
      if (!isSelectableNode(node)) return;
      if (copiedIds.has(node.id())) return;
      const snapshot = this.snapshotNode(node, parentId);
      if (snapshot) {
        snapshots.push(snapshot);
        copiedIds.add(snapshot.id);
      }

      if (typeof node.getChildren !== "function") return;
      node.getChildren().forEach((child) => {
        if (isSelectableNode(child)) {
          visit(child, node.id());
        }
      });
    };

    roots.forEach((node) => {
      visit(node, selectedSet.has(node.getParent?.()) ? this.getSelectableParentId(node) : null);
    });

    this.layer.find(".selectable")
      .filter((node) => node.getAttr("componentType") === "connection")
      .forEach((node) => {
        if (copiedIds.has(node.id())) return;

        const sourceId = node.getAttr("sourceNodeId");
        const targetId = node.getAttr("targetNodeId");
        if (!copiedIds.has(sourceId) || !copiedIds.has(targetId)) {
          return;
        }

        const snapshot = this.snapshotNode(node, this.getSelectableParentId(node));
        if (!snapshot) return;
        snapshots.push(snapshot);
        copiedIds.add(snapshot.id);
      });

    const filteredSnapshots = snapshots.filter((snapshot) => {
      if (!isConnectionSnapshot(snapshot)) return true;
      const sourceId = snapshot.data?.sourceNodeId;
      const targetId = snapshot.data?.targetNodeId;
      return copiedIds.has(sourceId) && copiedIds.has(targetId);
    });

    return {
      kind: CLIPBOARD_KIND,
      version: CLIPBOARD_VERSION,
      nodes: filteredSnapshots.map((snapshot) => clonePlainData(snapshot)),
    };
  }

  async copySelectionToClipboard() {
    if (!this.isEnabled() || !this.selectedNodes.length) return false;
    const payload = this.createClipboardPayload();
    if (!payload.nodes.length) return false;
    const text = JSON.stringify(payload, null, 2);
    this.internalClipboardText = text;
    if (!navigator.clipboard?.writeText) return true;
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      return true;
    }
    return true;
  }

  normalizeClipboardPayload(value) {
    let parsed = value;
    if (typeof value === "string") {
      try {
        parsed = JSON.parse(value);
      } catch {
        return [];
      }
    }
    const nodes = Array.isArray(parsed)
      ? parsed
      : Array.isArray(parsed?.nodes)
        ? parsed.nodes
        : [];
    return nodes
      .filter((snapshot) => snapshot && typeof snapshot.type === "string")
      .map((snapshot) => clonePlainData(snapshot));
  }

  prepareSnapshotsForPaste(snapshots = []) {
    const sourceIds = new Set(snapshots.map((snapshot) => snapshot.id).filter(Boolean));
    const idMap = new Map();
    sourceIds.forEach((id) => {
      const type = snapshots.find((snapshot) => snapshot.id === id)?.type ?? "node";
      idMap.set(id, `${type}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`);
    });

    return snapshots
      .filter((snapshot) => {
        if (!isConnectionSnapshot(snapshot)) return true;
        return sourceIds.has(snapshot.data?.sourceNodeId) && sourceIds.has(snapshot.data?.targetNodeId);
      })
      .map((snapshot) => {
        const next = clonePlainData(snapshot);
        next.id = idMap.get(snapshot.id) ?? undefined;
        next.parentId = sourceIds.has(snapshot.parentId) ? idMap.get(snapshot.parentId) : null;

        if (isConnectionSnapshot(next)) {
          next.x = Number.isFinite(snapshot.x) ? snapshot.x : 0;
          next.y = Number.isFinite(snapshot.y) ? snapshot.y : 0;
          next.data = {
            ...(next.data ?? {}),
            sourceNodeId: idMap.get(snapshot.data?.sourceNodeId),
            targetNodeId: idMap.get(snapshot.data?.targetNodeId),
          };
        } else {
          next.x = (Number.isFinite(snapshot.x) ? snapshot.x : 0) + PASTE_OFFSET;
          next.y = (Number.isFinite(snapshot.y) ? snapshot.y : 0) + PASTE_OFFSET;
        }

        return next;
      });
  }

  async pasteSnapshots(snapshots = []) {
    if (!this.isEnabled()) return [];
    const prepared = this.prepareSnapshotsForPaste(snapshots);
    if (!prepared.length) return [];

    const regularSnapshots = prepared.filter((snapshot) => !isConnectionSnapshot(snapshot));
    const connectionSnapshots = prepared.filter((snapshot) => isConnectionSnapshot(snapshot));
    const restoredNodes = new Map();
    const pastedNodes = [];

    for (const snapshot of regularSnapshots) {
      const node = await this.restoreNodeSnapshot(snapshot);
      if (node) {
        restoredNodes.set(snapshot.id, node);
        pastedNodes.push(node);
      }
    }

    regularSnapshots.forEach((snapshot) => {
      if (!snapshot.parentId) return;

      const node = restoredNodes.get(snapshot.id);
      const parentNode = restoredNodes.get(snapshot.parentId) ?? this.app.mainLayer.findOne(`#${snapshot.parentId}`);
      if (!node || !parentNode) return;

      node.moveTo(parentNode);
      node.position(normalizePoint(snapshot));
    });

    for (const snapshot of connectionSnapshots) {
      const node = await this.restoreNodeSnapshot(snapshot);
      if (node) {
        restoredNodes.set(snapshot.id, node);
        pastedNodes.push(node);
      }
    }

    this.setSelected(pastedNodes.filter((node) => node.getAttr("componentType") !== "connection"));
    this.app.mainLayer.batchDraw();
    return pastedNodes;
  }

  async pasteSelectionFromClipboard() {
    if (!this.isEnabled()) return false;
    if (await this.pasteImageFromNavigatorClipboard()) {
      return true;
    }

    let text = this.internalClipboardText;
    if (navigator.clipboard?.readText) {
      try {
        text = await navigator.clipboard.readText();
      } catch {
        text = this.internalClipboardText;
      }
    }
    const snapshots = this.normalizeClipboardPayload(text || this.internalClipboardText || "");
    const pastedNodes = await this.pasteSnapshots(snapshots);
    return pastedNodes.length > 0;
  }

  getViewportPastePosition() {
    const viewport = this.app.stageApi.getViewportBounds();
    return {
      x: viewport.x + viewport.width / 2 - IMAGE_PASTE_WIDTH / 2,
      y: viewport.y + viewport.height / 2 - IMAGE_PASTE_HEIGHT / 2,
    };
  }

  async createImageFromSource(src) {
    if (typeof src !== "string" || !src) return null;
    const position = this.getViewportPastePosition();
    return this.app.addComponent("image", {
      ...position,
      src,
    });
  }

  async pasteImageBlob(blob) {
    if (!(blob instanceof Blob)) return null;
    const src = await readBlobAsDataUrl(blob);
    return this.createImageFromSource(src);
  }

  async pasteImageFromNavigatorClipboard() {
    if (!navigator.clipboard?.read) return false;

    try {
      const items = await navigator.clipboard.read();
      for (const item of items) {
        const imageType = item.types.find((type) => type.startsWith("image/"));
        if (!imageType) continue;

        const blob = await item.getType(imageType);
        const node = await this.pasteImageBlob(blob);
        if (node) return true;
      }
    } catch {
      return false;
    }

    return false;
  }

  async handleNativePaste(event) {
    if (!this.isEnabled()) return;
    if (isEditablePasteTarget(event.target)) return;

    const imageFile = getImageFileFromClipboardData(event.clipboardData);
    if (!imageFile) return;

    event.preventDefault();
    await this.pasteImageBlob(imageFile);
  }

  async restoreNodeSnapshot(snapshot = {}) {
    const component = this.app.components.get(snapshot.type);
    if (!component?.restore) return null;

    const node = await component.restore(clonePlainData(snapshot));
    if (!node) return null;

    this.app.mainLayer.add(node);
    this.app.events.emit("node:added", { node });
    return node;
  }

  syncNodeInteractivity(node) {
    if (!node?.hasName?.("selectable")) return;
    node.draggable(Boolean(node.getAttr("baseDraggable")) && this.isEnabled());
  }

  bindNodeChangeSync(node) {
    if (!node?.hasName?.("selectable")) return;
    node.off(".selectionSync");
    node.on("dragstart.selectionSync transformstart.selectionSync", () => {
      if (!node.getStage?.()) return;
      this.app.events.emit("node:change:start", { node });
    });
    node.on("dragmove.selectionSync transform.selectionSync", (event) => {
      if (!node.getStage?.()) return;
      this.app.events.emit("node:changing", { node });
      if (
        event.type === "transform" &&
        (
          node.getAttr("componentType") === "rankingBox" ||
          node.getAttr("componentType") === "text" ||
          node.getAttr("componentType") === "button" ||
          node.getAttr("componentType") === "sticky" ||
          node.getAttr("componentType") === "page" ||
          node.getAttr("componentType") === "iframe" ||
          node.getAttr("componentType") === "javascriptEditor"
        )
      ) {
        this.transformer.forceUpdate();
      }
    });
    node.on("dragend.selectionSync transformend.selectionSync", () => {
      if (!node.getStage?.()) return;
      this.app.events.emit("node:changed", { node });
    });
    this.cleanups.push(() => node.off(".selectionSync"));
  }

  hideGuides() {
    this.guideLineVertical.visible(false);
    this.guideLineHorizontal.visible(false);
    this.overlayLayer.batchDraw();
  }

  getMarqueeBounds() {
    const { start, rect } = this.marquee;
    if (!start || !rect) return null;
    return {
      x: Math.min(start.x, rect.x),
      y: Math.min(start.y, rect.y),
      width: Math.abs(rect.x - start.x),
      height: Math.abs(rect.y - start.y),
    };
  }

  cancelMarquee() {
    this.unbindDocumentMarqueeListeners();
    this.marquee.active = false;
    this.marquee.selecting = false;
    this.marquee.start = null;
    this.marquee.rect = null;
    this.marquee.additive = false;
    this.marqueeRect.visible(false);
    this.overlayLayer.batchDraw();
  }

  bindDocumentMarqueeListeners() {
    if (this.documentMarqueeListenersBound) return;
    this.documentMarqueeListenersBound = true;
    document.addEventListener("mousemove", this.handleDocumentPointerMove, true);
    document.addEventListener("mouseup", this.handleDocumentPointerUp, true);
    document.addEventListener("touchmove", this.handleDocumentPointerMove, true);
    document.addEventListener("touchend", this.handleDocumentPointerUp, true);
    document.addEventListener("touchcancel", this.handleDocumentPointerUp, true);
  }

  unbindDocumentMarqueeListeners() {
    if (!this.documentMarqueeListenersBound) return;
    this.documentMarqueeListenersBound = false;
    document.removeEventListener("mousemove", this.handleDocumentPointerMove, true);
    document.removeEventListener("mouseup", this.handleDocumentPointerUp, true);
    document.removeEventListener("touchmove", this.handleDocumentPointerMove, true);
    document.removeEventListener("touchend", this.handleDocumentPointerUp, true);
    document.removeEventListener("touchcancel", this.handleDocumentPointerUp, true);
  }

  getCanvasPointFromEvent(event = null) {
    const nativeEvent = event?.evt ?? event;
    const touchPoint = nativeEvent?.touches?.[0] ?? nativeEvent?.changedTouches?.[0] ?? null;
    const clientX = touchPoint?.clientX ?? nativeEvent?.clientX;
    const clientY = touchPoint?.clientY ?? nativeEvent?.clientY;

    if (Number.isFinite(clientX) && Number.isFinite(clientY)) {
      const rect = this.stage.container().getBoundingClientRect();
      return this.app.stageApi.screenToCanvas({
        x: clientX - rect.left,
        y: clientY - rect.top,
      });
    }

    const pointer = this.stage.getPointerPosition();
    return pointer ? this.app.stageApi.screenToCanvas(pointer) : null;
  }

  forwardDocumentPointerMove(event) {
    if (!this.marquee.active) return;
    this.handlePointerMove(this.getCanvasPointFromEvent(event));
  }

  forwardDocumentPointerUp(event) {
    if (!this.marquee.active) return;
    const canvasPoint = this.getCanvasPointFromEvent(event);
    if (canvasPoint) {
      this.marquee.rect = canvasPoint;
    }
    this.handlePointerUp();
  }

  handlePointerDown(event) {
    if (!this.isEnabled() || this.app.tools.getActive() !== "arrange") return;
    if (event.evt?.button != null && event.evt.button !== 0) return;
    if (this.app.stageApi.isSpacePressed) return;
    if (this.getSelectable(event.target)) return;
    if (event.target !== this.stage && event.target?.getLayer?.() === this.app.uiLayer) return;
    if (event.evt?.shiftKey !== true) return;

    const canvasPoint = this.getCanvasPointFromEvent(event);
    if (!canvasPoint) return;
    this.marquee = {
      active: true,
      selecting: false,
      start: canvasPoint,
      rect: canvasPoint,
      additive: false,
    };
    this.bindDocumentMarqueeListeners();
  }

  handlePointerMove(canvasPoint = null) {
    if (!this.marquee.active) return;
    const nextCanvasPoint = canvasPoint ?? this.getCanvasPointFromEvent();
    if (!nextCanvasPoint) return;

    this.marquee.rect = nextCanvasPoint;
    const bounds = this.getMarqueeBounds();
    if (!bounds) return;

    if (
      !this.marquee.selecting &&
      Math.hypot(
        nextCanvasPoint.x - this.marquee.start.x,
        nextCanvasPoint.y - this.marquee.start.y,
      ) < MARQUEE_THRESHOLD
    ) {
      return;
    }

    this.marquee.selecting = true;
    this.marqueeRect.setAttrs({
      ...bounds,
      visible: true,
    });
    this.marqueeRect.moveToTop();
    this.overlayLayer.batchDraw();
  }

  handlePointerUp() {
    if (!this.marquee.active) return;
    const wasSelecting = this.marquee.selecting;
    const bounds = this.getMarqueeBounds();
    const addToSelection = this.marquee.additive;

    this.cancelMarquee();
    if (!wasSelecting || !bounds) return;
    this.suppressNextSelectionClick = true;

    const intersecting = this.layer.find(".selectable")
      .filter((node) => (
        node.isVisible() &&
        node.getAttr("componentType") !== "connection" &&
        rectsIntersect(bounds, node.getClientRect({
          relativeTo: this.stage,
          skipShadow: true,
        }))
      ));
    const selectedSet = new Set(intersecting);
    const selected = intersecting.filter((node) => !hasSelectedAncestor(node, selectedSet));

    this.setSelected(addToSelection ? [...this.selectedNodes, ...selected] : selected);
  }

  getGuideStops(skipNode) {
    const vertical = [0, this.stage.width() / 2, this.stage.width()].map(
      (value) => this.app.stageApi.screenToCanvas({ x: value, y: 0 }).x,
    );
    const horizontal = [0, this.stage.height() / 2, this.stage.height()].map(
      (value) => this.app.stageApi.screenToCanvas({ x: 0, y: value }).y,
    );

    this.layer.find(".selectable")
      .filter((node) => (
        node !== skipNode &&
        node.isVisible() &&
        node.getAttr("componentType") !== "connection"
      ))
      .forEach((node) => {
        const box = node.getClientRect({ skipTransform: false });
        vertical.push(box.x, box.x + box.width / 2, box.x + box.width);
        horizontal.push(box.y, box.y + box.height / 2, box.y + box.height);
      });

    return { vertical, horizontal };
  }

  getSnappingEdges(node) {
    const box = node.getClientRect({ skipTransform: false });
    const absPos = node.absolutePosition();
    return {
      vertical: [
        { guide: box.x, offset: absPos.x - box.x },
        { guide: box.x + box.width / 2, offset: absPos.x - box.x - box.width / 2 },
        { guide: box.x + box.width, offset: absPos.x - box.x - box.width },
      ],
      horizontal: [
        { guide: box.y, offset: absPos.y - box.y },
        { guide: box.y + box.height / 2, offset: absPos.y - box.y - box.height / 2 },
        { guide: box.y + box.height, offset: absPos.y - box.y - box.height },
      ],
    };
  }

  findGuide(stops, bounds) {
    const matches = [];
    stops.forEach((stop) => {
      bounds.forEach((bound) => {
        const diff = Math.abs(stop - bound.guide);
        if (diff < GUIDE_TOLERANCE) {
          matches.push({ lineGuide: stop, diff, offset: bound.offset });
        }
      });
    });
    matches.sort((a, b) => a.diff - b.diff);
    return matches[0];
  }

  updateGuides(node) {
    const stops = this.getGuideStops(node);
    const bounds = this.getSnappingEdges(node);
    const verticalGuide = this.findGuide(stops.vertical, bounds.vertical);
    const horizontalGuide = this.findGuide(stops.horizontal, bounds.horizontal);

    if (!verticalGuide && !horizontalGuide) {
      this.hideGuides();
      return;
    }

    const nextPosition = { ...node.absolutePosition() };

    if (verticalGuide) {
      nextPosition.x = verticalGuide.lineGuide + verticalGuide.offset;
      this.guideLineVertical.points([
        verticalGuide.lineGuide,
        this.app.stageApi.screenToCanvas({ x: 0, y: 0 }).y,
        verticalGuide.lineGuide,
        this.app.stageApi.screenToCanvas({ x: 0, y: this.stage.height() }).y,
      ]);
      this.guideLineVertical.visible(true);
    } else {
      this.guideLineVertical.visible(false);
    }

    if (horizontalGuide) {
      nextPosition.y = horizontalGuide.lineGuide + horizontalGuide.offset;
      this.guideLineHorizontal.points([
        this.app.stageApi.screenToCanvas({ x: 0, y: 0 }).x,
        horizontalGuide.lineGuide,
        this.app.stageApi.screenToCanvas({ x: this.stage.width(), y: 0 }).x,
        horizontalGuide.lineGuide,
      ]);
      this.guideLineHorizontal.visible(true);
    } else {
      this.guideLineHorizontal.visible(false);
    }

    node.absolutePosition(nextPosition);
    this.overlayLayer.batchDraw();
  }

  handleClick(event) {
    if (this.app.tools.getActive() !== "arrange") return;
    let targetNode = event.target;
    if (targetNode === this.stage && typeof this.stage?.getIntersection === "function") {
      const pointer = this.stage.getPointerPosition() ?? (() => {
        const { clientX, clientY } = event.evt ?? {};
        if (!Number.isFinite(clientX) || !Number.isFinite(clientY)) return null;
        const rect = this.stage.container().getBoundingClientRect();
        return { x: clientX - rect.left, y: clientY - rect.top };
      })();
      const intersection = pointer ? this.stage.getIntersection(pointer) : null;
      if (intersection) {
        const selectableCandidate = this.getSelectable(intersection);
        const textCandidate = this.getTextClickTarget(intersection);
        if (
          selectableCandidate?.getAttr?.("componentType") === "connection" &&
          selectableCandidate?.getAttr?.("connectionHiddenUntilEndpointSelected") === true
        ) {
          // Transparent/hidden connections should not be selectable via hit-test fallback.
          return;
        }
        const listeningCandidate = selectableCandidate ?? textCandidate;
        if ((selectableCandidate || textCandidate) && listeningCandidate?.listening?.() !== false) {
          targetNode = intersection;
        }
      }
    }

    if (isRankingItemInteractionTarget(targetNode)) return;
    if (this.app.stageApi.consumePanClickSuppression()) {
      return;
    }
    if (this.suppressNextSelectionClick) {
      this.suppressNextSelectionClick = false;
      return;
    }
    if (event.evt && event.evt.button === 2) {
      return;
    }

    const textTarget = this.getTextClickTarget(targetNode);
    if (textTarget && this.maybeOpenInlineTextEditor(event, textTarget)) {
      return;
    }

    const target = this.getSelectable(targetNode);
    if (!target) {
      this.clearSelection();
      return;
    }
    const isMulti = Boolean(event.evt?.metaKey || event.evt?.ctrlKey);
    if (!isMulti) {
      this.setSelected([target]);
      return;
    }

    const alreadySelected = this.selectedNodes.includes(target);
    if (alreadySelected) {
      this.setSelected(this.selectedNodes.filter((node) => node !== target));
      return;
    }
    this.setSelected([...this.selectedNodes, target]);
  }

  handleSnapMove(event) {
    if (!this.isEnabled()) return;
    if (isRankingItemInteractionTarget(event.target)) return;
    const target = this.getSelectable(event.target);
    if (!target) return;
    this.updateGuides(target);
  }
}
