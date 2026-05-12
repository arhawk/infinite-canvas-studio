import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PenDropdownPlugin } from "../../../src/component/PenDropdown/index.js";

function createDom() {
  document.body.innerHTML = `
    <div class="app-shell">
      <button id="pen-trigger" type="button" aria-pressed="false"></button>
    </div>
  `;
}

function createApp() {
  return {
    mode: "edit",
    editorTool: "pen",
    on: vi.fn(() => () => {}),
    getMode() {
      return this.mode;
    },
    getEditorTool() {
      return this.editorTool;
    },
  };
}

function createState() {
  return {
    activeToolId: "pen",
    presetsByTool: {
      pen: [
        { color: "#1f6feb", width: 4 },
        { color: "#d7612f", width: 8 },
        { color: "#18875d", width: 12 },
      ],
      pencil: [
        { color: "#4a4a4a", width: 3 },
        { color: "#8b5e3c", width: 5 },
        { color: "#1f6feb", width: 2 },
      ],
      highlighter: [
        { color: "#f6d32d", width: 16 },
        { color: "#ff7aa2", width: 14 },
        { color: "#7ed7a1", width: 20 },
      ],
    },
    activePresetIndexByTool: {
      pen: 0,
      pencil: 0,
      highlighter: 0,
    },
  };
}

describe("PenDropdownPlugin", () => {
  beforeEach(() => {
    createDom();
  });

  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("toggles from the left toolbar trigger and closes on outside click", () => {
    const app = createApp();
    const plugin = new PenDropdownPlugin(app);
    plugin.setup();
    plugin.setState(createState());
    plugin.wireTrigger(document.querySelector("#pen-trigger"));

    const trigger = document.querySelector("#pen-trigger");
    trigger.click();
    expect(document.querySelector('[data-testid="pen-dropdown"]').hidden).toBe(false);
    expect(trigger.getAttribute("aria-pressed")).toBe("true");

    document.body.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    expect(document.querySelector('[data-testid="pen-dropdown"]').hidden).toBe(true);
    expect(trigger.getAttribute("aria-pressed")).toBe("false");
  });

  it("closes on Escape and keeps the preset editor in the same popup flow", () => {
    const app = createApp();
    const onPresetActivate = vi.fn();
    const plugin = new PenDropdownPlugin(app);
    plugin.setup();
    plugin.setCallbacks({ onPresetActivate });
    plugin.setState(createState());
    plugin.wireTrigger(document.querySelector("#pen-trigger"));

    document.querySelector("#pen-trigger").click();
    document.querySelector('[data-testid="pen-preset-1"]').click();

    expect(onPresetActivate).toHaveBeenCalledWith("pen", 1);
    expect(document.querySelector('[data-testid="pen-preset-editor"]').hidden).toBe(false);

    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(document.querySelector('[data-testid="pen-dropdown"]').hidden).toBe(true);
    expect(document.querySelector('[data-testid="pen-preset-editor"]').hidden).toBe(true);
  });

  it("keeps the brush dropdown inside the viewport when the anchor is near the right edge", () => {
    const app = createApp();
    const plugin = new PenDropdownPlugin(app);
    plugin.setup();
    plugin.setState(createState());
    plugin.wireTrigger(document.querySelector("#pen-trigger"));

    const shell = document.querySelector(".app-shell");
    const trigger = document.querySelector("#pen-trigger");
    const dropdown = document.querySelector('[data-testid="pen-dropdown"]');

    shell.getBoundingClientRect = () => ({
      left: 0,
      top: 0,
      width: 240,
      height: 260,
      right: 240,
      bottom: 260,
      x: 0,
      y: 0,
    });
    trigger.getBoundingClientRect = () => ({
      left: 200,
      top: 210,
      width: 32,
      height: 32,
      right: 232,
      bottom: 242,
      x: 200,
      y: 210,
    });
    Object.defineProperty(dropdown, "offsetWidth", {
      configurable: true,
      get: () => 64,
    });
    Object.defineProperty(dropdown, "offsetHeight", {
      configurable: true,
      get: () => 140,
    });

    trigger.click();

    expect(dropdown.style.left).toBe("132px");
    expect(dropdown.style.top).toBe("108px");
  });

  it("repositions the preset editor back inside the viewport when there is no room on the right", () => {
    const app = createApp();
    const plugin = new PenDropdownPlugin(app);
    plugin.setup();
    plugin.setState(createState());
    plugin.wireTrigger(document.querySelector("#pen-trigger"));

    const shell = document.querySelector(".app-shell");
    const trigger = document.querySelector("#pen-trigger");
    const dropdown = document.querySelector('[data-testid="pen-dropdown"]');
    const editor = document.querySelector('[data-testid="pen-preset-editor"]');

    shell.getBoundingClientRect = () => ({
      left: 0,
      top: 0,
      width: 240,
      height: 260,
      right: 240,
      bottom: 260,
      x: 0,
      y: 0,
    });
    trigger.getBoundingClientRect = () => ({
      left: 120,
      top: 24,
      width: 32,
      height: 32,
      right: 152,
      bottom: 56,
      x: 120,
      y: 24,
    });
    Object.defineProperty(dropdown, "offsetWidth", {
      configurable: true,
      get: () => 64,
    });
    Object.defineProperty(dropdown, "offsetHeight", {
      configurable: true,
      get: () => 140,
    });
    Object.defineProperty(editor, "offsetWidth", {
      configurable: true,
      get: () => 176,
    });
    Object.defineProperty(editor, "offsetHeight", {
      configurable: true,
      get: () => 220,
    });

    trigger.click();

    const preset = document.querySelector('[data-testid="pen-preset-1"]');
    preset.getBoundingClientRect = () => ({
      left: 164,
      top: 80,
      width: 36,
      height: 36,
      right: 200,
      bottom: 116,
      x: 164,
      y: 80,
    });

    preset.click();

    expect(editor.style.left).toBe("52px");
    expect(editor.style.top).toBe("28px");
  });
});
