import { BasePlugin } from "../core/baseClasses.js";
import {
  BACKGROUND_TYPES,
  cloneBackgroundState,
  normalizeBackgroundState,
} from "../background/state.js";
import { DEFAULT_COLOR_SWATCHES } from "../lib/colorToolbar.js";

const STYLE_OPTIONS = [
  { id: "default", label: "Default" },
  { id: "colorful", label: "Colorful" },
];

const BACKGROUND_TYPE_OPTIONS = [
  { id: BACKGROUND_TYPES.BLANK, label: "Blank" },
  { id: BACKGROUND_TYPES.GRID, label: "Grid" },
  { id: BACKGROUND_TYPES.DOT, label: "Dot" },
];

const PRESET_COLORS = DEFAULT_COLOR_SWATCHES.filter((c) => c !== "transparent");

function backgroundsEqual(a, b) {
  return JSON.stringify(normalizeBackgroundState(a)) === JSON.stringify(normalizeBackgroundState(b));
}

export class BackgroundPlugin extends BasePlugin {
  static pluginId = "background";

  onSetup() {
    const { toggleEl } = this.options;
    this.ui = { toggleEl };
    this.isPanelOpen = false;
    this.currentTheme = "default";
    this.buildPanel();

    this.listenDom(toggleEl, "click", () => {
      this.isPanelOpen = !this.isPanelOpen;
      this.syncPanelPosition();
      this.syncUi();
    });

    this.listenDom(this.stylePillsEl, "click", (event) => {
      const button = event.target.closest("[data-style-id]");
      if (!button) return;
      this.currentTheme = button.dataset.styleId;
      document.body.classList.toggle("theme-colorful", this.currentTheme === "colorful");
      const baseColor = getComputedStyle(document.body).getPropertyValue("--canvas-base-bg").trim();
      if (baseColor) this.applyBackgroundChange({ color: baseColor });
      this.syncStylePills();
    });

    this.listenDom(this.typeButtonsEl, "click", (event) => {
      const button = event.target.closest("[data-background-type]");
      if (!button) return;
      this.applyBackgroundChange({ type: button.dataset.backgroundType });
    });

    this.listenDom(this.swatchesEl, "click", (event) => {
      const button = event.target.closest("[data-color]");
      if (!button || button.disabled) return;
      this.applyBackgroundChange({ color: button.dataset.color });
    });

    this.listenDom(this.customTriggerBtn, "click", () => {
      this.customColorInput.click();
    });

    this.listenDom(this.customColorInput, "input", () => {
      this.applyBackgroundChange({ color: this.customColorInput.value });
    });

    this.listenDom(this.opacityEl, "input", () => {
      this.applyBackgroundChange({ opacity: this.opacityEl.value });
    });

    this.listenDom(document, "mousedown", (event) => {
      if (!this.isPanelOpen) return;
      const target = event.target;
      if (this.panelEl?.contains(target) || this.ui.toggleEl?.contains(target)) return;
      this.isPanelOpen = false;
      this.syncUi();
    });

    this.listen("background:change", ({ after } = {}) => {
      this.syncControls(after);
      this.syncUi();
    });
    this.listen("document:load:start", () => {
      this.isPanelOpen = false;
      this.syncUi();
    });
    this.listenDom(window, "resize", () => this.syncPanelPosition());

    this.syncControls(this.app.getBackgroundState?.());
    this.syncPanelPosition();
    this.syncUi();
    this.cleanups.push(() => this.panelEl?.remove());
  }

  buildPanel() {
    const appShell = document.querySelector(".app-shell");
    this.panelEl = document.createElement("div");
    this.panelEl.id = "background-controls";
    this.panelEl.className = "toolbar__floating-panel toolbar__tool-panel background-panel";
    this.panelEl.hidden = true;
    this.panelEl.dataset.testid = "background-controls";

    // ── Style pills ──
    const styleSection = document.createElement("div");
    styleSection.className = "background-panel__section";

    this.stylePillsEl = document.createElement("div");
    this.stylePillsEl.className = "background-panel__style-row";

    for (const option of STYLE_OPTIONS) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "background-panel__style-pill";
      button.dataset.styleId = option.id;
      button.dataset.testid = `style-pill-${option.id}`;
      button.textContent = option.label;
      button.setAttribute("aria-pressed", "false");
      this.stylePillsEl.append(button);
    }
    styleSection.append(this.stylePillsEl);

    // ── Background type pills ──
    const bgSection = document.createElement("div");
    bgSection.className = "background-panel__section";

    this.typeButtonsEl = document.createElement("div");
    this.typeButtonsEl.className = "toolbar__brush-types background-panel__types";

