import { BasePlugin } from "../core/baseClasses.js";
import { renderIcons } from "../lib/icons.js";

const TOOL_ICONS = {
  arrange: "mouse-pointer-2",
  brush: "brush",
  eraser: "eraser",
};

export class ToolbarPlugin extends BasePlugin {
  static pluginId = "toolbar";

  onSetup() {
    const {
      modeToggleEl,
      toolButtonsEl,
      historyControlsEl,
      arrangeControlsEl,
      brushControlsEl,
      connectSelectionEl,
      saveFocusEl,
      focusPositionModeEl,
      strokeColorEl,
      strokeWidthEl,
      strokeWidthValueEl,
    } = this.options;

    this.ui = {
      modeToggleEl,
      toolButtonsEl,
      historyControlsEl,
      arrangeControlsEl,
      brushControlsEl,
      connectSelectionEl,
      saveFocusEl,
      focusPositionModeEl,
      strokeColorEl,
      strokeWidthEl,
      strokeWidthValueEl,
    };
    this.focusState = {
      positionMode: "absolute",
      canSave: false,
      canTogglePositionMode: false,
      selectedNodeId: null,
    };

    this.listenDom(connectSelectionEl, "click", () => {
      if (!this.focusState.selectedNodeId) return;
      this.app.commands.execute("connection:connect", this.focusState.selectedNodeId);
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

    this.listen("tool:change", () => this.syncUi());
    this.listen("interaction:change", () => this.syncUi());
    this.listen("focus:state-change", (payload = {}) => {
      this.focusState = {
        ...this.focusState,
        ...payload,
      };
      this.syncUi();
    });

    this.setupModeToggle();
    this.renderToolButtons();
    this.emitStrokeChange();
    this.syncUi();
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
    const { strokeColorEl, strokeWidthEl, strokeWidthValueEl } = this.ui;
    strokeWidthValueEl.value = strokeWidthEl.value;
    this.app.events.emit("stroke:change", {
      color: strokeColorEl.value,
      width: Number(strokeWidthEl.value),
    });
  }

  syncUi() {
    const {
      toolButtonsEl,
      arrangeControlsEl,
      brushControlsEl,
      connectSelectionEl,
      saveFocusEl,
      focusPositionModeEl,
      strokeColorEl,
      strokeWidthEl,
      strokeWidthValueEl,
      modeCheckbox,
      modeLabel,
    } = this.ui;

    const isEdit = this.app.getMode() === "edit";
    const activeToolId = isEdit ? this.app.getEditorTool() : null;
    const showArrangeControls =
      activeToolId === "arrange"
      && (this.focusState.canSave || this.focusState.canTogglePositionMode);
    const showBrushControls = activeToolId === "brush";
    const connectCommand = this.app.commands.get("connection:connect");
    const focusSaveCommand = this.app.commands.get("focus:save-selection");
    const focusModeCommand = this.app.commands.get("focus:position-mode:set");
    const isRelativeFocus = this.focusState.positionMode === "relative";

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

    if (arrangeControlsEl) {
      arrangeControlsEl.hidden = !showArrangeControls;
    }
    if (brushControlsEl) {
      brushControlsEl.hidden = !showBrushControls;
    }

    connectSelectionEl.disabled =
      !connectCommand?.isEnabled?.() || !this.focusState.selectedNodeId;
    connectSelectionEl.title = this.focusState.selectedNodeId
      ? "Select another component on the canvas to create a connection"
      : "Select a component first";
    saveFocusEl.disabled = !focusSaveCommand?.isEnabled?.() || !this.focusState.canSave;
    focusPositionModeEl.disabled =
      !focusModeCommand?.isEnabled?.() || !this.focusState.canTogglePositionMode;
    focusPositionModeEl.setAttribute("aria-pressed", String(isRelativeFocus));
    focusPositionModeEl.textContent = isRelativeFocus ? "Focus: Relative" : "Focus: Absolute";
    focusPositionModeEl.title = isRelativeFocus
      ? "Focus positioning follows the component when it moves"
      : "Focus positioning stays fixed in canvas space";

    const drawingEnabled = this.app.modeManager.matches({
      mode: "edit",
      editorTool: "brush",
    });
    strokeColorEl.disabled = !drawingEnabled;
    strokeWidthEl.disabled = !drawingEnabled;
    strokeWidthValueEl.disabled = !drawingEnabled;
  }
}
