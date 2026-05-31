import { BasePlugin } from "../../core/baseClasses.js";
import { renderIcons } from "../../lib/icons.js";

const TOOL_ICONS = {
  arrange: "mouse-pointer-2",
  components: "layers",
  pen: "pen",
  eraser: "eraser",
  shape: "shapes",
};

const VISIBLE_TOOL_IDS = ["arrange", "pen", "eraser", "shape", "components"];
const BRUSH_TOOL_IDS = ["pen", "pencil", "highlighter"];

export class LeftToolbarPlugin extends BasePlugin {
  static pluginId = "left-toolbar";

  constructor(app, options) {
    super(app, options);
    // Build DOM immediately so button references are available before app.start()
    this._buildDOM();
    this._renderToolButtons();
  }

  onSetup() {
    this._syncState();
    this.listen("tool:change", () => this._syncState());
    this.listen("interaction:change", () => this._syncState());
    this.cleanups.push(() => this._el?.remove());
  }

  _buildDOM() {
    const el = document.createElement("nav");
    el.className = "left-toolbar";
    el.setAttribute("aria-label", "Tools");

    // Main tool pill — tool buttons + style + center-map
    const toolPill = document.createElement("div");
    toolPill.className = "left-toolbar__pill";

    // Tool buttons rendered by _renderToolButtons into this._toolGroupEl
    this._toolGroupEl = document.createElement("div");
    this._toolGroupEl.className = "left-toolbar__group";
    toolPill.appendChild(this._toolGroupEl);

    this.backgroundBtn = this._makeBtn("palette", "Style", "background-toggle");
    this.backgroundBtn.setAttribute("aria-pressed", "false");
    toolPill.appendChild(this.backgroundBtn);

    this.centerMapBtn = this._makeBtn("crosshair", "Fit all content (Home)", "center-map-btn");
    toolPill.appendChild(this.centerMapBtn);

    el.appendChild(toolPill);

    // 3. History pill — undo + redo
    const historyPill = document.createElement("div");
    historyPill.className = "left-toolbar__pill";
    this.undoBtn = this._makeBtn("undo-2", "Undo (Mod+Z)", "undo-action");
    this.redoBtn = this._makeBtn("redo-2", "Redo (Mod+Shift+Z / Mod+Y)", "redo-action");
    historyPill.append(this.undoBtn, this.redoBtn);
    el.appendChild(historyPill);

    this._el = el;

    // Insert as first child of .app-shell (floats over canvas)
    const appShell = document.querySelector(".app-shell");
    appShell.prepend(el);

    // Render Lucide icons
    renderIcons(el, { width: 18, height: 18, "stroke-width": 2 });
  }

  _makeBtn(icon, label, testid) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "left-toolbar__btn";
    btn.dataset.tooltip = label;
    btn.setAttribute("aria-label", label);
    if (testid) btn.dataset.testid = testid;
    btn.innerHTML = `<i data-lucide="${icon}" aria-hidden="true"></i>`;
    return btn;
  }

  _renderToolButtons() {
    this._toolGroupEl.innerHTML = "";
    this._toolBtns = [];

    for (const toolId of VISIBLE_TOOL_IDS) {
      const icon = TOOL_ICONS[toolId];
      const label =
        toolId === "arrange"
          ? "Cursor"
          : toolId === "pen"
            ? "Brush tools"
            : toolId === "eraser"
              ? "Eraser"
              : toolId === "shape"
                ? "Shapes"
                : "Components";

      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "left-toolbar__btn";
      btn.dataset.tooltip = label;
      btn.setAttribute("aria-label", label);
      btn.setAttribute("aria-pressed", "false");
      btn.dataset.toolId = toolId;
      btn.dataset.testid = toolId === "components"
        ? "components-trigger"
        : `tool-button-${toolId}`;

      if (icon) {
        btn.innerHTML = `<i data-lucide="${icon}" aria-hidden="true"></i>`;
      } else {
        btn.textContent = label;
      }

      if (toolId !== "components") {
        this.listenDom(btn, "click", () => {
          if (toolId === "shape" && this.app.getEditorTool() === "shape") {
            this.app.setEditorTool("arrange");
            return;
          }
          this.app.setEditorTool(toolId);
        });
      }
      this._toolGroupEl.appendChild(btn);
      this._toolBtns.push(btn);
      if (toolId === "pen") this.penBtn = btn;
      if (toolId === "eraser") this.eraserBtn = btn;
      if (toolId === "shape") this.shapeBtn = btn;
      if (toolId === "arrange") this.arrangeBtn = btn;
      if (toolId === "components") this.componentsBtn = btn;
    }

    renderIcons(this._toolGroupEl, { width: 18, height: 18, "stroke-width": 2 });
  }

  _syncState() {
    const mode = this.app.getMode();
    const activeToolId = this.app.getEditorTool();
    const isBrushFamily = BRUSH_TOOL_IDS.includes(activeToolId);

    for (const btn of (this._toolBtns ?? [])) {
      const { toolId } = btn.dataset;
      let isActive = false;
      if (toolId === "pen") {
        isActive = isBrushFamily;
      } else if (toolId === "arrange") {
        isActive = activeToolId === "arrange" && mode === "edit";
      } else {
        isActive = activeToolId === toolId;
      }
      btn.setAttribute("aria-pressed", String(isActive));
    }
  }
}
