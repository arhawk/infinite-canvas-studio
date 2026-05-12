import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../src/component/shape.js", () => ({
  SHAPE_TYPES: [
    { value: "rectangle", label: "Rectangle" },
    { value: "oval", label: "Oval / Circle" },
    { value: "rhombus", label: "Rhombus" },
    { value: "triangle", label: "Triangle" },
  ],
  normalizeShapeType: (value) => (
    ["rectangle", "oval", "rhombus", "triangle"].includes(value) ? value : "rectangle"
  ),
  applyShapeStyle: vi.fn(),
  getShapeData: vi.fn(() => ({
    shapeType: "rectangle",
    fill: "#ffffff",
    fillOpacity: 0,
    stroke: "#000000",
    strokeWidth: 2,
    textColor: "#2d2d2d",
    fontSize: 18,
  })),
}));

vi.mock("../../../src/lib/konva.js", () => ({
  Konva: {},
}));

import { ToolbarPlugin } from "../../../src/plugins/toolbar.js";

function createToolbarDom() {
  document.body.innerHTML = `
    <div class="app-shell">
      <main class="workspace">
        <div
          id="presentation-toolbar-hover-zone"
          class="presentation-toolbar-hover-zone"
          aria-hidden="true"
        ></div>
        <header class="toolbar" data-testid="toolbar">
          <div class="toolbar__title-area">
            <span class="toolbar__project-title" id="project-title">Untitled</span>
          </div>
          <div class="toolbar__center">
            <button
              id="drawing-visibility-toggle"
              class="toolbar__icon-button toolbar__present-tool"
              type="button"
              aria-label="Hide drawings"
              data-tooltip="Hide drawings"
              aria-pressed="true"
              hidden
            ></button>
            <div class="mode-capsule" id="mode-capsule">
              <button type="button" id="mode-capsule-edit" aria-pressed="true">Edit</button>
              <button type="button" id="mode-capsule-present" aria-pressed="false">Present</button>
            </div>
          </div>
          <div class="toolbar__actions">
            <button type="button" class="toolbar__share-btn" id="share-btn">Share</button>
          </div>
        </header>
        <div id="shape-panel" hidden>
          <div id="shape-panel-type-controls">
            <button type="button" data-shape-type="rectangle"></button>
          </div>
          <button data-testid="shape-style-font-size"></button>
          <button data-testid="shape-style-text-color"></button>
          <button data-testid="shape-style-fill"></button>
          <button data-testid="shape-style-border"></button>
          <div id="shape-text-swatches"></div>
          <div id="shape-fill-swatches"></div>
          <div id="shape-border-swatches"></div>
          <div class="toolbar__button-custom-color"><input id="shape-text-color" type="color" value="#2d2d2d" /></div>
          <div class="toolbar__button-custom-color"><input id="shape-fill-color" type="color" value="#ffffff" /></div>
          <div class="toolbar__button-custom-color"><input id="shape-stroke-color" type="color" value="#000000" /></div>
          <input id="shape-font-size" type="range" min="8" max="72" value="18" />
          <output id="shape-font-size-value">18</output>
          <input id="shape-stroke-width" type="range" min="0" max="24" value="2" />
          <output id="shape-stroke-width-value">2</output>
          <input id="shape-opacity" type="range" min="0" max="1" step="0.05" value="0" />
          <output id="shape-opacity-value">0%</output>
        </div>
        <div id="button-controls" hidden>
          <div id="button-type-controls">
            <button type="button" data-button-shape-type="rounded"></button>
          </div>
          <button data-testid="button-style-font-size"></button>
          <button data-testid="button-style-text-color"></button>
          <button data-testid="button-style-fill"></button>
          <button data-testid="button-style-border"></button>
          <div id="button-text-swatches"></div>
          <div id="button-fill-swatches"></div>
          <div id="button-border-swatches"></div>
          <div class="toolbar__button-custom-color"><input id="button-text-color" type="color" value="#5b3b12" /></div>
          <div class="toolbar__button-custom-color"><input id="button-fill-color" type="color" value="#f7e7c6" /></div>
          <div class="toolbar__button-custom-color"><input id="button-stroke-color" type="color" value="#b9782f" /></div>
          <input id="button-font-size" type="range" min="8" max="72" value="16" />
          <output id="button-font-size-value">16</output>
          <input id="button-stroke-width" type="range" min="0" max="24" value="2" />
          <output id="button-stroke-width-value">2</output>
          <input id="button-opacity" type="range" min="0" max="1" step="0.05" value="1" />
          <output id="button-opacity-value">100%</output>
        </div>
        <div id="shape-type-controls">
          <button type="button" data-shape-type="rectangle"></button>
        </div>
        <button id="save-focus" type="button"></button>
        <button id="focus-position-mode" type="button"></button>
        <button id="eraser-trigger" type="button"></button>
      </main>
    </div>
  `;
}

