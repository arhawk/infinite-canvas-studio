import { BasePlugin } from "../core/baseClasses.js";
import {
  BACKGROUND_TYPES,
  cloneBackgroundState,
  normalizeBackgroundState,
} from "../background/state.js";

const BACKGROUND_TYPE_OPTIONS = [
  { id: BACKGROUND_TYPES.BLANK, label: "Blank" },
  { id: BACKGROUND_TYPES.SOLID, label: "Solid" },
  { id: BACKGROUND_TYPES.GRID, label: "Grid" },
  { id: BACKGROUND_TYPES.WARM_PAPER, label: "Warm Paper" },
];

function backgroundsEqual(a, b) {
  return JSON.stringify(normalizeBackgroundState(a)) === JSON.stringify(normalizeBackgroundState(b));
}

export class BackgroundPlugin extends BasePlugin {
  static pluginId = "background";

  onSetup() {
    const { toggleEl } = this.options;
    this.ui = {
      toggleEl,
    };
    this.isPanelOpen = false;
    this.buildPanel();

    this.listenDom(toggleEl, "click", () => {
      this.isPanelOpen = !this.isPanelOpen;
      this.syncPanelPosition();
      this.syncUi();
    });
    this.listenDom(this.typeButtonsEl, "click", (event) => {
      const button = event.target.closest?.("[data-background-type]");
      if (!button) return;
      this.applyBackgroundChange({
        type: button.dataset.backgroundType,
      });
    });
    this.listenDom(this.colorEl, "input", () => {
      this.applyBackgroundChange({
        color: this.colorEl.value,
      });
    });
    this.listenDom(this.opacityEl, "input", () => {
      this.applyBackgroundChange({
        opacity: this.opacityEl.value,
      });
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

    const colorWrap = document.createElement("div");
    colorWrap.className = "toolbar__field background-panel__color-wrap";

    this.colorEl = document.createElement("input");
    this.colorEl.id = "background-color";
    this.colorEl.type = "color";
    this.colorEl.value = "#f7f3ea";
    this.colorEl.dataset.testid = "background-color";
    this.colorEl.setAttribute("aria-label", "Background color");
    this.colorEl.className = "background-panel__color-input";

    colorWrap.append(this.colorEl);
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
    this.panelEl.append(this.typeButtonsEl, colorWrap, opacityWrap);
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

  syncControls(state = this.getBackgroundState()) {
    const nextState = cloneBackgroundState(state);

    for (const button of this.typeButtonsEl?.querySelectorAll?.("[data-background-type]") ?? []) {
      button.setAttribute(
        "aria-pressed",
        String(button.dataset.backgroundType === nextState.type),
      );
    }

    if (this.colorEl) {
      this.colorEl.value = nextState.color;
      this.colorEl.disabled = nextState.type === BACKGROUND_TYPES.BLANK;
      this.colorEl.title = nextState.type === BACKGROUND_TYPES.BLANK
        ? "Blank background uses a clean default surface"
        : "Choose background color";
    }

    if (this.opacityEl && this.opacityValueEl) {
      const opacity = Math.max(0, Math.min(1, Number(nextState.opacity) || 0));
      const opacityPercent = `${Math.round(opacity * 100)}%`;
      this.opacityEl.value = opacity.toFixed(2);
      this.opacityEl.disabled = nextState.type === BACKGROUND_TYPES.BLANK;
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
  }
}
