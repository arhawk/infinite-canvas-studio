import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../src/lib/icons.js", () => ({
  renderIcons: vi.fn(),
}));

import { TimerPlugin } from "../../../src/plugins/timer.js";

let plugin;
let app;

function createDom() {
  document.body.innerHTML = `
    <button id="timer-toggle" type="button" aria-pressed="false"></button>
    <div id="timer-widget" hidden>
      <div class="timer-widget__header">Timer</div>
      <button id="timer-close" type="button">x</button>
      <div id="timer-display"></div>
      <button id="timer-start" type="button">Start</button>
      <button id="timer-reset" type="button">Reset</button>
      <input id="timer-mm" value="1" />
      <input id="timer-ss" value="0" />
      <div id="timer-duration"></div>
      <button class="timer-widget__tab" data-mode="timer"></button>
      <button class="timer-widget__tab" data-mode="stopwatch"></button>
    </div>
  `;
}

function setup() {
  app = { emit: vi.fn() };
  plugin = new TimerPlugin(app, {
    toggleEl: document.querySelector("#timer-toggle"),
    widgetEl: document.querySelector("#timer-widget"),
    headerEl: document.querySelector(".timer-widget__header"),
    closeEl: document.querySelector("#timer-close"),
    displayEl: document.querySelector("#timer-display"),
    startPauseEl: document.querySelector("#timer-start"),
    resetEl: document.querySelector("#timer-reset"),
    mmInputEl: document.querySelector("#timer-mm"),
    ssInputEl: document.querySelector("#timer-ss"),
    durationRowEl: document.querySelector("#timer-duration"),
  });
  plugin.setup();
}

describe("TimerPlugin sync state", () => {
  beforeEach(() => {
    createDom();
    setup();
  });

  afterEach(() => {
    plugin?.destroy();
    plugin = null;
    app = null;
    document.body.innerHTML = "";
  });

  it("supports export/apply sync roundtrip", () => {
    document.querySelector("#timer-toggle").click();
    document.querySelector("#timer-start").click();
    const state = plugin.exportSyncState();

    const host = document.createElement("div");
    host.innerHTML = `
      <button id="timer-toggle-2" type="button" aria-pressed="false"></button>
      <div id="timer-widget-2" hidden>
        <div class="timer-widget__header">Timer</div>
        <button id="timer-close-2" type="button">x</button>
        <div id="timer-display-2"></div>
        <button id="timer-start-2" type="button">Start</button>
        <button id="timer-reset-2" type="button">Reset</button>
        <input id="timer-mm-2" value="1" />
        <input id="timer-ss-2" value="0" />
        <div id="timer-duration-2"></div>
        <button class="timer-widget__tab" data-mode="timer"></button>
        <button class="timer-widget__tab" data-mode="stopwatch"></button>
      </div>
    `;
    document.body.append(host);
    const peer = new TimerPlugin({ emit: vi.fn() }, {
      toggleEl: host.querySelector("#timer-toggle-2"),
      widgetEl: host.querySelector("#timer-widget-2"),
      headerEl: host.querySelector(".timer-widget__header"),
      closeEl: host.querySelector("#timer-close-2"),
      displayEl: host.querySelector("#timer-display-2"),
      startPauseEl: host.querySelector("#timer-start-2"),
      resetEl: host.querySelector("#timer-reset-2"),
      mmInputEl: host.querySelector("#timer-mm-2"),
      ssInputEl: host.querySelector("#timer-ss-2"),
      durationRowEl: host.querySelector("#timer-duration-2"),
    });
    peer.setup();
    peer.applySyncState(state, { remote: true });

    const restored = peer.exportSyncState();
    expect(restored.mode).toBe(state.mode);
    expect(restored.visible).toBe(true);
    expect(restored.running).toBe(state.running);
    peer.destroy();
  });

  it("does not emit timer:state-change when applying remote state", () => {
    const emitSpy = vi.spyOn(app, "emit");
    plugin.applySyncState({
      visible: true,
      mode: "timer",
      running: false,
      elapsed: 0,
      remaining: 1000,
      timerDuration: 1000,
      finished: false,
      lastTick: null,
      capturedAt: Date.now(),
      position: {},
    }, { remote: true });

    expect(emitSpy).not.toHaveBeenCalledWith("timer:state-change", expect.anything());
  });
});