function createApp(mode = "edit") {
  const listeners = new Map();

  return {
    mode,
    editorTool: "arrange",
    plugins: [
      {
        id: "drawing",
        isDrawLayerVisible: () => true,
        hasDrawings: () => false,
        toggleDrawLayerVisibility: vi.fn(),
      },
    ],
    commands: {
      register: vi.fn(),
      unregister: vi.fn(),
      execute: vi.fn(),
    },
    keybindings: {
      register: vi.fn(),
      unregister: vi.fn(),
    },
    events: {
      emit: vi.fn(),
    },
    on(event, handler) {
      const handlers = listeners.get(event) ?? new Set();
      handlers.add(handler);
      listeners.set(event, handlers);
      return () => handlers.delete(handler);
    },
    getMode() {
      return this.mode;
    },
    setMode(nextMode) {
      this.mode = nextMode;
    },
    getEditorTool() {
      return this.editorTool;
    },
    setEditorTool(toolId) {
      this.editorTool = toolId;
    },
    stage: {
      container: () => document.querySelector(".workspace"),
    },
  };
}

function createPlugin(app) {
  const penDropdownPlugin = {
    setCallbacks: vi.fn(),
    setState: vi.fn(),
    setAnchorElement: vi.fn(),
    clearAnchorElement: vi.fn(),
    hasCustomAnchor: vi.fn(() => false),
    isOpen: vi.fn(() => false),
    open: vi.fn(),
    close: vi.fn(),
    reposition: vi.fn(),
  };

  return new ToolbarPlugin(app, {
    presentationToolbarHoverZoneEl: document.querySelector("#presentation-toolbar-hover-zone"),
    modeCapsuleEditEl: document.querySelector("#mode-capsule-edit"),
    modeCapsulePresentEl: document.querySelector("#mode-capsule-present"),
    drawingVisibilityToggleEl: document.querySelector("#drawing-visibility-toggle"),
    saveFocusEl: document.querySelector("#save-focus"),
    focusPositionModeEl: document.querySelector("#focus-position-mode"),
    shapePanelEl: document.querySelector("#shape-panel"),
    shapePanelTypeControlsEl: document.querySelector("#shape-panel-type-controls"),
    shapeFontSizeEl: document.querySelector("#shape-font-size"),
    shapeFontSizeValueEl: document.querySelector("#shape-font-size-value"),
    shapeTextColorEl: document.querySelector("#shape-text-color"),
    shapeFillColorEl: document.querySelector("#shape-fill-color"),
    shapeStrokeColorEl: document.querySelector("#shape-stroke-color"),
    shapeStrokeWidthEl: document.querySelector("#shape-stroke-width"),
    shapeStrokeWidthValueEl: document.querySelector("#shape-stroke-width-value"),
    shapeOpacityEl: document.querySelector("#shape-opacity"),
    shapeOpacityValueEl: document.querySelector("#shape-opacity-value"),
    buttonControlsEl: document.querySelector("#button-controls"),
    buttonTypeControlsEl: document.querySelector("#button-type-controls"),
    buttonFontSizeEl: document.querySelector("#button-font-size"),
    buttonFontSizeValueEl: document.querySelector("#button-font-size-value"),
    buttonTextColorEl: document.querySelector("#button-text-color"),
    buttonFillColorEl: document.querySelector("#button-fill-color"),
    buttonStrokeColorEl: document.querySelector("#button-stroke-color"),
    buttonStrokeWidthEl: document.querySelector("#button-stroke-width"),
    buttonStrokeWidthValueEl: document.querySelector("#button-stroke-width-value"),
    buttonOpacityEl: document.querySelector("#button-opacity"),
    buttonOpacityValueEl: document.querySelector("#button-opacity-value"),
    penDropdownPlugin,
    eraserTriggerEl: document.querySelector("#eraser-trigger"),
  });
}

