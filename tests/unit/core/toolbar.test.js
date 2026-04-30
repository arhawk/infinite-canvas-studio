import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ToolbarPlugin } from "../../../src/plugins/toolbar.js";

function createToolbarDom() {
  document.body.innerHTML = `
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
            title="Hide drawings"
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
        <div id="arrange-controls" hidden></div>
        <div id="brush-controls" hidden></div>
      </header>
      <div id="brush-type-controls">
        <button type="button" data-brush-tool-id="pen"></button>
        <button type="button" data-brush-tool-id="pencil"></button>
        <button type="button" data-brush-tool-id="highlighter"></button>
      </div>
      <button id="save-focus" type="button"></button>
      <button id="focus-position-mode" type="button"></button>
      <label class="toolbar__field">
        <input id="stroke-color" type="color" value="#1f6feb" />
      </label>
      <div id="recent-colors"></div>
      <span id="stroke-width-label">Brush width</span>
      <input id="stroke-width" type="range" min="1" max="24" value="4" />
      <output id="stroke-width-value">4</output>
      <button id="clear-strokes" type="button" hidden></button>
    </main>
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
  };
}

function createPlugin(app) {
  return new ToolbarPlugin(app, {
    presentationToolbarHoverZoneEl: document.querySelector("#presentation-toolbar-hover-zone"),
    modeCapsuleEditEl: document.querySelector("#mode-capsule-edit"),
    modeCapsulePresentEl: document.querySelector("#mode-capsule-present"),
    drawingVisibilityToggleEl: document.querySelector("#drawing-visibility-toggle"),
    arrangeControlsEl: document.querySelector("#arrange-controls"),
    brushControlsEl: document.querySelector("#brush-controls"),
    brushTypeControlsEl: document.querySelector("#brush-type-controls"),
    saveFocusEl: document.querySelector("#save-focus"),
    focusPositionModeEl: document.querySelector("#focus-position-mode"),
    strokeColorEl: document.querySelector("#stroke-color"),
    recentColorsEl: document.querySelector("#recent-colors"),
    strokeWidthLabelEl: document.querySelector("#stroke-width-label"),
    strokeWidthEl: document.querySelector("#stroke-width"),
    strokeWidthValueEl: document.querySelector("#stroke-width-value"),
    clearStrokesEl: document.querySelector("#clear-strokes"),
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

    expect(document.body.classList.contains("is-presentation-mode")).toBe(true);
    expect(document.body.classList.contains("is-edit-mode")).toBe(false);
    expect(hoverZoneEl.hidden).toBe(false);
    expect(toolbarEl.classList.contains("is-visible")).toBe(false);
    expect(drawingVisibilityToggleEl.hidden).toBe(false);
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
});
