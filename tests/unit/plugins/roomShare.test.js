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
    events: {
      emit(event, payload) {
        for (const handler of listeners.get(event) ?? []) handler(payload);
      },
    },
    tools: { register() {}, unregister() {} },
    commands: { register() {}, unregister() {} },
    contextMenu: { register() {}, unregister() {} },
    modeManager: { register: () => () => {}, isEnabled: () => true, getConfig: () => ({}) },
    documentManager: {
      loadDocument: vi.fn(async () => {}),
      getDocumentSnapshot: vi.fn(() => ({ schemaVersion: 1, documentId: "doc-1", revision: 0, nodes: [] })),
      getCollaborationRevision: vi.fn(() => 0),
      setCollaborationRevision: vi.fn(),
      advanceCollaborationRevision: vi.fn(() => 1),
    },
    history: {
      applyCollaborationOperations: vi.fn(async () => {}),
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

  it("applies incoming room state on viewer client", async () => {
    const app = createApp();
    const pageComparePlugin = {
      applyRoomCompareState: vi.fn(),
      exportRoomCompareState: vi.fn(() => ({ isOpen: false })),
    };
    app.__setPlugin("page-compare", pageComparePlugin);
    const plugin = new RoomSharePlugin(app, {
      shareEl: document.querySelector('[data-testid="share-btn"]'),
    });
    plugin.setup();
    await plugin.startViewer("1234");

    const documentSnapshot = { schemaVersion: 1, nodes: [] };
    const compareState = { isOpen: false };
    plugin.viewer.client.emit("room:state", { document: documentSnapshot, compareState });
    await Promise.resolve();

    expect(app.documentManager.loadDocument).toHaveBeenCalledTimes(1);
    expect(app.documentManager.loadDocument).toHaveBeenCalledWith(documentSnapshot, { source: "room" });
    expect(pageComparePlugin.applyRoomCompareState).toHaveBeenCalledWith(compareState);
    expect(app.documentManager.loadDocument.mock.invocationCallOrder[0])
      .toBeLessThan(pageComparePlugin.applyRoomCompareState.mock.invocationCallOrder[0]);
    plugin.destroy();
  });

  it("includes compare state in host room state payload", async () => {
    const app = createApp();
    const compareState = { isOpen: true, openPageIds: ["p1", "p2"] };
    app.__setPlugin("page-compare", {
      exportRoomCompareState: vi.fn(() => compareState),
    });
    const plugin = new RoomSharePlugin(app, {
      shareEl: document.querySelector('[data-testid="share-btn"]'),
    });
    plugin.setup();
    plugin.connectHost({ roomId: "1234", hostToken: "token" });
    lastHostClient.emit("host:joined");
    await Promise.resolve();

    const stateCall = lastHostClient.send.mock.calls.find(([type]) => type === "room:state");
    expect(stateCall).toBeTruthy();
    expect(stateCall[1]).toMatchObject({
      document: { nodes: [] },
      compareState,
    });
    plugin.destroy();
  });

  it("applies incremental room patches without reloading the full document", async () => {
    const app = createApp();
    const plugin = new RoomSharePlugin(app, {
      shareEl: document.querySelector('[data-testid="share-btn"]'),
    });
    plugin.setup();
    await plugin.startViewer("1234");
    plugin.viewer.receivedState = true;
    plugin.viewer.client.emit("room:patch", {
      baseRevision: 0,
      revision: 1,
      operations: [{ type: "add-drawing", snapshot: { id: "d1", points: [0, 0] } }],
    });
    await Promise.resolve();

    expect(app.history.applyCollaborationOperations).toHaveBeenCalledTimes(1);
    expect(app.documentManager.loadDocument).not.toHaveBeenCalled();
    expect(app.documentManager.setCollaborationRevision).toHaveBeenCalledWith(1);
    plugin.destroy();
  });

  it("grants co-editor access to a targeted viewer", async () => {
    const app = createApp();
    app.setMode = vi.fn();
    app.setEditorTool = vi.fn();
    app.unlockPresentationMode = vi.fn();
    app.getPlugin = vi.fn(() => ({ syncUi: vi.fn() }));
    app.events.emit = vi.fn();
    const plugin = new RoomSharePlugin(app, {
      shareEl: document.querySelector('[data-testid="share-btn"]'),
    });
    plugin.setup();
    await plugin.startViewer("1234");
    plugin.viewer.viewerId = "viewer-1";

    plugin.viewer.client.emit("app:collab-grant", {
      viewerId: "viewer-1",
      editorToken: "token-1",
    });

    expect(plugin.viewer.isCoEditor).toBe(true);
    expect(app.unlockPresentationMode).toHaveBeenCalled();
    expect(app.setMode).toHaveBeenCalledWith("edit");
    expect(app.setEditorTool).toHaveBeenCalledWith("arrange");
    expect(document.body.classList.contains("is-room-coeditor")).toBe(true);
    expect(document.body.classList.contains("is-room-viewer")).toBe(false);
    plugin.destroy();
  });

  it("exposes co-editor edit capability helpers", () => {
    const app = createApp();
    const plugin = new RoomSharePlugin(app, {
      shareEl: document.querySelector('[data-testid="share-btn"]'),
    });
    plugin.setup();
    plugin.viewer.client = { close: vi.fn() };
    expect(plugin.isRoomReadOnlyClient()).toBe(true);
    expect(plugin.canRoomClientEdit()).toBe(false);
    plugin.viewer.isCoEditor = true;
    expect(plugin.isRoomReadOnlyClient()).toBe(false);
    expect(plugin.canRoomClientEdit()).toBe(true);
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

});
