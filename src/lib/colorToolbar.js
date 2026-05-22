import { renderIcons as defaultRenderIcons } from "./icons.js";

export const DEFAULT_COLOR_SWATCHES = [
  "transparent",
  "#ffffff",
  "#fff1b8",
  "#fed7aa",
  "#fecaca",
  "#bbf7d0",
  "#bfdbfe",
  "#ddd6fe",
  "#1d1b16",
];

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

export function normalizeHexColor(value, fallback = "#000000") {
  const text = typeof value === "string" ? value.trim() : "";
  const shortMatch = text.match(/^#([0-9a-f]{3})$/i);
  if (shortMatch) {
    return `#${shortMatch[1].split("").map((char) => `${char}${char}`).join("")}`.toLowerCase();
  }

  if (/^#[0-9a-f]{6}$/i.test(text)) {
    return text.toLowerCase();
  }

  return fallback;
}

function parseHexColorInput(value) {
  const text = String(value ?? "").trim();
  const withHash = text.startsWith("#") ? text : `#${text}`;
  const shortMatch = withHash.match(/^#([0-9a-f]{3})$/i);
  if (shortMatch) {
    return `#${shortMatch[1].split("").map((char) => `${char}${char}`).join("")}`.toLowerCase();
  }
  if (/^#[0-9a-f]{6}$/i.test(withHash)) {
    return withHash.toLowerCase();
  }
  return null;
}

function hexToRgb(value) {
  const hex = normalizeHexColor(value).slice(1);
  return {
    r: Number.parseInt(hex.slice(0, 2), 16),
    g: Number.parseInt(hex.slice(2, 4), 16),
    b: Number.parseInt(hex.slice(4, 6), 16),
  };
}

function rgbToHex({ r, g, b }) {
  const toHex = (channel) => {
    const numeric = Number(channel);
    const safe = Number.isFinite(numeric) ? clamp(numeric, 0, 255) : 0;
    return Math.round(safe).toString(16).padStart(2, "0");
  };
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function rgbToHsv({ r, g, b }) {
  const red = clamp(Number(r), 0, 255) / 255;
  const green = clamp(Number(g), 0, 255) / 255;
  const blue = clamp(Number(b), 0, 255) / 255;
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const delta = max - min;
  let h = 0;

  if (delta !== 0) {
    if (max === red) {
      h = 60 * (((green - blue) / delta) % 6);
    } else if (max === green) {
      h = 60 * ((blue - red) / delta + 2);
    } else {
      h = 60 * ((red - green) / delta + 4);
    }
  }

  if (h < 0) h += 360;

  return {
    h,
    s: max === 0 ? 0 : delta / max,
    v: max,
  };
}

function rgbToHsl({ r, g, b }) {
  const red = clamp(Number(r), 0, 255) / 255;
  const green = clamp(Number(g), 0, 255) / 255;
  const blue = clamp(Number(b), 0, 255) / 255;
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const delta = max - min;
  const lightness = (max + min) / 2;
  let hue = 0;
  let saturation = 0;

  if (delta !== 0) {
    saturation = delta / (1 - Math.abs(2 * lightness - 1));
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
    h: Math.round(hue),
    s: Math.round(saturation * 100),
    l: Math.round(lightness * 100),
  };
}

function hslToRgb({ h, s, l }) {
  const hue = ((Number(h) % 360) + 360) % 360;
  const saturation = clamp(Number(s), 0, 100) / 100;
  const lightness = clamp(Number(l), 0, 100) / 100;
  const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation;
  const x = chroma * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = lightness - chroma / 2;
  let red = 0;
  let green = 0;
  let blue = 0;

  if (hue < 60) {
    red = chroma;
    green = x;
  } else if (hue < 120) {
    red = x;
    green = chroma;
  } else if (hue < 180) {
    green = chroma;
    blue = x;
  } else if (hue < 240) {
    green = x;
    blue = chroma;
  } else if (hue < 300) {
    red = x;
    blue = chroma;
  } else {
    red = chroma;
    blue = x;
  }

  return {
    r: (red + m) * 255,
    g: (green + m) * 255,
    b: (blue + m) * 255,
  };
}

function hsvToRgb({ h, s, v }) {
  const hue = ((Number(h) % 360) + 360) % 360;
  const saturation = clamp(Number(s), 0, 1);
  const value = clamp(Number(v), 0, 1);
  const chroma = value * saturation;
  const x = chroma * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = value - chroma;
  let red = 0;
  let green = 0;
  let blue = 0;

  if (hue < 60) {
    red = chroma;
    green = x;
  } else if (hue < 120) {
    red = x;
    green = chroma;
  } else if (hue < 180) {
    green = chroma;
    blue = x;
  } else if (hue < 240) {
    green = x;
    blue = chroma;
  } else if (hue < 300) {
    red = x;
    blue = chroma;
  } else {
    red = chroma;
    blue = x;
  }

  return {
    r: (red + m) * 255,
    g: (green + m) * 255,
    b: (blue + m) * 255,
  };
}

function getColorFieldConfig(mode, color) {
  const rgb = hexToRgb(color);
  if (mode === "hex") {
    return [
      {
        id: "hex",
        label: "HEX",
        type: "text",
        value: color.toUpperCase(),
      },
    ];
  }

  if (mode === "hsl") {
    const hsl = rgbToHsl(rgb);
    return [
      { id: "h", label: "H", type: "number", min: 0, max: 359, value: hsl.h },
      { id: "s", label: "S", type: "number", min: 0, max: 100, value: hsl.s },
      { id: "l", label: "L", type: "number", min: 0, max: 100, value: hsl.l },
    ];
  }

  return [
    { id: "r", label: "R", type: "number", min: 0, max: 255, value: rgb.r },
    { id: "g", label: "G", type: "number", min: 0, max: 255, value: rgb.g },
    { id: "b", label: "B", type: "number", min: 0, max: 255, value: rgb.b },
  ];
}

export class ColorToolbarController {
  constructor({
    targets = {},
    listenDom = null,
    renderIcons = defaultRenderIcons,
    maxCustomColors = 8,
  } = {}) {
    this.targets = targets;
    this.listenDom = listenDom ?? ((target, event, handler, options) => {
      target.addEventListener(event, handler, options);
      return () => target.removeEventListener(event, handler, options);
    });
    this.renderIcons = renderIcons;
    this.maxCustomColors = maxCustomColors;
    this.customColors = {};
    this.pickers = new Map();
    this.activeTarget = null;

    Object.keys(targets).forEach((target) => {
      this.customColors[target] = [];
    });
  }

  setup() {
    for (const target of Object.keys(this.targets)) {
      this.renderSwatches(target);
      this.setupPicker(target);
    }
  }

  sync() {
    for (const target of this.pickers.keys()) {
      this.syncPicker(target);
    }
  }

  closeActive() {
    if (this.activeTarget) {
      this.setPickerOpen(this.activeTarget, false);
    }
  }

  containsActiveTarget(eventTarget) {
    const state = this.pickers.get(this.activeTarget);
    return Boolean(
      state &&
      (state.field.contains(eventTarget) || state.picker.contains(eventTarget)),
    );
  }

  getConfig(target) {
    return this.targets[target] ?? null;
  }

  getInput(target) {
    return this.getConfig(target)?.input ?? null;
  }

  getBaseSwatches(target) {
    const config = this.getConfig(target);
    if (!config) return [];
    if (typeof config.baseColors === "function") {
      return config.baseColors(target);
    }
    return config.baseColors ?? DEFAULT_COLOR_SWATCHES;
  }

  getSwatchContainer(target) {
    return this.getConfig(target)?.swatchesEl ?? null;
  }

  renderSwatches(target) {
    const container = this.getSwatchContainer(target);
    if (!container) return;

    const customColorEl =
      container.querySelector(".toolbar__button-custom-color") ??
      Array.from(container.parentElement?.children ?? [])
        .find((child) => child.classList?.contains?.("toolbar__button-custom-color")) ??
      null;
    customColorEl?.remove();
    container.innerHTML = "";

    const baseColors = this.getBaseSwatches(target);
    const customColors = (this.customColors[target] ?? [])
      .filter((color) => !baseColors.includes(color));

    for (const color of [...baseColors, ...customColors]) {
      const button = document.createElement("button");
      const isTransparent = color === "transparent";
      button.type = "button";
      button.className = [
        "toolbar__button-color-swatch",
        isTransparent ? "toolbar__button-color-swatch--transparent" : "",
      ].filter(Boolean).join(" ");
      button.dataset.color = color;
      button.title = isTransparent ? "Transparent" : color;
      button.setAttribute("aria-label", isTransparent ? "Transparent" : `Color ${color}`);
      if (!isTransparent) {
        button.style.setProperty("--button-swatch-color", color);
      }

      this.listenDom(button, "click", () => this.applySwatch(target, color));
      container.append(button);
    }

    if (customColorEl) {
      container.append(customColorEl);
    }
  }

  applySwatch(target, color) {
    const config = this.getConfig(target);
    const input = config?.input;
    if (!config || !input) return;

    if (config.onSwatch) {
      config.onSwatch(color, { input, controller: this, target });
      return;
    }

    if (typeof color !== "string" || color === "transparent") return;
    input.value = color;
    config.onChange?.(color, { input, controller: this, target });
  }

  recordCustomColor(target, color) {
    if (!this.customColors[target]) return;

    const normalized = normalizeHexColor(color, null);
    if (!normalized || normalized === "transparent") return;

    const baseColors = this.getBaseSwatches(target);
    if (baseColors.includes(normalized)) return;

    const withoutDuplicate = this.customColors[target].filter((entry) => entry !== normalized);
    withoutDuplicate.push(normalized);
    this.customColors[target] = withoutDuplicate.slice(-this.maxCustomColors);
    this.renderSwatches(target);
  }

  setupPicker(target) {
    const config = this.getConfig(target);
    const input = config?.input;
    const field = input?.closest?.(".toolbar__button-custom-color");
    if (!config || !input || !field || this.pickers.has(target)) return;

    const trigger = document.createElement("button");
    trigger.type = "button";
    trigger.className = "toolbar__button-custom-trigger";
    trigger.title = `Custom ${config.label.toLowerCase()}`;
    trigger.setAttribute("aria-label", `Custom ${config.label.toLowerCase()}`);
    trigger.innerHTML = '<span aria-hidden="true">+</span>';

    const picker = document.createElement("div");
    picker.className = "toolbar__button-custom-picker";
    picker.hidden = true;
    picker.innerHTML = `
      <button class="toolbar__button-custom-square" type="button" aria-label="Choose shade">
        <span class="toolbar__button-custom-square-marker" aria-hidden="true"></span>
      </button>
      <div class="toolbar__button-custom-controls">
        <button class="toolbar__button-custom-eyedropper" type="button" title="Eyedropper" aria-label="Eyedropper">
          <i data-lucide="pipette" aria-hidden="true"></i>
        </button>
        <span class="toolbar__button-custom-preview" aria-hidden="true"></span>
        <input class="toolbar__button-custom-hue" type="range" min="0" max="359" value="0" aria-label="Hue" />
      </div>
      <div class="toolbar__button-custom-code">
        <div class="toolbar__button-custom-fields" aria-label="Color values"></div>
        <label class="toolbar__button-custom-mode">
          <span class="toolbar__sr-only">Color format</span>
          <select aria-label="Color format">
            <option value="hex">HEX</option>
            <option value="rgb" selected>RGB</option>
            <option value="hsl">HSL</option>
          </select>
        </label>
      </div>
    `;

    field.prepend(trigger);
    (field.closest(".toolbar__button-style-popover") ?? field).append(picker);

    const state = {
      target,
      input,
      field,
      trigger,
      picker,
      square: picker.querySelector(".toolbar__button-custom-square"),
      marker: picker.querySelector(".toolbar__button-custom-square-marker"),
      eyedropper: picker.querySelector(".toolbar__button-custom-eyedropper"),
      preview: picker.querySelector(".toolbar__button-custom-preview"),
      hue: picker.querySelector(".toolbar__button-custom-hue"),
      fields: picker.querySelector(".toolbar__button-custom-fields"),
      modeSelect: picker.querySelector(".toolbar__button-custom-mode select"),
      mode: "rgb",
      hsv: rgbToHsv(hexToRgb(input.value)),
    };
    this.pickers.set(target, state);

    this.listenDom(trigger, "click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      this.setPickerOpen(target, state.picker.hidden);
    });
    this.listenDom(state.hue, "input", () => {
      const nextColor = rgbToHex(hsvToRgb({
        ...state.hsv,
        h: Number(state.hue.value),
      }));
      this.applyPickerColor(target, nextColor);
    });
    this.listenDom(state.eyedropper, "click", async (event) => {
      event.preventDefault();
      event.stopPropagation();

      if ("EyeDropper" in window) {
        try {
          const result = await new window.EyeDropper().open();
          if (result?.sRGBHex) {
            this.applyPickerColor(target, result.sRGBHex);
          }
        } catch {
          // The user can cancel the native picker; keep the current color.
        }
        return;
      }

      input.click?.();
    });
    this.listenDom(state.modeSelect, "change", () => {
      state.mode = state.modeSelect.value;
      this.renderColorFields(target);
    });
    this.listenDom(state.fields, "input", () => this.applyFieldsInput(target));
    this.listenDom(state.square, "pointerdown", (event) => {
      event.preventDefault();
      this.applySquarePoint(target, event);
    });

    this.syncPicker(target);
    this.renderIcons(picker, {
      width: 18,
      height: 18,
      "stroke-width": 2,
    });
  }

  renderColorFields(target) {
    const state = this.pickers.get(target);
    if (!state?.fields) return;

    const color = normalizeHexColor(state.input.value);
    const configs = getColorFieldConfig(state.mode, color);
    state.fields.dataset.colorMode = state.mode;
    state.fields.innerHTML = configs.map((field) => {
      const attrs = [
        `data-color-field="${field.id}"`,
        `type="${field.type}"`,
        `value="${field.value}"`,
      ];
      if (Number.isFinite(field.min)) attrs.push(`min="${field.min}"`);
      if (Number.isFinite(field.max)) attrs.push(`max="${field.max}"`);
      attrs.push(`aria-label="${field.label}"`);
      return `<label><input ${attrs.join(" ")} /></label>`;
    }).join("");
  }

  updateColorFields(target) {
    const state = this.pickers.get(target);
    if (!state?.fields) return;

    const color = normalizeHexColor(state.input.value);
    const configs = getColorFieldConfig(state.mode, color);
    const currentInputs = Array.from(state.fields.querySelectorAll("[data-color-field]"));
    const sameFields =
      currentInputs.length === configs.length &&
      currentInputs.every((input, index) => input.dataset.colorField === configs[index].id);

    if (!sameFields) {
      this.renderColorFields(target);
      return;
    }

    configs.forEach((field) => {
      const input = state.fields.querySelector(`[data-color-field="${field.id}"]`);
      if (input && document.activeElement !== input) {
        input.value = String(field.value);
      }
    });
  }

  applyFieldsInput(target) {
    const state = this.pickers.get(target);
    if (!state?.fields) return;

    const inputMap = Object.fromEntries(
      Array.from(state.fields.querySelectorAll("[data-color-field]")).map((input) => [
        input.dataset.colorField,
        input.value,
      ]),
    );

    let nextColor = null;
    if (state.mode === "hex") {
      nextColor = parseHexColorInput(inputMap.hex);
    } else if (state.mode === "hsl") {
      nextColor = rgbToHex(hslToRgb({
        h: clamp(Number(inputMap.h), 0, 359),
        s: clamp(Number(inputMap.s), 0, 100),
        l: clamp(Number(inputMap.l), 0, 100),
      }));
    } else {
      nextColor = rgbToHex({
        r: clamp(Number(inputMap.r), 0, 255),
        g: clamp(Number(inputMap.g), 0, 255),
        b: clamp(Number(inputMap.b), 0, 255),
      });
    }

    if (nextColor) {
      this.applyPickerColor(target, nextColor);
    }
  }

  setPickerOpen(target, open) {
    for (const [entryTarget, state] of this.pickers) {
      const shouldOpen = open && entryTarget === target;
      if (!shouldOpen && !state.picker.hidden) {
        this.recordCustomColor(entryTarget, state.input.value);
      }
      state.picker.hidden = !shouldOpen;
      state.field.classList.toggle("is-custom-picker-open", shouldOpen);
      if (shouldOpen) {
        this.activeTarget = entryTarget;
        this.syncPicker(entryTarget);
      }
    }

    if (!open || !this.pickers.has(target)) {
      this.activeTarget = null;
    }
  }

  applySquarePoint(target, event) {
    const state = this.pickers.get(target);
    const rect = state?.square?.getBoundingClientRect?.();
    if (!state || !rect?.width || !rect.height) return;

    const s = clamp((event.clientX - rect.left) / rect.width, 0, 1);
    const v = 1 - clamp((event.clientY - rect.top) / rect.height, 0, 1);
    const nextColor = rgbToHex(hsvToRgb({
      ...state.hsv,
      s,
      v,
    }));
    this.applyPickerColor(target, nextColor);
  }

  applyPickerColor(target, color) {
    const config = this.getConfig(target);
    const state = this.pickers.get(target);
    if (!config || !state) return;

    state.input.value = normalizeHexColor(color, state.input.value);
    this.syncPicker(target);
    config.onChange?.(state.input.value, { input: state.input, controller: this, target });
  }

  syncPicker(target) {
    const state = this.pickers.get(target);
    if (!state) return;

    const color = normalizeHexColor(state.input.value);
    const rgb = hexToRgb(color);
    const hsv = rgbToHsv(rgb);
    state.hsv = hsv;
    state.field.style.setProperty("--button-custom-color", color);
    state.field.style.setProperty("--button-custom-hue", `${Math.round(hsv.h)}`);
    state.picker.style.setProperty("--button-custom-hue", `${Math.round(hsv.h)}`);
    state.preview.style.backgroundColor = color;
    state.hue.value = String(Math.round(hsv.h));
    state.modeSelect.value = state.mode;
    state.marker.style.left = `${hsv.s * 100}%`;
    state.marker.style.top = `${(1 - hsv.v) * 100}%`;
    this.updateColorFields(target);
  }
}