describe("ToolbarPlugin", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    createToolbarDom();
    vi.stubGlobal("requestAnimationFrame", (callback) => setTimeout(() => callback(0), 0));
    vi.stubGlobal("cancelAnimationFrame", (handle) => clearTimeout(handle));
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    document.body.innerHTML = "";
  });

  it("starts hidden by default in presentation mode", () => {
    const app = createApp("presentation");
    const plugin = createPlugin(app);
    const toolbarEl = document.querySelector(".toolbar");
    const hoverZoneEl = document.querySelector("#presentation-toolbar-hover-zone");
    const drawingVisibilityToggleEl = document.querySelector("#drawing-visibility-toggle");

    plugin.setup();
    const fabEl = document.querySelector("[data-testid='presentation-brush-fab']");
    const fabShellEl = document.querySelector("[data-testid='presentation-brush-fab-shell']");

    expect(document.body.classList.contains("is-presentation-mode")).toBe(true);
    expect(document.body.classList.contains("is-edit-mode")).toBe(false);
    expect(hoverZoneEl.hidden).toBe(false);
    expect(toolbarEl.classList.contains("is-visible")).toBe(false);
    expect(drawingVisibilityToggleEl.hidden).toBe(false);
    expect(fabEl.hidden).toBe(false);
    expect(fabShellEl.dataset.edge).toBe("left");
    expect(fabShellEl.style.left).toBe("20px");
  });

  it("shows the toolbar when the pointer enters the presentation hover zone", () => {
    const app = createApp("presentation");
    const plugin = createPlugin(app);
    const toolbarEl = document.querySelector(".toolbar");
    const hoverZoneEl = document.querySelector("#presentation-toolbar-hover-zone");

    plugin.setup();
    hoverZoneEl.dispatchEvent(new MouseEvent("mouseenter"));

    expect(toolbarEl.classList.contains("is-visible")).toBe(true);
  });

  it("hides the toolbar again after leaving both the hover zone and the toolbar", () => {
    const app = createApp("presentation");
    const plugin = createPlugin(app);
    const toolbarEl = document.querySelector(".toolbar");
    const hoverZoneEl = document.querySelector("#presentation-toolbar-hover-zone");

    plugin.setup();
    hoverZoneEl.dispatchEvent(new MouseEvent("mouseenter"));
    expect(toolbarEl.classList.contains("is-visible")).toBe(true);

    hoverZoneEl.dispatchEvent(new MouseEvent("mouseleave"));
    vi.advanceTimersByTime(99);
    expect(toolbarEl.classList.contains("is-visible")).toBe(true);

    vi.advanceTimersByTime(1);
    expect(toolbarEl.classList.contains("is-visible")).toBe(false);
  });

  it("keeps the toolbar visible while the pointer is over the toolbar itself", () => {
    const app = createApp("presentation");
    const plugin = createPlugin(app);
    const toolbarEl = document.querySelector(".toolbar");
    const hoverZoneEl = document.querySelector("#presentation-toolbar-hover-zone");

    plugin.setup();
    hoverZoneEl.dispatchEvent(new MouseEvent("mouseenter"));
    hoverZoneEl.dispatchEvent(new MouseEvent("mouseleave"));
    toolbarEl.dispatchEvent(new MouseEvent("mouseenter"));

    vi.advanceTimersByTime(100);
    expect(toolbarEl.classList.contains("is-visible")).toBe(true);

    toolbarEl.dispatchEvent(new MouseEvent("mouseleave"));
    vi.advanceTimersByTime(100);
    expect(toolbarEl.classList.contains("is-visible")).toBe(false);
  });

  it("keeps edit mode behavior unchanged and never enables presentation auto-hide there", () => {
    const app = createApp("edit");
    const plugin = createPlugin(app);
    const toolbarEl = document.querySelector(".toolbar");
    const hoverZoneEl = document.querySelector("#presentation-toolbar-hover-zone");
    const drawingVisibilityToggleEl = document.querySelector("#drawing-visibility-toggle");

    plugin.setup();

    expect(document.body.classList.contains("is-edit-mode")).toBe(true);
    expect(document.body.classList.contains("is-presentation-mode")).toBe(false);
    expect(hoverZoneEl.hidden).toBe(true);
    expect(toolbarEl.classList.contains("is-visible")).toBe(false);
    expect(drawingVisibilityToggleEl.hidden).toBe(true);

    hoverZoneEl.dispatchEvent(new MouseEvent("mouseenter"));
    hoverZoneEl.dispatchEvent(new MouseEvent("mouseleave"));
    vi.advanceTimersByTime(200);

    expect(hoverZoneEl.hidden).toBe(true);
    expect(toolbarEl.classList.contains("is-visible")).toBe(false);
  });

  it("switches between edit and presentation states without keeping stale hidden behavior", () => {
    const app = createApp("edit");
    const plugin = createPlugin(app);
    const toolbarEl = document.querySelector(".toolbar");
    const hoverZoneEl = document.querySelector("#presentation-toolbar-hover-zone");

    plugin.setup();
    expect(hoverZoneEl.hidden).toBe(true);

    app.mode = "presentation";
    plugin.syncUi();

    expect(document.body.classList.contains("is-presentation-mode")).toBe(true);
    expect(document.body.classList.contains("is-edit-mode")).toBe(false);
    expect(hoverZoneEl.hidden).toBe(false);
    expect(toolbarEl.classList.contains("is-visible")).toBe(false);

    hoverZoneEl.dispatchEvent(new MouseEvent("mouseenter"));
    expect(toolbarEl.classList.contains("is-visible")).toBe(true);

    app.mode = "edit";
    plugin.syncUi();

    expect(document.body.classList.contains("is-edit-mode")).toBe(true);
    expect(document.body.classList.contains("is-presentation-mode")).toBe(false);
    expect(hoverZoneEl.hidden).toBe(true);
    expect(toolbarEl.classList.contains("toolbar--no-transition")).toBe(true);

    vi.runOnlyPendingTimers();
    expect(toolbarEl.classList.contains("toolbar--no-transition")).toBe(false);
  });

  it("keeps the drawing visibility eye button inside the toolbar visibility flow in presentation mode", () => {
    const app = createApp("presentation");
    const plugin = createPlugin(app);
    const toolbarEl = document.querySelector(".toolbar");
    const hoverZoneEl = document.querySelector("#presentation-toolbar-hover-zone");
    const drawingVisibilityToggleEl = document.querySelector("#drawing-visibility-toggle");

    plugin.setup();

    expect(drawingVisibilityToggleEl.hidden).toBe(false);
    expect(toolbarEl.classList.contains("is-visible")).toBe(false);

    hoverZoneEl.dispatchEvent(new MouseEvent("mouseenter"));
    expect(toolbarEl.classList.contains("is-visible")).toBe(true);
    expect(drawingVisibilityToggleEl.hidden).toBe(false);

    hoverZoneEl.dispatchEvent(new MouseEvent("mouseleave"));
    vi.advanceTimersByTime(100);
    expect(toolbarEl.classList.contains("is-visible")).toBe(false);
    expect(drawingVisibilityToggleEl.hidden).toBe(false);
  });

  it("restores normal always-visible behavior when switching back to edit mode", () => {
    const app = createApp("presentation");
    const plugin = createPlugin(app);
    const toolbarEl = document.querySelector(".toolbar");
    const hoverZoneEl = document.querySelector("#presentation-toolbar-hover-zone");

    plugin.setup();
    hoverZoneEl.dispatchEvent(new MouseEvent("mouseenter"));
    expect(toolbarEl.classList.contains("is-visible")).toBe(true);

    app.mode = "edit";
    plugin.syncUi();

    expect(document.body.classList.contains("is-edit-mode")).toBe(true);
    expect(document.body.classList.contains("is-presentation-mode")).toBe(false);
    expect(hoverZoneEl.hidden).toBe(true);
    expect(toolbarEl.classList.contains("toolbar--no-transition")).toBe(true);

    vi.runOnlyPendingTimers();
    expect(toolbarEl.classList.contains("toolbar--no-transition")).toBe(false);
  });

  it("shows the presentation floating brush ball and closes edit brush popups after switching to presentation mode", () => {
    const app = createApp("edit");
    app.editorTool = "pen";
    const plugin = createPlugin(app);

    plugin.setup();
    const fabEl = document.querySelector("[data-testid='presentation-brush-fab']");
    plugin.penDropdown.open = vi.fn();
    plugin.penDropdown.close = vi.fn();
    plugin.openEraserPanel();

    app.mode = "presentation";
    app.editorTool = "arrange";
    plugin.syncUi();

    expect(plugin.penDropdown.close).toHaveBeenCalled();
    expect(plugin.eraserPanelOpen).toBe(false);
    expect(fabEl.hidden).toBe(false);
  });

  it("snaps the presentation floating brush ball back to the nearest edge after release", () => {
    const app = createApp("presentation");
    const plugin = createPlugin(app);

    plugin.setup();
    const fabShellEl = document.querySelector("[data-testid='presentation-brush-fab-shell']");

    plugin.presentationBrushFabDock = plugin.getPresentationBrushFabDockFromPosition({
      x: 120,
      y: 620,
    });
    plugin.syncPresentationBrushFabPosition();

    expect(fabShellEl.dataset.edge).toBe("bottom");
    expect(fabShellEl.style.left).toBe("120px");
    expect(fabShellEl.style.top).toBe("692px");
  });

  it("keeps the presentation brush panel inside the viewport when docked near the bottom edge", () => {
    const app = createApp("presentation");
    const plugin = createPlugin(app);

    plugin.setup();
    const fabShellEl = document.querySelector("[data-testid='presentation-brush-fab-shell']");
    const panelEl = document.querySelector("[data-testid='presentation-brush-panel']");

    Object.defineProperty(panelEl, "offsetWidth", {
      configurable: true,
      get: () => 56,
    });
    Object.defineProperty(panelEl, "offsetHeight", {
      configurable: true,
      get: () => 220,
    });
    fabShellEl.getBoundingClientRect = () => ({
      x: 20,
      y: 680,
      left: 20,
      top: 680,
      width: 56,
      height: 56,
      right: 76,
      bottom: 736,
    });

    plugin.presentationBrushFabDock = { edge: "left", offset: 692 };
    plugin.openPresentationBrushMenu();

    const panelTop = 680 + Number.parseInt(panelEl.style.top, 10);
    const panelBottom = panelTop + panelEl.offsetHeight;

    expect(panelTop).toBeGreaterThanOrEqual(12);
    expect(panelBottom).toBeLessThanOrEqual(window.innerHeight - 12);
  });

  it("positions the presentation brush panel to the left of the ball when docked on the right edge", () => {
    const app = createApp("presentation");
    const plugin = createPlugin(app);

    plugin.setup();
    const fabShellEl = document.querySelector("[data-testid='presentation-brush-fab-shell']");
    const panelEl = document.querySelector("[data-testid='presentation-brush-panel']");

    Object.defineProperty(panelEl, "offsetWidth", {
      configurable: true,
      get: () => 56,
    });
    Object.defineProperty(panelEl, "offsetHeight", {
      configurable: true,
      get: () => 220,
    });
    fabShellEl.getBoundingClientRect = () => ({
      x: 768,
      y: 200,
      left: 768,
      top: 200,
      width: 56,
      height: 56,
      right: 824,
      bottom: 256,
    });

    plugin.presentationBrushFabDock = { edge: "right", offset: 200 };
    plugin.openPresentationBrushMenu();

    expect(panelEl.style.left).toBe("-68px");
    expect(panelEl.style.right).toBe("auto");
  });
});
