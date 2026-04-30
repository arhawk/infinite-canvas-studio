import { BasePlugin } from "../../core/baseClasses.js";
import { renderIcons } from "../../lib/icons.js";

const TOOL_ICONS = {
  arrange: "mouse-pointer-2",
  pen: "pen",
  eraser: "eraser",
  shape: "shapes",
};

const VISIBLE_TOOL_IDS = ["arrange", "pen", "eraser", "shape"];
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

    // Logo
    const logo = document.createElement("div");
    logo.className = "left-toolbar__logo";
    logo.innerHTML = `<span class="left-toolbar__logo-text">Mimi</span>`;
    el.appendChild(logo);

    // Tool group (cursor / pen / eraser) — rendered separately in _renderToolButtons
    this._toolGroupEl = document.createElement("div");
    this._toolGroupEl.className = "left-toolbar__group";
    el.appendChild(this._toolGroupEl);

    el.appendChild(this._makeSep());

    // Components group
    const compGroup = document.createElement("div");
    compGroup.className = "left-toolbar__group";
    this.componentsBtn = this._makeBtn("layers", "Components", "components-trigger");
    this.componentsBtn.setAttribute("aria-pressed", "false");
    compGroup.appendChild(this.componentsBtn);
    el.appendChild(compGroup);

    el.appendChild(this._makeSep());

    // Plugins group (calculator + timer + background)
    const pluginsGroup = document.createElement("div");
    pluginsGroup.className = "left-toolbar__group";
    this.calculatorBtn = this._makeBtn("calculator", "Binary Calculator", "calculator-toggle");
    this.timerBtn = this._makeBtn("timer", "Timer / Stopwatch", "timer-toggle");
    this.backgroundBtn = this._makeTextBtn("B", "Background", "background-toggle");
    this.calculatorBtn.setAttribute("aria-pressed", "false");
    this.timerBtn.setAttribute("aria-pressed", "false");
    this.backgroundBtn.setAttribute("aria-pressed", "false");
    pluginsGroup.append(this.calculatorBtn, this.timerBtn, this.backgroundBtn);
    el.appendChild(pluginsGroup);

    el.appendChild(this._makeSep());

    // View group (center + zoom-in + zoom-out + download + upload)
    const viewGroup = document.createElement("div");
    viewGroup.className = "left-toolbar__group";
    this.centerMapBtn = this._makeBtn("crosshair", "Fit all content (Home)", "center-map-btn");
    this.zoomInBtn = this._makeBtn("zoom-in", "Zoom In", "zoom-in-btn");
    this.zoomOutBtn = this._makeBtn("zoom-out", "Zoom Out", "zoom-out-btn");
    this.saveBtn = this._makeBtn("download", "Save document as JSON (Mod+S)", "save-document-action");
    this.loadBtn = this._makeBtn("upload", "Load document from JSON (Mod+O)", "load-document-action");
    viewGroup.append(
      this.centerMapBtn,
      this.zoomInBtn,
      this.zoomOutBtn,
      this.saveBtn,
      this.loadBtn,
    );
    el.appendChild(viewGroup);

    // Flex spacer pushes history group to the bottom
    const spacer = document.createElement("div");
    spacer.className = "left-toolbar__spacer";
    el.appendChild(spacer);

    // History group (undo + redo) at bottom
    const historyGroup = document.createElement("div");
    historyGroup.className = "left-toolbar__group";
    this.undoBtn = this._makeBtn("undo-2", "Undo (Mod+Z)", "undo-action");
    this.redoBtn = this._makeBtn("redo-2", "Redo (Mod+Shift+Z)", "redo-action");
    historyGroup.append(this.undoBtn, this.redoBtn);
    el.appendChild(historyGroup);

    this._el = el;

    // Insert as first child of .app-shell (before the component sidebar)
    const appShell = document.querySelector(".app-shell");
    appShell.prepend(el);

    // Render Lucide icons
    renderIcons(el, { width: 18, height: 18, "stroke-width": 2 });
  }

  _makeBtn(icon, label, testid) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "left-toolbar__btn";
    btn.title = label;
    btn.setAttribute("aria-label", label);
    if (testid) btn.dataset.testid = testid;
    btn.innerHTML = `<i data-lucide="${icon}" aria-hidden="true"></i>`;
    return btn;
  }

  _makeTextBtn(text, label, testid) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "left-toolbar__btn left-toolbar__btn--text";
    btn.title = label;
    btn.setAttribute("aria-label", label);
    if (testid) btn.dataset.testid = testid;
    btn.textContent = text;
    return btn;
  }

  _makeSep() {
    const sep = document.createElement("div");
    sep.className = "left-toolbar__sep";
    return sep;
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
              : "Shapes";

      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "left-toolbar__btn";
      btn.title = label;
      btn.setAttribute("aria-label", label);
      btn.setAttribute("aria-pressed", "false");
      btn.dataset.toolId = toolId;
      btn.dataset.testid = `tool-button-${toolId}`;

      if (icon) {
        btn.innerHTML = `<i data-lucide="${icon}" aria-hidden="true"></i>`;
      } else {
        btn.textContent = label;
      }

      this.listenDom(btn, "click", () => {
        if (toolId === "shape" && this.app.getEditorTool() === "shape") {
          this.app.setEditorTool("arrange");
          return;
        }
        this.app.setEditorTool(toolId);
      });
      this._toolGroupEl.appendChild(btn);
      this._toolBtns.push(btn);
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
