import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let lastHostClient = null;

vi.mock("../../../src/online/roomHost.js", () => ({
  createRoom: vi.fn(),
  createHostClient: vi.fn(() => {
    const handlers = new Map();
    const client = {
      on(type, handler) {
        handlers.set(type, handler);
      },
      emit(type, payload = {}) {
        handlers.get(type)?.(payload);
      },
      connect: vi.fn(),
      close: vi.fn(),
      send: vi.fn(),
    };
    lastHostClient = client;
    return client;
  }),
}));

vi.mock("../../../src/online/roomViewer.js", () => ({
  createViewerClient: vi.fn(() => {
    const handlers = new Map();
    return {
      on(type, handler) {
        handlers.set(type, handler);
      },
      emit(type, payload = {}) {
        handlers.get(type)?.(payload);
      },
      connect: vi.fn(),
      close: vi.fn(),
      send: vi.fn(),
    };
  }),
}));

vi.mock("qrcode", () => ({
  default: {
    toCanvas: vi.fn(async () => {}),
  },
}));

import { RoomSharePlugin } from "../../../src/plugins/roomShare.js";

function createApp() {
  const listeners = new Map();
  const plugins = new Map();
  return {
    on(event, handler) {
      const set = listeners.get(event) ?? new Set();
      set.add(handler);
      listeners.set(event, set);
      return () => set.delete(handler);
    },
    emit(event, payload) {
      for (const handler of listeners.get(event) ?? []) handler(payload);
    },
    tools: { register() {}, unregister() {} },
    commands: { register() {}, unregister() {} },
    contextMenu: { register() {}, unregister() {} },
    modeManager: { register: () => () => {}, isEnabled: () => true, getConfig: () => ({}) },
    documentManager: {
      loadDocument: vi.fn(async () => {}),
      exportDocument: vi.fn(async () => ({ nodes: [] })),
    },
    getMode: () => "edit",
    getPlugin(pluginId) {
      return plugins.get(pluginId) ?? null;
    },
    __setPlugin(pluginId, plugin) {
      plugins.set(pluginId, plugin);
    },
    isRestoringDocument: false,
  };
}

describe("RoomSharePlugin room-only sync", () => {
  beforeEach(() => {
    document.body.innerHTML = `<button data-testid="share-btn"></button>`;
    lastHostClient = null;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("applies incoming room state on host client", async () => {
    const app = createApp();
    const plugin = new RoomSharePlugin(app, {
      shareEl: document.querySelector('[data-testid="share-btn"]'),
    });
    plugin.setup();
    plugin.connectHost({ roomId: "1234", hostToken: "token" });

    const documentSnapshot = { schemaVersion: 1, nodes: [] };
    lastHostClient.emit("room:state", { document: documentSnapshot });
    await Promise.resolve();

    expect(app.documentManager.loadDocument).toHaveBeenCalledTimes(1);
    expect(app.documentManager.loadDocument).toHaveBeenCalledWith(documentSnapshot, { source: "room" });
    plugin.destroy();
  });

  it("does not rebroadcast while applying remote room state", async () => {
    vi.useFakeTimers();
    const app = createApp();
    app.documentManager.loadDocument = vi.fn(async () => {
      app.emit("document:load:end");
    });
    const plugin = new RoomSharePlugin(app, {
      shareEl: document.querySelector('[data-testid="share-btn"]'),
    });
    plugin.setup();
    plugin.host.connected = true;
    const sendSpy = vi.spyOn(plugin, "sendHostState").mockResolvedValue();
    plugin.connectHost({ roomId: "1234", hostToken: "token" });

    lastHostClient.emit("room:state", { document: { schemaVersion: 1, nodes: [] } });
    await Promise.resolve();
    vi.runAllTimers();

    expect(sendSpy).not.toHaveBeenCalled();
    plugin.destroy();
  });

  it("applies remote timer/calculator app events to plugins", () => {
    const app = createApp();
    const timerPlugin = { applySyncState: vi.fn() };
    const calculatorPlugin = { applySyncState: vi.fn() };
    app.__setPlugin("timer", timerPlugin);
    app.__setPlugin("binaryCalculator", calculatorPlugin);

    const plugin = new RoomSharePlugin(app, {
      shareEl: document.querySelector('[data-testid="share-btn"]'),
    });
    plugin.setup();
    plugin.startSession("room", "1234");
    const client = plugin.viewer.client;
    client.emit("app:timer-state", { state: { running: true } });
    client.emit("app:calculator-state", { state: { visible: true } });

    expect(timerPlugin.applySyncState).toHaveBeenCalledWith({ running: true }, { remote: true });
    expect(calculatorPlugin.applySyncState).toHaveBeenCalledWith({ visible: true }, { remote: true });
    plugin.destroy();
  });

  it("does not relay timer state during remote app-state guard window", async () => {
    const app = createApp();
    const plugin = new RoomSharePlugin(app, {
      shareEl: document.querySelector('[data-testid="share-btn"]'),
    });
    plugin.setup();
    plugin.applyRemoteAppState("app:timer-state", { running: true });

    app.emit("timer:state-change", { running: false });
    await new Promise((resolve) => setTimeout(resolve, 120));

    expect(plugin.host.client).toBeNull();
    plugin.destroy();
  });
});
