import { StageController } from "../stage.js";
import { EventBus } from "./eventBus.js";
import { ToolRegistry } from "./toolRegistry.js";
import { ModeManager } from "./modeManager.js";
import { CommandRegistry } from "./commandRegistry.js";
import { KeybindingRegistry } from "./keybindingRegistry.js";
import { ContextMenuRegistry } from "./contextMenuRegistry.js";
import { ComponentRegistry } from "./componentRegistry.js";
import { FloatingToolbarManager } from "./floatingToolbar.js";

function isSelectableNode(node) {
  return !!node?.hasName?.("selectable");
}

function participatesInLayerOrder(node) {
  return isSelectableNode(node) && node?.getAttr?.("excludeFromLayerOrder") !== true;
}

export class App {
  constructor({ container }) {
    this.events = new EventBus();
    this.tools = new ToolRegistry(this.events);
    this.modeManager = new ModeManager({
      eventBus: this.events,
      toolRegistry: this.tools,
    });
    this.commands = new CommandRegistry(this);
    this.keybindings = new KeybindingRegistry(this.commands);
    this.contextMenu = new ContextMenuRegistry(this);
    this.components = new ComponentRegistry();
    this.floatingToolbar = new FloatingToolbarManager(this);

    this.stageApi = new StageController(container, {
      onZoomChange: (zoom) => {
        this.events.emit("zoom:change", { zoom });
      },
      onViewportChange: (payload) => {
        this.events.emit("viewport:change", payload);
      },
    });
    this.stage = this.stageApi.stage;
    this.mainLayer = this.stageApi.mainLayer;
    this.drawLayer = this.stageApi.drawLayer;
    this.overlayLayer = this.stageApi.overlayLayer;
    this.uiLayer = this.stageApi.uiLayer;

    this.plugins = [];
    this.cursorOverride = null;
    this.isReplayingHistory = false;
    this.isRestoringDocument = false;
    this.isApplyingRemotePatch = false;
    this.presentationLockReason = null;
    this.activeInlineTextEditor = null;
    this.history = null;
    this.documentManager = null;

    this.stage.setAttr("app", this);
  }

  setCursorOverride(cursor) {
    this.cursorOverride = cursor;
    this.syncCursor();
  }

  clearCursorOverride() {
    this.cursorOverride = null;
    this.syncCursor();
  }

  use(PluginClass, options) {
    const plugin = new PluginClass(this, options);
    this.plugins.push(plugin);
    return plugin;
  }

  getPlugin(pluginId) {
    if (typeof pluginId !== "string" || !pluginId) return null;
    return this.plugins.find((plugin) => plugin?.constructor?.pluginId === pluginId) ?? null;
  }

  start() {
    for (const plugin of this.plugins) {
      plugin.setup();
    }
    this.modeManager.sync();
    this.syncCursor();
  }

  destroy() {
    for (const plugin of this.plugins.reverse()) {
      plugin.destroy();
    }
    this.plugins.length = 0;
    this.keybindings.destroy();
    this.floatingToolbar.destroy();
    this.stageApi.destroy();
  }

  on(event, handler) {
    return this.events.on(event, handler);
  }

  off(event, handler) {
    return this.events.off(event, handler);
  }

  getMode() {
    return this.modeManager.getMode();
  }

  setMode(mode) {
    if (this.presentationLockReason && mode === "edit") {
      const canCoEdit = this.getPlugin?.("room-share")?.canRoomClientEdit?.();
      if (!canCoEdit) {
        if (this.modeManager.getMode() !== "presentation") {
          this.modeManager.setMode("presentation");
        }
        this.syncCursor();
        return;
      }
      this.presentationLockReason = null;
    }
    this.modeManager.setMode(mode);
    this.syncCursor();
  }

  lockPresentationMode(reason = "locked") {
    this.presentationLockReason = reason || "locked";
    this.setMode("presentation");
  }

  unlockPresentationMode(reason = null) {
    if (reason && this.presentationLockReason !== reason) return;
    this.presentationLockReason = null;
  }

  isPresentationModeLocked() {
    return Boolean(this.presentationLockReason);
  }

  getEditorTool() {
    return this.modeManager.getEditorTool();
  }

  setEditorTool(toolId) {
    this.modeManager.setEditorTool(toolId);
    this.syncCursor();
  }

  isReadOnly() {
    return this.isPresentationModeLocked() || this.modeManager.isReadOnly();
  }

  getBackgroundState() {
    return this.stageApi.getBackgroundState();
  }

  setBackgroundState(state, { silent = false } = {}) {
    const before = this.getBackgroundState();
    const after = this.stageApi.setBackgroundState(state);

    if (!silent && JSON.stringify(before) !== JSON.stringify(after)) {
      this.events.emit("background:change", { before, after });
    }

    return after;
  }

