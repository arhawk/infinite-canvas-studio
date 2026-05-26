import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CalcTimerSyncPlugin } from "../../../src/plugins/calcTimerSync.js";

function createEventApp() {
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
    getPlugin(id) {
      return plugins.get(id) ?? null;
    },
    __setPlugin(id, value) {
      plugins.set(id, value);
    },
    tools: { register() {}, unregister() {} },
    commands: { register() {}, unregister() {} },
    contextMenu: { register() {}, unregister() {} },
    modeManager: { register: () => () => {}, isEnabled: () => true, getConfig: () => ({}) },
  };
}

function createViewerClient() {
  const handlers = new Map();
  return {
    on(type, cb) {
      const set = handlers.get(type) ?? new Set();
      set.add(cb);
      handlers.set(type, set);
      return () => set.delete(cb);
    },
    emit(type, payload) {
      for (const cb of handlers.get(type) ?? []) cb(payload);
    },
  };
}

describe("CalcTimerSyncPlugin", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("sets readonly for room clients and applies remote states", () => {
    const app = createEventApp();
    const timer = {
      setReadonly: vi.fn(),
      getSyncState: vi.fn(() => ({ running: false, visible: false })),
      applySyncState: vi.fn(),
      onStateChange: vi.fn(() => () => {}),
    };
    const calculator = {
      setReadonly: vi.fn(),
      getSyncState: vi.fn(() => ({ inputStr: "0", visible: false })),
      applySyncState: vi.fn(),
      onStateChange: vi.fn(() => () => {}),
    };
    const viewerClient = createViewerClient();
    app.__setPlugin("timer", timer);
    app.__setPlugin("binaryCalculator", calculator);
    app.__setPlugin("room-share", {
      host: { connected: false, client: null },
      viewer: { client: viewerClient, joined: true, roomId: "1234" },
    });

    const plugin = new CalcTimerSyncPlugin(app, {});
    plugin.setup();
    vi.runAllTimers();

    expect(timer.setReadonly).toHaveBeenCalledWith(true);
    expect(calculator.setReadonly).toHaveBeenCalledWith(true);

    viewerClient.emit("app:timer-state", { state: { running: true } });
    viewerClient.emit("app:calculator-state", { state: { inputStr: "1010" } });

    expect(timer.applySyncState).toHaveBeenCalledWith({ running: true });
    expect(calculator.applySyncState).toHaveBeenCalledWith({ inputStr: "1010" });
    plugin.destroy();
  });

  it("detaches old viewer client listeners and rebinds to the latest client", () => {
    const app = createEventApp();
    const timer = {
      setReadonly: vi.fn(),
      getSyncState: vi.fn(() => ({ running: false, visible: false })),
      applySyncState: vi.fn(),
      onStateChange: vi.fn(() => () => {}),
    };
    const calculator = {
      setReadonly: vi.fn(),
      getSyncState: vi.fn(() => ({ inputStr: "0", visible: false })),
      applySyncState: vi.fn(),
      onStateChange: vi.fn(() => () => {}),
    };
    const viewerClientA = createViewerClient();
    const viewerClientB = createViewerClient();
    const roomShare = {
      host: { connected: false, client: null },
      viewer: { client: viewerClientA, joined: true, roomId: "1234" },
    };
    app.__setPlugin("timer", timer);
    app.__setPlugin("binaryCalculator", calculator);
    app.__setPlugin("room-share", roomShare);

    const plugin = new CalcTimerSyncPlugin(app, {});
    plugin.setup();
    vi.runAllTimers();

    roomShare.viewer.client = viewerClientB;
    app.emit("room:share:change");
    vi.runAllTimers();

    viewerClientA.emit("app:timer-state", { state: { running: true } });
    viewerClientB.emit("app:timer-state", { state: { running: false, visible: true } });

    expect(timer.applySyncState).toHaveBeenCalledTimes(1);
    expect(timer.applySyncState).toHaveBeenCalledWith({ running: false, visible: true });
    plugin.destroy();
  });

  it("relays local changes only from control host", () => {
    const app = createEventApp();
    const hostClient = { send: vi.fn() };
    let timerChange = null;
    let calculatorChange = null;
    const timer = {
      setReadonly: vi.fn(),
      getSyncState: vi.fn(() => ({ running: false, visible: false })),
      applySyncState: vi.fn(),
      onStateChange: vi.fn((cb) => {
        timerChange = cb;
        return () => {
          timerChange = null;
        };
      }),
    };
    const calculator = {
      setReadonly: vi.fn(),
      getSyncState: vi.fn(() => ({ inputStr: "0", visible: false })),
      applySyncState: vi.fn(),
      onStateChange: vi.fn((cb) => {
        calculatorChange = cb;
        return () => {
          calculatorChange = null;
        };
      }),
    };
    app.__setPlugin("timer", timer);
    app.__setPlugin("binaryCalculator", calculator);
    app.__setPlugin("room-share", {
      host: { connected: true, client: hostClient },
      viewer: { client: null },
    });

    const plugin = new CalcTimerSyncPlugin(app, {});
    plugin.setup();
    vi.runAllTimers();

    timerChange?.({ running: true });
    calculatorChange?.({ inputStr: "7" });

    expect(hostClient.send).toHaveBeenCalledWith("app:timer-state", { state: { running: true } });
    expect(hostClient.send).toHaveBeenCalledWith("app:calculator-state", { state: { inputStr: "7" } });
    plugin.destroy();
  });

  it("pushes current widget states once when a viewer joins", () => {
    const app = createEventApp();
    const hostClient = { send: vi.fn() };
    const timerState = { running: true, visible: true };
    const calculatorState = { inputStr: "42", visible: true };
    const timer = {
      setReadonly: vi.fn(),
      getSyncState: vi.fn(() => timerState),
      applySyncState: vi.fn(),
      onStateChange: vi.fn(() => () => {}),
    };
    const calculator = {
      setReadonly: vi.fn(),
      getSyncState: vi.fn(() => calculatorState),
      applySyncState: vi.fn(),
      onStateChange: vi.fn(() => () => {}),
    };
    app.__setPlugin("timer", timer);
    app.__setPlugin("binaryCalculator", calculator);
    app.__setPlugin("room-share", {
      host: { connected: true, client: hostClient },
      viewer: { client: null },
    });

    const plugin = new CalcTimerSyncPlugin(app, {});
    plugin.setup();
    vi.runAllTimers();

    app.emit("room:viewer:joined");
    vi.runAllTimers();

    expect(hostClient.send).toHaveBeenCalledWith("app:timer-state", { state: timerState });
    expect(hostClient.send).toHaveBeenCalledWith("app:calculator-state", { state: calculatorState });
    plugin.destroy();
  });
});
