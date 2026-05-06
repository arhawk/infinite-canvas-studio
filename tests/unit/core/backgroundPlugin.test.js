import { beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_BACKGROUND_STATE } from "../../../src/background/state.js";
import { BackgroundPlugin } from "../../../src/plugins/background.js";

function createDom() {
  document.body.innerHTML = `
    <div class="app-shell">
      <nav class="left-toolbar">
        <div class="left-toolbar__group">
          <button
            id="background-settings-toggle"
            class="left-toolbar__btn"
            type="button"
            aria-pressed="false"
            data-testid="background-toggle"
          >
            <i data-lucide="palette" aria-hidden="true"></i>
          </button>
        </div>
      </nav>
    </div>
  `;
}

function createApp(initialBackground = DEFAULT_BACKGROUND_STATE) {
  const listeners = new Map();
  let backgroundState = { ...initialBackground };

  return {
    on(event, handler) {
      const handlers = listeners.get(event) ?? new Set();
      handlers.add(handler);
      listeners.set(event, handlers);
      return () => handlers.delete(handler);
    },
    getBackgroundState() {
      return { ...backgroundState };
    },
    setBackgroundState(nextState) {
      const before = { ...backgroundState };
      backgroundState = { ...nextState };
      for (const handler of listeners.get("background:change") ?? []) {
        handler({ before, after: { ...backgroundState } });
      }
      return { ...backgroundState };
    },
  };
}

function createPlugin(app) {
  return new BackgroundPlugin(app, {
    toggleEl: document.querySelector("#background-settings-toggle"),
  });
}

