import { BasePlugin } from "../../core/baseClasses.js";
import { renderIcons } from "../../lib/icons.js";

const BRUSH_TOOL_OPTIONS = [
  { id: "pen", label: "Pen", icon: "pen" },
  { id: "pencil", label: "Pencil", icon: "pencil" },
  { id: "highlighter", label: "Highlighter", icon: "highlighter" },
];
const PANEL_VIEWPORT_MARGIN = 12;
const DROPDOWN_ANCHOR_GAP = 4;
const EDITOR_ANCHOR_GAP = 10;

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function normalizeHexColor(value, fallback = "#000000") {
  if (typeof value !== "string") return fallback;
  const normalized = value.trim().toLowerCase();
  if (/^#[0-9a-f]{6}$/.test(normalized)) return normalized;
  if (/^#[0-9a-f]{3}$/.test(normalized)) {
    return `#${normalized[1]}${normalized[1]}${normalized[2]}${normalized[2]}${normalized[3]}${normalized[3]}`;
  }
  return fallback;
}

function rgbToHex({ r, g, b }) {
  const toChannel = (value) => clamp(Math.round(value), 0, 255).toString(16).padStart(2, "0");
  return `#${toChannel(r)}${toChannel(g)}${toChannel(b)}`;
}

function hexToRgb(hex) {
  const normalized = normalizeHexColor(hex);
  return {
    r: Number.parseInt(normalized.slice(1, 3), 16),
    g: Number.parseInt(normalized.slice(3, 5), 16),
    b: Number.parseInt(normalized.slice(5, 7), 16),
  };
}

function rgbToHsv({ r, g, b }) {
  const red = clamp(r, 0, 255) / 255;
  const green = clamp(g, 0, 255) / 255;
  const blue = clamp(b, 0, 255) / 255;
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const delta = max - min;

  let hue = 0;
  if (delta !== 0) {
    if (max === red) {
      hue = 60 * (((green - blue) / delta) % 6);
    } else if (max === green) {
      hue = 60 * ((blue - red) / delta + 2);
    } else {
      hue = 60 * ((red - green) / delta + 4);
    }
  }

  if (hue < 0) hue += 360;

  return {
    h: hue,
    s: max === 0 ? 0 : delta / max,
    v: max,
  };
}

function hsvToRgb({ h, s, v }) {
  const hue = ((Number.isFinite(h) ? h : 0) % 360 + 360) % 360;
  const saturation = clamp(Number.isFinite(s) ? s : 0, 0, 1);
  const value = clamp(Number.isFinite(v) ? v : 0, 0, 1);
  const chroma = value * saturation;
  const segment = hue / 60;
  const x = chroma * (1 - Math.abs((segment % 2) - 1));
  const match = value - chroma;

  let red = 0;
  let green = 0;
  let blue = 0;

  if (segment >= 0 && segment < 1) {
    red = chroma;
    green = x;
  } else if (segment < 2) {
    red = x;
    green = chroma;
  } else if (segment < 3) {
    green = chroma;
    blue = x;
  } else if (segment < 4) {
    green = x;
    blue = chroma;
  } else if (segment < 5) {
    red = x;
    blue = chroma;
  } else {
    red = chroma;
    blue = x;
  }

  return {
    r: Math.round((red + match) * 255),
    g: Math.round((green + match) * 255),
    b: Math.round((blue + match) * 255),
  };
}

function cloneState(state = {}) {
  return {
    activeToolId: state.activeToolId ?? "pen",
    presetsByTool: Object.fromEntries(
      Object.entries(state.presetsByTool ?? {}).map(([toolId, presets]) => [
        toolId,
        Array.isArray(presets)
          ? presets.map((preset) => ({
              color: normalizeHexColor(preset?.color, "#000000"),
              width: Number.isFinite(preset?.width) ? preset.width : 4,
            }))
          : [],
      ]),
    ),
    activePresetIndexByTool: { ...(state.activePresetIndexByTool ?? {}) },
  };
}

export class PenDropdownPlugin extends BasePlugin {
  static pluginId = "pen-dropdown";

  onSetup() {
    this.state = cloneState();
    this._open = false;
    this._editorOpen = false;
    this._editorPresetIndex = 0;
    this._anchorEl = null;
    this._callbacks = {
      onBrushToolSelect: null,
      onPresetActivate: null,
      onPresetWidthChange: null,
      onPresetColorChange: null,
    };
    this._isDraggingSurface = false;
    this._buildDropdown();

    this.listenDom(window, "resize", () => {
      if (!this._open) return;
      this._positionDropdown();
      this._positionEditor();
    });
    this.listenDom(document, "mousedown", (event) => this._handleOutsidePointer(event), true);
    this.listenDom(document, "keydown", (event) => {
      if (event.key === "Escape" && this._open) {
        this.close();
      }
    });
    this.listenDom(document, "pointermove", (event) => {
      if (!this._isDraggingSurface) return;
      this._updateColorFromSurfaceEvent(event);
    });
    this.listenDom(document, "pointerup", () => {
      this._isDraggingSurface = false;
    });

    this.cleanups.push(() => {
      this._dropdown?.remove();
      this._editor?.remove();
    });
  }

  wireTrigger(triggerBtn) {
    if (!triggerBtn) return;
    this._triggerBtn = triggerBtn;
    this.listenDom(triggerBtn, "click", (event) => {
      this.clearAnchorElement();
      event.stopPropagation();
      if (this.app.getMode() !== "edit" || !this._isBrushTool(this.app.getEditorTool())) {
        this.close();
        return;
      }
      this.toggle();
    });
  }

  setCallbacks(callbacks = {}) {
    this._callbacks = {
      ...this._callbacks,
      ...callbacks,
    };
  }

  setState(state = {}) {
    this.state = cloneState(state);
    this._render();
  }

  setAnchorElement(anchorEl = null) {
    this._anchorEl = anchorEl ?? null;
    this.reposition();
  }

  clearAnchorElement() {
    this.setAnchorElement(null);
  }

  hasCustomAnchor() {
    return Boolean(this._anchorEl);
  }

  isOpen() {
    return this._open;
  }

  open() {
    if (!this._getAnchorElement()) return;
    this._open = true;
    this._dropdown.hidden = false;
    this._positionDropdown();
    this._syncAnchorPressedState(true);
    this._render();
  }

  close() {
    this._open = false;
    this._dropdown.hidden = true;
    this._closeEditor();
    this._syncAnchorPressedState(false);
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
    this._dropdown.className = "pen-dropdown";
    this._dropdown.setAttribute("role", "dialog");
    this._dropdown.setAttribute("aria-label", "Brushes");
    this._dropdown.dataset.testid = "pen-dropdown";
    this._dropdown.hidden = true;

    const title = document.createElement("div");
    title.className = "pen-dropdown__title";
    title.textContent = "BRUSHES";

    this._toolListEl = document.createElement("div");
    this._toolListEl.className = "pen-dropdown__tools";
    this._toolButtons = new Map();

    for (const option of BRUSH_TOOL_OPTIONS) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "pen-dropdown__tool-button";
      button.dataset.brushToolId = option.id;
      button.dataset.testid = `brush-type-${option.id}`;
      button.title = option.label;
      button.setAttribute("aria-label", option.label);
      button.innerHTML = `<i data-lucide="${option.icon}" aria-hidden="true"></i>`;
      this.listenDom(button, "click", () => {
        this._callbacks.onBrushToolSelect?.(option.id);
      });
      this._toolButtons.set(option.id, button);
      this._toolListEl.append(button);
    }

    const divider = document.createElement("div");
    divider.className = "pen-dropdown__divider";

    this._presetListEl = document.createElement("div");
    this._presetListEl.className = "pen-dropdown__presets";
    this._presetButtons = [];

    for (let index = 0; index < 3; index += 1) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "pen-dropdown__preset";
      button.dataset.presetIndex = String(index);
      button.dataset.testid = `pen-preset-${index}`;
      button.setAttribute("aria-label", `Preset ${index + 1}`);
      this.listenDom(button, "click", () => {
        this._editorPresetIndex = index;
        this._editorOpen = true;
        this._callbacks.onPresetActivate?.(this.state.activeToolId, index);
        this._render();
      });
      this._presetButtons.push(button);
      this._presetListEl.append(button);
    }

    this._dropdown.append(title, this._toolListEl, divider, this._presetListEl);

    this._editor = document.createElement("div");
    this._editor.className = "pen-preset-editor";
    this._editor.setAttribute("role", "dialog");
    this._editor.setAttribute("aria-label", "Brush preset editor");
    this._editor.dataset.testid = "pen-preset-editor";
    this._editor.hidden = true;

    const sliderRow = document.createElement("label");
    sliderRow.className = "pen-preset-editor__slider";
    sliderRow.setAttribute("for", "pen-preset-width");

    this._widthInputEl = document.createElement("input");
    this._widthInputEl.id = "pen-preset-width";
    this._widthInputEl.type = "range";
    this._widthInputEl.min = "1";
    this._widthInputEl.max = "24";
    this._widthInputEl.value = "4";
    this._widthInputEl.dataset.testid = "pen-preset-width";

    this._widthValueEl = document.createElement("output");
    this._widthValueEl.className = "pen-preset-editor__width-value";
    this._widthValueEl.dataset.testid = "pen-preset-width-value";
    this._widthValueEl.textContent = "4";

    sliderRow.append(this._widthInputEl, this._widthValueEl);

    this._surfaceEl = document.createElement("div");
    this._surfaceEl.className = "pen-preset-editor__surface";
    this._surfaceEl.dataset.testid = "pen-color-surface";

    this._surfaceThumbEl = document.createElement("div");
    this._surfaceThumbEl.className = "pen-preset-editor__surface-thumb";
    this._surfaceEl.append(this._surfaceThumbEl);

    this._hueInputEl = document.createElement("input");
    this._hueInputEl.type = "range";
    this._hueInputEl.min = "0";
    this._hueInputEl.max = "360";
    this._hueInputEl.step = "1";
    this._hueInputEl.className = "pen-preset-editor__hue";
    this._hueInputEl.dataset.testid = "pen-hue";

    const rgbGrid = document.createElement("div");
    rgbGrid.className = "pen-preset-editor__rgb-grid";

    this._rgbInputs = {};
    for (const channel of ["r", "g", "b"]) {
      const field = document.createElement("label");
      field.className = "pen-preset-editor__rgb-field";

      const input = document.createElement("input");
      input.type = "number";
      input.min = "0";
      input.max = "255";
      input.step = "1";
      input.dataset.channel = channel;
      input.dataset.testid = `pen-${channel}-input`;

      const caption = document.createElement("span");
      caption.textContent = channel.toUpperCase();

      field.append(input, caption);
      rgbGrid.append(field);
      this._rgbInputs[channel] = input;
    }

    this._editor.append(sliderRow, this._surfaceEl, this._hueInputEl, rgbGrid);

    document.querySelector(".app-shell")?.append(this._dropdown, this._editor);

    renderIcons(this._dropdown, { width: 18, height: 18, "stroke-width": 1.8 });

    this.listenDom(this._widthInputEl, "input", () => {
      const width = Number(this._widthInputEl.value);
      this._widthValueEl.textContent = String(width);
      this._callbacks.onPresetWidthChange?.(this.state.activeToolId, this._editorPresetIndex, width);
    });

    this.listenDom(this._hueInputEl, "input", () => {
      const nextColor = hsvToRgb({
        h: Number(this._hueInputEl.value),
        s: this._editorColorHsv?.s ?? 1,
        v: this._editorColorHsv?.v ?? 1,
      });
      this._applyEditorColor(rgbToHex(nextColor));
    });

    this.listenDom(this._surfaceEl, "pointerdown", (event) => {
      this._isDraggingSurface = true;
      this._updateColorFromSurfaceEvent(event);
    });

    for (const input of Object.values(this._rgbInputs)) {
      this.listenDom(input, "input", () => {
        const nextColor = rgbToHex({
          r: Number(this._rgbInputs.r.value),
          g: Number(this._rgbInputs.g.value),
          b: Number(this._rgbInputs.b.value),
        });
        this._applyEditorColor(nextColor);
      });
    }
  }

  _handleOutsidePointer(event) {
    if (!this._open) return;
    const target = event.target;
    if (
      this._dropdown.contains(target) ||
      this._editor.contains(target) ||
      this._getAnchorElement()?.contains(target)
    ) {
      return;
    }
    this.close();
  }

  _isBrushTool(toolId) {
    return BRUSH_TOOL_OPTIONS.some((option) => option.id === toolId);
  }

  _getActivePresets() {
    return this.state.presetsByTool?.[this.state.activeToolId] ?? [];
  }

  _getActivePreset() {
    return this._getActivePresets()[this._editorPresetIndex] ?? null;
  }

  _getAnchorElement() {
    return this._anchorEl ?? this._triggerBtn ?? null;
  }

  _syncAnchorPressedState(pressed) {
    const value = String(pressed);
    this._triggerBtn?.setAttribute("aria-pressed", value);
    if (this._anchorEl && this._anchorEl !== this._triggerBtn) {
      this._anchorEl.setAttribute("aria-pressed", value);
    }
  }

  reposition() {
    if (!this._open) return;
    this._positionDropdown();
    this._positionEditor();
  }

  _getShellRect() {
    return document.querySelector(".app-shell")?.getBoundingClientRect?.() ?? null;
  }

  _resolveHorizontalPosition(anchorRect, panelWidth, {
    gap = DROPDOWN_ANCHOR_GAP,
    prefer = "right",
  } = {}) {
    const shellRect = this._getShellRect();
    if (!shellRect) return null;

    const minLeft = PANEL_VIEWPORT_MARGIN;
    const maxLeft = Math.max(
      minLeft,
      shellRect.width - PANEL_VIEWPORT_MARGIN - panelWidth,
    );
    const fitsRight = anchorRect.right - shellRect.left + gap + panelWidth <= shellRect.width - PANEL_VIEWPORT_MARGIN;
    const fitsLeft = anchorRect.left - shellRect.left - gap - panelWidth >= PANEL_VIEWPORT_MARGIN;

    let left;
    if ((prefer === "right" && fitsRight) || !fitsLeft) {
      left = anchorRect.right - shellRect.left + gap;
    } else {
      left = anchorRect.left - shellRect.left - panelWidth - gap;
    }

    return clamp(left, minLeft, maxLeft);
  }

  _resolveVerticalPosition(anchorRect, panelHeight, { align = "top" } = {}) {
    const shellRect = this._getShellRect();
    if (!shellRect) return null;

    const minTop = PANEL_VIEWPORT_MARGIN;
    const maxTop = Math.max(
      minTop,
      shellRect.height - PANEL_VIEWPORT_MARGIN - panelHeight,
    );
    const top = align === "center"
      ? anchorRect.top - shellRect.top + anchorRect.height / 2 - panelHeight / 2
      : anchorRect.top - shellRect.top;

    return clamp(top, minTop, maxTop);
  }

  _positionDropdown() {
    const anchorEl = this._getAnchorElement();
    if (!anchorEl) return;
    const triggerRect = anchorEl.getBoundingClientRect();
    const panelWidth = this._dropdown.offsetWidth || this._dropdown.getBoundingClientRect().width || 0;
    const panelHeight = this._dropdown.offsetHeight || this._dropdown.getBoundingClientRect().height || 0;
    const left = this._resolveHorizontalPosition(triggerRect, panelWidth, {
      gap: DROPDOWN_ANCHOR_GAP,
      prefer: "right",
    });
    const top = this._resolveVerticalPosition(triggerRect, panelHeight, { align: "top" });
    if (left == null || top == null) return;
    this._dropdown.style.left = `${Math.round(left)}px`;
    this._dropdown.style.top = `${Math.round(top)}px`;
  }

  _positionEditor() {
    if (!this._editorOpen) return;
    const anchor = this._presetButtons[this._editorPresetIndex];
    const anchorRect = anchor?.getBoundingClientRect?.();
    if (!anchorRect) return;
    const panelWidth = this._editor.offsetWidth || this._editor.getBoundingClientRect().width || 0;
    const panelHeight = this._editor.offsetHeight || this._editor.getBoundingClientRect().height || 0;
    const left = this._resolveHorizontalPosition(anchorRect, panelWidth, {
      gap: EDITOR_ANCHOR_GAP,
      prefer: "right",
    });
    const top = this._resolveVerticalPosition(anchorRect, panelHeight, { align: "top" });
    if (left == null || top == null) return;
    this._editor.style.left = `${Math.round(left)}px`;
    this._editor.style.top = `${Math.round(top)}px`;
  }

  _closeEditor() {
    this._editorOpen = false;
    this._editor.hidden = true;
  }

  _syncEditorFromPreset(preset) {
    if (!preset) {
      this._closeEditor();
      return;
    }

    const width = Number.isFinite(preset.width) ? preset.width : 4;
    const color = normalizeHexColor(preset.color, "#000000");
    this._widthInputEl.value = String(width);
    this._widthValueEl.textContent = String(width);

    const rgb = hexToRgb(color);
    this._editorColorHsv = rgbToHsv(rgb);

    this._hueInputEl.value = String(Math.round(this._editorColorHsv.h));
    this._rgbInputs.r.value = String(rgb.r);
    this._rgbInputs.g.value = String(rgb.g);
    this._rgbInputs.b.value = String(rgb.b);
    this._surfaceEl.style.background = [
      "linear-gradient(to top, #000, transparent)",
      `linear-gradient(to right, #fff, hsl(${Math.round(this._editorColorHsv.h)} 100% 50%))`,
    ].join(",");
    this._surfaceThumbEl.style.left = `${this._editorColorHsv.s * 100}%`;
    this._surfaceThumbEl.style.top = `${(1 - this._editorColorHsv.v) * 100}%`;
  }

  _updateColorFromSurfaceEvent(event) {
    const rect = this._surfaceEl.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const saturation = clamp((event.clientX - rect.left) / rect.width, 0, 1);
    const value = 1 - clamp((event.clientY - rect.top) / rect.height, 0, 1);
    const rgb = hsvToRgb({
      h: this._editorColorHsv?.h ?? Number(this._hueInputEl.value),
      s: saturation,
      v: value,
    });
    this._applyEditorColor(rgbToHex(rgb));
  }

  _applyEditorColor(hex) {
    const normalized = normalizeHexColor(hex, "#000000");
    const rgb = hexToRgb(normalized);
    this._editorColorHsv = rgbToHsv(rgb);
    this._hueInputEl.value = String(Math.round(this._editorColorHsv.h));
    this._rgbInputs.r.value = String(rgb.r);
    this._rgbInputs.g.value = String(rgb.g);
    this._rgbInputs.b.value = String(rgb.b);
    this._surfaceEl.style.background = [
      "linear-gradient(to top, #000, transparent)",
      `linear-gradient(to right, #fff, hsl(${Math.round(this._editorColorHsv.h)} 100% 50%))`,
    ].join(",");
    this._surfaceThumbEl.style.left = `${this._editorColorHsv.s * 100}%`;
    this._surfaceThumbEl.style.top = `${(1 - this._editorColorHsv.v) * 100}%`;
    this._callbacks.onPresetColorChange?.(this.state.activeToolId, this._editorPresetIndex, normalized);
  }

  _render() {
    for (const option of BRUSH_TOOL_OPTIONS) {
      const button = this._toolButtons.get(option.id);
      if (!button) continue;
      button.setAttribute("aria-pressed", String(option.id === this.state.activeToolId));
    }

    const activePresets = this._getActivePresets();
    const activePresetIndex = this.state.activePresetIndexByTool?.[this.state.activeToolId] ?? 0;

    this._presetButtons.forEach((button, index) => {
      const preset = activePresets[index];
      button.style.backgroundColor = preset?.color ?? "transparent";
      button.style.opacity = preset ? "1" : "0.45";
      button.setAttribute("aria-pressed", String(index === activePresetIndex));
      button.title = preset ? `${preset.color} • ${preset.width}` : `Preset ${index + 1}`;
    });

    if (!this._open) return;

    if (!activePresets.length || !this._editorOpen) {
      this._closeEditor();
      return;
    }

    const currentPreset = this._getActivePreset();
    if (!currentPreset) {
      this._closeEditor();
      return;
    }

    this._editor.hidden = false;
    this._syncEditorFromPreset(currentPreset);
    this._positionEditor();
  }
}
