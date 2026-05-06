import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../src/lib/icons.js", () => ({
  renderIcons: vi.fn(),
}));

import { LeftToolbarPlugin } from "../../../src/component/LeftToolbar/index.js";

function createDom() {
  document.body.innerHTML = `<div class="app-shell"></div>`;
}

function createApp() {
  const listeners = new Map();

  return {
    getMode: () => "edit",
    getEditorTool: () => "arrange",
    setEditorTool: vi.fn(),
    on(event, handler) {
      const handlers = listeners.get(event) ?? new Set();
      handlers.add(handler);
      listeners.set(event, handlers);
      return () => handlers.delete(handler);
    },
  };
}

describe("LeftToolbarPlugin", () => {
  beforeEach(() => {
    createDom();
  });

  it("renders Components in the main single-select tool group", () => {
    const plugin = new LeftToolbarPlugin(createApp());

    const toolButtons = Array.from(plugin.arrangeBtn.parentElement.children);
    const shapeIndex = toolButtons.indexOf(plugin.shapeBtn);
    const componentsIndex = toolButtons.indexOf(plugin.componentsBtn);

    expect(shapeIndex).toBeGreaterThanOrEqual(0);
    expect(componentsIndex).toBe(shapeIndex + 1);
    expect(plugin.componentsBtn.dataset.toolId).toBe("components");
    expect(plugin.componentsBtn.dataset.testid).toBe("components-trigger");
    expect(plugin.componentsBtn.getAttribute("aria-label")).toBe("Components");
  });

  it("renders a Background button under Timer in the left plugin group", () => {
    const plugin = new LeftToolbarPlugin(createApp());

    const pluginButtons = Array.from(plugin.calculatorBtn.parentElement.children);
    const timerIndex = pluginButtons.indexOf(plugin.timerBtn);
    const backgroundIndex = pluginButtons.indexOf(plugin.backgroundBtn);

    expect(timerIndex).toBeGreaterThanOrEqual(0);
    expect(backgroundIndex).toBe(timerIndex + 1);
    expect(plugin.backgroundBtn).toBeTruthy();
    expect(plugin.backgroundBtn.textContent).toBe("");
    expect(plugin.backgroundBtn.querySelector('[data-lucide="palette"]')).toBeTruthy();
    expect(plugin.backgroundBtn.dataset.testid).toBe("background-toggle");
    expect(plugin.backgroundBtn.getAttribute("aria-label")).toBe("Style");
  });
});
