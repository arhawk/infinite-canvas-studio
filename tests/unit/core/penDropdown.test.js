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
});
