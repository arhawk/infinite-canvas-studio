import { BasePlugin } from "../core/baseClasses.js";
import { renderIcons } from "../lib/icons.js";

const TOOL_ICONS = {
  arrange: "mouse-pointer-2",
  pen: "pen",
  pencil: "pencil",
  highlighter: "highlighter",
  eraser: "eraser",
  "annotate": "baseline",
  "annotate-eraser": "eraser",
};

const DRAWING_TOOL_IDS = ["pen", "pencil", "highlighter"];
const BRUSH_CONTROL_TOOL_IDS = [...DRAWING_TOOL_IDS, "eraser"];

const DEFAULT_ERASER_STATE = {
  radius: 12,
};

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


export class ToolbarPlugin extends BasePlugin {
  static pluginId = "toolbar";

  onSetup() {
    const {
      modeToggleEl,
      drawingVisibilityToggleEl,
      toolButtonsEl,
      historyControlsEl,
      arrangeControlsEl,
      brushControlsEl,
      connectSelectionEl,
      deleteSelectionEl,
      saveFocusEl,
      focusPositionModeEl,
      strokeColorEl,
      recentColorsEl,
      strokeWidthLabelEl,
      strokeWidthEl,
      strokeWidthValueEl,
      clearStrokesEl,
    } = this.options;

    this.ui = {
      modeToggleEl,
      drawingVisibilityToggleEl,
      toolButtonsEl,
      historyControlsEl,
      arrangeControlsEl,
      brushControlsEl,
      connectSelectionEl,
      deleteSelectionEl,
      saveFocusEl,
      focusPositionModeEl,
      strokeColorEl,
      recentColorsEl,
      strokeWidthLabelEl,
      strokeWidthEl,
      strokeWidthValueEl,
      clearStrokesEl,
    };
    this.focusState = {
      positionMode: "absolute",
      canSave: false,
      canTogglePositionMode: false,
      selectedNodeId: null,
    };

    this.drawingToolState = cloneDrawingToolState();
    this.eraserState = { ...DEFAULT_ERASER_STATE };

    this.listenDom(connectSelectionEl, "click", () => {
      if (!this.focusState.selectedNodeId) return;
      this.app.commands.execute("connection:connect", this.focusState.selectedNodeId);
    });
    this.listenDom(deleteSelectionEl, "click", () => {
      this.app.commands.execute("selection:delete");
    });
    this.listenDom(saveFocusEl, "click", () => {
      this.app.commands.execute("focus:save-selection");
    });
    this.listenDom(focusPositionModeEl, "click", () => {
      const nextMode = this.focusState.positionMode === "relative" ? "absolute" : "relative";
      this.app.commands.execute("focus:position-mode:set", nextMode);
    });
    this.listenDom(strokeColorEl, "input", () => this.emitStrokeChange());
    this.listenDom(strokeWidthEl, "input", () => this.emitStrokeChange());
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
      this.syncUi();
    });

    this.listen("interaction:change", () => {
      this.syncDrawingUiToActiveTool();
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
    this.renderToolButtons();

    this.loadDrawingUiFromTool("pen");
    this.renderRecentColors("pen");

    this.emitStrokeChange();
    this.syncUi();
  }

  isDrawingTool(toolId) {
    return DRAWING_TOOL_IDS.includes(toolId);
  }

  showsBrushControls(toolId) {
    return BRUSH_CONTROL_TOOL_IDS.includes(toolId);
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
      strokeWidthEl.min = "4";
      strokeWidthEl.max = "48";
      strokeWidthEl.value = String(this.eraserState.radius);
      strokeWidthValueEl.value = String(this.eraserState.radius);
      return;
    }

    const toolState = this.getDrawingToolState(toolId);
    if (!toolState) return;

    strokeWidthLabelEl.textContent = "Stroke";
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
    const { modeToggleEl } = this.ui;
    const checkbox = modeToggleEl.querySelector("input");
    this.ui.modeCheckbox = checkbox;
    this.ui.modeLabel = modeToggleEl.querySelector(".mode-toggle__label");

    this.listenDom(checkbox, "change", () => {
      this.app.setMode(checkbox.checked ? "edit" : "presentation");
    });
  }

  renderToolButtons() {
    const { toolButtonsEl, historyControlsEl, arrangeControlsEl } = this.ui;
    toolButtonsEl.innerHTML = "";

    for (const tool of this.app.tools.list()) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "tool-button";
      button.title = tool.label;
      button.dataset.toolId = tool.id;
      button.dataset.testid = `tool-button-${tool.id}`;

      if (TOOL_ICONS[tool.id]) {
        const icon = document.createElement("i");
        icon.dataset.lucide = TOOL_ICONS[tool.id];
        button.append(icon);
      } else {
        button.textContent = tool.label;
      }

      this.listenDom(button, "click", () => this.app.setEditorTool(tool.id));
      toolButtonsEl.append(button);
    }

    renderIcons(toolButtonsEl, {
      width: 18,
      height: 18,
      "stroke-width": 2,
    });
    renderIcons(arrangeControlsEl, {
      width: 16,
      height: 16,
      "stroke-width": 2,
    });
    renderIcons(historyControlsEl, {
      width: 16,
      height: 16,
      "stroke-width": 2,
    });
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

  syncUi() {
    const {
      toolButtonsEl,
      arrangeControlsEl,
      brushControlsEl,
      connectSelectionEl,
      deleteSelectionEl,
      saveFocusEl,
      focusPositionModeEl,
      strokeColorEl,
      recentColorsEl,
      strokeWidthEl,
      strokeWidthValueEl,
      clearStrokesEl,
      drawingVisibilityToggleEl,
      modeCheckbox,
      modeLabel,
    } = this.ui;

    const isEdit = this.app.getMode() === "edit";
    const activeToolId = isEdit ? this.app.getEditorTool() : null;
    const isEraser = activeToolId === "eraser";
    const hasSelectedArrangeNode = Boolean(this.focusState.selectedNodeId);
    const showArrangeControls =
      activeToolId === "arrange"
      && hasSelectedArrangeNode;
    const showBrushControls = this.showsBrushControls(activeToolId);
    const connectCommand = this.app.commands.get("connection:connect");
    const drawingPlugin = this.getDrawingPlugin();
    const isPresentation = !isEdit;
    const drawLayerVisible = drawingPlugin?.isDrawLayerVisible?.() !== false;

    document.body.classList.toggle("is-edit-mode", isEdit);
    document.body.classList.toggle("is-presentation-mode", !isEdit);

    if (modeCheckbox) {
      modeCheckbox.checked = isEdit;
    }
    if (modeLabel) {
      modeLabel.textContent = isEdit ? "Edit" : "View";
    }

    for (const button of toolButtonsEl.querySelectorAll("[data-tool-id]")) {
      button.setAttribute("aria-pressed", String(button.dataset.toolId === this.app.tools.getActive()));
      button.disabled = !isEdit;
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
    const colorFieldEl = strokeColorEl.closest(".toolbar__field");
    if (colorFieldEl) {
      colorFieldEl.hidden = isEraser;
    }
    if (recentColorsEl) {
      recentColorsEl.hidden = isEraser;
    }
    if (clearStrokesEl) {
      clearStrokesEl.hidden = !isEraser;
      clearStrokesEl.disabled = !isEraser || !drawingPlugin?.hasDrawings?.();
    }

    connectSelectionEl.hidden = !hasSelectedArrangeNode;
    deleteSelectionEl.hidden = !hasSelectedArrangeNode;
    saveFocusEl.hidden = true;
    focusPositionModeEl.hidden = true;
    connectSelectionEl.disabled =
      !connectCommand?.isEnabled?.() || !this.focusState.selectedNodeId;
    deleteSelectionEl.disabled = !hasSelectedArrangeNode;
    connectSelectionEl.title = this.focusState.selectedNodeId
      ? "Select another component on the canvas to create a connection"
      : "Select a component first";
    deleteSelectionEl.title = hasSelectedArrangeNode
      ? "Delete the selected component"
      : "Select a component first";
    saveFocusEl.disabled = true;
    focusPositionModeEl.disabled = true;

    const brushControlsEnabled =
      isEdit && this.showsBrushControls(activeToolId);

    strokeColorEl.disabled = !brushControlsEnabled || isEraser;
    strokeWidthEl.disabled = !brushControlsEnabled;
    strokeWidthValueEl.disabled = !brushControlsEnabled;
  }
}
