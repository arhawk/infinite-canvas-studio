import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../src/lib/icons.js", () => ({
  renderIcons: vi.fn(),
}));

import { TimerPlugin } from "../../../src/plugins/timer.js";

let plugin;

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
  plugin = new TimerPlugin({}, {
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
});
