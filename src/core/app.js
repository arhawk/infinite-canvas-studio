import { StageController } from "../stage.js";
import { EventBus } from "./eventBus.js";
import { ToolRegistry } from "./toolRegistry.js";
import { ModeManager } from "./modeManager.js";
import { CommandRegistry } from "./commandRegistry.js";
import { KeybindingRegistry } from "./keybindingRegistry.js";
import { ContextMenuRegistry } from "./contextMenuRegistry.js";
import { ComponentRegistry } from "./componentRegistry.js";

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
    this.modeManager.setMode(mode);
    this.syncCursor();
  }

  getEditorTool() {
    return this.modeManager.getEditorTool();
  }

  setEditorTool(toolId) {
    this.modeManager.setEditorTool(toolId);
    this.syncCursor();
  }

  isReadOnly() {
    return this.modeManager.isReadOnly();
  }

  async addComponent(type, payload) {
    const node = await this.components.create(type, payload);
    if (!node) return null;
    this.mainLayer.add(node);
    this.mainLayer.batchDraw();
    this.events.emit("node:added", { node });
    return node;
  }

  syncCursor() {
    const container = this.stage.container();
    
    if (this.cursorOverride) {
      container.style.cursor = this.cursorOverride;
      return;
    }

    if (this.stageApi.isSpacePressed || this.isReadOnly()) {
      container.style.cursor = "grab";
      return;
    }

    if (this.modeManager.matches({ mode: "edit", editorTool: "arrange" })) {
      container.style.cursor = "default";
    }
  }
}