    for (const option of BACKGROUND_TYPE_OPTIONS) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "toolbar__brush-type-button background-panel__type-button";
      button.dataset.backgroundType = option.id;
      button.dataset.testid = `background-type-${option.id}`;
      button.textContent = option.label;
      button.setAttribute("aria-pressed", "false");
      this.typeButtonsEl.append(button);
    }
    bgSection.append(this.typeButtonsEl);

    // ── Color swatches ──
    const colorSection = document.createElement("div");
    colorSection.className = "background-panel__section";

    this.swatchesEl = document.createElement("div");
    this.swatchesEl.className = "background-panel__swatches";

    for (const color of PRESET_COLORS) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "toolbar__button-color-swatch";
      button.dataset.color = color;
      button.dataset.testid = `bg-color-swatch-${color.replace("#", "")}`;
      button.title = color;
      button.setAttribute("aria-label", `Background color ${color}`);
      button.setAttribute("aria-pressed", "false");
      button.style.setProperty("--button-swatch-color", color);
      this.swatchesEl.append(button);
    }

    this.customColorWrap = document.createElement("div");
    this.customColorWrap.className = "toolbar__button-custom-color";

    this.customTriggerBtn = document.createElement("button");
    this.customTriggerBtn.type = "button";
    this.customTriggerBtn.className = "toolbar__button-custom-trigger";
    this.customTriggerBtn.title = "Custom color";
    this.customTriggerBtn.setAttribute("aria-label", "Custom background color");
    this.customTriggerBtn.innerHTML = '<span aria-hidden="true">+</span>';

    this.customColorInput = document.createElement("input");
    this.customColorInput.id = "background-color";
    this.customColorInput.type = "color";
    this.customColorInput.value = "#f7f3ea";
    this.customColorInput.setAttribute("aria-label", "Custom background color");
    this.customColorInput.dataset.testid = "background-color";

    this.customColorWrap.append(this.customTriggerBtn, this.customColorInput);
    this.swatchesEl.append(this.customColorWrap);
    colorSection.append(this.swatchesEl);

    // ── Opacity ──
    const opacitySection = document.createElement("div");
    opacitySection.className = "background-panel__section";

    const opacityWrap = document.createElement("div");
    opacityWrap.className = "toolbar__field background-panel__opacity-wrap";

    this.opacityEl = document.createElement("input");
    this.opacityEl.id = "background-opacity";
    this.opacityEl.type = "range";
    this.opacityEl.min = "0";
    this.opacityEl.max = "1";
    this.opacityEl.step = "0.01";
    this.opacityEl.value = "1";
    this.opacityEl.dataset.testid = "background-opacity";
    this.opacityEl.setAttribute("aria-label", "Background opacity");
    this.opacityEl.className = "background-panel__opacity-input";

    this.opacityValueEl = document.createElement("output");
    this.opacityValueEl.id = "background-opacity-value";
    this.opacityValueEl.dataset.testid = "background-opacity-value";
    this.opacityValueEl.className = "background-panel__opacity-value";
    this.opacityValueEl.setAttribute("for", "background-opacity");
    this.opacityValueEl.textContent = "100%";

    opacityWrap.append(this.opacityEl, this.opacityValueEl);
    opacitySection.append(opacityWrap);

    this.panelEl.append(styleSection, bgSection, colorSection, opacitySection);
    appShell?.append(this.panelEl);
  }

  getBackgroundState() {
    return this.app.getBackgroundState?.();
  }

  applyBackgroundChange(partialState = {}) {
    const before = this.getBackgroundState();
    const after = normalizeBackgroundState({
      ...before,
      ...partialState,
    });
    if (backgroundsEqual(before, after)) return after;
    return this.app.setBackgroundState(after);
  }

  syncStylePills() {
    for (const button of this.stylePillsEl?.querySelectorAll("[data-style-id]") ?? []) {
      button.setAttribute("aria-pressed", String(button.dataset.styleId === this.currentTheme));
    }
  }

  syncControls(state = this.getBackgroundState()) {
    const nextState = cloneBackgroundState(state);

    for (const button of this.typeButtonsEl?.querySelectorAll("[data-background-type]") ?? []) {
      button.setAttribute("aria-pressed", String(button.dataset.backgroundType === nextState.type));
    }

    const isBlank = nextState.type === BACKGROUND_TYPES.BLANK;

    for (const button of this.swatchesEl?.querySelectorAll("[data-color]") ?? []) {
      button.disabled = isBlank;
      button.setAttribute(
        "aria-pressed",
        String(!isBlank && button.dataset.color === nextState.color),
      );
    }

    if (this.customTriggerBtn) this.customTriggerBtn.disabled = isBlank;
    if (this.customColorInput) {
      this.customColorInput.value = nextState.color;
      this.customColorInput.disabled = isBlank;
    }

    if (this.opacityEl && this.opacityValueEl) {
      const opacity = Math.max(0, Math.min(1, Number(nextState.opacity) || 0));
      const opacityPercent = `${Math.round(opacity * 100)}%`;
      if (document.activeElement !== this.opacityEl) {
        this.opacityEl.value = opacity.toFixed(2);
      }
      this.opacityEl.disabled = isBlank;
      this.opacityEl.title = opacityPercent;
      this.opacityValueEl.value = opacityPercent;
      this.opacityValueEl.textContent = opacityPercent;
      this.opacityValueEl.title = opacityPercent;
    }
  }

  syncPanelPosition() {
    if (!this.panelEl || !this.ui.toggleEl) return;
    const appShellRect = document.querySelector(".app-shell")?.getBoundingClientRect?.();
    const buttonRect = this.ui.toggleEl.getBoundingClientRect();
    if (!appShellRect || !buttonRect) return;
    const left = buttonRect.right - appShellRect.left + 12;
    const top = buttonRect.top - appShellRect.top - 4;
    this.panelEl.style.left = `${left}px`;
    this.panelEl.style.top = `${Math.max(8, top)}px`;
  }

  syncUi() {
    const { toggleEl } = this.ui;
    if (toggleEl) {
      toggleEl.setAttribute("aria-pressed", String(this.isPanelOpen));
    }
    if (this.panelEl) {
      this.panelEl.hidden = !this.isPanelOpen;
    }
    this.syncStylePills();
  }
}
