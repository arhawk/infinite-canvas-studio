import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { IframeToolbarPlugin } from "../../../src/plugins/iframeToolbar.js";

function createEventBus() {
  const listeners = new Map();

  return {
    on(event, handler) {
      const handlers = listeners.get(event) ?? new Set();
      handlers.add(handler);
      listeners.set(event, handlers);
      return () => handlers.delete(handler);
    },
    emit(event, payload) {
      for (const handler of listeners.get(event) ?? []) {
        handler(payload);
      }
    },
  };
}

function createNode(id = "iframe-1") {
  return {
    id: () => id,
    getAttr: (key) => {
      if (key === "componentType") return "iframe";
      return null;
    },
    getStage: () => ({}),
    getLayer: () => ({ batchDraw: vi.fn() }),
    getClientRect: () => ({ x: 0, y: 0, width: 100, height: 80 }),
  };
}

function createApp() {
  const bus = createEventBus();
  const panelHandle = {
    registerButton: vi.fn(),
    setButtonState: vi.fn(),
    setVisible: vi.fn(),
    queuePosition: vi.fn(),
    unregister: vi.fn(),
  };
  const selectionPlugin = {
    canBringForward: vi.fn(() => true),
    bringForward: vi.fn(() => true),
    canSendBackward: vi.fn(() => true),
    sendBackward: vi.fn(() => true),
    setSelected: vi.fn(),
  };
  const applySerializedData = vi.fn(async (node, data) => {
    node.__serialized = { ...data };
  });
  const serializeNode = vi.fn((node) => ({
    url: node.__serialized?.url ?? "https://example.com",
  }));
  const connectionsPlugin = {
    isConnectable: vi.fn(() => true),
    connectingFromId: null,
  };

  const app = {
    on: bus.on,
    off: vi.fn(),
    events: {
      emit: vi.fn((event, payload) => bus.emit(event, payload)),
    },
    getMode: () => "edit",
    getEditorTool: () => "arrange",
    modeManager: {
      register: () => () => {},
    },
    tools: { register: vi.fn(), unregister: vi.fn() },
    commands: {
      register: vi.fn(),
      unregister: vi.fn(),
      execute: vi.fn(),
    },
    contextMenu: { register: vi.fn(), unregister: vi.fn() },
    floatingToolbar: {
      registerPanel: vi.fn(() => panelHandle),
      syncPopoverOpenState: vi.fn(),
    },
    components: {
      get: vi.fn(() => ({
        serializeNode,
        applySerializedData,
      })),
    },
    getPlugin: vi.fn((id) => {
      if (id === "selection") return selectionPlugin;
      if (id === "connections") return connectionsPlugin;
      if (id === "context-menu") return { hideMenu: vi.fn() };
      return null;
    }),
    plugins: [],
    stage: {
      on: vi.fn(),
      off: vi.fn(),
      setPointersPositions: vi.fn(),
      getPointerPosition: vi.fn(() => null),
      getIntersection: vi.fn(() => null),
      container: vi.fn(() => ({
        getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 }),
      })),
    },
    overlayLayer: { batchDraw: vi.fn() },
    uiLayer: { batchDraw: vi.fn() },
    mainLayer: { findOne: vi.fn(() => null) },
  };

  return {
    app,
    panelHandle,
    selectionPlugin,
    connectionsPlugin,
    serializeNode,
    applySerializedData,
  };
}

describe("IframeToolbarPlugin", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("starts connecting through the existing connection command", () => {
    const { app } = createApp();
    const plugin = new IframeToolbarPlugin(app);
    plugin.setup();
    plugin.selectedIframeNode = createNode("iframe-connect");

    plugin.startConnection();

    expect(app.commands.execute).toHaveBeenCalledWith("connection:connect", "iframe-connect");
    plugin.destroy();
  });

  it("derives the send backward disabled state from the selection plugin", () => {
    const { app, panelHandle, selectionPlugin } = createApp();
    const plugin = new IframeToolbarPlugin(app);
    plugin.setup();
    plugin.selectedIframeNode = createNode("iframe-layer");
    selectionPlugin.canSendBackward.mockReturnValueOnce(false);

    plugin.syncLayerActions();

    expect(panelHandle.setButtonState).toHaveBeenCalledWith("layer:send-backward", expect.objectContaining({
      disabled: true,
      title: "Send Backward",
      label: "Send Backward",
    }));
    plugin.destroy();
  });

  it("derives the bring forward disabled state from the selection plugin", () => {
    const { app, panelHandle, selectionPlugin } = createApp();
    const plugin = new IframeToolbarPlugin(app);
    plugin.setup();
    plugin.selectedIframeNode = createNode("iframe-layer-forward");
    selectionPlugin.canBringForward.mockReturnValueOnce(false);

    plugin.syncLayerActions();

    expect(panelHandle.setButtonState).toHaveBeenCalledWith("layer:bring-forward", expect.objectContaining({
      disabled: true,
      title: "Bring Forward",
      label: "Bring Forward",
    }));
    plugin.destroy();
  });

  it("reuses selection.sendBackward for the layer action", () => {
    const { app, selectionPlugin } = createApp();
    const plugin = new IframeToolbarPlugin(app);
    plugin.setup();
    plugin.selectedIframeNode = createNode("iframe-layer-run");

    plugin.runLayerAction("send-backward");

    expect(selectionPlugin.sendBackward).toHaveBeenCalled();
    plugin.destroy();
  });

  it("reuses selection.bringForward for the layer action", () => {
    const { app, selectionPlugin } = createApp();
    const plugin = new IframeToolbarPlugin(app);
    plugin.setup();
    plugin.selectedIframeNode = createNode("iframe-layer-run-forward");

    plugin.runLayerAction("bring-forward");

    expect(selectionPlugin.bringForward).toHaveBeenCalled();
    plugin.destroy();
  });

  it("applies URL edits through the iframe component serializer flow", async () => {
    const { app, applySerializedData } = createApp();
    const plugin = new IframeToolbarPlugin(app);
    plugin.setup();
    plugin.selectedIframeNode = createNode("iframe-edit");
    plugin.syncEditForm();
    plugin.urlInputEl.value = "https://updated.example.com";

    await plugin.applyEdit({ preserveFocus: false });

    expect(applySerializedData).toHaveBeenCalledWith(plugin.selectedIframeNode, {
      url: "https://updated.example.com",
    });
    expect(plugin.urlInputEl.value).toBe("https://updated.example.com");
    plugin.destroy();
  });
});
