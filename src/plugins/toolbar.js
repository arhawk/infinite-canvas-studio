import { BaseCommand, BasePlugin } from "../core/baseClasses.js";
import {
  DEFAULT_SHAPE_FILL,
  DEFAULT_SHAPE_FILL_OPACITY,
  DEFAULT_SHAPE_STROKE,
  SHAPE_TYPES,
  normalizeShapeType,
} from "../component/shapeModel.js";
import { renderIcons } from "../lib/icons.js";

const DRAWING_TOOL_IDS = ["pen", "pencil", "highlighter"];
const DEFAULT_ERASER_STATE = {
  radius: 12,
};
const DEFAULT_SHAPE_TOOL_STATE = {
  shapeType: "rectangle",
  fill: DEFAULT_SHAPE_FILL,
  fillOpacity: DEFAULT_SHAPE_FILL_OPACITY,
  stroke: DEFAULT_SHAPE_STROKE,
  strokeWidth: 2,
};
const PRESENTATION_TOOLBAR_HIDE_DELAY_MS = 100;

const DEFAULT_DRAWING_TOOL_STATE = {
  pen: {
    opacity: 1,
    activePresetIndex: 0,
    presets: [
      { color: "#1f6feb", width: 4 },
      { color: "#d7612f", width: 8 },
      { color: "#18875d", width: 12 },
    ],
  },
  pencil: {
    opacity: 0.55,
    activePresetIndex: 0,
    presets: [
      { color: "#4a4a4a", width: 3 },
      { color: "#8b5e3c", width: 5 },
      { color: "#1f6feb", width: 2 },
    ],
  },
  highlighter: {
    opacity: 0.25,
    activePresetIndex: 0,
    presets: [
      { color: "#f6d32d", width: 16 },
      { color: "#ff7aa2", width: 14 },
      { color: "#7ed7a1", width: 20 },
    ],
  },
};

