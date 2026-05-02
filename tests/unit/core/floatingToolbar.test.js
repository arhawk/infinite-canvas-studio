import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FloatingToolbarManager } from "../../../src/core/floatingToolbar.js";

function createApp() {
  return {
    stage: {
      container: () => document.querySelector("#stage"),
    },
    stageApi: {
      canvasToScreen: ({ x, y }) => ({ x, y }),
    },
  };
}

function createAnchor(rect) {
  return {
    getStage: () => ({}),
    getClientRect: () => rect,
  };
}

describe("FloatingToolbarManager", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal("requestAnimationFrame", (callback) => setTimeout(() => callback(0), 0));
    vi.stubGlobal("cancelAnimationFrame", (handle) => clearTimeout(handle));
    document.body.innerHTML = `
      <div id="root">
        <div id="panel">
          <button id="rect" type="button"></button>
        </div>
      </div>
      <div id="stage"></div>
    `;
    Object.defineProperty(window, "innerWidth", { value: 800, configurable: true });
    Object.defineProperty(window, "innerHeight", { value: 600, configurable: true });
    document.querySelector("#stage").getBoundingClientRect = () => ({
      left: 0,
      top: 0,
      right: 800,
      bottom: 600,
      width: 800,
      height: 600,
    });
    Object.defineProperties(document.querySelector("#panel"), {
      offsetWidth: { value: 120, configurable: true },
      offsetHeight: { value: 40, configurable: true },
    });
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    document.body.innerHTML = "";
  });

  it("mounts panels, positions them from an anchor node, and restores them on destroy", () => {
    const app = createApp();
    const manager = new FloatingToolbarManager(app);
    const panel = document.querySelector("#panel");
    const originalParent = document.querySelector("#root");
    const anchor = createAnchor({ x: 200, y: 220, width: 160, height: 80 });

    manager.registerPanel({
      id: "shape-panel",
      element: panel,
      getAnchorNode: () => anchor,
    });
    manager.setPanelVisible("shape-panel", true);
    vi.runOnlyPendingTimers();

    expect(panel.parentElement).toBe(document.body);
    expect(panel.hidden).toBe(false);
    expect(panel.dataset.placement).toBe("top");
    expect(panel.style.left).toBe("220px");
    expect(panel.style.top).toBe("116px");
    expect(panel.style.transform).toBe("none");

    manager.destroy();

    expect(panel.parentElement).toBe(originalParent);
  });

  it("updates registered button state dynamically", () => {
    const manager = new FloatingToolbarManager(createApp());
    const panel = document.querySelector("#panel");
    const button = document.querySelector("#rect");

    manager.registerPanel({
      id: "shape-panel",
      element: panel,
    });
    manager.registerButton("shape-panel", "rectangle", button);
    manager.setButtonState("shape-panel", "rectangle", {
      pressed: true,
      disabled: true,
      title: "Rectangle",
      label: "Rectangle",
      classes: { "is-active": true },
      styles: { "--tool-color": "#d7612f" },
    });

    expect(button.getAttribute("aria-pressed")).toBe("true");
    expect(button.disabled).toBe(true);
    expect(button.getAttribute("aria-disabled")).toBe("true");
    expect(button.title).toBe("Rectangle");
    expect(button.getAttribute("aria-label")).toBe("Rectangle");
    expect(button.classList.contains("is-active")).toBe(true);
    expect(button.style.getPropertyValue("--tool-color")).toBe("#d7612f");

    manager.destroy();
  });
});
