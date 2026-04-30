import { BasePlugin } from "../core/baseClasses.js";
import {
  DEFAULT_SHAPE_FILL,
  DEFAULT_SHAPE_FILL_OPACITY,
  DEFAULT_SHAPE_STROKE,
  SHAPE_TYPES,
  normalizeShapeType,
} from "../component/shapeModel.js";
import { renderIcons } from "../lib/icons.js";

const TOOL_ICONS = {
  arrange: "mouse-pointer-2",
  pen: "pen",
  pencil: "pencil",
  highlighter: "highlighter",
  eraser: "eraser",
  shape: "shapes",
  annotate: "text-cursor",
};

const DRAWING_TOOL_IDS = ["pen", "pencil", "highlighter"];
const BRUSH_CONTROL_TOOL_IDS = [...DRAWING_TOOL_IDS, "eraser"];
const HIDDEN_MAIN_TOOL_BUTTON_IDS = new Set(["pencil", "highlighter", "annotate"]);

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
    color: "#1f6feb",
    width: 4,
    opacity: 1,
    recentColors: ["#1f6feb"],
  },
  pencil: {
    color: "#4a4a4a",
    width: 3,
    opacity: 0.55,
    recentColors: ["#4a4a4a"],
  },
  highlighter: {
    color: "#f6d32d",
    width: 16,
    opacity: 0.25,
    recentColors: ["#f6d32d"],
  },
};

function cloneDrawingToolState() {
  return Object.fromEntries(
    Object.entries(DEFAULT_DRAWING_TOOL_STATE).map(([toolId, config]) => [
      toolId,
      {
        ...config,
        recentColors: [...config.recentColors],
      },
    ]),
  );
}

function formatOpacityValue(value) {
  return Number(value).toFixed(2).replace(/\.?0+$/, "");
}


export class ToolbarPlugin extends BasePlugin {
  static pluginId = "toolbar";

