import { BaseCommand, BasePlugin } from "../core/baseClasses.js";
import {
  DEFAULT_SHAPE_FILL,
  DEFAULT_SHAPE_FILL_OPACITY,
  DEFAULT_SHAPE_STROKE,
  SHAPE_TYPES,
  normalizeShapeType,
} from "../component/shapeModel.js";
import {
  BUTTON_SHAPE_TYPES,
  DEFAULT_BUTTON_FILL,
  DEFAULT_BUTTON_FILL_OPACITY,
  DEFAULT_BUTTON_FONT_SIZE,
  DEFAULT_BUTTON_STROKE,
  DEFAULT_BUTTON_STROKE_WIDTH,
  DEFAULT_BUTTON_TEXT_COLOR,
  applyButtonStyle,
  getButtonData,
  normalizeButtonShapeType,
} from "../component/button.js";
import { renderIcons } from "../lib/icons.js";

const DRAWING_TOOL_IDS = ["pen", "pencil", "highlighter"];
const DEFAULT_ERASER_STATE = {
  radius: 12,
};
const DEFAULT_SHAPE_TOOL_STATE = {
  shapeType: "rectangle",
  fill: DEFAULT_SHAPE_FILL,
  fillOpacity: DEFAULT_SHAPE_FILL_OPACITY,
  stroke: DEFAULT_SHAPE_STROKE,
  strokeWidth: 2,
};
const PRESENTATION_TOOLBAR_HIDE_DELAY_MS = 100;