  async addComponent(type, payload) {
    const node = await this.components.create(type, payload);
    if (!node) return null;
    this.mainLayer.add(node);
    this.mainLayer.draw();
    this.events.emit("node:added", { node });
    return node;
  }

  syncCursor() {
    const container = this.stage.container();
    const activeToolId = this.modeManager.getEditorTool();
    
    if (this.cursorOverride) {
      container.style.cursor = this.cursorOverride;
      return;
    }

    if (["pen", "pencil", "highlighter", "eraser", "shape"].includes(activeToolId)) {
      container.style.cursor = "crosshair";
      return;
    }

    if (this.stageApi.isSpacePressed || this.isReadOnly()) {
      container.style.cursor = "grab";
      return;
    }

    if (this.modeManager.matches({ mode: "edit", editorTool: "arrange" })) {
      container.style.cursor = "default";
      return;
    }

    container.style.cursor = "default";
  }

  getSelectableParent(node) {
    const parent = node?.getParent?.();
    return isSelectableNode(parent) ? parent : this.mainLayer;
  }

  getSelectableSiblings(node) {
    const parent = this.getSelectableParent(node);
    return parent?.getChildren
      ? Array.from(parent.getChildren()).filter((child) => participatesInLayerOrder(child))
      : [];
  }

  getSelectableIndex(node) {
    return this.getSelectableSiblings(node).findIndex((child) => child === node);
  }

  getSelectableSiblingCount(node) {
    return this.getSelectableSiblings(node).length;
  }

  getSelectableStackIndex(node) {
    if (!node) return -1;

    if (typeof node.getAbsoluteZIndex === "function") {
      const absoluteIndex = node.getAbsoluteZIndex();
      if (Number.isFinite(absoluteIndex)) return absoluteIndex;
    }

    const chain = [];
    let current = node;
    while (current) {
      chain.unshift(current.zIndex?.() ?? 0);
      current = current.getParent?.() ?? null;
    }

    return chain.reduce((total, value) => total * 1000 + value, 0);
  }

  applySelectableOrder(parent, orderedSelectableChildren = []) {
    if (!parent?.getChildren) return false;

    const allChildren = Array.from(parent.getChildren());
    const selectableChildren = allChildren.filter((child) => participatesInLayerOrder(child));
    if (!selectableChildren.length) return false;

    const sameMembers =
      selectableChildren.length === orderedSelectableChildren.length &&
      orderedSelectableChildren.every((child) => selectableChildren.includes(child));
    if (!sameMembers) return false;

    let selectableIndex = 0;
    const finalOrder = allChildren.map((child) => (
      participatesInLayerOrder(child) ? orderedSelectableChildren[selectableIndex++] : child
    ));

    // Rebuild the sibling order without disturbing non-selectable children such as the transformer.
    finalOrder.forEach((child) => child.moveToTop());
    return true;
  }

  setSelectableIndex(node, nextIndex) {
    if (!isSelectableNode(node)) return false;

    const siblings = this.getSelectableSiblings(node);
    const currentIndex = siblings.findIndex((child) => child === node);
    if (currentIndex < 0) return false;

    const clampedIndex = Math.max(0, Math.min(siblings.length - 1, Math.floor(nextIndex)));
    if (clampedIndex === currentIndex) return false;

    const reordered = [...siblings];
    reordered.splice(currentIndex, 1);
    reordered.splice(clampedIndex, 0, node);
    return this.applySelectableOrder(this.getSelectableParent(node), reordered);
  }

  bringNodeForward(node) {
    return this.setSelectableIndex(node, this.getSelectableIndex(node) + 1);
  }

  bringNodeToFront(node) {
    return this.setSelectableIndex(node, this.getSelectableSiblingCount(node) - 1);
  }

  sendNodeBackward(node) {
    return this.setSelectableIndex(node, this.getSelectableIndex(node) - 1);
  }

  sendNodeToBack(node) {
    return this.setSelectableIndex(node, 0);
  }

  getSelectableDescendants(rootNode) {
    if (!rootNode?.find) return [];
    return Array.from(rootNode.find((node) => (
      node !== rootNode &&
      isSelectableNode(node) &&
      node?.getStage?.()
    )) ?? []);
  }

  destroySelectableNodeTree(rootNode, { draw = true } = {}) {
    if (!isSelectableNode(rootNode) || !rootNode?.getStage?.()) return false;

    const layer = rootNode.getLayer?.() ?? null;
    this.getSelectableDescendants(rootNode)
      .slice()
      .reverse()
      .forEach((node) => {
        this.events.emit("node:removed", { node });
      });

    this.events.emit("node:removed", { node: rootNode });
    rootNode.destroy();

    if (draw) {
      layer?.batchDraw?.();
    }

    return true;
  }
}
