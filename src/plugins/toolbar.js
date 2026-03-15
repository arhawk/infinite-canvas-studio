import { BaseCommand, BasePlugin } from "../core/baseClasses.js";

const TOOL_ICONS = {
  arrange: "mouse-pointer-2",
  brush: "brush",
};

class ResetZoomCommand extends BaseCommand {
  static commandId = "zoom:reset";
  static label = "Reset Zoom";

  execute() {
    this.app.stageApi.resetZoom();
  }
}

class FitAllCommand extends BaseCommand {
  static commandId = "fit:all";
  static label = "Fit All";

  execute() {
    this.app.stageApi.fitNodes([
      ...this.app.mainLayer.find(".selectable"),
      ...this.app.drawLayer.find(".drawable"),
    ]);
  }
}

export class ToolbarPlugin extends BasePlugin {
  static pluginId = "toolbar";

  commands() {
    return [ResetZoomCommand, FitAllCommand];
  }

  onSetup() {
    const {
      modeToggleEl,
      toolButtonsEl,
      strokeColorEl,
      strokeWidthEl,
      strokeWidthValueEl,
      zoomResetEl,
      fitAllEl,
    } = this.options;

    this.ui = {
      modeToggleEl,
      toolButtonsEl,
      strokeColorEl,
      strokeWidthEl,
      strokeWidthValueEl,
      zoomResetEl,
      fitAllEl,
    };

    this.app.keybindings.register("Mod+0", "zoom:reset");
    this.cleanups.push(() => this.app.keybindings.unregister("Mod+0"));

    this.listenDom(strokeColorEl, "input", () => this.emitStrokeChange());
    this.listenDom(strokeWidthEl, "input", () => this.emitStrokeChange());
    this.listenDom(zoomResetEl, "click", () => this.app.commands.execute("zoom:reset"));
    this.listenDom(fitAllEl, "click", () => this.app.commands.execute("fit:all"));

    this.listen("tool:change", () => this.syncUi());
    this.listen("zoom:change", ({ zoom }) => {
      zoomResetEl.textContent = `${zoom}%`;
    });
    this.listen("interaction:change", () => this.syncUi());

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
    const { toolButtonsEl } = this.ui;
    toolButtonsEl.innerHTML = "";

    for (const tool of this.app.tools.list()) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "tool-button";
      button.title = tool.label;
      button.dataset.toolId = tool.id;

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

    if (window.lucide) {
      window.lucide.createIcons({
        attrs: {
          width: 18,
          height: 18,
          "stroke-width": 2,
        },
      });
    }
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
      strokeColorEl,
      strokeWidthEl,
      strokeWidthValueEl,
      modeCheckbox,
      modeLabel,
    } = this.ui;

    const isEdit = this.app.getMode() === "edit";

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

    const drawingEnabled = this.app.modeManager.matches({
      mode: "edit",
      editorTool: "brush",
    });
    strokeColorEl.disabled = !drawingEnabled;
    strokeWidthEl.disabled = !drawingEnabled;
    strokeWidthValueEl.disabled = !drawingEnabled;
  }
}