const DEFAULT_BUTTON_PANEL_STATE = {
  shapeType: "rounded",
  fill: DEFAULT_BUTTON_FILL,
  fillOpacity: DEFAULT_BUTTON_FILL_OPACITY,
  stroke: DEFAULT_BUTTON_STROKE,
  strokeWidth: DEFAULT_BUTTON_STROKE_WIDTH,
  textColor: DEFAULT_BUTTON_TEXT_COLOR,
  fontSize: DEFAULT_BUTTON_FONT_SIZE,
};
const BUTTON_PANEL_VIEWPORT_MARGIN = 12;
const BUTTON_PANEL_ANCHOR_GAP = 24;
const BUTTON_POPOVER_NODE_CLEARANCE = 10;
const BUTTON_STYLE_SWATCHES = [
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

const DEFAULT_DRAWING_TOOL_STATE = {
  pen: {
    opacity: 1,
    activePresetIndex: 0,
    presets: [
      { color: "#1f6feb", width: 4 },
      { color: "#d7612f", width: 8 },
      { color: "#18875d", width: 12 },
    ],
  },
  pencil: {
    opacity: 0.55,
    activePresetIndex: 0,
    presets: [
      { color: "#4a4a4a", width: 3 },
      { color: "#8b5e3c", width: 5 },
      { color: "#1f6feb", width: 2 },
    ],
  },
  highlighter: {
    opacity: 0.25,
    activePresetIndex: 0,
    presets: [
      { color: "#f6d32d", width: 16 },
      { color: "#ff7aa2", width: 14 },
      { color: "#7ed7a1", width: 20 },
    ],
  },
};

function cloneDrawingToolState() {
  return Object.fromEntries(
    Object.entries(DEFAULT_DRAWING_TOOL_STATE).map(([toolId, config]) => [
      toolId,
      {
        ...config,
        presets: config.presets.map((preset) => ({ ...preset })),
      },
    ]),
  );
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function formatOpacityValue(value) {
  return Number(value).toFixed(2).replace(/\.?0+$/, "");
}

function formatPercentValue(value) {
  const numeric = Number(value);
  return `${Math.round((Number.isFinite(numeric) ? numeric : 0) * 100)}%`;
}

function normalizeHexColor(value, fallback = "#000000") {
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

function isFiniteRect(rect) {
  return Boolean(
    rect &&
    Number.isFinite(rect.x) &&
    Number.isFinite(rect.y) &&
    Number.isFinite(rect.width) &&
    Number.isFinite(rect.height),
  );
}

class TogglePresentationBoardFullscreenCommand extends BaseCommand {
  static commandId = "presentation:toggle-fullscreen-board";
  static label = "Toggle Presentation Board Fullscreen";
  static modes = {
    presentation: {},
  };

  execute() {
    this.plugin?.toggleBoardFullscreen?.();
  }
}

export class ToolbarPlugin extends BasePlugin {
  static pluginId = "toolbar";

  commands() {
    return [TogglePresentationBoardFullscreenCommand];
  }

  onSetup() {
    const {
      presentationToolbarHoverZoneEl,
      modeCapsuleEditEl,
      modeCapsulePresentEl,
      drawingVisibilityToggleEl,
      saveFocusEl,
      focusPositionModeEl,
      shapeControlsEl,
      shapeTypeControlsEl,
      shapeFillColorEl,
      shapeStrokeColorEl,
      shapeStrokeWidthEl,
      shapeStrokeWidthValueEl,
      shapeOpacityEl,
      shapeOpacityValueEl,
      penDropdownPlugin,
      eraserTriggerEl,
      buttonControlsEl,
      buttonTypeControlsEl,
      buttonFontSizeEl,
      buttonFontSizeValueEl,
      buttonTextColorEl,
      buttonFillColorEl,
      buttonStrokeColorEl,
      buttonStrokeWidthEl,
      buttonStrokeWidthValueEl,
      buttonOpacityEl,
      buttonOpacityValueEl,
    } = this.options;

    this.ui = {
      presentationToolbarHoverZoneEl,
      modeCapsuleEditEl,
      modeCapsulePresentEl,
      drawingVisibilityToggleEl,
      saveFocusEl,
      focusPositionModeEl,
      shapeControlsEl,
      shapeTypeControlsEl,
      shapeFillColorEl,
      shapeStrokeColorEl,
      shapeStrokeWidthEl,
      shapeStrokeWidthValueEl,
      shapeOpacityEl,
      shapeOpacityValueEl,
      buttonControlsEl,
      buttonTypeControlsEl,
      buttonFontSizeEl,
      buttonFontSizeValueEl,
      buttonTextColorEl,
      buttonFillColorEl,
      buttonStrokeColorEl,
      buttonStrokeWidthEl,
      buttonStrokeWidthValueEl,
      buttonOpacityEl,
      buttonOpacityValueEl,
    };
    if (buttonControlsEl?.parentElement && buttonControlsEl.parentElement !== document.body) {
      const originalParent = buttonControlsEl.parentElement;
      const originalNextSibling = buttonControlsEl.nextSibling;
      document.body.append(buttonControlsEl);
      this.cleanups.push(() => {
        if (!buttonControlsEl.isConnected) return;
        if (originalNextSibling?.parentElement === originalParent) {
          originalParent.insertBefore(buttonControlsEl, originalNextSibling);
        } else {
          originalParent.append(buttonControlsEl);
        }
      });
    }
    this.toolbarEl = document.querySelector(".toolbar");
    this.penDropdown = penDropdownPlugin ?? null;
    this.eraserTriggerEl = eraserTriggerEl ?? null;
    this.focusState = {
      positionMode: "absolute",
      canSave: false,
      canTogglePositionMode: false,
      selectedNodeId: null,
    };
    this.brushPanelPositionFrame = null;
    this.buttonPanelPositionFrame = null;
    this.presentationToolbarHideTimer = null;
    this.presentationToolbarAnimationFrame = null;
    this.isHoveringPresentationToolbarZone = false;
    this.isHoveringPresentationToolbar = false;
    this.eraserPanelOpen = false;
    this.lastBrushToolId = "pen";
    this.drawingToolState = cloneDrawingToolState();
    this.eraserState = { ...DEFAULT_ERASER_STATE };
    this.shapeToolState = { ...DEFAULT_SHAPE_TOOL_STATE };
    this.buttonPanelState = { ...DEFAULT_BUTTON_PANEL_STATE };
    this.selectedNodes = [];
    this.selectedButtonNode = null;
    this.buttonCustomColors = {
      text: [],
      fill: [],
      border: [],
    };
    this.buttonCustomPickers = new Map();
    this.activeButtonCustomPickerTarget = null;

    this.buildEraserPanel();
    this.setupPenDropdown();
    this.setupEraserPanel();

    if (saveFocusEl) {
      this.listenDom(saveFocusEl, "click", () => {
        this.app.commands.execute("focus:save-selection");
      });
    }
    if (focusPositionModeEl) {
      this.listenDom(focusPositionModeEl, "click", () => {
        const nextMode = this.focusState.positionMode === "relative" ? "absolute" : "relative";
        this.app.commands.execute("focus:position-mode:set", nextMode);
      });
    }
    for (const button of (shapeTypeControlsEl?.querySelectorAll("[data-shape-type]") ?? [])) {
      this.listenDom(button, "click", () => {
        this.shapeToolState.shapeType = normalizeShapeType(button.dataset.shapeType);
        this.syncShapeTypeControls();
        this.emitShapeStyleChange({ applyToSelection: true });
      });
    }
    for (const button of buttonTypeControlsEl.querySelectorAll("[data-button-shape-type]")) {
      this.listenDom(button, "click", () => {
        this.buttonPanelState.shapeType = normalizeButtonShapeType(button.dataset.buttonShapeType);
        this.syncButtonTypeControls();
        this.emitButtonStyleChange();
      });
    }
    this.listenDom(window, "resize", () => {
      this.queueBrushPanelPositionSync();
      this.queueButtonPanelPositionSync();
    });
    if (shapeFillColorEl) {
      this.listenDom(shapeFillColorEl, "input", () => this.emitShapeStyleChange({ applyToSelection: true }));
    }
    if (shapeStrokeColorEl) {
      this.listenDom(shapeStrokeColorEl, "input", () => this.emitShapeStyleChange({ applyToSelection: true }));
    }
    if (shapeStrokeWidthEl) {
      this.listenDom(shapeStrokeWidthEl, "input", () => this.emitShapeStyleChange({ applyToSelection: true }));
    }
    if (shapeOpacityEl) {
      this.listenDom(shapeOpacityEl, "input", () => this.emitShapeStyleChange({ applyToSelection: true }));
    }
    this.listenDom(buttonFontSizeEl, "input", () => this.emitButtonStyleChange());
    this.listenDom(buttonTextColorEl, "input", () => {
      this.recordButtonCustomColor("text", buttonTextColorEl.value);
      this.emitButtonStyleChange();
    });
    this.listenDom(buttonFillColorEl, "input", () => {
      this.recordButtonCustomColor("fill", buttonFillColorEl.value);
      this.emitButtonStyleChange();
    });
    this.listenDom(buttonStrokeColorEl, "input", () => {
      this.recordButtonCustomColor("border", buttonStrokeColorEl.value);
      this.emitButtonStyleChange();
    });
    this.listenDom(buttonStrokeWidthEl, "input", () => this.emitButtonStyleChange());
    this.listenDom(buttonOpacityEl, "input", () => this.emitButtonStyleChange());
    if (buttonControlsEl) {
      this.listenDom(buttonControlsEl, "focusin", () => {
        this.syncButtonPopoverOpenState();
        this.queueButtonPanelPositionSync();
      });
      this.listenDom(buttonControlsEl, "focusout", () => {
        window.setTimeout(() => {
          this.syncButtonPopoverOpenState();
          this.queueButtonPanelPositionSync();
        }, 0);
      });
      this.listenDom(buttonControlsEl, "pointerdown", () => {
        window.requestAnimationFrame(() => {
          this.syncButtonPopoverOpenState();
          this.queueButtonPanelPositionSync();
        });
      }, true);
    }
    this.setupButtonStyleSwatches();
    this.setupButtonCustomColorPickers();
    this.listenDom(document, "pointerdown", (event) => {
      const target = this.activeButtonCustomPickerTarget;
      if (!target) return;

      const picker = this.buttonCustomPickers.get(target);
      if (!picker || picker.field.contains(event.target) || picker.picker.contains(event.target)) return;
      this.setButtonCustomPickerOpen(target, false);
    }, true);
    this.listenDom(drawingVisibilityToggleEl, "click", () => {
      this.getDrawingPlugin()?.toggleDrawLayerVisibility?.();
      this.syncUi();
    });
    this.app.keybindings.register("Mod+Shift+F", "presentation:toggle-fullscreen-board");

    this.listen("tool:change", () => {
      this.syncDrawingUiToActiveTool();
      this.syncShapeUiToActiveTool();
      this.syncUi();
    });
    this.listen("interaction:change", () => {
      this.syncDrawingUiToActiveTool();
      this.syncShapeUiToActiveTool();
      this.syncUi();
    });
    this.listen("focus:state-change", (payload = {}) => {
      this.focusState = {
        ...this.focusState,
        ...payload,
      };
      this.syncUi();
    });
    this.listen("selection:change", ({ nodes = [] } = {}) => {
      this.selectedNodes = nodes;
      this.selectedButtonNode =
        nodes.length === 1 && nodes[0]?.getAttr?.("componentType") === "button"
          ? nodes[0]
          : null;
      this.loadButtonUiFromSelection();
      this.syncUi();
    });
    this.listen("viewport:change", () => this.queueButtonPanelPositionSync());
    this.listen("node:changing", ({ node } = {}) => {
      if (this.isSelectedButtonAffectedByNode(node)) {
        this.queueButtonPanelPositionSync();
      }
    });
    this.listen("node:changed", ({ node } = {}) => {
      if (this.isSelectedButtonAffectedByNode(node)) {
        if (node === this.selectedButtonNode) {
          this.loadButtonUiFromSelection();
        }
        this.syncUi();
      }
    });
    this.listen("draw:added", () => this.syncUi());
    this.listen("draw:removed", () => this.syncUi());

    this.setupModeToggle();
    this.setupPresentationToolbarAutoHide();
    this.renderToolButtons();
    this.loadShapeUi();
    this.syncDrawingUiToActiveTool();
    this.loadButtonUiFromSelection();
    this.emitStrokeChange("pen");
    this.emitShapeStyleChange();
    this.syncUi();

    this.cleanups.push(() => {
      this.app.keybindings.unregister("Mod+Shift+F");
      if (this.brushPanelPositionFrame != null) {
        window.cancelAnimationFrame(this.brushPanelPositionFrame);
        this.brushPanelPositionFrame = null;
      }
      if (this.buttonPanelPositionFrame != null) {
        window.cancelAnimationFrame(this.buttonPanelPositionFrame);
        this.buttonPanelPositionFrame = null;
      }
      this.clearPresentationToolbarHideTimer();
      if (this.presentationToolbarAnimationFrame != null) {
        window.cancelAnimationFrame(this.presentationToolbarAnimationFrame);
        this.presentationToolbarAnimationFrame = null;
      }
      this.eraserPanelEl?.remove();
    });
  }

  buildEraserPanel() {
    const shell = document.querySelector(".app-shell");
    if (!shell) return;

    const panel = document.createElement("div");
    panel.className = "toolbar__eraser-panel";
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-label", "Eraser");
    panel.dataset.testid = "eraser-controls";
    panel.hidden = true;

    const sliderRow = document.createElement("label");
    sliderRow.className = "toolbar__field toolbar__field--slider toolbar__eraser-slider";
    sliderRow.setAttribute("for", "eraser-radius");

    const srOnly = document.createElement("span");
    srOnly.id = "eraser-radius-label";
    srOnly.className = "toolbar__sr-only";
    srOnly.textContent = "Eraser radius";

    this.eraserRadiusEl = document.createElement("input");
    this.eraserRadiusEl.id = "eraser-radius";
    this.eraserRadiusEl.type = "range";
    this.eraserRadiusEl.min = "4";
    this.eraserRadiusEl.max = "48";
    this.eraserRadiusEl.value = String(this.eraserState.radius);
    this.eraserRadiusEl.dataset.testid = "eraser-radius";
    this.eraserRadiusEl.setAttribute("aria-labelledby", "eraser-radius-label");

    this.eraserRadiusValueEl = document.createElement("output");
    this.eraserRadiusValueEl.id = "eraser-radius-value";
    this.eraserRadiusValueEl.dataset.testid = "eraser-radius-value";
    this.eraserRadiusValueEl.textContent = String(this.eraserState.radius);

    sliderRow.append(srOnly, this.eraserRadiusEl, this.eraserRadiusValueEl);

    this.clearStrokesEl = document.createElement("button");
    this.clearStrokesEl.id = "clear-strokes";
    this.clearStrokesEl.type = "button";
    this.clearStrokesEl.className = "ghost-button toolbar__eraser-clear";
    this.clearStrokesEl.dataset.testid = "clear-strokes";
    this.clearStrokesEl.textContent = "Clear Strokes";

    panel.append(sliderRow, this.clearStrokesEl);
    shell.append(panel);
    this.eraserPanelEl = panel;

    this.listenDom(this.eraserRadiusEl, "input", () => {
      this.eraserState.radius = Number(this.eraserRadiusEl.value);
      this.eraserRadiusValueEl.textContent = this.eraserRadiusEl.value;
      this.emitStrokeChange("eraser");
    });
    this.listenDom(this.clearStrokesEl, "click", () => {
      this.app.commands.execute("drawing:clear-strokes");
      this.syncUi();
    });
  }

  setupPenDropdown() {
    if (!this.penDropdown) return;

    this.penDropdown.setCallbacks({
      onBrushToolSelect: (toolId) => {
        this.app.setEditorTool(toolId);
      },
      onPresetActivate: (toolId, presetIndex) => {
        this.setActivePresetIndex(toolId, presetIndex);
        if (this.app.getEditorTool() !== toolId) {
          this.app.setEditorTool(toolId);
        } else {
          this.syncDrawingUiToActiveTool();
          this.emitStrokeChange(toolId);
          this.syncUi();
        }
      },
      onPresetWidthChange: (toolId, presetIndex, width) => {
        this.updatePreset(toolId, presetIndex, { width });
        this.syncDrawingUiToActiveTool();
        this.emitStrokeChange(toolId);
        this.syncUi();
      },
      onPresetColorChange: (toolId, presetIndex, color) => {
        this.updatePreset(toolId, presetIndex, { color });
        this.syncDrawingUiToActiveTool();
        this.emitStrokeChange(toolId);
        this.syncUi();
      },
    });
  }

  setupEraserPanel() {
    if (!this.eraserTriggerEl) return;

    this.listenDom(this.eraserTriggerEl, "click", (event) => {
      event.stopPropagation();
      if (this.app.getMode() !== "edit" || this.app.getEditorTool() !== "eraser") {
        this.closeEraserPanel();
        return;
      }
      if (this.eraserPanelOpen) {
        this.closeEraserPanel();
      } else {
        this.openEraserPanel();
      }
    });

    this.listenDom(document, "mousedown", (event) => {
      if (!this.eraserPanelOpen) return;
      const target = event.target;
      if (this.eraserPanelEl?.contains(target) || this.eraserTriggerEl?.contains(target)) return;
      this.closeEraserPanel();
    }, true);
    this.listenDom(document, "keydown", (event) => {
      if (event.key === "Escape" && this.eraserPanelOpen) {
        this.closeEraserPanel();
      }
    });
    this.listenDom(window, "resize", () => {
      if (this.eraserPanelOpen) this.positionEraserPanel();
    });
  }

  openEraserPanel() {
    if (!this.eraserPanelEl) return;
    this.eraserPanelOpen = true;
    this.eraserPanelEl.hidden = false;
    this.positionEraserPanel();
  }

  closeEraserPanel() {
    this.eraserPanelOpen = false;
    if (this.eraserPanelEl) {
      this.eraserPanelEl.hidden = true;
    }
  }

  positionEraserPanel() {
    if (!this.eraserPanelEl || !this.eraserTriggerEl) return;
    const shellRect = document.querySelector(".app-shell")?.getBoundingClientRect?.();
    const triggerRect = this.eraserTriggerEl.getBoundingClientRect();
    if (!shellRect) return;
    this.eraserPanelEl.style.left = `${triggerRect.right - shellRect.left + 4}px`;
    this.eraserPanelEl.style.top = `${triggerRect.top - shellRect.top}px`;
  }

  getBoardFullscreenTarget() {
    const container = this.app.stage?.container?.();
    if (!container) return null;
    return container.closest(".board-shell");
  }

  toggleBoardFullscreen() {
    const target = this.getBoardFullscreenTarget();
    if (!target) return;

    if (document.fullscreenElement === target) {
      const exitPromise = document.exitFullscreen?.();
      exitPromise?.catch?.(() => {});
      return;
    }

    if (document.fullscreenElement) {
      const exitPromise = document.exitFullscreen?.();
      exitPromise?.catch?.(() => {});
      return;
    }

    const fullscreenPromise = target.requestFullscreen?.();
    fullscreenPromise?.catch?.(() => {});
  }

  setupPresentationToolbarAutoHide() {
    const { presentationToolbarHoverZoneEl } = this.ui;
    if (!this.toolbarEl || !presentationToolbarHoverZoneEl) return;

    const showToolbar = () => {
      this.isHoveringPresentationToolbarZone = true;
      this.setPresentationToolbarVisible(true);
    };
    const leaveHoverZone = () => {
      this.isHoveringPresentationToolbarZone = false;
      this.schedulePresentationToolbarHide();
    };
    const enterToolbar = () => {
      this.isHoveringPresentationToolbar = true;
      this.setPresentationToolbarVisible(true);
    };
    const leaveToolbar = () => {
      this.isHoveringPresentationToolbar = false;
      this.schedulePresentationToolbarHide();
    };

    this.listenDom(presentationToolbarHoverZoneEl, "mouseenter", showToolbar);
    this.listenDom(presentationToolbarHoverZoneEl, "mouseleave", leaveHoverZone);
    this.listenDom(this.toolbarEl, "mouseenter", enterToolbar);
    this.listenDom(this.toolbarEl, "mouseleave", leaveToolbar);
  }

  clearPresentationToolbarHideTimer() {
    if (this.presentationToolbarHideTimer == null) return;
    window.clearTimeout(this.presentationToolbarHideTimer);
    this.presentationToolbarHideTimer = null;
  }

  clearPresentationToolbarAnimationFrame() {
    if (this.presentationToolbarAnimationFrame == null) return;
    window.cancelAnimationFrame(this.presentationToolbarAnimationFrame);
    this.presentationToolbarAnimationFrame = null;
  }

  setPresentationToolbarVisible(visible) {
    if (!this.toolbarEl || this.app.getMode() !== "presentation") return;
    this.clearPresentationToolbarHideTimer();
    this.toolbarEl.classList.toggle("is-visible", visible);
  }

  schedulePresentationToolbarHide() {
    if (!this.toolbarEl || this.app.getMode() !== "presentation") return;

    this.clearPresentationToolbarHideTimer();
    this.presentationToolbarHideTimer = window.setTimeout(() => {
      this.presentationToolbarHideTimer = null;
      if (this.isHoveringPresentationToolbarZone || this.isHoveringPresentationToolbar) return;
      this.toolbarEl.classList.remove("is-visible");
    }, PRESENTATION_TOOLBAR_HIDE_DELAY_MS);
  }

  syncPresentationToolbarAutoHide() {
    const { presentationToolbarHoverZoneEl } = this.ui;
    if (!this.toolbarEl || !presentationToolbarHoverZoneEl) return;

    const isPresentation = this.app.getMode() === "presentation";
    presentationToolbarHoverZoneEl.hidden = !isPresentation;

    if (!isPresentation) {
      this.isHoveringPresentationToolbarZone = false;
      this.isHoveringPresentationToolbar = false;
      this.clearPresentationToolbarHideTimer();
      this.clearPresentationToolbarAnimationFrame();
      this.toolbarEl.classList.add("toolbar--no-transition");
      this.toolbarEl.classList.remove("is-visible");
      this.presentationToolbarAnimationFrame = window.requestAnimationFrame(() => {
        this.presentationToolbarAnimationFrame = null;
        this.toolbarEl?.classList.remove("toolbar--no-transition");
      });
      return;
    }

    this.clearPresentationToolbarAnimationFrame();
    this.toolbarEl.classList.remove("toolbar--no-transition");
    this.clearPresentationToolbarHideTimer();
    this.toolbarEl.classList.toggle(
      "is-visible",
      this.isHoveringPresentationToolbarZone || this.isHoveringPresentationToolbar,
    );
  }

  isDrawingTool(toolId) {
    return DRAWING_TOOL_IDS.includes(toolId);
  }

  isBrushFamilyActive(toolId = this.app.getEditorTool()) {
    return this.isDrawingTool(toolId);
  }

  showsShapeControls(toolId) {
    return toolId === "shape";
  }

  isToolAvailableInPresentation(toolId) {
    return toolId === "arrange";
  }

  getDrawingPlugin() {
    return this.app.plugins.find((plugin) => plugin.id === "drawing") ?? null;
  }

  getDrawingToolState(toolId = this.lastBrushToolId) {
    if (!this.isDrawingTool(toolId)) return null;
    return this.drawingToolState[toolId] ?? null;
  }

  getActivePreset(toolId = this.lastBrushToolId) {
    const toolState = this.getDrawingToolState(toolId);
    if (!toolState) return null;
    return toolState.presets[toolState.activePresetIndex] ?? null;
  }

  setActivePresetIndex(toolId, presetIndex) {
    const toolState = this.getDrawingToolState(toolId);
    if (!toolState) return;
    toolState.activePresetIndex = clamp(
      Math.round(presetIndex),
      0,
      Math.max(toolState.presets.length - 1, 0),
    );
  }

  updatePreset(toolId, presetIndex, patch = {}) {
    const toolState = this.getDrawingToolState(toolId);
    const preset = toolState?.presets?.[presetIndex];
    if (!preset) return;
    preset.color = patch.color ?? preset.color;
    preset.width = Number.isFinite(patch.width) ? patch.width : preset.width;
    toolState.activePresetIndex = presetIndex;
  }

  buildPenDropdownState() {
    return {
      activeToolId: this.lastBrushToolId,
      presetsByTool: Object.fromEntries(
        DRAWING_TOOL_IDS.map((toolId) => [
          toolId,
          this.getDrawingToolState(toolId)?.presets?.map((preset) => ({ ...preset })) ?? [],
        ]),
      ),
      activePresetIndexByTool: Object.fromEntries(
        DRAWING_TOOL_IDS.map((toolId) => [
          toolId,
          this.getDrawingToolState(toolId)?.activePresetIndex ?? 0,
        ]),
      ),
    };
  }

  syncEraserUi() {
    if (!this.eraserRadiusEl || !this.eraserRadiusValueEl) return;
    this.eraserRadiusEl.value = String(this.eraserState.radius);
    this.eraserRadiusValueEl.textContent = String(this.eraserState.radius);
  }

  loadShapeUi() {
    const {
      shapeFillColorEl,
      shapeStrokeColorEl,
      shapeStrokeWidthEl,
      shapeStrokeWidthValueEl,
      shapeOpacityEl,
      shapeOpacityValueEl,
    } = this.ui;

    if (shapeFillColorEl) shapeFillColorEl.value = this.shapeToolState.fill;
    if (shapeStrokeColorEl) shapeStrokeColorEl.value = this.shapeToolState.stroke;
    if (shapeStrokeWidthEl) shapeStrokeWidthEl.value = String(this.shapeToolState.strokeWidth);
    if (shapeStrokeWidthValueEl) {
      shapeStrokeWidthValueEl.value = String(this.shapeToolState.strokeWidth);
    }
    if (shapeOpacityEl) shapeOpacityEl.value = String(this.shapeToolState.fillOpacity);
    if (shapeOpacityValueEl) {
      shapeOpacityValueEl.value = formatOpacityValue(this.shapeToolState.fillOpacity);
    }
    this.syncShapeControlTooltips();
    this.syncShapeTypeControls();
  }

  saveShapeUiToState() {
    const {
      shapeFillColorEl,
      shapeStrokeColorEl,
      shapeStrokeWidthEl,
      shapeOpacityEl,
    } = this.ui;

    this.shapeToolState = {
      ...this.shapeToolState,
      fill: shapeFillColorEl?.value ?? this.shapeToolState.fill,
      stroke: shapeStrokeColorEl?.value ?? this.shapeToolState.stroke,
      strokeWidth: Number(shapeStrokeWidthEl?.value ?? this.shapeToolState.strokeWidth),
      fillOpacity: Number(shapeOpacityEl?.value ?? this.shapeToolState.fillOpacity),
    };
    return this.shapeToolState;
  }

  syncShapeTypeControls() {
    const { shapeTypeControlsEl } = this.ui;
    const validShapeTypes = new Set(SHAPE_TYPES.map((entry) => entry.value));

    if (!validShapeTypes.has(this.shapeToolState.shapeType)) {
      this.shapeToolState.shapeType = "rectangle";
    }

    for (const button of (shapeTypeControlsEl?.querySelectorAll("[data-shape-type]") ?? [])) {
      button.setAttribute(
        "aria-pressed",
        String(button.dataset.shapeType === this.shapeToolState.shapeType),
      );
    }
  }

  syncShapeUiToActiveTool() {
    if (!this.showsShapeControls(this.app.getEditorTool())) return;
    this.loadShapeUi();
    this.emitShapeStyleChange();
  }

  syncShapeControlTooltips() {
    const {
      shapeFillColorEl,
      shapeStrokeColorEl,
      shapeStrokeWidthEl,
      shapeStrokeWidthValueEl,
      shapeOpacityEl,
      shapeOpacityValueEl,
    } = this.ui;
    const fillTitle = `Shape fill color: ${shapeFillColorEl?.value ?? this.shapeToolState.fill}`;
    const opacityTitle = `Shape fill opacity: ${formatOpacityValue(shapeOpacityEl?.value ?? this.shapeToolState.fillOpacity)}`;
    const strokeTitle = `Shape border color: ${shapeStrokeColorEl?.value ?? this.shapeToolState.stroke}`;
    const strokeWidthTitle = `Shape border width: ${shapeStrokeWidthEl?.value ?? this.shapeToolState.strokeWidth}`;

    if (!shapeFillColorEl || !shapeStrokeColorEl || !shapeStrokeWidthEl || !shapeOpacityEl) return;

    shapeFillColorEl.title = fillTitle;
    shapeFillColorEl.closest("label")?.setAttribute("title", fillTitle);
    shapeOpacityEl.title = opacityTitle;
    if (shapeOpacityValueEl) shapeOpacityValueEl.title = opacityTitle;
    shapeOpacityEl.closest("label")?.setAttribute("title", opacityTitle);
    shapeStrokeColorEl.title = strokeTitle;
    shapeStrokeColorEl.closest("label")?.setAttribute("title", strokeTitle);
    shapeStrokeWidthEl.title = strokeWidthTitle;
    if (shapeStrokeWidthValueEl) shapeStrokeWidthValueEl.title = strokeWidthTitle;
    shapeStrokeWidthEl.closest("label")?.setAttribute("title", strokeWidthTitle);
  }


  loadButtonUiFromSelection() {
    const {
      buttonFontSizeEl,
      buttonFontSizeValueEl,
      buttonTextColorEl,
      buttonFillColorEl,
      buttonStrokeColorEl,
      buttonStrokeWidthEl,
      buttonStrokeWidthValueEl,
      buttonOpacityEl,
      buttonOpacityValueEl,
    } = this.ui;
    const state = this.selectedButtonNode
      ? getButtonData(this.selectedButtonNode)
      : { ...DEFAULT_BUTTON_PANEL_STATE };

    this.buttonPanelState = {
      ...this.buttonPanelState,
      ...state,
      shapeType: normalizeButtonShapeType(state.shapeType),
    };
    buttonFontSizeEl.value = String(this.buttonPanelState.fontSize);
    buttonFontSizeValueEl.value = String(this.buttonPanelState.fontSize);
    buttonTextColorEl.value = this.buttonPanelState.textColor;
    buttonFillColorEl.value = this.buttonPanelState.fill;
    buttonStrokeColorEl.value = this.buttonPanelState.stroke;
    buttonStrokeWidthEl.value = String(this.buttonPanelState.strokeWidth);
    buttonStrokeWidthValueEl.value = String(this.buttonPanelState.strokeWidth);
    buttonOpacityEl.value = String(this.buttonPanelState.fillOpacity);
    buttonOpacityValueEl.value = formatPercentValue(this.buttonPanelState.fillOpacity);
    this.syncButtonControlTooltips();
    this.syncButtonTypeControls();
  }

  saveButtonUiToState() {
    const {
      buttonTextColorEl,
      buttonFontSizeEl,
      buttonFillColorEl,
      buttonStrokeColorEl,
      buttonStrokeWidthEl,
      buttonOpacityEl,
    } = this.ui;

    this.buttonPanelState = {
      ...this.buttonPanelState,
      shapeType: normalizeButtonShapeType(this.buttonPanelState.shapeType),
      fontSize: Number(buttonFontSizeEl.value),
      textColor: buttonTextColorEl.value,
      fill: buttonFillColorEl.value,
      stroke: buttonStrokeColorEl.value,
      strokeWidth: Number(buttonStrokeWidthEl.value),
      fillOpacity: Number(buttonOpacityEl.value),
    };
    return this.buttonPanelState;
  }

  syncButtonTypeControls() {
    const { buttonTypeControlsEl } = this.ui;
    const validShapeTypes = new Set(BUTTON_SHAPE_TYPES.map((entry) => entry.value));

    if (!validShapeTypes.has(this.buttonPanelState.shapeType)) {
      this.buttonPanelState.shapeType = "rounded";
    }

    for (const button of buttonTypeControlsEl.querySelectorAll("[data-button-shape-type]")) {
      button.setAttribute(
        "aria-pressed",
        String(button.dataset.buttonShapeType === this.buttonPanelState.shapeType),
      );
    }
  }

  setupButtonStyleSwatches() {
    const { buttonControlsEl } = this.ui;
    const textSwatchesEl = buttonControlsEl?.querySelector?.("#button-text-swatches");
    const fillSwatchesEl = buttonControlsEl?.querySelector?.("#button-fill-swatches");
    const borderSwatchesEl = buttonControlsEl?.querySelector?.("#button-border-swatches");

    this.renderButtonStyleSwatches(textSwatchesEl, "text");
    this.renderButtonStyleSwatches(fillSwatchesEl, "fill");
    this.renderButtonStyleSwatches(borderSwatchesEl, "border");
  }

  renderButtonStyleSwatches(container, target) {
    if (!container) return;
    const customColorEl =
      container.querySelector(".toolbar__button-custom-color") ??
      Array.from(container.parentElement?.children ?? [])
        .find((child) => child.classList?.contains?.("toolbar__button-custom-color")) ??
      null;
    customColorEl?.remove();
    container.innerHTML = "";

    const baseColors = this.getButtonBaseSwatches(target);
    const customColors = (this.buttonCustomColors?.[target] ?? [])
      .filter((color) => !baseColors.includes(color));
    const colors = [...baseColors, ...customColors];

    for (const color of colors) {
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

      this.listenDom(button, "click", () => {
        if (target === "text") {
          this.applyButtonTextSwatch(color);
        } else if (target === "fill") {
          this.applyButtonFillSwatch(color);
        } else {
          this.applyButtonBorderSwatch(color);
        }
      });

      container.append(button);
    }

    if (customColorEl) {
      container.append(customColorEl);
    }
  }

  getButtonBaseSwatches(target) {
    return target === "text"
      ? BUTTON_STYLE_SWATCHES.filter((color) => color !== "transparent")
      : BUTTON_STYLE_SWATCHES;
  }

  getButtonSwatchContainer(target) {
    const { buttonControlsEl } = this.ui;
    const id = target === "border"
      ? "button-border-swatches"
      : `button-${target}-swatches`;
    return buttonControlsEl?.querySelector?.(`#${id}`) ?? null;
  }

  recordButtonCustomColor(target, color) {
    if (!this.buttonCustomColors?.[target]) return;

    const normalized = normalizeHexColor(color, null);
    if (!normalized || normalized === "transparent") return;

    const baseColors = this.getButtonBaseSwatches(target);
    if (baseColors.includes(normalized)) return;

    const withoutDuplicate = this.buttonCustomColors[target]
      .filter((entry) => entry !== normalized);
    withoutDuplicate.push(normalized);
    this.buttonCustomColors[target] = withoutDuplicate.slice(-8);
    this.renderButtonStyleSwatches(this.getButtonSwatchContainer(target), target);
  }

  setupButtonCustomColorPickers() {
    const configs = [
      { target: "text", input: this.ui.buttonTextColorEl, label: "Text color" },
      { target: "fill", input: this.ui.buttonFillColorEl, label: "Fill color" },
      { target: "border", input: this.ui.buttonStrokeColorEl, label: "Border color" },
    ];

    for (const config of configs) {
      this.setupButtonCustomColorPicker(config);
    }
  }

  setupButtonCustomColorPicker({ target, input, label }) {
    const field = input?.closest?.(".toolbar__button-custom-color");
    if (!field || this.buttonCustomPickers.has(target)) return;

    field.dataset.buttonCustomTarget = target;
    const trigger = document.createElement("button");
    trigger.type = "button";
    trigger.className = "toolbar__button-custom-trigger";
    trigger.title = `Custom ${label.toLowerCase()}`;
    trigger.setAttribute("aria-label", `Custom ${label.toLowerCase()}`);
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

    this.buttonCustomPickers.set(target, state);

    this.listenDom(trigger, "click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      this.setButtonCustomPickerOpen(target, state.picker.hidden);
    });

    this.listenDom(state.hue, "input", () => {
      const nextColor = rgbToHex(hsvToRgb({
        ...state.hsv,
        h: Number(state.hue.value),
      }));
      this.applyButtonCustomPickerColor(target, nextColor);
    });

    this.listenDom(state.eyedropper, "click", async (event) => {
      event.preventDefault();
      event.stopPropagation();

      if ("EyeDropper" in window) {
        try {
          const result = await new window.EyeDropper().open();
          if (result?.sRGBHex) {
            this.applyButtonCustomPickerColor(target, result.sRGBHex);
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
      this.renderButtonCustomColorFields(target);
    });

    this.listenDom(state.fields, "input", () => {
      this.applyButtonCustomFieldsInput(target);
    });

    this.listenDom(state.square, "pointerdown", (event) => {
      event.preventDefault();
      this.applyButtonCustomSquarePoint(target, event);
    });

    this.syncButtonCustomPicker(target);
  }

  getButtonCustomFieldConfig(state, color) {
    const rgb = hexToRgb(color);
    if (state.mode === "hex") {
      return [
        {
          id: "hex",
          label: "HEX",
          type: "text",
          value: color.toUpperCase(),
        },
      ];
    }

    if (state.mode === "hsl") {
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

  renderButtonCustomColorFields(target) {
    const state = this.buttonCustomPickers.get(target);
    if (!state?.fields) return;

    const color = normalizeHexColor(state.input.value);
    const configs = this.getButtonCustomFieldConfig(state, color);
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

  updateButtonCustomColorFields(target) {
    const state = this.buttonCustomPickers.get(target);
    if (!state?.fields) return;

    const color = normalizeHexColor(state.input.value);
    const configs = this.getButtonCustomFieldConfig(state, color);
    const currentInputs = Array.from(state.fields.querySelectorAll("[data-color-field]"));
    const sameFields =
      currentInputs.length === configs.length &&
      currentInputs.every((input, index) => input.dataset.colorField === configs[index].id);

    if (!sameFields) {
      this.renderButtonCustomColorFields(target);
      return;
    }

    configs.forEach((field) => {
      const input = state.fields.querySelector(`[data-color-field="${field.id}"]`);
      if (input && document.activeElement !== input) {
        input.value = String(field.value);
      }
    });
  }

  applyButtonCustomFieldsInput(target) {
    const state = this.buttonCustomPickers.get(target);
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
      this.applyButtonCustomPickerColor(target, nextColor);
    }
  }

  setButtonCustomPickerOpen(target, open) {
    for (const [entryTarget, state] of this.buttonCustomPickers) {
      const shouldOpen = open && entryTarget === target;
      if (!shouldOpen && !state.picker.hidden) {
        this.recordButtonCustomColor(entryTarget, state.input.value);
      }
      state.picker.hidden = !shouldOpen;
      state.field.classList.toggle("is-custom-picker-open", shouldOpen);
      if (shouldOpen) {
        this.activeButtonCustomPickerTarget = entryTarget;
        this.syncButtonCustomPicker(entryTarget);
      }
    }

    if (!open || !this.buttonCustomPickers.has(target)) {
      this.activeButtonCustomPickerTarget = null;
    }
  }

  applyButtonCustomSquarePoint(target, event) {
    const state = this.buttonCustomPickers.get(target);
    const rect = state?.square?.getBoundingClientRect?.();
    if (!state || !rect?.width || !rect.height) return;

    const s = clamp((event.clientX - rect.left) / rect.width, 0, 1);
    const v = 1 - clamp((event.clientY - rect.top) / rect.height, 0, 1);
    const nextColor = rgbToHex(hsvToRgb({
      ...state.hsv,
      s,
      v,
    }));
    this.applyButtonCustomPickerColor(target, nextColor);
  }

  applyButtonCustomPickerColor(target, color) {
    const state = this.buttonCustomPickers.get(target);
    if (!state) return;

    state.input.value = normalizeHexColor(color, state.input.value);
    this.syncButtonCustomPicker(target);
    this.emitButtonStyleChange();
  }

  syncButtonCustomPickers() {
    for (const target of this.buttonCustomPickers.keys()) {
      this.syncButtonCustomPicker(target);
    }
  }

  syncButtonCustomPicker(target) {
    const state = this.buttonCustomPickers.get(target);
    if (!state) return;

    const color = normalizeHexColor(state.input.value);
    const rgb = hexToRgb(color);
    const hsv = rgbToHsv(rgb);
    state.hsv = hsv;
    state.field.style.setProperty("--button-custom-color", color);
    state.field.style.setProperty("--button-custom-hue", `${Math.round(hsv.h)}`);
    state.preview.style.backgroundColor = color;
    state.hue.value = String(Math.round(hsv.h));
    state.modeSelect.value = state.mode;
    state.marker.style.left = `${hsv.s * 100}%`;
    state.marker.style.top = `${(1 - hsv.v) * 100}%`;
    this.updateButtonCustomColorFields(target);
  }

  applyButtonTextSwatch(color) {
    const { buttonTextColorEl } = this.ui;
    if (typeof color !== "string" || color === "transparent") return;

    buttonTextColorEl.value = color;
    this.emitButtonStyleChange();
  }

  applyButtonFillSwatch(color) {
    const { buttonFillColorEl, buttonOpacityEl } = this.ui;
    if (color === "transparent") {
      buttonOpacityEl.value = "0";
    } else {
      buttonFillColorEl.value = color;
      if (Number(buttonOpacityEl.value) === 0) {
        buttonOpacityEl.value = "1";
      }
    }
    this.emitButtonStyleChange();
  }

  applyButtonBorderSwatch(color) {
    const { buttonStrokeColorEl, buttonStrokeWidthEl } = this.ui;
    if (color === "transparent") {
      buttonStrokeWidthEl.value = "0";
    } else {
      buttonStrokeColorEl.value = color;
      if (Number(buttonStrokeWidthEl.value) === 0) {
        buttonStrokeWidthEl.value = String(DEFAULT_BUTTON_STROKE_WIDTH);
      }
    }
    this.emitButtonStyleChange();
  }

  syncButtonControlTooltips() {
    const {
      buttonFontSizeEl,
      buttonFontSizeValueEl,
      buttonTextColorEl,
      buttonFillColorEl,
      buttonStrokeColorEl,
      buttonStrokeWidthEl,
      buttonStrokeWidthValueEl,
      buttonOpacityEl,
      buttonOpacityValueEl,
    } = this.ui;
    const textTitle = "Text color";
    const fontSizeTitle = `Font size: ${buttonFontSizeEl.value}`;
    const fillTitle = "Fill color";
    const opacityTitle = `Opacity: ${formatPercentValue(buttonOpacityEl.value)}`;
    const strokeTitle = "Border color";
    const strokeWidthTitle = `Thickness: ${buttonStrokeWidthEl.value}`;
    const textToolEl = buttonTextColorEl.closest(".toolbar__button-style-tool");
    const fontSizeToolEl = buttonFontSizeEl.closest(".toolbar__button-style-tool");
    const fillToolEl = buttonFillColorEl.closest(".toolbar__button-style-tool");
    const borderToolEl = buttonStrokeColorEl.closest(".toolbar__button-style-tool");

    buttonFontSizeEl.title = fontSizeTitle;
    buttonFontSizeValueEl.title = fontSizeTitle;
    fontSizeToolEl?.querySelector?.(".toolbar__button-style-trigger")?.setAttribute("title", "Font size");
    buttonTextColorEl.title = textTitle;
    textToolEl?.querySelector?.(".toolbar__button-style-trigger")?.setAttribute("title", textTitle);
    textToolEl?.style.setProperty("--button-tool-color", buttonTextColorEl.value);
    buttonFillColorEl.title = fillTitle;
    fillToolEl?.querySelector?.(".toolbar__button-style-trigger")?.setAttribute("title", fillTitle);
    fillToolEl?.style.setProperty("--button-tool-fill", buttonFillColorEl.value);
    fillToolEl?.style.setProperty("--button-tool-opacity", formatOpacityValue(buttonOpacityEl.value));
    fillToolEl?.classList.toggle("is-button-fill-transparent", Number(buttonOpacityEl.value) <= 0);
    buttonOpacityEl.title = opacityTitle;
    buttonOpacityValueEl.title = opacityTitle;
    buttonStrokeColorEl.title = strokeTitle;
    borderToolEl?.querySelector?.(".toolbar__button-style-trigger")?.setAttribute("title", strokeTitle);
    borderToolEl?.style.setProperty("--button-tool-color", buttonStrokeColorEl.value);
    borderToolEl?.style.setProperty("--button-tool-stroke-width", `${Math.max(1, Number(buttonStrokeWidthEl.value) || 0)}px`);
    buttonStrokeWidthEl.title = strokeWidthTitle;
    buttonStrokeWidthValueEl.title = strokeWidthTitle;
    this.syncButtonCustomPickers();
  }


  syncDrawingUiToActiveTool() {
    const activeToolId = this.app.getEditorTool();
    if (this.isDrawingTool(activeToolId)) {
      this.lastBrushToolId = activeToolId;
    }

    this.penDropdown?.setState(this.buildPenDropdownState());
    this.syncEraserUi();

    if (activeToolId === "eraser") {
      this.emitStrokeChange("eraser");
      return;
    }

    if (this.isDrawingTool(activeToolId)) {
      this.emitStrokeChange(activeToolId);
    }
  }

  setupModeToggle() {
    const { modeCapsuleEditEl, modeCapsulePresentEl } = this.ui;
    if (modeCapsuleEditEl) {
      this.listenDom(modeCapsuleEditEl, "click", () => this.app.setMode("edit"));
    }
    if (modeCapsulePresentEl) {
      this.listenDom(modeCapsulePresentEl, "click", () => this.app.setMode("presentation"));
    }
  }

  renderToolButtons() {
    if (this.ui.shapeTypeControlsEl) {
      renderIcons(this.ui.shapeTypeControlsEl, {
        width: 16,
        height: 16,
        "stroke-width": 2,
      });
    }
    if (this.ui.buttonTypeControlsEl) {
      renderIcons(this.ui.buttonTypeControlsEl, {
        width: 16,
        height: 16,
        "stroke-width": 2,
      });
    }
    if (this.ui.buttonControlsEl) {
      renderIcons(this.ui.buttonControlsEl, {
        width: 18,
        height: 18,
        "stroke-width": 2,
      });
    }

    this.queueBrushPanelPositionSync();
  }

  queueBrushPanelPositionSync() {
    if (this.brushPanelPositionFrame != null) return;

    this.brushPanelPositionFrame = window.requestAnimationFrame(() => {
      this.brushPanelPositionFrame = null;
      this.syncBrushPanelPosition();
    });
  }

  syncBrushPanelPosition() {
    const { brushControlsEl, toolButtonsEl } = this.ui;
    if (!brushControlsEl || brushControlsEl.hidden) return;

    const anchorButton = toolButtonsEl?.querySelector?.('[data-tool-id="pen"]');
    const toolbarRect = brushControlsEl.parentElement?.getBoundingClientRect?.();
    const buttonRect = anchorButton?.getBoundingClientRect?.();
    const panelWidth = brushControlsEl.offsetWidth;

    if (!toolbarRect || !buttonRect || !panelWidth) return;

    const horizontalPadding = 16;
    const anchorCenter = buttonRect.left - toolbarRect.left + buttonRect.width / 2;
    let left = anchorCenter - panelWidth / 2;
    left = Math.max(horizontalPadding, Math.min(left, toolbarRect.width - panelWidth - horizontalPadding));

    brushControlsEl.style.left = `${left}px`;
  }

  queueButtonPanelPositionSync() {
    if (this.buttonPanelPositionFrame != null) return;

    this.buttonPanelPositionFrame = window.requestAnimationFrame(() => {
      this.buttonPanelPositionFrame = null;
      this.syncButtonPanelPosition();
    });
  }

  syncButtonPopoverOpenState() {
    const { buttonControlsEl } = this.ui;
    if (!buttonControlsEl) return false;

    const hasOpenPopover = Boolean(
      buttonControlsEl.querySelector(".toolbar__button-popover-tool:focus-within"),
    );
    buttonControlsEl.classList.toggle("is-button-popover-open", hasOpenPopover);
    return hasOpenPopover;
  }

  syncButtonPopoverOffset({ nodeLeft, nodeRight, placement, stageRect }) {
    const { buttonControlsEl } = this.ui;
    if (!buttonControlsEl) return;

    const tools = Array.from(buttonControlsEl.querySelectorAll(".toolbar__button-popover-tool"));
    for (const tool of tools) {
      tool.style.removeProperty("--button-popover-offset");
    }

    const openTool = buttonControlsEl.querySelector(".toolbar__button-popover-tool:focus-within");
    const popover = openTool?.querySelector?.(".toolbar__button-style-popover");
    if (!openTool || !popover || placement !== "top") return;

    const toolRect = openTool.getBoundingClientRect();
    const popoverWidth = popover.offsetWidth || popover.getBoundingClientRect().width;
    if (!toolRect.width || !popoverWidth) return;

    const viewportLeft = Math.max(BUTTON_PANEL_VIEWPORT_MARGIN, stageRect.left + BUTTON_PANEL_VIEWPORT_MARGIN);
    const viewportRight = Math.min(window.innerWidth - BUTTON_PANEL_VIEWPORT_MARGIN, stageRect.right - BUTTON_PANEL_VIEWPORT_MARGIN);
    const baseLeft = toolRect.left + toolRect.width / 2 - popoverWidth / 2;
    const baseRight = baseLeft + popoverWidth;
    const overlapsButton = baseRight > nodeLeft - BUTTON_POPOVER_NODE_CLEARANCE &&
      baseLeft < nodeRight + BUTTON_POPOVER_NODE_CLEARANCE;

    let offset = 0;
    if (overlapsButton) {
      const rightOffset = nodeRight + BUTTON_POPOVER_NODE_CLEARANCE - baseLeft;
      const leftOffset = nodeLeft - BUTTON_POPOVER_NODE_CLEARANCE - baseRight;
      const rightFits = baseLeft + rightOffset >= viewportLeft &&
        baseRight + rightOffset <= viewportRight;
      const leftFits = baseLeft + leftOffset >= viewportLeft &&
        baseRight + leftOffset <= viewportRight;

      if (rightFits && (!leftFits || Math.abs(rightOffset) <= Math.abs(leftOffset))) {
        offset = rightOffset;
      } else if (leftFits) {
        offset = leftOffset;
      } else {
        const clampedRight = clamp(baseRight, viewportLeft + popoverWidth, viewportRight);
        const viewportOffset = clampedRight - baseRight;
        const candidateRight = baseRight + viewportOffset <= nodeLeft
          ? viewportOffset
          : rightOffset;
        const candidateLeft = baseLeft + viewportOffset >= nodeRight
          ? viewportOffset
          : leftOffset;
        offset = Math.abs(candidateRight) < Math.abs(candidateLeft)
          ? candidateRight
          : candidateLeft;
        offset = clamp(offset, viewportLeft - baseLeft, viewportRight - baseRight);
      }
    } else {
      offset = clamp(0, viewportLeft - baseLeft, viewportRight - baseRight);
    }

    if (Math.abs(offset) > 0.5) {
      openTool.style.setProperty("--button-popover-offset", `${Math.round(offset)}px`);
    }
  }

  isSelectedButtonAffectedByNode(node) {
    const selectedButton = this.selectedButtonNode;
    if (!node || !selectedButton?.getStage?.()) return false;
    if (node === selectedButton) return true;

    let parent = selectedButton.getParent?.() ?? null;
    while (parent) {
      if (parent === node) return true;
      parent = parent.getParent?.() ?? null;
    }

    return false;
  }

  syncButtonPanelPosition() {
    const { buttonControlsEl } = this.ui;
    const node = this.selectedButtonNode;
    const stageContainer = this.app.stage?.container?.();
    if (!buttonControlsEl || buttonControlsEl.hidden || !node?.getStage?.() || !stageContainer) {
      return;
    }

    const anchorNode = node.findOne?.(".button-bg") ?? node;
    const canvasRect = anchorNode.getClientRect?.({ relativeTo: this.app.stage }) ?? null;
    if (!isFiniteRect(canvasRect)) return;

    const stageRect = stageContainer.getBoundingClientRect();
    const topLeft = this.app.stageApi.canvasToScreen({
      x: canvasRect.x,
      y: canvasRect.y,
    });
    const bottomRight = this.app.stageApi.canvasToScreen({
      x: canvasRect.x + canvasRect.width,
      y: canvasRect.y + canvasRect.height,
    });
    const nodeLeft = stageRect.left + Math.min(topLeft.x, bottomRight.x);
    const nodeRight = stageRect.left + Math.max(topLeft.x, bottomRight.x);
    const nodeTop = stageRect.top + Math.min(topLeft.y, bottomRight.y);
    const nodeBottom = stageRect.top + Math.max(topLeft.y, bottomRight.y);
    const nodeCenterX = (nodeLeft + nodeRight) / 2;

    const panelWidth = buttonControlsEl.offsetWidth;
    const panelHeight = buttonControlsEl.offsetHeight;
    if (!panelWidth || !panelHeight) return;
    this.syncButtonPopoverOpenState();

    let minLeft = panelWidth / 2 + BUTTON_PANEL_VIEWPORT_MARGIN;
    let maxLeft = window.innerWidth - panelWidth / 2 - BUTTON_PANEL_VIEWPORT_MARGIN;
    if (stageRect.width >= panelWidth + BUTTON_PANEL_VIEWPORT_MARGIN * 2) {
      minLeft = Math.max(minLeft, stageRect.left + panelWidth / 2 + BUTTON_PANEL_VIEWPORT_MARGIN);
      maxLeft = Math.min(maxLeft, stageRect.right - panelWidth / 2 - BUTTON_PANEL_VIEWPORT_MARGIN);
    }

    const verticalMin = Math.max(BUTTON_PANEL_VIEWPORT_MARGIN, stageRect.top + BUTTON_PANEL_VIEWPORT_MARGIN);
    const verticalMax = Math.min(
      window.innerHeight - BUTTON_PANEL_VIEWPORT_MARGIN,
      stageRect.bottom - BUTTON_PANEL_VIEWPORT_MARGIN,
    );
    const availableAbove = nodeTop - verticalMin - BUTTON_PANEL_ANCHOR_GAP;
    const availableBelow = verticalMax - nodeBottom - BUTTON_PANEL_ANCHOR_GAP;
    const placeAbove = availableAbove >= panelHeight || availableAbove >= availableBelow;
    const placement = placeAbove ? "top" : "bottom";
    const top = placeAbove
      ? clamp(nodeTop - BUTTON_PANEL_ANCHOR_GAP, verticalMin + panelHeight, verticalMax)
      : clamp(nodeBottom + BUTTON_PANEL_ANCHOR_GAP, verticalMin, verticalMax - panelHeight);
    const left = clamp(nodeCenterX, minLeft, maxLeft);

    buttonControlsEl.dataset.placement = placement;
    buttonControlsEl.style.left = `${left}px`;
    buttonControlsEl.style.top = `${top}px`;
    this.syncButtonPopoverOffset({
      nodeLeft,
      nodeRight,
      placement,
      stageRect,
    });
  }

  emitStrokeChange(toolId = this.app.getEditorTool()) {
    if (toolId === "eraser") {
      this.app.events.emit("stroke:change", {
        toolId: "eraser",
        radius: this.eraserState.radius,
      });
      return;
    }

    const toolState = this.getDrawingToolState(toolId);
    const preset = this.getActivePreset(toolId);
    if (!toolState || !preset) return;

    this.app.events.emit("stroke:change", {
      toolId,
      color: preset.color,
      width: preset.width,
      opacity: toolState.opacity,
    });
  }

  emitShapeStyleChange({ applyToSelection = false } = {}) {
    const {
      shapeStrokeWidthValueEl,
      shapeOpacityValueEl,
    } = this.ui;
    const state = this.saveShapeUiToState();

    if (shapeStrokeWidthValueEl) shapeStrokeWidthValueEl.value = String(state.strokeWidth);
    if (shapeOpacityValueEl) shapeOpacityValueEl.value = formatOpacityValue(state.fillOpacity);
    this.syncShapeControlTooltips();

    this.app.events.emit("shape:style-change", {
      shapeType: normalizeShapeType(state.shapeType),
      fill: state.fill,
      fillOpacity: state.fillOpacity,
      stroke: state.stroke,
      strokeWidth: state.strokeWidth,
      applyToSelection,
    });
  }

  emitButtonStyleChange() {
    const {
      buttonFontSizeValueEl,
      buttonStrokeWidthValueEl,
      buttonOpacityValueEl,
    } = this.ui;
    const state = this.saveButtonUiToState();

    buttonFontSizeValueEl.value = String(state.fontSize);
    buttonStrokeWidthValueEl.value = String(state.strokeWidth);
    buttonOpacityValueEl.value = formatPercentValue(state.fillOpacity);
    this.syncButtonControlTooltips();
    this.syncButtonTypeControls();

    const node = this.selectedButtonNode;
    if (this.app.getMode() !== "edit" || this.app.getEditorTool() !== "arrange") return;
    if (node?.getAttr?.("componentType") !== "button") return;

    this.app.events.emit("node:change:start", { node });
    applyButtonStyle(node, state);
    node.getLayer()?.batchDraw();
    this.app.overlayLayer.batchDraw();
    this.app.uiLayer.batchDraw();
    this.app.events.emit("node:changed", { node });
  }

  syncUi() {
    const {
      shapeControlsEl,
      buttonControlsEl,
      saveFocusEl,
      focusPositionModeEl,
      drawingVisibilityToggleEl,
      modeCapsuleEditEl,
      modeCapsulePresentEl,
    } = this.ui;

    const isEdit = this.app.getMode() === "edit";
    const activeToolId = this.app.getEditorTool();
    const isShapeTool = this.showsShapeControls(activeToolId);
    const hasSelectedButton = Boolean(this.selectedButtonNode?.getStage?.());
    const showButtonControls =
      isEdit
      && activeToolId === "arrange"
      && hasSelectedButton;
    const showShapeControls = isEdit && isShapeTool;
    const drawingPlugin = this.getDrawingPlugin();
    const isPresentation = !isEdit;
    const drawLayerVisible = drawingPlugin?.isDrawLayerVisible?.() !== false;

    document.body.classList.toggle("is-edit-mode", isEdit);
    document.body.classList.toggle("is-presentation-mode", !isEdit);
    this.syncPresentationToolbarAutoHide();

    if (modeCapsuleEditEl) {
      modeCapsuleEditEl.setAttribute("aria-pressed", String(isEdit));
    }
    if (modeCapsulePresentEl) {
      modeCapsulePresentEl.setAttribute("aria-pressed", String(!isEdit));
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

    if (shapeControlsEl) {
      shapeControlsEl.hidden = !showShapeControls;
    }
    if (buttonControlsEl) {
      buttonControlsEl.hidden = !showButtonControls;
    }
    if (!isEdit || !this.isBrushFamilyActive(activeToolId)) {
      this.penDropdown?.close();
    }
    if (!isEdit || activeToolId !== "eraser") {
      this.closeEraserPanel();
    }

    if (this.eraserPanelEl) {
      this.eraserPanelEl.hidden = !this.eraserPanelOpen;
    }
    if (this.clearStrokesEl) {
      this.clearStrokesEl.disabled = !drawingPlugin?.hasDrawings?.();
    }
    if (this.eraserRadiusEl) {
      this.eraserRadiusEl.disabled = !(isEdit && activeToolId === "eraser");
    }
    if (this.eraserRadiusValueEl) {
      this.eraserRadiusValueEl.disabled = !(isEdit && activeToolId === "eraser");
    }

    if (saveFocusEl) {
      saveFocusEl.hidden = true;
      saveFocusEl.disabled = true;
    }
    if (focusPositionModeEl) {
      focusPositionModeEl.hidden = true;
      focusPositionModeEl.disabled = true;
    }

    const shapeControlsEnabled = isEdit && isShapeTool;
    for (const control of [
      this.ui.shapeFillColorEl,
      this.ui.shapeStrokeColorEl,
      this.ui.shapeStrokeWidthEl,
      this.ui.shapeStrokeWidthValueEl,
      this.ui.shapeOpacityEl,
      this.ui.shapeOpacityValueEl,
      ...(this.ui.shapeTypeControlsEl?.querySelectorAll("[data-shape-type]") ?? []),
    ]) {
      if (control) control.disabled = !shapeControlsEnabled;
    }

    const buttonControlsEnabled = showButtonControls;
    for (const control of [
      this.ui.buttonFontSizeEl,
      this.ui.buttonFontSizeValueEl,
      this.ui.buttonTextColorEl,
      this.ui.buttonFillColorEl,
      this.ui.buttonStrokeColorEl,
      this.ui.buttonStrokeWidthEl,
      this.ui.buttonStrokeWidthValueEl,
      this.ui.buttonOpacityEl,
      this.ui.buttonOpacityValueEl,
      ...(this.ui.buttonTypeControlsEl?.querySelectorAll("[data-button-shape-type]") ?? []),
    ]) {
      control.disabled = !buttonControlsEnabled;
    }

    if (this.isBrushFamilyActive(activeToolId)) {
      this.queueBrushPanelPositionSync();
    }
    if (showButtonControls) {
      this.queueButtonPanelPositionSync();
    }
  }
}