describe("BackgroundPlugin", () => {
  beforeEach(() => {
    createDom();
  });

  it("opens a panel with style pills and background type pills", () => {
    const app = createApp();
    const plugin = createPlugin(app);
    const toggleEl = document.querySelector("#background-settings-toggle");

    plugin.setup();
    expect(toggleEl.getAttribute("aria-pressed")).toBe("false");
    toggleEl.click();

    const panelEl = document.querySelector("#background-controls");
    expect(toggleEl.getAttribute("aria-pressed")).toBe("true");
    expect(panelEl.hidden).toBe(false);
    expect(panelEl.textContent).toContain("Default");
    expect(panelEl.textContent).toContain("Colorful");
    expect(panelEl.textContent).toContain("Blank");
    expect(panelEl.textContent).toContain("Grid");
    expect(panelEl.textContent).toContain("Dot");
    expect(document.querySelector("#background-color")).toBeTruthy();
  });

  it("updates background type when the user chooses a background button", () => {
    const app = createApp();
    const plugin = createPlugin(app);
    const toggleEl = document.querySelector("#background-settings-toggle");

    plugin.setup();
    toggleEl.click();
    document.querySelector('[data-background-type="dot"]').click();

    expect(app.getBackgroundState()).toEqual({
      type: "dot",
      color: "#f7f3ea",
      opacity: 1,
    });
  });

  it("updates background color when the user changes the color picker", () => {
    const app = createApp();
    const plugin = createPlugin(app);
    const toggleEl = document.querySelector("#background-settings-toggle");

    plugin.setup();
    toggleEl.click();

    const colorEl = document.querySelector("#background-color");
    colorEl.value = "#c8d8f0";
    colorEl.dispatchEvent(new Event("input"));

    expect(app.getBackgroundState()).toEqual({
      type: "grid",
      color: "#c8d8f0",
      opacity: 1,
    });
  });

  it("supports switching between blank, grid, and dot backgrounds", () => {
    const app = createApp();
    const plugin = createPlugin(app);
    const toggleEl = document.querySelector("#background-settings-toggle");

    plugin.setup();
    toggleEl.click();

    const colorEl = document.querySelector("#background-color");

    document.querySelector('[data-background-type="blank"]').click();
    expect(app.getBackgroundState().type).toBe("blank");
    expect(colorEl.disabled).toBe(true);
    expect(document.querySelector('[data-background-type="blank"]').getAttribute("aria-pressed")).toBe("true");
    expect(document.querySelector('[data-background-type="grid"]').getAttribute("aria-pressed")).toBe("false");

    document.querySelector('[data-background-type="dot"]').click();
    expect(app.getBackgroundState().type).toBe("dot");
    expect(colorEl.disabled).toBe(false);
    expect(document.querySelector('[data-background-type="dot"]').getAttribute("aria-pressed")).toBe("true");
    expect(document.querySelector('[data-background-type="blank"]').getAttribute("aria-pressed")).toBe("false");

    document.querySelector('[data-background-type="grid"]').click();
    expect(app.getBackgroundState().type).toBe("grid");
    expect(document.querySelector('[data-background-type="grid"]').getAttribute("aria-pressed")).toBe("true");
    expect(document.querySelector('[data-background-type="dot"]').getAttribute("aria-pressed")).toBe("false");
  });

  it("updates background opacity and disables opacity slider for blank background", () => {
    const app = createApp();
    const plugin = createPlugin(app);
    const toggleEl = document.querySelector("#background-settings-toggle");

    plugin.setup();
    toggleEl.click();

    const opacityEl = document.querySelector("#background-opacity");
    const opacityValueEl = document.querySelector("#background-opacity-value");
    expect(opacityEl.disabled).toBe(false);
    expect(opacityValueEl.textContent).toBe("100%");

    opacityEl.value = "0.42";
    opacityEl.dispatchEvent(new Event("input"));

    expect(app.getBackgroundState()).toEqual({
      type: "grid",
      color: "#f7f3ea",
      opacity: 0.42,
    });
    expect(opacityValueEl.textContent).toBe("42%");
    expect(opacityEl.title).toBe("42%");
    expect(opacityValueEl.title).toBe("42%");

    document.querySelector('[data-background-type="blank"]').click();
    expect(opacityEl.disabled).toBe(true);
  });

  it("keeps exactly one selected background type active at a time", () => {
    const app = createApp();
    const plugin = createPlugin(app);
    const toggleEl = document.querySelector("#background-settings-toggle");

    plugin.setup();
    toggleEl.click();

    const pressedButtons = () => Array.from(
      document.querySelectorAll('[data-background-type][aria-pressed="true"]'),
    ).map((button) => button.dataset.backgroundType);

    expect(pressedButtons()).toEqual(["grid"]);

    document.querySelector('[data-background-type="blank"]').click();
    expect(pressedButtons()).toEqual(["blank"]);

    document.querySelector('[data-background-type="dot"]').click();
    expect(pressedButtons()).toEqual(["dot"]);
  });

  it("toggles theme-colorful class on body when style pills are clicked", () => {
    const app = createApp();
    const plugin = createPlugin(app);
    const toggleEl = document.querySelector("#background-settings-toggle");

    plugin.setup();
    toggleEl.click();

    expect(document.body.classList.contains("theme-colorful")).toBe(false);
    expect(document.querySelector('[data-style-id="default"]').getAttribute("aria-pressed")).toBe("true");
    expect(document.querySelector('[data-style-id="colorful"]').getAttribute("aria-pressed")).toBe("false");

    document.querySelector('[data-style-id="colorful"]').click();
    expect(document.body.classList.contains("theme-colorful")).toBe(true);
    expect(document.querySelector('[data-style-id="colorful"]').getAttribute("aria-pressed")).toBe("true");
    expect(document.querySelector('[data-style-id="default"]').getAttribute("aria-pressed")).toBe("false");

    document.querySelector('[data-style-id="default"]').click();
    expect(document.body.classList.contains("theme-colorful")).toBe(false);
    expect(document.querySelector('[data-style-id="default"]').getAttribute("aria-pressed")).toBe("true");
  });

  it("updates background color when a preset swatch is clicked", () => {
    const app = createApp();
    const plugin = createPlugin(app);
    const toggleEl = document.querySelector("#background-settings-toggle");

    plugin.setup();
    toggleEl.click();

    const swatch = document.querySelector('[data-color="#ffffff"]');
    expect(swatch).toBeTruthy();
    swatch.click();

    expect(app.getBackgroundState().color).toBe("#ffffff");
    expect(swatch.getAttribute("aria-pressed")).toBe("true");
  });
});