function cloneDrawingToolState() {
  return Object.fromEntries(
    Object.entries(DEFAULT_DRAWING_TOOL_STATE).map(([toolId, config]) => [
      toolId,
      {
        ...config,
        presets: config.presets.map((preset) => ({ ...preset })),
      },
    ]),
  );
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function formatOpacityValue(value) {
  return Number(value).toFixed(2).replace(/\.?0+$/, "");
}

class TogglePresentationBoardFullscreenCommand extends BaseCommand {
  static commandId = "presentation:toggle-fullscreen-board";
  static label = "Toggle Presentation Board Fullscreen";
  static modes = {
    presentation: {},
  };

  execute() {
    this.plugin?.toggleBoardFullscreen?.();
  }
}

export class ToolbarPlugin extends BasePlugin {
  static pluginId = "toolbar";

  commands() {
    return [TogglePresentationBoardFullscreenCommand];
  }

  onSetup() {
    const {
      presentationToolbarHoverZoneEl,
      modeCapsuleEditEl,
      modeCapsulePresentEl,
      drawingVisibilityToggleEl,
      saveFocusEl,
      focusPositionModeEl,
      shapeControlsEl,
      shapeTypeControlsEl,
      shapeFillColorEl,
      shapeStrokeColorEl,
      shapeStrokeWidthEl,
      shapeStrokeWidthValueEl,
      shapeOpacityEl,
      shapeOpacityValueEl,
      penDropdownPlugin,
      eraserTriggerEl,
    } = this.options;

    this.ui = {
      presentationToolbarHoverZoneEl,
      modeCapsuleEditEl,
      modeCapsulePresentEl,
      drawingVisibilityToggleEl,
      saveFocusEl,
      focusPositionModeEl,
      shapeControlsEl,
      shapeTypeControlsEl,
      shapeFillColorEl,
      shapeStrokeColorEl,
      shapeStrokeWidthEl,
      shapeStrokeWidthValueEl,
      shapeOpacityEl,
      shapeOpacityValueEl,
    };
    this.toolbarEl = document.querySelector(".toolbar");
    this.penDropdown = penDropdownPlugin ?? null;
    this.eraserTriggerEl = eraserTriggerEl ?? null;
    this.focusState = {
      positionMode: "absolute",
      canSave: false,
      canTogglePositionMode: false,
      selectedNodeId: null,
    };
    this.presentationToolbarHideTimer = null;
    this.presentationToolbarAnimationFrame = null;
    this.isHoveringPresentationToolbarZone = false;
    this.isHoveringPresentationToolbar = false;
    this.eraserPanelOpen = false;
    this.lastBrushToolId = "pen";
    this.drawingToolState = cloneDrawingToolState();
    this.eraserState = { ...DEFAULT_ERASER_STATE };
    this.shapeToolState = { ...DEFAULT_SHAPE_TOOL_STATE };

    this.buildEraserPanel();
    this.setupPenDropdown();
    this.setupEraserPanel();

    if (saveFocusEl) {
      this.listenDom(saveFocusEl, "click", () => {
        this.app.commands.execute("focus:save-selection");
      });
    }
    if (focusPositionModeEl) {
      this.listenDom(focusPositionModeEl, "click", () => {
        const nextMode = this.focusState.positionMode === "relative" ? "absolute" : "relative";
        this.app.commands.execute("focus:position-mode:set", nextMode);
      });
    }
    for (const button of (shapeTypeControlsEl?.querySelectorAll("[data-shape-type]") ?? [])) {
      this.listenDom(button, "click", () => {
        this.shapeToolState.shapeType = normalizeShapeType(button.dataset.shapeType);
        this.syncShapeTypeControls();
        this.emitShapeStyleChange({ applyToSelection: true });
      });
    }
    if (shapeFillColorEl) {
      this.listenDom(shapeFillColorEl, "input", () => this.emitShapeStyleChange({ applyToSelection: true }));
    }
    if (shapeStrokeColorEl) {
      this.listenDom(shapeStrokeColorEl, "input", () => this.emitShapeStyleChange({ applyToSelection: true }));
    }
    if (shapeStrokeWidthEl) {
      this.listenDom(shapeStrokeWidthEl, "input", () => this.emitShapeStyleChange({ applyToSelection: true }));
    }
    if (shapeOpacityEl) {
      this.listenDom(shapeOpacityEl, "input", () => this.emitShapeStyleChange({ applyToSelection: true }));
    }
    this.listenDom(drawingVisibilityToggleEl, "click", () => {
      this.getDrawingPlugin()?.toggleDrawLayerVisibility?.();
      this.syncUi();
    });
    this.app.keybindings.register("Mod+Shift+F", "presentation:toggle-fullscreen-board");

    this.listen("tool:change", () => {
      this.syncDrawingUiToActiveTool();
      this.syncShapeUiToActiveTool();
      this.syncUi();
    });
    this.listen("interaction:change", () => {
      this.syncDrawingUiToActiveTool();
      this.syncShapeUiToActiveTool();
      this.syncUi();
    });
    this.listen("focus:state-change", (payload = {}) => {
      this.focusState = {
        ...this.focusState,
        ...payload,
      };
      this.syncUi();
    });
    this.listen("draw:added", () => this.syncUi());
    this.listen("draw:removed", () => this.syncUi());

    this.setupModeToggle();
    this.setupPresentationToolbarAutoHide();
    this.renderToolButtons();
    this.loadShapeUi();
    this.syncDrawingUiToActiveTool();
    this.emitStrokeChange("pen");
    this.emitShapeStyleChange();
    this.syncUi();

    this.cleanups.push(() => {
      this.app.keybindings.unregister("Mod+Shift+F");
      this.clearPresentationToolbarHideTimer();
      if (this.presentationToolbarAnimationFrame != null) {
        window.cancelAnimationFrame(this.presentationToolbarAnimationFrame);
        this.presentationToolbarAnimationFrame = null;
      }
      this.eraserPanelEl?.remove();
    });
  }

  buildEraserPanel() {
    const shell = document.querySelector(".app-shell");
    if (!shell) return;

    const panel = document.createElement("div");
    panel.className = "toolbar__eraser-panel";
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-label", "Eraser");
    panel.dataset.testid = "eraser-controls";
    panel.hidden = true;

    const sliderRow = document.createElement("label");
    sliderRow.className = "toolbar__field toolbar__field--slider toolbar__eraser-slider";
    sliderRow.setAttribute("for", "eraser-radius");

    const srOnly = document.createElement("span");
    srOnly.id = "eraser-radius-label";
    srOnly.className = "toolbar__sr-only";
    srOnly.textContent = "Eraser radius";

    this.eraserRadiusEl = document.createElement("input");
    this.eraserRadiusEl.id = "eraser-radius";
    this.eraserRadiusEl.type = "range";
    this.eraserRadiusEl.min = "4";
    this.eraserRadiusEl.max = "48";
    this.eraserRadiusEl.value = String(this.eraserState.radius);
    this.eraserRadiusEl.dataset.testid = "eraser-radius";
    this.eraserRadiusEl.setAttribute("aria-labelledby", "eraser-radius-label");

    this.eraserRadiusValueEl = document.createElement("output");
    this.eraserRadiusValueEl.id = "eraser-radius-value";
    this.eraserRadiusValueEl.dataset.testid = "eraser-radius-value";
    this.eraserRadiusValueEl.textContent = String(this.eraserState.radius);

    sliderRow.append(srOnly, this.eraserRadiusEl, this.eraserRadiusValueEl);

    this.clearStrokesEl = document.createElement("button");
    this.clearStrokesEl.id = "clear-strokes";
    this.clearStrokesEl.type = "button";
    this.clearStrokesEl.className = "ghost-button toolbar__eraser-clear";
    this.clearStrokesEl.dataset.testid = "clear-strokes";
    this.clearStrokesEl.textContent = "Clear Strokes";

    panel.append(sliderRow, this.clearStrokesEl);
    shell.append(panel);
    this.eraserPanelEl = panel;

    this.listenDom(this.eraserRadiusEl, "input", () => {
      this.eraserState.radius = Number(this.eraserRadiusEl.value);
      this.eraserRadiusValueEl.textContent = this.eraserRadiusEl.value;
      this.emitStrokeChange("eraser");
    });
    this.listenDom(this.clearStrokesEl, "click", () => {
      this.app.commands.execute("drawing:clear-strokes");
      this.syncUi();
    });
  }

  setupPenDropdown() {
    if (!this.penDropdown) return;

    this.penDropdown.setCallbacks({
      onBrushToolSelect: (toolId) => {
        this.app.setEditorTool(toolId);
      },
      onPresetActivate: (toolId, presetIndex) => {
        this.setActivePresetIndex(toolId, presetIndex);
        if (this.app.getEditorTool() !== toolId) {
          this.app.setEditorTool(toolId);
        } else {
          this.syncDrawingUiToActiveTool();
          this.emitStrokeChange(toolId);
          this.syncUi();
        }
      },
      onPresetWidthChange: (toolId, presetIndex, width) => {
        this.updatePreset(toolId, presetIndex, { width });
        this.syncDrawingUiToActiveTool();
        this.emitStrokeChange(toolId);
        this.syncUi();
      },
      onPresetColorChange: (toolId, presetIndex, color) => {
        this.updatePreset(toolId, presetIndex, { color });
        this.syncDrawingUiToActiveTool();
        this.emitStrokeChange(toolId);
        this.syncUi();
      },
    });
  }

  setupEraserPanel() {
    if (!this.eraserTriggerEl) return;

    this.listenDom(this.eraserTriggerEl, "click", (event) => {
      event.stopPropagation();
      if (this.app.getMode() !== "edit" || this.app.getEditorTool() !== "eraser") {
        this.closeEraserPanel();
        return;
      }
      if (this.eraserPanelOpen) {
        this.closeEraserPanel();
      } else {
        this.openEraserPanel();
      }
    });

    this.listenDom(document, "mousedown", (event) => {
      if (!this.eraserPanelOpen) return;
      const target = event.target;
      if (this.eraserPanelEl?.contains(target) || this.eraserTriggerEl?.contains(target)) return;
      this.closeEraserPanel();
    }, true);
    this.listenDom(document, "keydown", (event) => {
      if (event.key === "Escape" && this.eraserPanelOpen) {
        this.closeEraserPanel();
      }
    });
    this.listenDom(window, "resize", () => {
      if (this.eraserPanelOpen) this.positionEraserPanel();
    });
  }

  openEraserPanel() {
    if (!this.eraserPanelEl) return;
    this.eraserPanelOpen = true;
    this.eraserPanelEl.hidden = false;
    this.positionEraserPanel();
  }

  closeEraserPanel() {
    this.eraserPanelOpen = false;
    if (this.eraserPanelEl) {
      this.eraserPanelEl.hidden = true;
    }
  }

  positionEraserPanel() {
    if (!this.eraserPanelEl || !this.eraserTriggerEl) return;
    const shellRect = document.querySelector(".app-shell")?.getBoundingClientRect?.();
    const triggerRect = this.eraserTriggerEl.getBoundingClientRect();
    if (!shellRect) return;
    this.eraserPanelEl.style.left = `${triggerRect.right - shellRect.left + 4}px`;
    this.eraserPanelEl.style.top = `${triggerRect.top - shellRect.top}px`;
  }

  getBoardFullscreenTarget() {
    const container = this.app.stage?.container?.();
    if (!container) return null;
    return container.closest(".board-shell");
  }

  toggleBoardFullscreen() {
    const target = this.getBoardFullscreenTarget();
    if (!target) return;

    if (document.fullscreenElement === target) {
      const exitPromise = document.exitFullscreen?.();
      exitPromise?.catch?.(() => {});
      return;
    }

    if (document.fullscreenElement) {
      const exitPromise = document.exitFullscreen?.();
      exitPromise?.catch?.(() => {});
      return;
    }

    const fullscreenPromise = target.requestFullscreen?.();
    fullscreenPromise?.catch?.(() => {});
  }

  setupPresentationToolbarAutoHide() {
    const { presentationToolbarHoverZoneEl } = this.ui;
    if (!this.toolbarEl || !presentationToolbarHoverZoneEl) return;

    const showToolbar = () => {
      this.isHoveringPresentationToolbarZone = true;
      this.setPresentationToolbarVisible(true);
    };
    const leaveHoverZone = () => {
      this.isHoveringPresentationToolbarZone = false;
      this.schedulePresentationToolbarHide();
    };
    const enterToolbar = () => {
      this.isHoveringPresentationToolbar = true;
      this.setPresentationToolbarVisible(true);
    };
    const leaveToolbar = () => {
      this.isHoveringPresentationToolbar = false;
      this.schedulePresentationToolbarHide();
    };

    this.listenDom(presentationToolbarHoverZoneEl, "mouseenter", showToolbar);
    this.listenDom(presentationToolbarHoverZoneEl, "mouseleave", leaveHoverZone);
    this.listenDom(this.toolbarEl, "mouseenter", enterToolbar);
    this.listenDom(this.toolbarEl, "mouseleave", leaveToolbar);
  }

  clearPresentationToolbarHideTimer() {
    if (this.presentationToolbarHideTimer == null) return;
    window.clearTimeout(this.presentationToolbarHideTimer);
    this.presentationToolbarHideTimer = null;
  }

  clearPresentationToolbarAnimationFrame() {
    if (this.presentationToolbarAnimationFrame == null) return;
    window.cancelAnimationFrame(this.presentationToolbarAnimationFrame);
    this.presentationToolbarAnimationFrame = null;
  }

  setPresentationToolbarVisible(visible) {
    if (!this.toolbarEl || this.app.getMode() !== "presentation") return;
    this.clearPresentationToolbarHideTimer();
    this.toolbarEl.classList.toggle("is-visible", visible);
  }

  schedulePresentationToolbarHide() {
    if (!this.toolbarEl || this.app.getMode() !== "presentation") return;

    this.clearPresentationToolbarHideTimer();
    this.presentationToolbarHideTimer = window.setTimeout(() => {
      this.presentationToolbarHideTimer = null;
      if (this.isHoveringPresentationToolbarZone || this.isHoveringPresentationToolbar) return;
      this.toolbarEl.classList.remove("is-visible");
    }, PRESENTATION_TOOLBAR_HIDE_DELAY_MS);
  }

  syncPresentationToolbarAutoHide() {
    const { presentationToolbarHoverZoneEl } = this.ui;
    if (!this.toolbarEl || !presentationToolbarHoverZoneEl) return;

    const isPresentation = this.app.getMode() === "presentation";
    presentationToolbarHoverZoneEl.hidden = !isPresentation;

    if (!isPresentation) {
      this.isHoveringPresentationToolbarZone = false;
      this.isHoveringPresentationToolbar = false;
      this.clearPresentationToolbarHideTimer();
      this.clearPresentationToolbarAnimationFrame();
      this.toolbarEl.classList.add("toolbar--no-transition");
      this.toolbarEl.classList.remove("is-visible");
      this.presentationToolbarAnimationFrame = window.requestAnimationFrame(() => {
        this.presentationToolbarAnimationFrame = null;
        this.toolbarEl?.classList.remove("toolbar--no-transition");
      });
      return;
    }

    this.clearPresentationToolbarAnimationFrame();
    this.toolbarEl.classList.remove("toolbar--no-transition");
    this.clearPresentationToolbarHideTimer();
    this.toolbarEl.classList.toggle(
      "is-visible",
      this.isHoveringPresentationToolbarZone || this.isHoveringPresentationToolbar,
    );
  }

  isDrawingTool(toolId) {
    return DRAWING_TOOL_IDS.includes(toolId);
  }

  isBrushFamilyActive(toolId = this.app.getEditorTool()) {
    return this.isDrawingTool(toolId);
  }

  showsShapeControls(toolId) {
    return toolId === "shape";
  }

  isToolAvailableInPresentation(toolId) {
    return toolId === "arrange";
  }

  getDrawingPlugin() {
    return this.app.plugins.find((plugin) => plugin.id === "drawing") ?? null;
  }

  getDrawingToolState(toolId = this.lastBrushToolId) {
    if (!this.isDrawingTool(toolId)) return null;
    return this.drawingToolState[toolId] ?? null;
  }

  getActivePreset(toolId = this.lastBrushToolId) {
    const toolState = this.getDrawingToolState(toolId);
    if (!toolState) return null;
    return toolState.presets[toolState.activePresetIndex] ?? null;
  }

  setActivePresetIndex(toolId, presetIndex) {
    const toolState = this.getDrawingToolState(toolId);
    if (!toolState) return;
    toolState.activePresetIndex = clamp(
      Math.round(presetIndex),
      0,
      Math.max(toolState.presets.length - 1, 0),
    );
  }

  updatePreset(toolId, presetIndex, patch = {}) {
    const toolState = this.getDrawingToolState(toolId);
    const preset = toolState?.presets?.[presetIndex];
    if (!preset) return;
    preset.color = patch.color ?? preset.color;
    preset.width = Number.isFinite(patch.width) ? patch.width : preset.width;
    toolState.activePresetIndex = presetIndex;
  }

  buildPenDropdownState() {
    return {
      activeToolId: this.lastBrushToolId,
      presetsByTool: Object.fromEntries(
        DRAWING_TOOL_IDS.map((toolId) => [
          toolId,
          this.getDrawingToolState(toolId)?.presets?.map((preset) => ({ ...preset })) ?? [],
        ]),
      ),
      activePresetIndexByTool: Object.fromEntries(
        DRAWING_TOOL_IDS.map((toolId) => [
          toolId,
          this.getDrawingToolState(toolId)?.activePresetIndex ?? 0,
        ]),
      ),
    };
  }

  syncEraserUi() {
    if (!this.eraserRadiusEl || !this.eraserRadiusValueEl) return;
    this.eraserRadiusEl.value = String(this.eraserState.radius);
    this.eraserRadiusValueEl.textContent = String(this.eraserState.radius);
  }

  loadShapeUi() {
    const {
      shapeFillColorEl,
      shapeStrokeColorEl,
      shapeStrokeWidthEl,
      shapeStrokeWidthValueEl,
      shapeOpacityEl,
      shapeOpacityValueEl,
    } = this.ui;

    if (shapeFillColorEl) shapeFillColorEl.value = this.shapeToolState.fill;
    if (shapeStrokeColorEl) shapeStrokeColorEl.value = this.shapeToolState.stroke;
    if (shapeStrokeWidthEl) shapeStrokeWidthEl.value = String(this.shapeToolState.strokeWidth);
    if (shapeStrokeWidthValueEl) {
      shapeStrokeWidthValueEl.value = String(this.shapeToolState.strokeWidth);
    }
    if (shapeOpacityEl) shapeOpacityEl.value = String(this.shapeToolState.fillOpacity);
    if (shapeOpacityValueEl) {
      shapeOpacityValueEl.value = formatOpacityValue(this.shapeToolState.fillOpacity);
    }
    this.syncShapeControlTooltips();
    this.syncShapeTypeControls();
  }

  saveShapeUiToState() {
    const {
      shapeFillColorEl,
      shapeStrokeColorEl,
      shapeStrokeWidthEl,
      shapeOpacityEl,
    } = this.ui;

    this.shapeToolState = {
      ...this.shapeToolState,
      fill: shapeFillColorEl?.value ?? this.shapeToolState.fill,
      stroke: shapeStrokeColorEl?.value ?? this.shapeToolState.stroke,
      strokeWidth: Number(shapeStrokeWidthEl?.value ?? this.shapeToolState.strokeWidth),
      fillOpacity: Number(shapeOpacityEl?.value ?? this.shapeToolState.fillOpacity),
    };
    return this.shapeToolState;
  }

  syncShapeTypeControls() {
    const { shapeTypeControlsEl } = this.ui;
    const validShapeTypes = new Set(SHAPE_TYPES.map((entry) => entry.value));

    if (!validShapeTypes.has(this.shapeToolState.shapeType)) {
      this.shapeToolState.shapeType = "rectangle";
    }

    for (const button of (shapeTypeControlsEl?.querySelectorAll("[data-shape-type]") ?? [])) {
      button.setAttribute(
        "aria-pressed",
        String(button.dataset.shapeType === this.shapeToolState.shapeType),
      );
    }
  }

  syncShapeUiToActiveTool() {
    if (!this.showsShapeControls(this.app.getEditorTool())) return;
    this.loadShapeUi();
    this.emitShapeStyleChange();
  }

  syncShapeControlTooltips() {
    const {
      shapeFillColorEl,
      shapeStrokeColorEl,
      shapeStrokeWidthEl,
      shapeStrokeWidthValueEl,
      shapeOpacityEl,
      shapeOpacityValueEl,
    } = this.ui;
    const fillTitle = `Shape fill color: ${shapeFillColorEl?.value ?? this.shapeToolState.fill}`;
    const opacityTitle = `Shape fill opacity: ${formatOpacityValue(shapeOpacityEl?.value ?? this.shapeToolState.fillOpacity)}`;
    const strokeTitle = `Shape border color: ${shapeStrokeColorEl?.value ?? this.shapeToolState.stroke}`;
    const strokeWidthTitle = `Shape border width: ${shapeStrokeWidthEl?.value ?? this.shapeToolState.strokeWidth}`;

    if (!shapeFillColorEl || !shapeStrokeColorEl || !shapeStrokeWidthEl || !shapeOpacityEl) return;

    shapeFillColorEl.title = fillTitle;
    shapeFillColorEl.closest("label")?.setAttribute("title", fillTitle);
    shapeOpacityEl.title = opacityTitle;
    if (shapeOpacityValueEl) shapeOpacityValueEl.title = opacityTitle;
    shapeOpacityEl.closest("label")?.setAttribute("title", opacityTitle);
    shapeStrokeColorEl.title = strokeTitle;
    shapeStrokeColorEl.closest("label")?.setAttribute("title", strokeTitle);
    shapeStrokeWidthEl.title = strokeWidthTitle;
    if (shapeStrokeWidthValueEl) shapeStrokeWidthValueEl.title = strokeWidthTitle;
    shapeStrokeWidthEl.closest("label")?.setAttribute("title", strokeWidthTitle);
  }

  syncDrawingUiToActiveTool() {
    const activeToolId = this.app.getEditorTool();
    if (this.isDrawingTool(activeToolId)) {
      this.lastBrushToolId = activeToolId;
    }

    this.penDropdown?.setState(this.buildPenDropdownState());
    this.syncEraserUi();

    if (activeToolId === "eraser") {
      this.emitStrokeChange("eraser");
      return;
    }

    if (this.isDrawingTool(activeToolId)) {
      this.emitStrokeChange(activeToolId);
    }
  }

  setupModeToggle() {
    const { modeCapsuleEditEl, modeCapsulePresentEl } = this.ui;
    if (modeCapsuleEditEl) {
      this.listenDom(modeCapsuleEditEl, "click", () => this.app.setMode("edit"));
    }
    if (modeCapsulePresentEl) {
      this.listenDom(modeCapsulePresentEl, "click", () => this.app.setMode("presentation"));
    }
  }

  renderToolButtons() {
    if (this.ui.shapeTypeControlsEl) {
      renderIcons(this.ui.shapeTypeControlsEl, {
        width: 16,
        height: 16,
        "stroke-width": 2,
      });
    }
  }

  emitStrokeChange(toolId = this.app.getEditorTool()) {
    if (toolId === "eraser") {
      this.app.events.emit("stroke:change", {
        toolId: "eraser",
        radius: this.eraserState.radius,
      });
      return;
    }

    const toolState = this.getDrawingToolState(toolId);
    const preset = this.getActivePreset(toolId);
    if (!toolState || !preset) return;

    this.app.events.emit("stroke:change", {
      toolId,
      color: preset.color,
      width: preset.width,
      opacity: toolState.opacity,
    });
  }

  emitShapeStyleChange({ applyToSelection = false } = {}) {
    const {
      shapeStrokeWidthValueEl,
      shapeOpacityValueEl,
    } = this.ui;
    const state = this.saveShapeUiToState();

    if (shapeStrokeWidthValueEl) shapeStrokeWidthValueEl.value = String(state.strokeWidth);
    if (shapeOpacityValueEl) shapeOpacityValueEl.value = formatOpacityValue(state.fillOpacity);
    this.syncShapeControlTooltips();

    this.app.events.emit("shape:style-change", {
      shapeType: normalizeShapeType(state.shapeType),
      fill: state.fill,
      fillOpacity: state.fillOpacity,
      stroke: state.stroke,
      strokeWidth: state.strokeWidth,
      applyToSelection,
    });
  }

  syncUi() {
    const {
      shapeControlsEl,
      saveFocusEl,
      focusPositionModeEl,
      drawingVisibilityToggleEl,
      modeCapsuleEditEl,
      modeCapsulePresentEl,
    } = this.ui;

    const isEdit = this.app.getMode() === "edit";
    const activeToolId = this.app.getEditorTool();
    const isShapeTool = this.showsShapeControls(activeToolId);
    const showShapeControls = isEdit && isShapeTool;
    const drawingPlugin = this.getDrawingPlugin();
    const isPresentation = !isEdit;
    const drawLayerVisible = drawingPlugin?.isDrawLayerVisible?.() !== false;

    document.body.classList.toggle("is-edit-mode", isEdit);
    document.body.classList.toggle("is-presentation-mode", !isEdit);
    this.syncPresentationToolbarAutoHide();

    if (modeCapsuleEditEl) {
      modeCapsuleEditEl.setAttribute("aria-pressed", String(isEdit));
    }
    if (modeCapsulePresentEl) {
      modeCapsulePresentEl.setAttribute("aria-pressed", String(!isEdit));
    }

    if (drawingVisibilityToggleEl) {
      drawingVisibilityToggleEl.hidden = !isPresentation;
      drawingVisibilityToggleEl.setAttribute("aria-pressed", String(drawLayerVisible));
      drawingVisibilityToggleEl.setAttribute(
        "aria-label",
        drawLayerVisible ? "Hide drawings" : "Show drawings",
      );
      drawingVisibilityToggleEl.title = drawLayerVisible ? "Hide drawings" : "Show drawings";
      drawingVisibilityToggleEl.innerHTML =
        `<i data-lucide="${drawLayerVisible ? "eye" : "eye-off"}" aria-hidden="true"></i>`;
      renderIcons(drawingVisibilityToggleEl, {
        width: 16,
        height: 16,
        "stroke-width": 2,
      });
    }

    if (shapeControlsEl) {
      shapeControlsEl.hidden = !showShapeControls;
    }

    if (!isEdit || !this.isBrushFamilyActive(activeToolId)) {
      this.penDropdown?.close();
    }
    if (!isEdit || activeToolId !== "eraser") {
      this.closeEraserPanel();
    }

    if (this.eraserPanelEl) {
      this.eraserPanelEl.hidden = !this.eraserPanelOpen;
    }
    if (this.clearStrokesEl) {
      this.clearStrokesEl.disabled = !drawingPlugin?.hasDrawings?.();
    }
    if (this.eraserRadiusEl) {
      this.eraserRadiusEl.disabled = !(isEdit && activeToolId === "eraser");
    }
    if (this.eraserRadiusValueEl) {
      this.eraserRadiusValueEl.disabled = !(isEdit && activeToolId === "eraser");
    }

    if (saveFocusEl) {
      saveFocusEl.hidden = true;
      saveFocusEl.disabled = true;
    }
    if (focusPositionModeEl) {
      focusPositionModeEl.hidden = true;
      focusPositionModeEl.disabled = true;
    }

    const shapeControlsEnabled = isEdit && isShapeTool;
    for (const control of [
      this.ui.shapeFillColorEl,
      this.ui.shapeStrokeColorEl,
      this.ui.shapeStrokeWidthEl,
      this.ui.shapeStrokeWidthValueEl,
      this.ui.shapeOpacityEl,
      this.ui.shapeOpacityValueEl,
      ...(this.ui.shapeTypeControlsEl?.querySelectorAll("[data-shape-type]") ?? []),
    ]) {
      if (control) control.disabled = !shapeControlsEnabled;
    }
  }
}
