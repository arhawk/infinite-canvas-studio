import { BasePlugin } from "../../core/baseClasses.js";
import { renderIcons } from "../../lib/icons.js";

const SHAPE_OPTIONS = [
  { value: "rectangle", label: "Rectangle", icon: "square" },
  { value: "oval", label: "Oval / Circle", icon: "circle" },
  { value: "rhombus", label: "Rhombus", icon: "diamond" },
  { value: "triangle", label: "Triangle", icon: "triangle" },
];

export class ShapeDropdownPlugin extends BasePlugin {
  static pluginId = "shape-dropdown";

  onSetup() {
    this._open = false;
    this._selectedType = "rectangle";
    this._triggerBtn ??= null;
    this._buildDropdown();

    this.listenDom(window, "resize", () => {
      if (this._open) this._positionDropdown();
    });
    this.listen("tool:change", () => {
      if (this.app.getEditorTool() !== "shape" || this.app.getMode() !== "edit") {
        this.close();
      }
    });
    this.listen("interaction:change", () => {
      if (this.app.getEditorTool() !== "shape" || this.app.getMode() !== "edit") {
        this.close();
      }
    });
    this.listen("shape:style-change", ({ shapeType } = {}) => {
      if (shapeType && this._selectedType !== shapeType) {
        this._selectedType = shapeType;
        this._render();
      }
    });

    this.cleanups.push(() => this._dropdown?.remove());
  }

  wireTrigger(triggerBtn) {
    if (!triggerBtn) return;
    this._triggerBtn = triggerBtn;
    this.listenDom(triggerBtn, "click", (event) => {
      event.stopPropagation();
      if (this.app.getMode() !== "edit" || this.app.getEditorTool() !== "shape") {
        this.close();
        return;
      }
      this.toggle();
    });
  }

  open() {
    if (!this._triggerBtn) return;
    this._open = true;
    this._dropdown.hidden = false;
    this._positionDropdown();
    this._render();
  }

  close() {
    this._open = false;
    this._dropdown.hidden = true;
  }

  toggle() {
    if (this._open) {
      this.close();
      return;
    }
    this.open();
  }

  _buildDropdown() {
    this._dropdown = document.createElement("div");
    this._dropdown.className = "shape-dropdown pen-dropdown";
    this._dropdown.setAttribute("role", "dialog");
    this._dropdown.setAttribute("aria-label", "Shapes");
    this._dropdown.dataset.testid = "shape-dropdown";
    this._dropdown.hidden = true;

    const title = document.createElement("div");
    title.className = "pen-dropdown__title";
    title.textContent = "SHAPES";

    this._toolListEl = document.createElement("div");
    this._toolListEl.className = "pen-dropdown__tools";
    this._shapeButtons = new Map();

    for (const option of SHAPE_OPTIONS) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "pen-dropdown__tool-button";
      button.dataset.shapeType = option.value;
      button.dataset.testid = `shape-dropdown-${option.value}`;
      button.title = option.label;
      button.setAttribute("aria-label", option.label);
      button.setAttribute("aria-pressed", "false");
      button.innerHTML = `<i data-lucide="${option.icon}" aria-hidden="true"></i>`;
      this.listenDom(button, "click", () => {
        this._selectShapeType(option.value);
      });
      this._shapeButtons.set(option.value, button);
      this._toolListEl.append(button);
    }

    this._dropdown.append(title, this._toolListEl);
    document.querySelector(".app-shell")?.append(this._dropdown);
    renderIcons(this._dropdown, { width: 18, height: 18, "stroke-width": 1.8 });
  }

  _selectShapeType(shapeType) {
    this._selectedType = shapeType;
    this.app.setEditorTool("shape");
    this.app.events.emit("shape:style-change", { shapeType });
    this._render();
  }

  _handleOutsidePointer(event) {
    if (!this._open) return;
    const target = event.target;
    if (this._dropdown.contains(target) || this._triggerBtn?.contains(target)) return;
  }

  _positionDropdown() {
    if (!this._triggerBtn) return;
    const shellRect = document.querySelector(".app-shell")?.getBoundingClientRect?.();
    const triggerRect = this._triggerBtn.getBoundingClientRect();
    if (!shellRect) return;
    this._dropdown.style.left = `${triggerRect.right - shellRect.left + 4}px`;
    this._dropdown.style.top = `${triggerRect.top - shellRect.top}px`;
  }

  _render() {
    for (const [type, button] of this._shapeButtons) {
      button.setAttribute("aria-pressed", String(type === this._selectedType));
    }
  }
}