  onSetup() {
    const {
      presentationToolbarHoverZoneEl,
      modeCapsuleEditEl,
      modeCapsulePresentEl,
      drawingVisibilityToggleEl,
      arrangeControlsEl,
      brushControlsEl,
      brushTypeControlsEl,
      saveFocusEl,
      focusPositionModeEl,
      strokeColorEl,
      recentColorsEl,
      strokeWidthLabelEl,
      strokeWidthEl,
      strokeWidthValueEl,
      clearStrokesEl,
      shapeControlsEl,
      shapeTypeControlsEl,
      shapeFillColorEl,
      shapeStrokeColorEl,
      shapeStrokeWidthEl,
      shapeStrokeWidthValueEl,
      shapeOpacityEl,
      shapeOpacityValueEl,
    } = this.options;

    this.ui = {
      presentationToolbarHoverZoneEl,
      modeCapsuleEditEl,
      modeCapsulePresentEl,
      drawingVisibilityToggleEl,
      arrangeControlsEl,
      brushControlsEl,
      brushTypeControlsEl,
      saveFocusEl,
      focusPositionModeEl,
      strokeColorEl,
      recentColorsEl,
      strokeWidthLabelEl,
      strokeWidthEl,
      strokeWidthValueEl,
      clearStrokesEl,
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
    this.focusState = {
      positionMode: "absolute",
      canSave: false,
      canTogglePositionMode: false,
      selectedNodeId: null,
    };
    this.brushPanelPositionFrame = null;
    this.presentationToolbarHideTimer = null;
    this.presentationToolbarAnimationFrame = null;
    this.isHoveringPresentationToolbarZone = false;
    this.isHoveringPresentationToolbar = false;

    this.drawingToolState = cloneDrawingToolState();
    this.eraserState = { ...DEFAULT_ERASER_STATE };
    this.shapeToolState = { ...DEFAULT_SHAPE_TOOL_STATE };

    this.listenDom(saveFocusEl, "click", () => {
      this.app.commands.execute("focus:save-selection");
    });
    this.listenDom(focusPositionModeEl, "click", () => {
      const nextMode = this.focusState.positionMode === "relative" ? "absolute" : "relative";
      this.app.commands.execute("focus:position-mode:set", nextMode);
    });
    for (const button of brushTypeControlsEl.querySelectorAll("[data-brush-tool-id]")) {
      this.listenDom(button, "click", () => {
        const { brushToolId } = button.dataset;
        if (!brushToolId) return;
        this.app.setEditorTool(brushToolId);
      });
    }
    for (const button of (shapeTypeControlsEl?.querySelectorAll("[data-shape-type]") ?? [])) {
      this.listenDom(button, "click", () => {
        this.shapeToolState.shapeType = normalizeShapeType(button.dataset.shapeType);
        this.syncShapeTypeControls();
        this.emitShapeStyleChange({ applyToSelection: true });
      });
    }
    this.listenDom(window, "resize", () => this.queueBrushPanelPositionSync());
    this.listenDom(strokeColorEl, "input", () => this.emitStrokeChange());
    this.listenDom(strokeWidthEl, "input", () => this.emitStrokeChange());
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
    this.listenDom(clearStrokesEl, "click", () => {
      this.app.commands.execute("drawing:clear-strokes");
      this.syncUi();
    });
    this.listenDom(drawingVisibilityToggleEl, "click", () => {
      this.getDrawingPlugin()?.toggleDrawLayerVisibility?.();
      this.syncUi();
    });

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
    this.listen("draw:added", (payload = {}) => {
      this.recordRecentColorFromStroke(payload);
      this.syncUi();
    });
    this.listen("draw:removed", () => this.syncUi());

    this.setupModeToggle();
    this.setupPresentationToolbarAutoHide();
    this.renderToolButtons();

    this.loadDrawingUiFromTool("pen");
    this.renderRecentColors("pen");
    this.loadShapeUi();

    this.emitStrokeChange();
    this.emitShapeStyleChange();
    this.syncUi();

    this.cleanups.push(() => {
      if (this.brushPanelPositionFrame != null) {
        window.cancelAnimationFrame(this.brushPanelPositionFrame);
        this.brushPanelPositionFrame = null;
      }
      this.clearPresentationToolbarHideTimer();
      if (this.presentationToolbarAnimationFrame != null) {
        window.cancelAnimationFrame(this.presentationToolbarAnimationFrame);
        this.presentationToolbarAnimationFrame = null;
      }
    });
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

  showsBrushControls(toolId) {
    return BRUSH_CONTROL_TOOL_IDS.includes(toolId);
  }

  showsShapeControls(toolId) {
    return toolId === "shape";
  }

  isToolAvailableInPresentation(toolId) {
    return toolId === "arrange" || this.showsBrushControls(toolId);
  }

  isMainToolButtonActive(buttonToolId, activeToolId) {
    if (this.app.getMode() === "presentation" && buttonToolId === "arrange") {
      return false;
    }

    if (buttonToolId === "pen") {
      return this.isBrushFamilyActive(activeToolId);
    }

    return buttonToolId === activeToolId;
  }

  handleMainToolButtonClick(toolId) {
    if (this.app.getMode() === "presentation") {
      const activeToolId = this.app.getEditorTool();
      const isPenFamilyButton = toolId === "pen" && this.isBrushFamilyActive(activeToolId);
      const isSameStandaloneTool = toolId !== "pen" && activeToolId === toolId;

      if (isPenFamilyButton || isSameStandaloneTool) {
        this.app.setEditorTool("arrange");
        return;
      }
    }

    this.app.setEditorTool(toolId);
  }

  getDrawingPlugin() {
    return this.app.plugins.find((plugin) => plugin.id === "drawing") ?? null;
  }

  getDrawingToolState(toolId = this.app.getEditorTool()) {
    if (!this.isDrawingTool(toolId)) return null;
    return this.drawingToolState[toolId] ?? null;
  }

  loadDrawingUiFromTool(toolId = this.app.getEditorTool()) {
    const {
      strokeColorEl,
      strokeWidthLabelEl,
      strokeWidthEl,
      strokeWidthValueEl,
    } = this.ui;

    if (toolId === "eraser") {
      strokeWidthLabelEl.textContent = "Radius";
      strokeWidthEl.setAttribute("aria-label", "Radius");
      strokeColorEl.setAttribute("aria-label", "Brush color");
      strokeWidthEl.min = "4";
      strokeWidthEl.max = "48";
      strokeWidthEl.value = String(this.eraserState.radius);
      strokeWidthValueEl.value = String(this.eraserState.radius);
      return;
    }

    const toolState = this.getDrawingToolState(toolId);
    if (!toolState) return;

    strokeWidthLabelEl.textContent = `${toolId} width`;
    strokeWidthEl.setAttribute("aria-label", `${toolId} width`);
    strokeColorEl.setAttribute("aria-label", `${toolId} color`);
    strokeWidthEl.min = "1";
    strokeWidthEl.max = "24";
    strokeColorEl.value = toolState.color;
    strokeWidthEl.value = String(toolState.width);
    strokeWidthValueEl.value = String(toolState.width);
  }

  saveDrawingUiToTool(toolId = this.app.getEditorTool()) {
    const toolState = this.getDrawingToolState(toolId);
    if (!toolState) return null;

    const { strokeColorEl, strokeWidthEl } = this.ui;
    toolState.color = strokeColorEl.value;
    toolState.width = Number(strokeWidthEl.value);
    return toolState;
  }

  renderRecentColors(toolId = this.app.getEditorTool()) {
    const toolState = this.getDrawingToolState(toolId);
    const { recentColorsEl } = this.ui;
    if (!toolState || !recentColorsEl) return;

    recentColorsEl.innerHTML = "";

    for (const color of toolState.recentColors) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "recent-color-swatch";
      button.dataset.color = color;
      button.dataset.testid = `recent-color-${color.slice(1)}`;
      button.title = color;
      button.setAttribute("aria-label", `Recent color ${color}`);
      button.style.backgroundColor = color;

      this.listenDom(button, "click", () => {
        const { strokeColorEl } = this.ui;
        strokeColorEl.value = color;
        this.pushRecentColor(toolId, color);
        this.renderRecentColors(toolId);
        this.emitStrokeChange();
      });

      recentColorsEl.append(button);
    }
  }

  pushRecentColor(toolId, color) {
    const toolState = this.getDrawingToolState(toolId);
    if (!toolState || typeof color !== "string" || !color) return;

    toolState.recentColors = [
      color,
      ...toolState.recentColors.filter((item) => item !== color),
    ].slice(0, 3);
  }

  recordRecentColorFromStroke({ node, toolId, color } = {}) {
    const drawingToolId = toolId ?? node?.getAttr?.("drawingToolId");
    if (!this.isDrawingTool(drawingToolId)) return;

    const strokeColor = color ?? node?.stroke?.();
    this.pushRecentColor(drawingToolId, strokeColor);

    if (this.app.getEditorTool() === drawingToolId) {
      this.renderRecentColors(drawingToolId);
    }
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
    if (!this.showsBrushControls(activeToolId)) return;

    this.loadDrawingUiFromTool(activeToolId);

    if (this.isDrawingTool(activeToolId)) {
      this.renderRecentColors(activeToolId);
    } else {
      this.ui.recentColorsEl.innerHTML = "";
    }

    this.emitStrokeChange();
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
    const {
      arrangeControlsEl,
      brushTypeControlsEl,
    } = this.ui;

    if (arrangeControlsEl) {
      renderIcons(arrangeControlsEl, {
        width: 16,
        height: 16,
        "stroke-width": 2,
      });
    }
    if (brushTypeControlsEl) {
      renderIcons(brushTypeControlsEl, {
        width: 16,
        height: 16,
        "stroke-width": 2,
      });
    }
    if (this.ui.shapeTypeControlsEl) {
      renderIcons(this.ui.shapeTypeControlsEl, {
        width: 16,
        height: 16,
        "stroke-width": 2,
      });
    }

    this.queueBrushPanelPositionSync();
  }

  queueBrushPanelPositionSync() {
    if (this.brushPanelPositionFrame != null) return;

    this.brushPanelPositionFrame = window.requestAnimationFrame(() => {
      this.brushPanelPositionFrame = null;
      this.syncBrushPanelPosition();
    });
  }

  syncBrushPanelPosition() {
    const { brushControlsEl, toolButtonsEl } = this.ui;
    if (!brushControlsEl || brushControlsEl.hidden) return;

    const anchorButton = toolButtonsEl?.querySelector?.('[data-tool-id="pen"]');
    const toolbarRect = brushControlsEl.parentElement?.getBoundingClientRect?.();
    const buttonRect = anchorButton?.getBoundingClientRect?.();
    const panelWidth = brushControlsEl.offsetWidth;

    if (!toolbarRect || !buttonRect || !panelWidth) return;

    const horizontalPadding = 16;
    const anchorCenter = buttonRect.left - toolbarRect.left + buttonRect.width / 2;
    let left = anchorCenter - panelWidth / 2;
    left = Math.max(horizontalPadding, Math.min(left, toolbarRect.width - panelWidth - horizontalPadding));

    brushControlsEl.style.left = `${left}px`;
  }

  emitStrokeChange() {
    const { strokeWidthEl, strokeWidthValueEl } = this.ui;
    strokeWidthValueEl.value = strokeWidthEl.value;

    const activeToolId = this.app.getEditorTool();

    if (activeToolId === "eraser") {
      this.eraserState.radius = Number(strokeWidthEl.value);
      this.app.events.emit("stroke:change", {
        toolId: "eraser",
        radius: this.eraserState.radius,
      });
      return;
    }

    const toolState = this.saveDrawingUiToTool(activeToolId);
    if (!toolState) return;

    this.app.events.emit("stroke:change", {
      toolId: activeToolId,
      color: toolState.color,
      width: toolState.width,
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
      arrangeControlsEl,
      brushControlsEl,
      brushTypeControlsEl,
      shapeControlsEl,
      saveFocusEl,
      focusPositionModeEl,
      strokeColorEl,
      recentColorsEl,
      strokeWidthEl,
      strokeWidthValueEl,
      clearStrokesEl,
      drawingVisibilityToggleEl,
      modeCapsuleEditEl,
      modeCapsulePresentEl,
    } = this.ui;

    const isEdit = this.app.getMode() === "edit";
    const activeToolId = this.app.getEditorTool();
    const isEraser = activeToolId === "eraser";
    const isBrushFamilyActive = this.isBrushFamilyActive(activeToolId);
    const isShapeTool = this.showsShapeControls(activeToolId);
    const hasSelectedArrangeNode = Boolean(this.focusState.selectedNodeId);
    const showArrangeControls =
      isEdit
      && activeToolId === "arrange"
      && hasSelectedArrangeNode;
    const showBrushControls = this.showsBrushControls(activeToolId);
    const showBrushTypeControls = isBrushFamilyActive;
    const showShapeControls = isEdit && isShapeTool;
    const canUseSelectedToolInCurrentMode =
      isEdit || this.isToolAvailableInPresentation(activeToolId);
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

    for (const button of (brushTypeControlsEl?.querySelectorAll("[data-brush-tool-id]") ?? [])) {
      const { brushToolId } = button.dataset;
      button.setAttribute("aria-pressed", String(brushToolId === activeToolId));
      button.disabled = !canUseSelectedToolInCurrentMode || isEraser;
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

    if (arrangeControlsEl) {
      arrangeControlsEl.hidden = !showArrangeControls;
    }
    if (brushControlsEl) {
      brushControlsEl.hidden = !showBrushControls;
    }
    if (shapeControlsEl) {
      shapeControlsEl.hidden = !showShapeControls;
    }
    if (brushTypeControlsEl) {
      brushTypeControlsEl.hidden = !showBrushTypeControls;
    }
    const colorFieldEl = strokeColorEl.closest(".toolbar__field");
    if (colorFieldEl) {
      colorFieldEl.hidden = !isBrushFamilyActive;
    }
    if (recentColorsEl) {
      recentColorsEl.hidden = !isBrushFamilyActive;
    }
    if (clearStrokesEl) {
      clearStrokesEl.hidden = !isEraser;
      clearStrokesEl.disabled = !isEraser || !drawingPlugin?.hasDrawings?.();
    }

    if (saveFocusEl) {
      saveFocusEl.hidden = true;
      saveFocusEl.disabled = true;
    }
    if (focusPositionModeEl) {
      focusPositionModeEl.hidden = true;
      focusPositionModeEl.disabled = true;
    }

    const brushControlsEnabled =
      canUseSelectedToolInCurrentMode && this.showsBrushControls(activeToolId);

    strokeColorEl.disabled = !brushControlsEnabled || isEraser;
    strokeWidthEl.disabled = !brushControlsEnabled;
    strokeWidthValueEl.disabled = !brushControlsEnabled;

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

    if (showBrushControls) {
      this.queueBrushPanelPositionSync();
    }
  }
}
