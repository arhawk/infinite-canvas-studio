import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../src/lib/icons.js", () => ({
  renderIcons: vi.fn(),
}));

import { TimerPlugin } from "../../../src/plugins/timer.js";

let plugin;
let roomShare;

function createDom() {
  document.body.innerHTML = `
    <button id="timer-toggle" type="button" aria-pressed="false"></button>
    <div id="timer-widget" hidden>
      <div id="timer-header"></div>
      <button class="timer-widget__tab" data-mode="timer"></button>
      <button class="timer-widget__tab" data-mode="stopwatch"></button>
      <div id="timer-display"></div>
      <button id="timer-start-pause" type="button">Start</button>
      <button id="timer-reset" type="button">Reset</button>
      <div id="timer-duration-row"></div>
      <input id="timer-mm" value="1" />
      <input id="timer-ss" value="0" />
      <button id="timer-close" type="button">Close</button>
    </div>
  `;
}

function setupPlugin() {
  roomShare = { host: { connected: false }, viewer: { client: null } };
  plugin = new TimerPlugin({
    getPlugin(id) {
      return id === "room-share" ? roomShare : null;
    },
    tools: { register() {}, unregister() {} },
    commands: { register() {}, unregister() {} },
    contextMenu: { register() {}, unregister() {} },
    modeManager: { register: () => () => {}, isEnabled: () => true, getConfig: () => ({}) },
    on() {
      return () => {};
    },
  }, {
    toggleEl: document.querySelector("#timer-toggle"),
    widgetEl: document.querySelector("#timer-widget"),
    headerEl: document.querySelector("#timer-header"),
    closeEl: document.querySelector("#timer-close"),
    displayEl: document.querySelector("#timer-display"),
    startPauseEl: document.querySelector("#timer-start-pause"),
    resetEl: document.querySelector("#timer-reset"),
    mmInputEl: document.querySelector("#timer-mm"),
    ssInputEl: document.querySelector("#timer-ss"),
    durationRowEl: document.querySelector("#timer-duration-row"),
  });
  plugin.setup();
  return plugin;
}

describe("TimerPlugin", () => {
  beforeEach(() => {
    createDom();
    setupPlugin();
  });

  afterEach(() => {
    plugin?.destroy();
    plugin = null;
    document.body.innerHTML = "";
  });

  it("setReadonly disables interactions", () => {
    document.querySelector("#timer-toggle").click();
    plugin.setReadonly(true);
    document.querySelector("#timer-start-pause").click();
    expect(plugin.state.running).toBe(false);
    expect(document.querySelector("#timer-toggle").disabled).toBe(true);
  });

  it("applySyncState updates timer state without state-change loop", () => {
    const handler = vi.fn();
    plugin.onStateChange(handler);
    plugin.applySyncState({
      mode: "timer",
      running: false,
      elapsed: 0,
      remaining: 5000,
      timerDuration: 5000,
      finished: false,
      visible: true,
    });

    expect(document.querySelector("#timer-display").textContent).toContain("00:05");
    expect(handler).not.toHaveBeenCalled();
  });

  it("syncs inline position through getSyncState/applySyncState", () => {
    const widget = document.querySelector("#timer-widget");
    widget.style.left = "130px";
    widget.style.top = "45px";
    const syncState = plugin.getSyncState();
    expect(syncState.position).toEqual({ left: 130, top: 45 });

    plugin.applySyncState({ visible: true, position: { left: 210, top: 95 } });
    expect(widget.style.left).toBe("210px");
    expect(widget.style.top).toBe("95px");
    expect(widget.style.right).toBe("auto");
    expect(widget.style.bottom).toBe("auto");

    plugin.applySyncState({ visible: true, position: null });
    expect(widget.style.left).toBe("");
    expect(widget.style.top).toBe("");
    expect(widget.style.right).toBe("");
    expect(widget.style.bottom).toBe("");
  });

  it("blocks dragging for viewer clients", () => {
    const widget = document.querySelector("#timer-widget");
    widget.hidden = false;
    widget.setPointerCapture = vi.fn();
    roomShare.viewer.client = {};

    const event = new Event("pointerdown", { bubbles: true, cancelable: true });
    Object.assign(event, {
      pointerId: 1,
      clientX: 40,
      clientY: 40,
    });
    widget.dispatchEvent(event);

    expect(widget.style.cursor).toBe("");
    expect(widget.setPointerCapture).not.toHaveBeenCalled();
  });

  it("allows dragging for room host", () => {
    const widget = document.querySelector("#timer-widget");
    widget.hidden = false;
    widget.setPointerCapture = vi.fn();
    roomShare.host.connected = true;

    const event = new Event("pointerdown", { bubbles: true, cancelable: true });
    Object.assign(event, {
      pointerId: 1,
      clientX: 40,
      clientY: 40,
    });
    widget.dispatchEvent(event);

    expect(widget.style.cursor).toBe("grabbing");
    expect(widget.setPointerCapture).toHaveBeenCalledWith(1);
  });
});
