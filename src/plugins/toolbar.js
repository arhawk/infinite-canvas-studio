import { BaseCommand, BasePlugin } from "../core/baseClasses.js";
import {
  DEFAULT_SHAPE_FILL,
  DEFAULT_SHAPE_FILL_OPACITY,
  DEFAULT_SHAPE_FONT_SIZE,
  DEFAULT_SHAPE_STROKE,
  DEFAULT_SHAPE_TEXT_COLOR,
  SHAPE_TYPES,
  normalizeShapeType,
} from "../component/shapeModel.js";
import {
  applyShapeStyle,
  getShapeData,
} from "../component/shape.js";
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
import {
  DEFAULT_STICKY_FILL,
  DEFAULT_STICKY_FILL_OPACITY,
  DEFAULT_STICKY_FONT_SIZE,
  DEFAULT_STICKY_TEXT_COLOR,
  applyStickyStyle,
  getStickyData,
} from "../component/sticky.js";
import {
  ColorToolbarController,
  DEFAULT_COLOR_SWATCHES,
} from "../lib/colorToolbar.js";
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
const DEFAULT_SHAPE_PANEL_STATE = {
  shapeType: "rectangle",
  fill: DEFAULT_SHAPE_FILL,
  fillOpacity: DEFAULT_SHAPE_FILL_OPACITY,
  stroke: DEFAULT_SHAPE_STROKE,
  strokeWidth: 2,
  textColor: DEFAULT_SHAPE_TEXT_COLOR,
  fontSize: DEFAULT_SHAPE_FONT_SIZE,
};
const SHAPE_LAYER_ACTIONS = [
  {
    id: "bring-forward",
    label: "Bring Forward",
    run: "bringForward",
    canRun: "canBringForward",
  },
  {
    id: "bring-to-front",
    label: "Bring to Front",
    run: "bringToFront",
    canRun: "canBringToFront",
  },
  {
    id: "send-backward",
    label: "Send Backward",
    run: "sendBackward",
    canRun: "canSendBackward",
  },
  {
    id: "send-to-back",
    label: "Send to Back",
    run: "sendToBack",
    canRun: "canSendToBack",
  },
];
const SHAPE_PANEL_VIEWPORT_MARGIN = 12;
const SHAPE_PANEL_ANCHOR_GAP = 64;
const SHAPE_LAYER_CONTEXT_PENDING_MS = 800;
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
const DEFAULT_STICKY_PANEL_STATE = {
  fill: DEFAULT_STICKY_FILL,
  fillOpacity: DEFAULT_STICKY_FILL_OPACITY,
  textColor: DEFAULT_STICKY_TEXT_COLOR,
  fontSize: DEFAULT_STICKY_FONT_SIZE,
};
const BUTTON_PANEL_VIEWPORT_MARGIN = 12;
const BUTTON_PANEL_ANCHOR_GAP = 64;
const BUTTON_POPOVER_NODE_CLEARANCE = 10;
const BUTTON_STYLE_SWATCHES = DEFAULT_COLOR_SWATCHES;
const PRESENTATION_BRUSH_FAB_MARGIN = 20;
const PRESENTATION_BRUSH_FAB_SIZE = 56;
const PRESENTATION_BRUSH_DRAG_THRESHOLD = 4;
const PRESENTATION_BRUSH_PANEL_GAP = 12;
const PRESENTATION_BRUSH_PANEL_VIEWPORT_MARGIN = 12;

function resolveSelectable(target) {
  if (!target) return null;
  if (target.hasName?.("selectable")) return target;
  return target.findAncestor?.(".selectable", true) ?? null;
}

function getStagePointerFromNativeEvent(app, nativeEvent) {
  const stage = app?.stage;
  if (!stage || !nativeEvent) return null;

  if (typeof stage.setPointersPositions === "function") {
    stage.setPointersPositions(nativeEvent);
  }

  const pointer = stage.getPointerPosition?.() ?? null;
  if (pointer) return pointer;

  const rect = stage.container?.()?.getBoundingClientRect?.() ?? null;
  const { clientX, clientY } = nativeEvent;
  if (
    !rect ||
    !Number.isFinite(clientX) ||
    !Number.isFinite(clientY)
  ) {
    return null;
  }

  return {
    x: clientX - rect.left,
    y: clientY - rect.top,
  };
}

function resolveSelectableFromNativeEvent(app, nativeEvent) {
  const stage = app?.stage;
  const pointer = getStagePointerFromNativeEvent(app, nativeEvent);
  const intersection = pointer && typeof stage?.getIntersection === "function"
    ? stage.getIntersection(pointer)
    : null;
  return resolveSelectable(intersection);
}

function resolveSelectableFromStageEvent(app, event) {
  const directTarget = resolveSelectable(event?.target);
  if (directTarget) return directTarget;

  const stage = app?.stage;
  const nativeEvent = event?.evt;
  if (!stage || event?.target !== stage) return null;

  return resolveSelectableFromNativeEvent(app, nativeEvent);
}

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

  constructor(app, options) {
    super(app, options);
    // Create the timer button immediately so it can be passed to TimerPlugin
    // before app.start() calls onSetup() for all plugins.
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "presentation-brush-fab__tool";
    btn.setAttribute("aria-label", "Timer / Stopwatch");
    btn.setAttribute("aria-pressed", "false");
    btn.dataset.tooltip = "Timer";
    btn.dataset.testid = "presentation-tool-timer";
    btn.innerHTML = `<i data-lucide="timer" aria-hidden="true"></i>`;
    this.presentationTimerBtnEl = btn;

    // Create the calculator button immediately so it can be passed to BinaryCalculatorPlugin
    // before app.start() calls onSetup() for all plugins.
    const calcBtn = document.createElement("button");
    calcBtn.type = "button";
    calcBtn.className = "presentation-brush-fab__tool";
    calcBtn.setAttribute("aria-label", "Binary Calculator");
    calcBtn.setAttribute("aria-pressed", "false");
    calcBtn.dataset.tooltip = "Binary Calculator";
    calcBtn.dataset.testid = "presentation-tool-calculator";
    calcBtn.innerHTML = `<i data-lucide="calculator" aria-hidden="true"></i>`;
    this.presentationCalculatorBtnEl = calcBtn;

    // Create the reactions button immediately so it can be passed to EmojiReactionsPlugin
    // before app.start() calls onSetup() for all plugins.
    const reactBtn = document.createElement("button");
    reactBtn.type = "button";
    reactBtn.className = "presentation-brush-fab__tool";
    reactBtn.setAttribute("aria-label", "Emoji Reactions");
    reactBtn.setAttribute("aria-pressed", "false");
    reactBtn.dataset.tooltip = "Reactions";
    reactBtn.dataset.testid = "presentation-tool-reactions";
    reactBtn.innerHTML = `<i data-lucide="smile-plus" aria-hidden="true"></i>`;
    reactBtn.hidden = true;
    this.presentationReactionsBtnEl = reactBtn;
  }

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
      shapePanelEl,
      shapePanelTypeControlsEl,
      shapeFontSizeEl,
      shapeFontSizeValueEl,
      shapeTextColorEl,
      shapeFillColorEl,
      shapeOpacityEl,
      shapeOpacityValueEl,
      shapeStrokeColorEl,
      shapeStrokeWidthEl,
      shapeStrokeWidthValueEl,
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
      stickyPanelEl,
      stickyFontSizeEl,
      stickyFontSizeValueEl,
      stickyTextColorEl,
      stickyFillColorEl,
      stickyOpacityEl,
      stickyOpacityValueEl,
    } = this.options;

    this.ui = {
      presentationToolbarHoverZoneEl,
      modeCapsuleEditEl,
      modeCapsulePresentEl,
      drawingVisibilityToggleEl,
      saveFocusEl,
      focusPositionModeEl,
      shapePanelEl,
      shapePanelTypeControlsEl,
      shapeFontSizeEl,
      shapeFontSizeValueEl,
      shapeTextColorEl,
      shapeFillColorEl,
      shapeOpacityEl,
      shapeOpacityValueEl,
      shapeStrokeColorEl,
      shapeStrokeWidthEl,
      shapeStrokeWidthValueEl,
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
      stickyPanelEl,
      stickyFontSizeEl,
      stickyFontSizeValueEl,
      stickyTextColorEl,
      stickyFillColorEl,
      stickyOpacityEl,
      stickyOpacityValueEl,
    };
    this.floatingToolbar = this.app.floatingToolbar ?? null;
    this.pendingShapeLayerContextMenu = null;
    this.pendingButtonLayerContextMenu = null;
    this.pendingStickyLayerContextMenu = null;

    if (!this.floatingToolbar && buttonControlsEl?.parentElement && buttonControlsEl.parentElement !== document.body) {
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
    if (!this.floatingToolbar && shapePanelEl?.parentElement && shapePanelEl.parentElement !== document.body) {
      const originalParent = shapePanelEl.parentElement;
      const originalNextSibling = shapePanelEl.nextSibling;
      document.body.append(shapePanelEl);
      this.cleanups.push(() => {
        if (!shapePanelEl.isConnected) return;
        if (originalNextSibling?.parentElement === originalParent) {
          originalParent.insertBefore(shapePanelEl, originalNextSibling);
        } else {
          originalParent.append(shapePanelEl);
        }
      });
    }
    if (!this.floatingToolbar && stickyPanelEl?.parentElement && stickyPanelEl.parentElement !== document.body) {
      const originalParent = stickyPanelEl.parentElement;
      const originalNextSibling = stickyPanelEl.nextSibling;
      document.body.append(stickyPanelEl);
      this.cleanups.push(() => {
        if (!stickyPanelEl.isConnected) return;
        if (originalNextSibling?.parentElement === originalParent) {
          originalParent.insertBefore(stickyPanelEl, originalNextSibling);
        } else {
          originalParent.append(stickyPanelEl);
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
    this.presentationBrushFabDock = null;
    this.presentationBrushFabDrag = null;
    this.presentationBrushMenuOpen = false;
    this.suppressPresentationBrushFabClick = false;
    this.eraserPanelOpen = false;
    this.activeEraserAnchorEl = null;
    this.lastBrushToolId = "pen";
    this.drawingToolState = cloneDrawingToolState();
    this.eraserState = { ...DEFAULT_ERASER_STATE };
    this.shapeToolState = { ...DEFAULT_SHAPE_TOOL_STATE };
    this.buttonPanelState = { ...DEFAULT_BUTTON_PANEL_STATE };
    this.shapePanelState = { ...DEFAULT_SHAPE_PANEL_STATE };
    this.stickyPanelState = { ...DEFAULT_STICKY_PANEL_STATE };
    this.selectedNodes = [];
    this.selectedButtonNode = null;
    this.selectedShapeNode = null;
    this.selectedStickyNode = null;
    this.shapePanelPositionFrame = null;
    this.setupColorToolbarControllers();
    this.registerFloatingPanels();

    this.buildPresentationBrushFab();
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
    for (const button of (shapePanelTypeControlsEl?.querySelectorAll("[data-shape-type]") ?? [])) {
      this.listenDom(button, "click", () => {
        this.shapePanelState.shapeType = normalizeShapeType(button.dataset.shapeType);
        this.syncShapePanelTypeControls();
        this.emitShapePanelChange();
      });
    }
    if (shapeFontSizeEl) {
      this.listenDom(shapeFontSizeEl, "input", () => this.emitShapePanelChange());
    }
    if (shapeTextColorEl) {
      this.listenDom(shapeTextColorEl, "input", () => {
        this.shapeColorToolbar?.recordCustomColor("text", shapeTextColorEl.value);
        this.emitShapePanelChange();
      });
    }
    if (shapeFillColorEl) {
      this.listenDom(shapeFillColorEl, "input", () => {
        this.shapeColorToolbar?.recordCustomColor("fill", shapeFillColorEl.value);
        this.emitShapePanelChange();
      });
    }
    if (shapeOpacityEl) {
      this.listenDom(shapeOpacityEl, "input", () => this.emitShapePanelChange());
    }
    if (shapeStrokeColorEl) {
      this.listenDom(shapeStrokeColorEl, "input", () => {
        this.shapeColorToolbar?.recordCustomColor("border", shapeStrokeColorEl.value);
        this.emitShapePanelChange();
      });
    }
    if (shapeStrokeWidthEl) {
      this.listenDom(shapeStrokeWidthEl, "input", () => this.emitShapePanelChange());
    }
    const shapeConnectTriggerEl = shapePanelEl?.querySelector("#shape-connect-trigger") ?? null;
    if (shapeConnectTriggerEl) {
      this.listenDom(shapeConnectTriggerEl, "click", () => this.startShapeConnection());
    }
    const shapeLayerTriggerEl = shapePanelEl?.querySelector("#shape-layer-menu-trigger") ?? null;
    if (shapeLayerTriggerEl) {
      let closeShapeLayerMenuOnClick = false;
      this.listenDom(shapeLayerTriggerEl, "pointerdown", (event) => {
        closeShapeLayerMenuOnClick = this.isShapeLayerMenuOpen();
        if (closeShapeLayerMenuOnClick) {
          event.preventDefault();
        } else {
          this.clearShapeLayerContextPosition();
        }
      });
      this.listenDom(shapeLayerTriggerEl, "click", (event) => {
        if (!closeShapeLayerMenuOnClick) return;

        event.preventDefault();
        closeShapeLayerMenuOnClick = false;
        this.closeShapeLayerMenu();
      });
    }
    for (const button of (shapePanelEl?.querySelectorAll("[data-shape-layer-action]") ?? [])) {
      this.listenDom(button, "click", () => {
        this.runShapeLayerAction(button.dataset.shapeLayerAction);
        button.blur();
      });
    }
    if (shapePanelEl) {
      this.app.stage?.on?.("contextmenu.shapeLayerMenu mousedown.shapeLayerMenu", (event) => {
        this.handleShapeLayerContextMenu(event);
      });
      const captureOptions = { capture: true };
      this.listenDom(document, "contextmenu", (event) => {
        this.handleShapeLayerNativeContextMenu(event);
      }, captureOptions);
      this.listenDom(document, "mousedown", (event) => {
        this.handleShapeLayerNativeContextMenu(event);
      }, captureOptions);
      this.listenDom(shapePanelEl, "focusin", () => {
        this.syncShapePopoverOpenState();
        this.queueShapePanelPositionSync();
      });
      this.listenDom(shapePanelEl, "focusout", () => {
        window.setTimeout(() => {
          this.syncShapePopoverOpenState();
          if (!shapePanelEl.querySelector(".toolbar__shape-layer-tool:focus-within")) {
            this.clearShapeLayerContextPosition();
          }
          this.queueShapePanelPositionSync();
        }, 0);
      });
      this.listenDom(shapePanelEl, "pointerdown", () => {
        window.requestAnimationFrame(() => {
          this.syncShapePopoverOpenState();
          this.queueShapePanelPositionSync();
        });
      }, true);
    }
    if (stickyPanelEl) {
      this.app.stage?.on?.("contextmenu.stickyLayerMenu mousedown.stickyLayerMenu", (event) => {
        this.handleStickyLayerContextMenu(event);
      });
      const captureOptions = { capture: true };
      this.listenDom(document, "contextmenu", (event) => {
        this.handleStickyLayerNativeContextMenu(event);
      }, captureOptions);
      this.listenDom(document, "mousedown", (event) => {
        this.handleStickyLayerNativeContextMenu(event);
      }, captureOptions);
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
      this.queueShapePanelPositionSync();
      this.queueStickyPanelPositionSync();
      this.queuePresentationBrushFabPositionSync();
    });
    this.listenDom(buttonFontSizeEl, "input", () => this.emitButtonStyleChange());
    this.listenDom(buttonTextColorEl, "input", () => {
      this.buttonColorToolbar?.recordCustomColor("text", buttonTextColorEl.value);
      this.emitButtonStyleChange();
    });
    this.listenDom(buttonFillColorEl, "input", () => {
      this.buttonColorToolbar?.recordCustomColor("fill", buttonFillColorEl.value);
      this.emitButtonStyleChange();
    });
    this.listenDom(buttonStrokeColorEl, "input", () => {
      this.buttonColorToolbar?.recordCustomColor("border", buttonStrokeColorEl.value);
      this.emitButtonStyleChange();
    });
    this.listenDom(buttonStrokeWidthEl, "input", () => this.emitButtonStyleChange());
    this.listenDom(buttonOpacityEl, "input", () => this.emitButtonStyleChange());
    const buttonConnectTriggerEl = buttonControlsEl?.querySelector("#button-connect-trigger") ?? null;
    if (buttonConnectTriggerEl) {
      this.listenDom(buttonConnectTriggerEl, "click", () => this.startButtonConnection());
    }
    const buttonLayerTriggerEl = buttonControlsEl?.querySelector("#button-layer-menu-trigger") ?? null;
    if (buttonLayerTriggerEl) {
      let closeButtonLayerMenuOnClick = false;
      this.listenDom(buttonLayerTriggerEl, "pointerdown", (event) => {
        closeButtonLayerMenuOnClick = this.isButtonLayerMenuOpen();
        if (closeButtonLayerMenuOnClick) {
          event.preventDefault();
        } else {
          this.clearButtonLayerContextPosition();
        }
      });
      this.listenDom(buttonLayerTriggerEl, "click", (event) => {
        if (!closeButtonLayerMenuOnClick) return;

        event.preventDefault();
        closeButtonLayerMenuOnClick = false;
        this.closeButtonLayerMenu();
      });
    }
    for (const button of (buttonControlsEl?.querySelectorAll("[data-button-layer-action]") ?? [])) {
      this.listenDom(button, "click", () => {
        this.runButtonLayerAction(button.dataset.buttonLayerAction);
        button.blur();
      });
    }
    if (buttonControlsEl) {
      this.app.stage?.on?.("contextmenu.buttonLayerMenu mousedown.buttonLayerMenu", (event) => {
        this.handleButtonLayerContextMenu(event);
      });
      const captureOptions = { capture: true };
      this.listenDom(document, "contextmenu", (event) => {
        this.handleButtonLayerNativeContextMenu(event);
      }, captureOptions);
      this.listenDom(document, "mousedown", (event) => {
        this.handleButtonLayerNativeContextMenu(event);
      }, captureOptions);
    }
    if (stickyFontSizeEl) {
      this.listenDom(stickyFontSizeEl, "input", () => this.emitStickyStyleChange());
    }
    if (stickyTextColorEl) {
      this.listenDom(stickyTextColorEl, "input", () => {
        this.stickyColorToolbar?.recordCustomColor("text", stickyTextColorEl.value);
        this.emitStickyStyleChange();
      });
    }
    if (stickyFillColorEl) {
      this.listenDom(stickyFillColorEl, "input", () => {
        this.stickyColorToolbar?.recordCustomColor("fill", stickyFillColorEl.value);
        this.emitStickyStyleChange();
      });
    }
    if (stickyOpacityEl) {
      this.listenDom(stickyOpacityEl, "input", () => this.emitStickyStyleChange());
    }
    const stickyConnectTriggerEl = stickyPanelEl?.querySelector("#sticky-connect-trigger") ?? null;
    if (stickyConnectTriggerEl) {
      this.listenDom(stickyConnectTriggerEl, "click", () => this.startStickyConnection());
    }
    const stickyLayerTriggerEl = stickyPanelEl?.querySelector("#sticky-layer-menu-trigger") ?? null;
    if (stickyLayerTriggerEl) {
      let closeStickyLayerMenuOnClick = false;
      this.listenDom(stickyLayerTriggerEl, "pointerdown", (event) => {
        closeStickyLayerMenuOnClick = this.isStickyLayerMenuOpen();
        if (closeStickyLayerMenuOnClick) {
          event.preventDefault();
        } else {
          this.clearStickyLayerContextPosition();
        }
      });
      this.listenDom(stickyLayerTriggerEl, "click", (event) => {
        if (!closeStickyLayerMenuOnClick) return;

        event.preventDefault();
        closeStickyLayerMenuOnClick = false;
        this.closeStickyLayerMenu();
      });
    }
    for (const button of (stickyPanelEl?.querySelectorAll("[data-sticky-layer-action]") ?? [])) {
      this.listenDom(button, "click", () => {
        this.runStickyLayerAction(button.dataset.stickyLayerAction);
        button.blur();
      });
    }
    if (stickyPanelEl) {
      this.listenDom(stickyPanelEl, "focusin", () => {
        this.syncStickyPopoverOpenState();
        this.queueStickyPanelPositionSync();
      });
      this.listenDom(stickyPanelEl, "focusout", () => {
        window.setTimeout(() => {
          this.syncStickyPopoverOpenState();
          if (!stickyPanelEl.querySelector(".toolbar__sticky-layer-tool:focus-within")) {
            this.clearStickyLayerContextPosition();
          }
          this.queueStickyPanelPositionSync();
        }, 0);
      });
      this.listenDom(stickyPanelEl, "pointerdown", () => {
        window.requestAnimationFrame(() => {
          this.syncStickyPopoverOpenState();
          this.queueStickyPanelPositionSync();
        });
      }, true);
    }
    if (buttonControlsEl) {
      this.listenDom(buttonControlsEl, "focusin", () => {
        this.syncButtonPopoverOpenState();
        this.queueButtonPanelPositionSync();
      });
      this.listenDom(buttonControlsEl, "focusout", () => {
        window.setTimeout(() => {
          this.syncButtonPopoverOpenState();
          if (!buttonControlsEl.querySelector(".toolbar__button-layer-tool:focus-within")) {
            this.clearButtonLayerContextPosition();
          }
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
    this.setupStickyStyleSwatches();
    this.setupStickyCustomColorPickers();
    this.listenDom(document, "pointerdown", (event) => {
      if (!this.buttonColorToolbar?.activeTarget) return;
      if (this.buttonColorToolbar.containsActiveTarget(event.target)) return;
      this.buttonColorToolbar.closeActive();
    }, true);
    this.listenDom(document, "pointerdown", (event) => {
      if (!this.shapeColorToolbar?.activeTarget) return;
      if (this.shapeColorToolbar.containsActiveTarget(event.target)) return;
      this.shapeColorToolbar.closeActive();
    }, true);
    this.listenDom(document, "pointerdown", (event) => {
      if (!this.stickyColorToolbar?.activeTarget) return;
      if (this.stickyColorToolbar.containsActiveTarget(event.target)) return;
      this.stickyColorToolbar.closeActive();
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
      this.selectedShapeNode =
        nodes.length === 1 && nodes[0]?.getAttr?.("componentType") === "shape"
          ? nodes[0]
          : null;
      this.selectedStickyNode =
        nodes.length === 1 && nodes[0]?.getAttr?.("componentType") === "sticky"
          ? nodes[0]
          : null;
      this.loadButtonUiFromSelection();
      this.loadShapeUiFromSelection();
      this.loadStickyUiFromSelection();
      this.syncUi();
    });
    this.listen("viewport:change", () => {
      this.queueButtonPanelPositionSync();
      this.queueShapePanelPositionSync();
      this.queueStickyPanelPositionSync();
    });
    this.listen("node:changing", ({ node } = {}) => {
      if (this.isSelectedButtonAffectedByNode(node)) {
        this.queueButtonPanelPositionSync();
      }
      if (this.isSelectedShapeAffectedByNode(node)) {
        this.queueShapePanelPositionSync();
      }
      if (this.isSelectedStickyAffectedByNode(node)) {
        this.queueStickyPanelPositionSync();
      }
    });
    this.listen("node:changed", ({ node } = {}) => {
      if (this.isSelectedButtonAffectedByNode(node)) {
        if (node === this.selectedButtonNode) {
          this.loadButtonUiFromSelection();
        }
        this.syncUi();
      }
      if (node === this.selectedShapeNode) {
        this.loadShapeUiFromSelection();
        this.queueShapePanelPositionSync();
      } else if (this.isSelectedShapeAffectedByNode(node)) {
        this.queueShapePanelPositionSync();
      }
      if (node === this.selectedStickyNode) {
        this.loadStickyUiFromSelection();
        this.syncUi();
      } else if (this.isSelectedStickyAffectedByNode(node)) {
        this.queueStickyPanelPositionSync();
      }
    });
    this.listen("draw:added", () => this.syncUi());
    this.listen("draw:removed", () => this.syncUi());

    this.setupModeToggle();
    this.setupPresentationToolbarAutoHide();
    this.renderToolButtons();
    this.setupShapeStyleSwatches();
    this.setupShapeCustomColorPickers();
    this.loadShapeUi();
    this.syncDrawingUiToActiveTool();
    this.loadButtonUiFromSelection();
    this.loadShapeUiFromSelection();
    this.loadStickyUiFromSelection();
    this.emitStrokeChange("pen");
    this.emitShapeStyleChange();
    this.syncUi();

    this.cleanups.push(() => {
      this.app.stage?.off?.(".shapeLayerMenu");
      this.app.stage?.off?.(".stickyLayerMenu");
      this.app.keybindings.unregister("Mod+Shift+F");
      if (this.brushPanelPositionFrame != null) {
        window.cancelAnimationFrame(this.brushPanelPositionFrame);
        this.brushPanelPositionFrame = null;
      }
      if (this.buttonPanelPositionFrame != null) {
        window.cancelAnimationFrame(this.buttonPanelPositionFrame);
        this.buttonPanelPositionFrame = null;
      }
      if (this.shapePanelPositionFrame != null) {
        window.cancelAnimationFrame(this.shapePanelPositionFrame);
        this.shapePanelPositionFrame = null;
      }
      this.clearPresentationToolbarHideTimer();
      if (this.presentationToolbarAnimationFrame != null) {
        window.cancelAnimationFrame(this.presentationToolbarAnimationFrame);
        this.presentationToolbarAnimationFrame = null;
      }
      this.presentationBrushFabEl?.remove();
      this.eraserPanelEl?.remove();
    });
  }

  registerFloatingPanels() {
    if (!this.floatingToolbar) return;

    const popoverConfig = {
      nodeClearance: BUTTON_POPOVER_NODE_CLEARANCE,
    };

    if (this.ui.shapePanelEl) {
      this.floatingToolbar.registerPanel({
        id: "shape-panel",
        element: this.ui.shapePanelEl,
        getAnchorNode: () => this.selectedShapeNode,
        viewportMargin: SHAPE_PANEL_VIEWPORT_MARGIN,
        anchorGap: SHAPE_PANEL_ANCHOR_GAP,
        popover: popoverConfig,
      });
      this.cleanups.push(() => this.floatingToolbar?.unregisterPanel("shape-panel"));

      for (const button of (this.ui.shapePanelTypeControlsEl?.querySelectorAll("[data-shape-type]") ?? [])) {
        this.floatingToolbar.registerButton("shape-panel", button.dataset.shapeType, button);
      }
      for (const button of (this.ui.shapePanelEl.querySelectorAll("[data-shape-layer-action]") ?? [])) {
        this.floatingToolbar.registerButton(
          "shape-panel",
          `layer:${button.dataset.shapeLayerAction}`,
          button,
        );
      }
      const connectButton = this.ui.shapePanelEl.querySelector("#shape-connect-trigger");
      if (connectButton) {
        this.floatingToolbar.registerButton("shape-panel", "connect", connectButton);
      }
    }

    if (this.ui.buttonControlsEl) {
      this.floatingToolbar.registerPanel({
        id: "button-panel",
        element: this.ui.buttonControlsEl,
        getAnchorNode: () => this.selectedButtonNode,
        getAnchorRect: (node) => {
          const anchorNode = node?.findOne?.(".button-bg") ?? node;
          return anchorNode?.getClientRect?.({ relativeTo: this.app.stage }) ?? null;
        },
        viewportMargin: BUTTON_PANEL_VIEWPORT_MARGIN,
        anchorGap: BUTTON_PANEL_ANCHOR_GAP,
        popover: popoverConfig,
      });
      this.cleanups.push(() => this.floatingToolbar?.unregisterPanel("button-panel"));

      for (const button of (this.ui.buttonTypeControlsEl?.querySelectorAll("[data-button-shape-type]") ?? [])) {
        this.floatingToolbar.registerButton("button-panel", button.dataset.buttonShapeType, button);
      }
      for (const button of (this.ui.buttonControlsEl.querySelectorAll("[data-button-layer-action]") ?? [])) {
        this.floatingToolbar.registerButton(
          "button-panel",
          `layer:${button.dataset.buttonLayerAction}`,
          button,
        );
      }
      const connectButton = this.ui.buttonControlsEl.querySelector("#button-connect-trigger");
      if (connectButton) {
        this.floatingToolbar.registerButton("button-panel", "connect", connectButton);
      }
    }

    if (this.ui.stickyPanelEl) {
      this.floatingToolbar.registerPanel({
        id: "sticky-panel",
        element: this.ui.stickyPanelEl,
        getAnchorNode: () => this.selectedStickyNode,
        getAnchorRect: (node) => {
          const anchorNode = node?.findOne?.(".sticky-bg") ?? node;
          return anchorNode?.getClientRect?.({ relativeTo: this.app.stage }) ?? null;
        },
        viewportMargin: BUTTON_PANEL_VIEWPORT_MARGIN,
        anchorGap: BUTTON_PANEL_ANCHOR_GAP,
        popover: popoverConfig,
      });
      this.cleanups.push(() => this.floatingToolbar?.unregisterPanel("sticky-panel"));

      for (const button of (this.ui.stickyPanelEl.querySelectorAll("[data-sticky-layer-action]") ?? [])) {
        this.floatingToolbar.registerButton(
          "sticky-panel",
          `layer:${button.dataset.stickyLayerAction}`,
          button,
        );
      }
      const connectButton = this.ui.stickyPanelEl.querySelector("#sticky-connect-trigger");
      if (connectButton) {
        this.floatingToolbar.registerButton("sticky-panel", "connect", connectButton);
      }
    }
  }

  setupColorToolbarControllers() {
    const withoutTransparent = BUTTON_STYLE_SWATCHES.filter((color) => color !== "transparent");
    const listenDom = (...args) => this.listenDom(...args);

    this.shapeColorToolbar = new ColorToolbarController({
      listenDom,
      renderIcons,
      targets: {
        text: {
          input: this.ui.shapeTextColorEl,
          swatchesEl: this.ui.shapePanelEl?.querySelector?.("#shape-text-swatches") ?? null,
          label: "Text color",
          baseColors: withoutTransparent,
          onChange: () => this.emitShapePanelChange(),
        },
        fill: {
          input: this.ui.shapeFillColorEl,
          swatchesEl: this.ui.shapePanelEl?.querySelector?.("#shape-fill-swatches") ?? null,
          label: "Fill color",
          baseColors: BUTTON_STYLE_SWATCHES,
          onChange: () => this.emitShapePanelChange(),
          onSwatch: (color, { input }) => {
            if (!input || !this.ui.shapeOpacityEl) return;
            if (color === "transparent") {
              this.ui.shapeOpacityEl.value = "0";
            } else {
              input.value = color;
              if (Number(this.ui.shapeOpacityEl.value) === 0) {
                this.ui.shapeOpacityEl.value = "1";
              }
            }
            this.emitShapePanelChange();
          },
        },
        border: {
          input: this.ui.shapeStrokeColorEl,
          swatchesEl: this.ui.shapePanelEl?.querySelector?.("#shape-border-swatches") ?? null,
          label: "Border color",
          baseColors: BUTTON_STYLE_SWATCHES,
          onChange: () => this.emitShapePanelChange(),
          onSwatch: (color, { input }) => {
            if (!input || !this.ui.shapeStrokeWidthEl) return;
            if (color === "transparent") {
              this.ui.shapeStrokeWidthEl.value = "0";
            } else {
              input.value = color;
              if (Number(this.ui.shapeStrokeWidthEl.value) === 0) {
                this.ui.shapeStrokeWidthEl.value = "2";
              }
            }
            this.emitShapePanelChange();
          },
        },
      },
    });

    this.buttonColorToolbar = new ColorToolbarController({
      listenDom,
      renderIcons,
      targets: {
        text: {
          input: this.ui.buttonTextColorEl,
          swatchesEl: this.ui.buttonControlsEl?.querySelector?.("#button-text-swatches") ?? null,
          label: "Text color",
          baseColors: withoutTransparent,
          onChange: () => this.emitButtonStyleChange(),
        },
        fill: {
          input: this.ui.buttonFillColorEl,
          swatchesEl: this.ui.buttonControlsEl?.querySelector?.("#button-fill-swatches") ?? null,
          label: "Fill color",
          baseColors: BUTTON_STYLE_SWATCHES,
          onChange: () => this.emitButtonStyleChange(),
          onSwatch: (color, { input }) => {
            if (!input || !this.ui.buttonOpacityEl) return;
            if (color === "transparent") {
              this.ui.buttonOpacityEl.value = "0";
            } else {
              input.value = color;
              if (Number(this.ui.buttonOpacityEl.value) === 0) {
                this.ui.buttonOpacityEl.value = "1";
              }
            }
            this.emitButtonStyleChange();
          },
        },
        border: {
          input: this.ui.buttonStrokeColorEl,
          swatchesEl: this.ui.buttonControlsEl?.querySelector?.("#button-border-swatches") ?? null,
          label: "Border color",
          baseColors: BUTTON_STYLE_SWATCHES,
          onChange: () => this.emitButtonStyleChange(),
          onSwatch: (color, { input }) => {
            if (!input || !this.ui.buttonStrokeWidthEl) return;
            if (color === "transparent") {
              this.ui.buttonStrokeWidthEl.value = "0";
            } else {
              input.value = color;
              if (Number(this.ui.buttonStrokeWidthEl.value) === 0) {
                this.ui.buttonStrokeWidthEl.value = String(DEFAULT_BUTTON_STROKE_WIDTH);
              }
            }
            this.emitButtonStyleChange();
          },
        },
      },
    });

    this.stickyColorToolbar = new ColorToolbarController({
      listenDom,
      renderIcons,
      targets: {
        text: {
          input: this.ui.stickyTextColorEl,
          swatchesEl: this.ui.stickyPanelEl?.querySelector?.("#sticky-text-swatches") ?? null,
          label: "Text color",
          baseColors: withoutTransparent,
          onChange: () => this.emitStickyStyleChange(),
        },
        fill: {
          input: this.ui.stickyFillColorEl,
          swatchesEl: this.ui.stickyPanelEl?.querySelector?.("#sticky-fill-swatches") ?? null,
          label: "Fill color",
          baseColors: BUTTON_STYLE_SWATCHES,
          onChange: () => this.emitStickyStyleChange(),
          onSwatch: (color, { input }) => {
            if (!input || !this.ui.stickyOpacityEl) return;
            if (color === "transparent") {
              this.ui.stickyOpacityEl.value = "0";
            } else {
              input.value = color;
              if (Number(this.ui.stickyOpacityEl.value) === 0) {
                this.ui.stickyOpacityEl.value = "1";
              }
            }
            this.emitStickyStyleChange();
          },
        },
      },
    });
  }

  buildPresentationBrushFab() {
    const shell = document.querySelector(".app-shell");
    if (!shell) return;

    const root = document.createElement("div");
    root.className = "presentation-brush-fab";
    root.dataset.testid = "presentation-brush-fab-shell";
    root.hidden = true;

    const panel = document.createElement("div");
    panel.className = "presentation-brush-fab__panel";
    panel.dataset.testid = "presentation-brush-panel";
    panel.hidden = true;

    const createToolButton = (icon, label, testid) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "presentation-brush-fab__tool";
      button.setAttribute("aria-label", label);
      button.dataset.tooltip = label;
      button.dataset.testid = testid;
      button.setAttribute("aria-pressed", "false");
      button.innerHTML = `<i data-lucide="${icon}" aria-hidden="true"></i>`;
      return button;
    };

    this.presentationArrangeBtnEl = createToolButton("mouse-pointer-2", "Pointer", "presentation-tool-arrange");
    this.presentationBrushBtnEl = createToolButton("pen", "Pen", "presentation-tool-brush");
    this.presentationEraserBtnEl = createToolButton("eraser", "Eraser", "presentation-tool-eraser");
    // presentationTimerBtnEl was created in the constructor so TimerPlugin can receive it
    // before app.start() is called; just append it here.
    const cancelBtn = createToolButton("x", "Close", "presentation-tool-cancel");
    cancelBtn.removeAttribute("aria-pressed");

    panel.append(
      this.presentationArrangeBtnEl,
      this.presentationBrushBtnEl,
      this.presentationEraserBtnEl,
      this.presentationTimerBtnEl,
      this.presentationCalculatorBtnEl,
      this.presentationReactionsBtnEl,
      cancelBtn,
    );

    const fabButton = document.createElement("button");
    fabButton.type = "button";
    fabButton.className = "presentation-brush-fab__ball";
    fabButton.dataset.testid = "presentation-brush-fab";
    fabButton.setAttribute("aria-label", "Tool Ball");
    fabButton.dataset.tooltip = "Tool Ball";
    fabButton.setAttribute("aria-expanded", "false");
    fabButton.innerHTML = `<svg class="fab-cat-svg" viewBox="-58 -58 116 116" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <defs>
    <mask id="fab-cat-mask" maskUnits="userSpaceOnUse" x="-55" y="-55" width="110" height="110">
      <rect x="-55" y="-55" width="110" height="110" fill="white"/>
      <path d="M -34,-26 Q -32,-44 -20,-44 Q -14,-44 -14,-26 Q -10,-14 0,-14 Q 10,-14 14,-26 Q 14,-44 20,-44 Q 32,-44 34,-26 Q 38,-4 36,16 Q 32,30 16,40 Q 0,44 -16,40 Q -32,30 -36,16 Q -38,-4 -34,-26 Z" fill="black"/>
      <line x1="-32" y1="-1" x2="-52" y2="-6" stroke="black" stroke-width="3" stroke-linecap="round"/>
      <line x1="-34" y1="8" x2="-52" y2="8" stroke="black" stroke-width="3" stroke-linecap="round"/>
      <line x1="-32" y1="16" x2="-50" y2="21" stroke="black" stroke-width="3" stroke-linecap="round"/>
      <line x1="32" y1="-1" x2="52" y2="-6" stroke="black" stroke-width="3" stroke-linecap="round"/>
      <line x1="34" y1="8" x2="52" y2="8" stroke="black" stroke-width="3" stroke-linecap="round"/>
      <line x1="32" y1="16" x2="50" y2="21" stroke="black" stroke-width="3" stroke-linecap="round"/>
    </mask>
  </defs>
  <circle class="mimi-circle" cx="0" cy="0" r="55" mask="url(#fab-cat-mask)"/>
</svg>`;

    root.append(panel, fabButton);
    shell.append(root);

    this.presentationBrushFabEl = root;
    this.presentationBrushPanelEl = panel;
    this.presentationBrushFabButtonEl = fabButton;

    this.listenDom(fabButton, "pointerdown", (event) => {
      this.handlePresentationBrushFabPointerDown(event);
    });
    this.listenDom(fabButton, "click", () => {
      if (this.suppressPresentationBrushFabClick) {
        this.suppressPresentationBrushFabClick = false;
        return;
      }
      this.togglePresentationBrushMenu();
    });
    this.listenDom(this.presentationArrangeBtnEl, "click", () => {
      this.closePresentationBrushMenu();
      this.app.setEditorTool("arrange");
    });
    this.listenDom(this.presentationBrushBtnEl, "click", (event) => {
      event.stopPropagation();
      this.togglePresentationBrushDropdown();
    });
    this.listenDom(this.presentationEraserBtnEl, "click", (event) => {
      event.stopPropagation();
      this.togglePresentationEraserPanel();
    });
    this.listenDom(cancelBtn, "click", () => {
      this.closePresentationBrushMenu();
    });
    this.listenDom(document, "pointermove", (event) => {
      this.handlePresentationBrushFabPointerMove(event);
    }, true);
    this.listenDom(document, "pointerup", (event) => {
      this.handlePresentationBrushFabPointerUp(event);
    }, true);
    this.listenDom(document, "pointercancel", () => {
      this.cancelPresentationBrushFabDrag();
    }, true);

    renderIcons(root, {
      width: 18,
      height: 18,
      "stroke-width": 2,
    });
  }

  getPresentationBrushFabViewportBounds() {
    return {
      minX: PRESENTATION_BRUSH_FAB_MARGIN,
      maxX: Math.max(
        PRESENTATION_BRUSH_FAB_MARGIN,
        window.innerWidth - PRESENTATION_BRUSH_FAB_SIZE - PRESENTATION_BRUSH_FAB_MARGIN,
      ),
      minY: PRESENTATION_BRUSH_FAB_MARGIN,
      maxY: Math.max(
        PRESENTATION_BRUSH_FAB_MARGIN,
        window.innerHeight - PRESENTATION_BRUSH_FAB_SIZE - PRESENTATION_BRUSH_FAB_MARGIN,
      ),
    };
  }

  getDefaultPresentationBrushFabDock() {
    return {
      edge: "left",
      offset: this.getPresentationBrushFabViewportBounds().maxY,
    };
  }

  clampPresentationBrushFabPosition(position = null) {
    const fallback = this.resolvePresentationBrushFabDockPosition(
      this.presentationBrushFabDock ?? this.getDefaultPresentationBrushFabDock(),
    );
    const nextPosition = position ?? fallback;
    const bounds = this.getPresentationBrushFabViewportBounds();
    return {
      x: clamp(
        Number.isFinite(nextPosition.x) ? nextPosition.x : fallback.x,
        bounds.minX,
        bounds.maxX,
      ),
      y: clamp(
        Number.isFinite(nextPosition.y) ? nextPosition.y : fallback.y,
        bounds.minY,
        bounds.maxY,
      ),
    };
  }

  clampPresentationBrushFabDock(dock = this.presentationBrushFabDock) {
    const fallback = this.getDefaultPresentationBrushFabDock();
    const nextDock = dock ?? fallback;
    const bounds = this.getPresentationBrushFabViewportBounds();
    const edge = ["left", "right", "top", "bottom"].includes(nextDock.edge)
      ? nextDock.edge
      : fallback.edge;
    const usesVerticalOffset = edge === "left" || edge === "right";
    return {
      edge,
      offset: clamp(
        Number.isFinite(nextDock.offset) ? nextDock.offset : fallback.offset,
        usesVerticalOffset ? bounds.minY : bounds.minX,
        usesVerticalOffset ? bounds.maxY : bounds.maxX,
      ),
    };
  }

  resolvePresentationBrushFabDockPosition(dock = this.presentationBrushFabDock) {
    const nextDock = this.clampPresentationBrushFabDock(dock);
    const bounds = this.getPresentationBrushFabViewportBounds();

    switch (nextDock.edge) {
      case "right":
        return {
          x: bounds.maxX,
          y: nextDock.offset,
        };
      case "top":
        return {
          x: nextDock.offset,
          y: bounds.minY,
        };
      case "bottom":
        return {
          x: nextDock.offset,
          y: bounds.maxY,
        };
      case "left":
      default:
        return {
          x: bounds.minX,
          y: nextDock.offset,
        };
    }
  }

  getPresentationBrushFabDockFromPosition(position = null) {
    const nextPosition = this.clampPresentationBrushFabPosition(position);
    const bounds = this.getPresentationBrushFabViewportBounds();
    const distances = [
      { edge: "left", distance: Math.abs(nextPosition.x - bounds.minX), offset: nextPosition.y },
      { edge: "right", distance: Math.abs(nextPosition.x - bounds.maxX), offset: nextPosition.y },
      { edge: "top", distance: Math.abs(nextPosition.y - bounds.minY), offset: nextPosition.x },
      { edge: "bottom", distance: Math.abs(nextPosition.y - bounds.maxY), offset: nextPosition.x },
    ];
    distances.sort((a, b) => a.distance - b.distance);
    return this.clampPresentationBrushFabDock({
      edge: distances[0]?.edge,
      offset: distances[0]?.offset,
    });
  }

  queuePresentationBrushFabPositionSync() {
    this.presentationBrushFabDock = this.clampPresentationBrushFabDock(
      this.presentationBrushFabDock ?? this.getDefaultPresentationBrushFabDock(),
    );
    this.syncPresentationBrushFabPosition();
  }

  syncPresentationBrushFabPosition() {
    if (!this.presentationBrushFabEl) return;

    if (!this.presentationBrushFabDock) {
      this.presentationBrushFabDock = this.getDefaultPresentationBrushFabDock();
    }

    this.presentationBrushFabDock = this.clampPresentationBrushFabDock(this.presentationBrushFabDock);
    const dockPosition = this.resolvePresentationBrushFabDockPosition(this.presentationBrushFabDock);
    const position = this.presentationBrushFabDrag?.dragged
      ? this.clampPresentationBrushFabPosition(this.presentationBrushFabDrag.currentPosition)
      : dockPosition;
    this.presentationBrushFabEl.dataset.edge = this.presentationBrushFabDock.edge;
    this.presentationBrushFabEl.style.left = `${position.x}px`;
    this.presentationBrushFabEl.style.top = `${position.y}px`;
    this.positionPresentationBrushPanel();
    this.penDropdown?.reposition?.();
    if (this.eraserPanelOpen) {
      this.positionEraserPanel();
    }
  }

  positionPresentationBrushPanel() {
    const root = this.presentationBrushFabEl;
    const panel = this.presentationBrushPanelEl;
    if (!root || !panel || panel.hidden) return;

    const rootRect = root.getBoundingClientRect();
    const panelWidth = panel.offsetWidth;
    const panelHeight = panel.offsetHeight;
    if (!panelWidth || !panelHeight) return;

    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const fabWidth = rootRect.width || PRESENTATION_BRUSH_FAB_SIZE;
    const fabHeight = rootRect.height || PRESENTATION_BRUSH_FAB_SIZE;
    const edge = this.presentationBrushFabDock?.edge ?? root.dataset.edge ?? "left";

    panel.style.left = "auto";
    panel.style.right = "auto";
    panel.style.top = "auto";
    panel.style.bottom = "auto";
    panel.style.transform = "none";

    if (edge === "left" || edge === "right") {
      const anchorCenterY = rootRect.top + fabHeight / 2;
      const top = clamp(
        anchorCenterY - panelHeight / 2,
        PRESENTATION_BRUSH_PANEL_VIEWPORT_MARGIN,
        viewportHeight - PRESENTATION_BRUSH_PANEL_VIEWPORT_MARGIN - panelHeight,
      );

      panel.style.top = `${Math.round(top - rootRect.top)}px`;
      if (edge === "left") {
        panel.style.left = `${fabWidth + PRESENTATION_BRUSH_PANEL_GAP}px`;
      } else {
        panel.style.left = `${Math.round(-(panelWidth + PRESENTATION_BRUSH_PANEL_GAP))}px`;
      }
      return;
    }

    const anchorCenterX = rootRect.left + fabWidth / 2;
    const left = clamp(
      anchorCenterX - panelWidth / 2,
      PRESENTATION_BRUSH_PANEL_VIEWPORT_MARGIN,
      viewportWidth - PRESENTATION_BRUSH_PANEL_VIEWPORT_MARGIN - panelWidth,
    );

    panel.style.left = `${Math.round(left - rootRect.left)}px`;
    if (edge === "top") {
      panel.style.top = `${fabHeight + PRESENTATION_BRUSH_PANEL_GAP}px`;
    } else {
      panel.style.top = `${Math.round(-(panelHeight + PRESENTATION_BRUSH_PANEL_GAP))}px`;
    }
  }

  handlePresentationBrushFabPointerDown(event) {
    if (this.app.getMode() !== "presentation" || !this.presentationBrushFabEl) return;

    const dock = this.clampPresentationBrushFabDock(
      this.presentationBrushFabDock ?? this.getDefaultPresentationBrushFabDock(),
    );
    const position = this.resolvePresentationBrushFabDockPosition(dock);
    this.presentationBrushFabDock = dock;
    this.presentationBrushFabDrag = {
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      originX: position.x,
      originY: position.y,
      currentPosition: position,
      dragged: false,
    };
    this.presentationBrushFabEl.classList.add("is-dragging");
  }

  handlePresentationBrushFabPointerMove(event) {
    const drag = this.presentationBrushFabDrag;
    if (!drag || (event.pointerId != null && drag.pointerId != null && event.pointerId !== drag.pointerId)) {
      return;
    }

    const deltaX = event.clientX - drag.startClientX;
    const deltaY = event.clientY - drag.startClientY;
    if (!drag.dragged && Math.hypot(deltaX, deltaY) >= PRESENTATION_BRUSH_DRAG_THRESHOLD) {
      drag.dragged = true;
    }
    if (!drag.dragged) return;

    event.preventDefault();
    drag.currentPosition = this.clampPresentationBrushFabPosition({
      x: drag.originX + deltaX,
      y: drag.originY + deltaY,
    });
    this.syncPresentationBrushFabPosition();
  }

  handlePresentationBrushFabPointerUp(event) {
    const drag = this.presentationBrushFabDrag;
    if (!drag || (event.pointerId != null && drag.pointerId != null && event.pointerId !== drag.pointerId)) {
      return;
    }

    this.suppressPresentationBrushFabClick = Boolean(drag.dragged);
    if (drag.dragged) {
      this.presentationBrushFabDock = this.getPresentationBrushFabDockFromPosition(drag.currentPosition);
    }
    this.presentationBrushFabEl?.classList.remove("is-dragging");
    this.presentationBrushFabDrag = null;
    this.syncPresentationBrushFabPosition();
  }

  cancelPresentationBrushFabDrag() {
    this.presentationBrushFabEl?.classList.remove("is-dragging");
    this.presentationBrushFabDrag = null;
    this.syncPresentationBrushFabPosition();
  }

  openPresentationBrushMenu() {
    this.presentationBrushMenuOpen = true;
    this.syncPresentationBrushFab();
  }

  closePresentationBrushMenu() {
    this.presentationBrushMenuOpen = false;
    this.closePresentationDrawingPopovers();
    this.syncPresentationBrushFab();
  }

  togglePresentationBrushMenu() {
    if (this.presentationBrushMenuOpen) {
      this.closePresentationBrushMenu();
      return;
    }
    this.openPresentationBrushMenu();
  }

  closePresentationDrawingPopovers() {
    this.penDropdown?.close?.();
    this.penDropdown?.clearAnchorElement?.();
    this.closeEraserPanel();
  }

  togglePresentationBrushDropdown() {
    if (this.app.getMode() !== "presentation") return;

    this.openPresentationBrushMenu();
    this.closeEraserPanel();
    this.penDropdown?.setAnchorElement?.(this.presentationBrushBtnEl);

    const nextToolId = this.isBrushFamilyActive() ? this.app.getEditorTool() : this.lastBrushToolId;
    if (this.app.getEditorTool() !== nextToolId) {
      this.app.setEditorTool(nextToolId);
    }

    if (this.penDropdown?.isOpen?.()) {
      this.penDropdown.close();
      return;
    }

    this.penDropdown?.open?.();
  }

  togglePresentationEraserPanel() {
    if (this.app.getMode() !== "presentation") return;

    this.openPresentationBrushMenu();
    this.penDropdown?.close?.();
    this.penDropdown?.clearAnchorElement?.();

    if (this.app.getEditorTool() !== "eraser") {
      this.app.setEditorTool("eraser");
    }

    if (this.eraserPanelOpen) {
      this.closeEraserPanel();
      return;
    }

    this.openEraserPanel(this.presentationEraserBtnEl);
  }

  syncPresentationBrushFab() {
    if (!this.presentationBrushFabEl || !this.presentationBrushFabButtonEl) return;

    const isPresentation = this.app.getMode() === "presentation";
    const activeToolId = this.app.getEditorTool();
    const isBrushActive = this.isBrushFamilyActive(activeToolId);
    const isEraserActive = activeToolId === "eraser";

    this.presentationBrushFabEl.hidden = !isPresentation;
    if (!isPresentation) {
      this.presentationBrushMenuOpen = false;
      this.presentationBrushPanelEl.hidden = true;
      this.presentationBrushFabButtonEl.setAttribute("aria-expanded", "false");
      this.presentationBrushFabEl.classList.remove("is-active");
      if (this.penDropdown?.hasCustomAnchor?.()) {
        this.penDropdown.close?.();
        this.penDropdown.clearAnchorElement?.();
      }
      if (this.activeEraserAnchorEl && this.activeEraserAnchorEl !== this.eraserTriggerEl) {
        this.closeEraserPanel();
      }
      return;
    }

    this.queuePresentationBrushFabPositionSync();
    this.presentationBrushPanelEl.hidden = !this.presentationBrushMenuOpen;
    this.positionPresentationBrushPanel();
    this.presentationBrushFabEl.classList.toggle(
      "is-active",
      this.presentationBrushMenuOpen || Boolean(this.presentationBrushFabDrag),
    );
    this.presentationBrushFabButtonEl.setAttribute("aria-expanded", String(this.presentationBrushMenuOpen));
    this.presentationBrushFabButtonEl.setAttribute(
      "aria-pressed",
      String(this.presentationBrushMenuOpen || isBrushActive || isEraserActive),
    );
    this.presentationArrangeBtnEl?.setAttribute("aria-pressed", String(activeToolId === "arrange"));
    this.presentationBrushBtnEl?.setAttribute("aria-pressed", String(isBrushActive));
    this.presentationEraserBtnEl?.setAttribute("aria-pressed", String(isEraserActive));
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
      if (
        this.eraserPanelEl?.contains(target) ||
        this.activeEraserAnchorEl?.contains(target) ||
        this.eraserTriggerEl?.contains(target)
      ) {
        return;
      }
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

  openEraserPanel(anchorEl = this.eraserTriggerEl) {
    if (!this.eraserPanelEl) return;
    this.activeEraserAnchorEl = anchorEl ?? this.eraserTriggerEl ?? null;
    this.eraserPanelOpen = true;
    this.eraserPanelEl.hidden = false;
    this.positionEraserPanel();
  }

  closeEraserPanel() {
    this.eraserPanelOpen = false;
    this.activeEraserAnchorEl = null;
    if (this.eraserPanelEl) {
      this.eraserPanelEl.hidden = true;
    }
  }

  positionEraserPanel() {
    const anchorEl = this.activeEraserAnchorEl ?? this.eraserTriggerEl;
    if (!this.eraserPanelEl || !anchorEl) return;
    const shellRect = document.querySelector(".app-shell")?.getBoundingClientRect?.();
    const triggerRect = anchorEl.getBoundingClientRect();
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
    return toolId === "arrange" || this.isBrushFamilyActive(toolId) || toolId === "eraser";
  }

  getDrawingPlugin() {
    return this.app.plugins.find((plugin) => plugin.id === "drawing") ?? null;
  }

  getSelectionPlugin() {
    return this.app.getPlugin?.("selection")
      ?? this.app.plugins.find((plugin) => plugin.id === "selection")
      ?? null;
  }

  getConnectionsPlugin() {
    return this.app.getPlugin?.("connections")
      ?? this.app.plugins.find((plugin) => plugin.id === "connections")
      ?? null;
  }

  startShapeConnection() {
    const node = this.selectedShapeNode;
    if (node?.getAttr?.("componentType") !== "shape") return;

    this.closeShapeLayerMenu();
    this.app.commands.execute("connection:connect", node.id());
    this.syncShapeConnectAction();
  }

  startButtonConnection() {
    const node = this.selectedButtonNode;
    if (node?.getAttr?.("componentType") !== "button") return;

    this.closeButtonLayerMenu();
    this.app.commands.execute("connection:connect", node.id());
    this.syncButtonConnectAction();
  }

  startStickyConnection() {
    const node = this.selectedStickyNode;
    if (node?.getAttr?.("componentType") !== "sticky") return;

    this.closeStickyLayerMenu();
    this.app.commands.execute("connection:connect", node.id());
    this.syncStickyConnectAction();
  }

  runShapeLayerAction(actionId) {
    const action = SHAPE_LAYER_ACTIONS.find((entry) => entry.id === actionId);
    const selection = this.getSelectionPlugin();
    const node = this.selectedShapeNode;
    if (!action || !selection || node?.getAttr?.("componentType") !== "shape") return;

    selection[action.run]?.(node);
    this.syncShapeLayerActions();
    this.queueShapePanelPositionSync();
  }

  runButtonLayerAction(actionId) {
    const action = SHAPE_LAYER_ACTIONS.find((entry) => entry.id === actionId);
    const selection = this.getSelectionPlugin();
    const node = this.selectedButtonNode;
    if (!action || !selection || node?.getAttr?.("componentType") !== "button") return;

    selection[action.run]?.(node);
    this.syncButtonLayerActions();
    this.queueButtonPanelPositionSync();
  }

  runStickyLayerAction(actionId) {
    const action = SHAPE_LAYER_ACTIONS.find((entry) => entry.id === actionId);
    const selection = this.getSelectionPlugin();
    const node = this.selectedStickyNode;
    if (!action || !selection || node?.getAttr?.("componentType") !== "sticky") return;

    selection[action.run]?.(node);
    this.syncStickyLayerActions();
    this.queueStickyPanelPositionSync();
  }

  handleButtonLayerContextMenu(event) {
    const isContextMenuEvent = event.type === "contextmenu";
    const isRightMouseDown = event.type === "mousedown" && event.evt?.button === 2;
    if (!isContextMenuEvent && !isRightMouseDown) return;
    if (this.app.getMode() !== "edit") return;

    const node = resolveSelectableFromStageEvent(this.app, event);
    if (node?.getAttr?.("componentType") !== "button") return;

    event.evt?.preventDefault?.();
    event.evt?.stopPropagation?.();
    event.cancelBubble = true;
    if (isRightMouseDown) {
      return;
    }

    this.openButtonLayerMenu(node, this.getShapeLayerContextPoint(event));
  }

  handleButtonLayerNativeContextMenu(event) {
    const isContextMenuEvent = event.type === "contextmenu";
    const isRightMouseDown = event.type === "mousedown" && event.button === 2;
    if (!isContextMenuEvent && !isRightMouseDown) return;
    if (this.app.getMode() !== "edit") return;

    const point = {
      x: event.clientX,
      y: event.clientY,
    };
    const directNode = resolveSelectableFromNativeEvent(this.app, event);
    const pending = isContextMenuEvent ? this.getPendingButtonLayerContextMenu() : null;
    const node = directNode?.getAttr?.("componentType") === "button"
      ? directNode
      : pending?.node;
    if (node?.getAttr?.("componentType") !== "button") return;

    event.preventDefault();
    event.stopPropagation();
    if (isRightMouseDown) {
      this.pendingButtonLayerContextMenu = {
        node,
        point,
        time: this.getNow(),
      };
      return;
    }

    this.pendingButtonLayerContextMenu = null;
    this.openButtonLayerMenu(node, {
      x: Number.isFinite(point.x) ? point.x : pending?.point?.x,
      y: Number.isFinite(point.y) ? point.y : pending?.point?.y,
    });
  }

  getPendingButtonLayerContextMenu() {
    const pending = this.pendingButtonLayerContextMenu;
    if (!pending) return null;

    if (
      !pending.node?.getStage?.() ||
      this.getNow() - pending.time > SHAPE_LAYER_CONTEXT_PENDING_MS
    ) {
      this.pendingButtonLayerContextMenu = null;
      return null;
    }

    return pending;
  }

  handleStickyLayerContextMenu(event) {
    const isContextMenuEvent = event.type === "contextmenu";
    const isRightMouseDown = event.type === "mousedown" && event.evt?.button === 2;
    if (!isContextMenuEvent && !isRightMouseDown) return;
    if (this.app.getMode() !== "edit") return;

    const node = resolveSelectableFromStageEvent(this.app, event);
    if (node?.getAttr?.("componentType") !== "sticky") return;

    event.evt?.preventDefault?.();
    event.evt?.stopPropagation?.();
    event.cancelBubble = true;
    if (isRightMouseDown) {
      return;
    }

    this.openStickyLayerMenu(node, this.getShapeLayerContextPoint(event));
  }

  handleStickyLayerNativeContextMenu(event) {
    const isContextMenuEvent = event.type === "contextmenu";
    const isRightMouseDown = event.type === "mousedown" && event.button === 2;
    if (!isContextMenuEvent && !isRightMouseDown) return;
    if (this.app.getMode() !== "edit") return;

    const point = {
      x: event.clientX,
      y: event.clientY,
    };
    const directNode = resolveSelectableFromNativeEvent(this.app, event);
    const pending = isContextMenuEvent ? this.getPendingStickyLayerContextMenu() : null;
    const node = directNode?.getAttr?.("componentType") === "sticky"
      ? directNode
      : pending?.node;
    if (node?.getAttr?.("componentType") !== "sticky") return;

    event.preventDefault();
    event.stopPropagation();
    if (isRightMouseDown) {
      this.pendingStickyLayerContextMenu = {
        node,
        point,
        time: this.getNow(),
      };
      return;
    }

    this.pendingStickyLayerContextMenu = null;
    this.openStickyLayerMenu(node, {
      x: Number.isFinite(point.x) ? point.x : pending?.point?.x,
      y: Number.isFinite(point.y) ? point.y : pending?.point?.y,
    });
  }

  getPendingStickyLayerContextMenu() {
    const pending = this.pendingStickyLayerContextMenu;
    if (!pending) return null;

    if (
      !pending.node?.getStage?.() ||
      this.getNow() - pending.time > SHAPE_LAYER_CONTEXT_PENDING_MS
    ) {
      this.pendingStickyLayerContextMenu = null;
      return null;
    }

    return pending;
  }

  handleShapeLayerContextMenu(event) {
    const isContextMenuEvent = event.type === "contextmenu";
    const isRightMouseDown = event.type === "mousedown" && event.evt?.button === 2;
    if (!isContextMenuEvent && !isRightMouseDown) return;
    if (this.app.getMode() !== "edit") return;

    const node = resolveSelectableFromStageEvent(this.app, event);
    if (node?.getAttr?.("componentType") !== "shape") return;

    event.evt?.preventDefault?.();
    event.evt?.stopPropagation?.();
    event.cancelBubble = true;
    if (isRightMouseDown) {
      return;
    }

    this.openShapeLayerMenu(node, this.getShapeLayerContextPoint(event));
  }

  handleShapeLayerNativeContextMenu(event) {
    const isContextMenuEvent = event.type === "contextmenu";
    const isRightMouseDown = event.type === "mousedown" && event.button === 2;
    if (!isContextMenuEvent && !isRightMouseDown) return;
    if (this.app.getMode() !== "edit") return;

    const point = {
      x: event.clientX,
      y: event.clientY,
    };
    const directNode = resolveSelectableFromNativeEvent(this.app, event);
    const pending = isContextMenuEvent ? this.getPendingShapeLayerContextMenu() : null;
    const node = directNode?.getAttr?.("componentType") === "shape"
      ? directNode
      : pending?.node;
    if (node?.getAttr?.("componentType") !== "shape") return;

    event.preventDefault();
    event.stopPropagation();
    if (isRightMouseDown) {
      this.pendingShapeLayerContextMenu = {
        node,
        point,
        time: this.getNow(),
      };
      return;
    }

    this.pendingShapeLayerContextMenu = null;
    this.openShapeLayerMenu(node, {
      x: Number.isFinite(point.x) ? point.x : pending?.point?.x,
      y: Number.isFinite(point.y) ? point.y : pending?.point?.y,
    });
  }

  getNow() {
    return window.performance?.now?.() ?? Date.now();
  }

  getPendingShapeLayerContextMenu() {
    const pending = this.pendingShapeLayerContextMenu;
    if (!pending) return null;

    if (
      !pending.node?.getStage?.() ||
      this.getNow() - pending.time > SHAPE_LAYER_CONTEXT_PENDING_MS
    ) {
      this.pendingShapeLayerContextMenu = null;
      return null;
    }

    return pending;
  }

  getShapeLayerContextPoint(event) {
    const { clientX, clientY } = event?.evt ?? {};
    if (Number.isFinite(clientX) && Number.isFinite(clientY)) {
      return {
        x: clientX,
        y: clientY,
      };
    }

    const pointer = this.app.stage?.getPointerPosition?.() ?? null;
    const rect = this.app.stage?.container?.()?.getBoundingClientRect?.() ?? null;
    if (
      pointer &&
      rect &&
      Number.isFinite(pointer.x) &&
      Number.isFinite(pointer.y)
    ) {
      return {
        x: rect.left + pointer.x,
        y: rect.top + pointer.y,
      };
    }

    return {
      x: event.evt?.clientX,
      y: event.evt?.clientY,
    };
  }

  openShapeLayerMenu(node, clientPoint = null) {
    if (node?.getAttr?.("componentType") !== "shape") return;

    this.app.getPlugin?.("context-menu")?.hideMenu?.();
    this.getSelectionPlugin()?.setSelected?.([node]);
    this.selectedShapeNode = node;
    this.loadShapeUiFromSelection();
    this.syncUi();
    this.floatingToolbar?.setPanelVisible?.("shape-panel", true);
    this.queueShapePanelPositionSync();

    window.requestAnimationFrame(() => {
      const trigger = this.ui.shapePanelEl?.querySelector?.("#shape-layer-menu-trigger");
      trigger?.focus?.({ preventScroll: true });
      if (clientPoint) {
        this.positionShapeLayerMenuAtPoint(clientPoint);
      }
      this.syncShapePopoverOpenState();
      this.queueShapePanelPositionSync();
    });
  }

  openButtonLayerMenu(node, clientPoint = null) {
    if (node?.getAttr?.("componentType") !== "button") return;

    this.app.getPlugin?.("context-menu")?.hideMenu?.();
    this.getSelectionPlugin()?.setSelected?.([node]);
    this.selectedButtonNode = node;
    this.loadButtonUiFromSelection();
    this.syncUi();
    this.floatingToolbar?.setPanelVisible?.("button-panel", true);
    this.queueButtonPanelPositionSync();

    window.requestAnimationFrame(() => {
      const trigger = this.ui.buttonControlsEl?.querySelector?.("#button-layer-menu-trigger");
      trigger?.focus?.({ preventScroll: true });
      if (clientPoint) {
        this.positionButtonLayerMenuAtPoint(clientPoint);
      }
      this.syncButtonPopoverOpenState();
      this.queueButtonPanelPositionSync();
    });
  }

  openStickyLayerMenu(node, clientPoint = null) {
    if (node?.getAttr?.("componentType") !== "sticky") return;

    this.app.getPlugin?.("context-menu")?.hideMenu?.();
    this.getSelectionPlugin()?.setSelected?.([node]);
    this.selectedStickyNode = node;
    this.loadStickyUiFromSelection();
    this.syncUi();
    this.floatingToolbar?.setPanelVisible?.("sticky-panel", true);
    this.queueStickyPanelPositionSync();

    window.requestAnimationFrame(() => {
      const trigger = this.ui.stickyPanelEl?.querySelector?.("#sticky-layer-menu-trigger");
      trigger?.focus?.({ preventScroll: true });
      if (clientPoint) {
        this.positionStickyLayerMenuAtPoint(clientPoint);
      }
      this.syncStickyPopoverOpenState();
      this.queueStickyPanelPositionSync();
    });
  }

  getShapeLayerToolEl() {
    return this.ui.shapePanelEl?.querySelector?.(".toolbar__shape-layer-tool") ?? null;
  }

  getShapeLayerPopoverEl() {
    return this.ui.shapePanelEl?.querySelector?.(".toolbar__shape-layer-popover") ?? null;
  }

  getButtonLayerToolEl() {
    return this.ui.buttonControlsEl?.querySelector?.(".toolbar__button-layer-tool") ?? null;
  }

  getButtonLayerPopoverEl() {
    return this.ui.buttonControlsEl?.querySelector?.(".toolbar__button-layer-popover") ?? null;
  }

  getStickyLayerToolEl() {
    return this.ui.stickyPanelEl?.querySelector?.(".toolbar__sticky-layer-tool") ?? null;
  }

  getStickyLayerPopoverEl() {
    return this.ui.stickyPanelEl?.querySelector?.(".toolbar__sticky-layer-popover") ?? null;
  }

  isShapeLayerMenuOpen() {
    const tool = this.getShapeLayerToolEl();
    return Boolean(tool?.matches?.(":focus-within"));
  }

  closeShapeLayerMenu() {
    const tool = this.getShapeLayerToolEl();
    const activeElement = document.activeElement;
    if (tool?.contains?.(activeElement)) {
      activeElement.blur?.();
    }
    this.clearShapeLayerContextPosition();
    this.syncShapePopoverOpenState();
    this.queueShapePanelPositionSync();
  }

  isButtonLayerMenuOpen() {
    const tool = this.getButtonLayerToolEl();
    return Boolean(tool?.matches?.(":focus-within"));
  }

  closeButtonLayerMenu() {
    const tool = this.getButtonLayerToolEl();
    const activeElement = document.activeElement;
    if (tool?.contains?.(activeElement)) {
      activeElement.blur?.();
    }
    this.clearButtonLayerContextPosition();
    this.syncButtonPopoverOpenState();
    this.queueButtonPanelPositionSync();
  }

  isStickyLayerMenuOpen() {
    const tool = this.getStickyLayerToolEl();
    return Boolean(tool?.matches?.(":focus-within"));
  }

  closeStickyLayerMenu() {
    const tool = this.getStickyLayerToolEl();
    const activeElement = document.activeElement;
    if (tool?.contains?.(activeElement)) {
      activeElement.blur?.();
    }
    this.clearStickyLayerContextPosition();
    this.syncStickyPopoverOpenState();
    this.queueStickyPanelPositionSync();
  }

  clearShapeLayerContextPosition() {
    const tool = this.getShapeLayerToolEl();
    const popover = this.getShapeLayerPopoverEl();
    if (!tool) return;

    tool.classList.remove("is-context-open");
    tool.style.removeProperty("--shape-layer-menu-left");
    tool.style.removeProperty("--shape-layer-menu-top");
    popover?.style.removeProperty("position");
    popover?.style.removeProperty("top");
    popover?.style.removeProperty("right");
    popover?.style.removeProperty("left");
    popover?.style.removeProperty("transform");
    popover?.style.removeProperty("z-index");
  }

  clearButtonLayerContextPosition() {
    const tool = this.getButtonLayerToolEl();
    const popover = this.getButtonLayerPopoverEl();
    if (!tool) return;

    tool.classList.remove("is-context-open");
    popover?.style.removeProperty("position");
    popover?.style.removeProperty("top");
    popover?.style.removeProperty("right");
    popover?.style.removeProperty("left");
    popover?.style.removeProperty("transform");
    popover?.style.removeProperty("z-index");
  }

  clearStickyLayerContextPosition() {
    const tool = this.getStickyLayerToolEl();
    const popover = this.getStickyLayerPopoverEl();
    if (!tool) return;

    tool.classList.remove("is-context-open");
    popover?.style.removeProperty("position");
    popover?.style.removeProperty("top");
    popover?.style.removeProperty("right");
    popover?.style.removeProperty("left");
    popover?.style.removeProperty("transform");
    popover?.style.removeProperty("z-index");
  }

  positionShapeLayerMenuAtPoint(point) {
    const tool = this.getShapeLayerToolEl();
    const popover = this.getShapeLayerPopoverEl();
    const x = Number(point?.x);
    const y = Number(point?.y);
    if (!tool || !popover || !Number.isFinite(x) || !Number.isFinite(y)) return;

    tool.classList.add("is-context-open");
    const margin = 8;
    const width = popover.offsetWidth || popover.getBoundingClientRect().width || 140;
    const height = popover.offsetHeight || popover.getBoundingClientRect().height || 60;
    const left = clamp(x, margin, Math.max(margin, window.innerWidth - width - margin));
    const top = clamp(y, margin, Math.max(margin, window.innerHeight - height - margin));

    tool.style.setProperty("--shape-layer-menu-left", `${Math.round(left)}px`);
    tool.style.setProperty("--shape-layer-menu-top", `${Math.round(top)}px`);
    const toolRect = tool.getBoundingClientRect();
    popover.style.setProperty("position", "absolute", "important");
    popover.style.setProperty("top", `${Math.round(top - toolRect.top)}px`, "important");
    popover.style.setProperty("right", "auto", "important");
    popover.style.setProperty("left", `${Math.round(left - toolRect.left)}px`, "important");
    popover.style.setProperty("transform", "none", "important");
    popover.style.setProperty("z-index", "100", "important");
  }

  positionButtonLayerMenuAtPoint(point) {
    const tool = this.getButtonLayerToolEl();
    const popover = this.getButtonLayerPopoverEl();
    const x = Number(point?.x);
    const y = Number(point?.y);
    if (!tool || !popover || !Number.isFinite(x) || !Number.isFinite(y)) return;

    tool.classList.add("is-context-open");
    const margin = 8;
    const width = popover.offsetWidth || popover.getBoundingClientRect().width || 140;
    const height = popover.offsetHeight || popover.getBoundingClientRect().height || 60;
    const left = clamp(x, margin, Math.max(margin, window.innerWidth - width - margin));
    const top = clamp(y, margin, Math.max(margin, window.innerHeight - height - margin));

    const toolRect = tool.getBoundingClientRect();
    popover.style.setProperty("position", "absolute", "important");
    popover.style.setProperty("top", `${Math.round(top - toolRect.top)}px`, "important");
    popover.style.setProperty("right", "auto", "important");
    popover.style.setProperty("left", `${Math.round(left - toolRect.left)}px`, "important");
    popover.style.setProperty("transform", "none", "important");
    popover.style.setProperty("z-index", "100", "important");
  }

  positionStickyLayerMenuAtPoint(point) {
    const tool = this.getStickyLayerToolEl();
    const popover = this.getStickyLayerPopoverEl();
    const x = Number(point?.x);
    const y = Number(point?.y);
    if (!tool || !popover || !Number.isFinite(x) || !Number.isFinite(y)) return;

    tool.classList.add("is-context-open");
    const margin = 8;
    const width = popover.offsetWidth || popover.getBoundingClientRect().width || 140;
    const height = popover.offsetHeight || popover.getBoundingClientRect().height || 60;
    const left = clamp(x, margin, Math.max(margin, window.innerWidth - width - margin));
    const top = clamp(y, margin, Math.max(margin, window.innerHeight - height - margin));

    const toolRect = tool.getBoundingClientRect();
    popover.style.setProperty("position", "absolute", "important");
    popover.style.setProperty("top", `${Math.round(top - toolRect.top)}px`, "important");
    popover.style.setProperty("right", "auto", "important");
    popover.style.setProperty("left", `${Math.round(left - toolRect.left)}px`, "important");
    popover.style.setProperty("transform", "none", "important");
    popover.style.setProperty("z-index", "100", "important");
  }

  syncShapeConnectAction() {
    const connections = this.getConnectionsPlugin();
    const node = this.selectedShapeNode;
    const canConnect = Boolean(
      connections &&
      node?.getStage?.() &&
      node.getAttr?.("componentType") === "shape" &&
      connections.isConnectable?.(node),
    );
    if (!this.floatingToolbar?.setButtonState?.("shape-panel", "connect", {
      disabled: !canConnect,
      title: "Connect to",
      label: "Connect to",
    })) {
      const button = this.ui.shapePanelEl?.querySelector?.("#shape-connect-trigger") ?? null;
      if (button) {
        button.disabled = !canConnect;
        button.setAttribute("aria-disabled", String(!canConnect));
        button.title = "Connect to";
        button.setAttribute("aria-label", "Connect to");
      }
    }
  }

  syncButtonConnectAction() {
    const connections = this.getConnectionsPlugin();
    const node = this.selectedButtonNode;
    const canConnect = Boolean(
      connections &&
      node?.getStage?.() &&
      node.getAttr?.("componentType") === "button" &&
      connections.isConnectable?.(node),
    );
    if (!this.floatingToolbar?.setButtonState?.("button-panel", "connect", {
      disabled: !canConnect,
      title: "Connect to",
      label: "Connect to",
    })) {
      const button = this.ui.buttonControlsEl?.querySelector?.("#button-connect-trigger") ?? null;
      if (button) {
        button.disabled = !canConnect;
        button.setAttribute("aria-disabled", String(!canConnect));
        button.title = "Connect to";
        button.setAttribute("aria-label", "Connect to");
      }
    }
  }

  syncStickyConnectAction() {
    const connections = this.getConnectionsPlugin();
    const node = this.selectedStickyNode;
    const canConnect = Boolean(
      connections &&
      node?.getStage?.() &&
      node.getAttr?.("componentType") === "sticky" &&
      connections.isConnectable?.(node),
    );
    if (!this.floatingToolbar?.setButtonState?.("sticky-panel", "connect", {
      disabled: !canConnect,
      title: "Connect to",
      label: "Connect to",
    })) {
      const button = this.ui.stickyPanelEl?.querySelector?.("#sticky-connect-trigger") ?? null;
      if (button) {
        button.disabled = !canConnect;
        button.setAttribute("aria-disabled", String(!canConnect));
        button.title = "Connect to";
        button.setAttribute("aria-label", "Connect to");
      }
    }
  }

  syncShapeLayerActions() {
    this.syncShapeConnectAction();

    const selection = this.getSelectionPlugin();
    const node = this.selectedShapeNode;
    const canTargetShape = Boolean(
      selection &&
      node?.getStage?.() &&
      node.getAttr?.("componentType") === "shape",
    );

    for (const action of SHAPE_LAYER_ACTIONS) {
      const button = this.ui.shapePanelEl
        ?.querySelector?.(`[data-shape-layer-action="${action.id}"]`) ?? null;
      const disabled = !canTargetShape || !selection[action.canRun]?.(node);
      if (!this.floatingToolbar?.setButtonState?.("shape-panel", `layer:${action.id}`, {
        disabled,
        title: action.label,
        label: action.label,
      })) {
        if (button) {
          button.disabled = disabled;
          button.setAttribute("aria-disabled", String(disabled));
          button.title = action.label;
          button.setAttribute("aria-label", action.label);
        }
      }
    }
  }

  syncButtonLayerActions() {
    this.syncButtonConnectAction();

    const selection = this.getSelectionPlugin();
    const node = this.selectedButtonNode;
    const canTargetButton = Boolean(
      selection &&
      node?.getStage?.() &&
      node.getAttr?.("componentType") === "button",
    );

    for (const action of SHAPE_LAYER_ACTIONS) {
      const button = this.ui.buttonControlsEl
        ?.querySelector?.(`[data-button-layer-action="${action.id}"]`) ?? null;
      const disabled = !canTargetButton || !selection[action.canRun]?.(node);
      if (!this.floatingToolbar?.setButtonState?.("button-panel", `layer:${action.id}`, {
        disabled,
        title: action.label,
        label: action.label,
      })) {
        if (button) {
          button.disabled = disabled;
          button.setAttribute("aria-disabled", String(disabled));
          button.title = action.label;
          button.setAttribute("aria-label", action.label);
        }
      }
    }
  }

  syncStickyLayerActions() {
    this.syncStickyConnectAction();

    const selection = this.getSelectionPlugin();
    const node = this.selectedStickyNode;
    const canTargetSticky = Boolean(
      selection &&
      node?.getStage?.() &&
      node.getAttr?.("componentType") === "sticky",
    );

    for (const action of SHAPE_LAYER_ACTIONS) {
      const button = this.ui.stickyPanelEl
        ?.querySelector?.(`[data-sticky-layer-action="${action.id}"]`) ?? null;
      const disabled = !canTargetSticky || !selection[action.canRun]?.(node);
      if (!this.floatingToolbar?.setButtonState?.("sticky-panel", `layer:${action.id}`, {
        disabled,
        title: action.label,
        label: action.label,
      })) {
        if (button) {
          button.disabled = disabled;
          button.setAttribute("aria-disabled", String(disabled));
          button.title = action.label;
          button.setAttribute("aria-label", action.label);
        }
      }
    }
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
    // No-op: shape state is managed through the floating shape panel now.
  }

  saveShapeUiToState() {
    return this.shapeToolState;
  }

  syncShapeTypeControls() {
    // No-op: shape type is synced via syncShapePanelTypeControls.
  }

  syncShapeUiToActiveTool() {
    // No-op: shape tool state is emitted on init via emitShapeStyleChange.
  }

  syncShapeControlTooltips() {
    const {
      shapeFontSizeEl,
      shapeFontSizeValueEl,
      shapeTextColorEl,
      shapeFillColorEl,
      shapeOpacityEl,
      shapeOpacityValueEl,
      shapeStrokeColorEl,
      shapeStrokeWidthEl,
      shapeStrokeWidthValueEl,
    } = this.ui;
    if (!shapeFontSizeEl || !shapeTextColorEl || !shapeFillColorEl || !shapeStrokeColorEl) {
      return;
    }

    const fontSizeTitle = `Font size: ${shapeFontSizeEl.value}`;
    const textTitle = "Text color";
    const fillTitle = "Fill color";
    const opacityTitle = `Opacity: ${formatPercentValue(shapeOpacityEl?.value ?? 0)}`;
    const strokeTitle = "Border color";
    const strokeWidthTitle = `Thickness: ${shapeStrokeWidthEl?.value ?? 0}`;
    const textToolEl = shapeTextColorEl.closest(".toolbar__button-style-tool");
    const fontSizeToolEl = shapeFontSizeEl.closest(".toolbar__button-style-tool");
    const fillToolEl = shapeFillColorEl.closest(".toolbar__button-style-tool");
    const borderToolEl = shapeStrokeColorEl.closest(".toolbar__button-style-tool");

    shapeFontSizeEl.title = fontSizeTitle;
    if (shapeFontSizeValueEl) shapeFontSizeValueEl.title = fontSizeTitle;
    fontSizeToolEl?.querySelector?.(".toolbar__button-style-trigger")?.setAttribute("title", "Font size");
    shapeTextColorEl.title = textTitle;
    textToolEl?.querySelector?.(".toolbar__button-style-trigger")?.setAttribute("title", textTitle);
    textToolEl?.style.setProperty("--button-tool-color", shapeTextColorEl.value);
    shapeFillColorEl.title = fillTitle;
    fillToolEl?.querySelector?.(".toolbar__button-style-trigger")?.setAttribute("title", fillTitle);
    fillToolEl?.style.setProperty("--button-tool-fill", shapeFillColorEl.value);
    fillToolEl?.style.setProperty("--button-tool-opacity", formatOpacityValue(shapeOpacityEl?.value ?? 0));
    fillToolEl?.classList.toggle("is-button-fill-transparent", Number(shapeOpacityEl?.value ?? 0) <= 0);
    if (shapeOpacityEl) shapeOpacityEl.title = opacityTitle;
    if (shapeOpacityValueEl) shapeOpacityValueEl.title = opacityTitle;
    shapeStrokeColorEl.title = strokeTitle;
    borderToolEl?.querySelector?.(".toolbar__button-style-trigger")?.setAttribute("title", strokeTitle);
    borderToolEl?.style.setProperty("--button-tool-color", shapeStrokeColorEl.value);
    borderToolEl?.style.setProperty(
      "--button-tool-stroke-width",
      `${Math.max(1, Number(shapeStrokeWidthEl?.value) || 0)}px`,
    );
    if (shapeStrokeWidthEl) shapeStrokeWidthEl.title = strokeWidthTitle;
    if (shapeStrokeWidthValueEl) shapeStrokeWidthValueEl.title = strokeWidthTitle;
    this.syncShapeCustomPickers();
  }

  loadShapeUiFromSelection() {
    const {
      shapePanelTypeControlsEl,
      shapeFontSizeEl,
      shapeFontSizeValueEl,
      shapeTextColorEl,
      shapeFillColorEl,
      shapeOpacityEl,
      shapeOpacityValueEl,
      shapeStrokeColorEl,
      shapeStrokeWidthEl,
      shapeStrokeWidthValueEl,
    } = this.ui;

    const state = this.selectedShapeNode
      ? getShapeData(this.selectedShapeNode)
      : { ...DEFAULT_SHAPE_PANEL_STATE };

    this.shapePanelState = {
      ...this.shapePanelState,
      shapeType: normalizeShapeType(state.shapeType ?? this.shapePanelState.shapeType),
      fill: state.fill ?? this.shapePanelState.fill,
      fillOpacity: Number.isFinite(state.fillOpacity) ? state.fillOpacity : this.shapePanelState.fillOpacity,
      stroke: state.stroke ?? this.shapePanelState.stroke,
      strokeWidth: Number.isFinite(state.strokeWidth) ? state.strokeWidth : this.shapePanelState.strokeWidth,
      textColor: state.textColor ?? this.shapePanelState.textColor,
      fontSize: Number.isFinite(state.fontSize) ? state.fontSize : this.shapePanelState.fontSize,
    };

    if (shapeFontSizeEl) shapeFontSizeEl.value = String(this.shapePanelState.fontSize);
    if (shapeFontSizeValueEl) shapeFontSizeValueEl.value = String(this.shapePanelState.fontSize);
    if (shapeTextColorEl) shapeTextColorEl.value = this.shapePanelState.textColor;
    if (shapeFillColorEl) shapeFillColorEl.value = this.shapePanelState.fill;
    if (shapeOpacityEl) shapeOpacityEl.value = String(this.shapePanelState.fillOpacity);
    if (shapeOpacityValueEl) shapeOpacityValueEl.value = formatPercentValue(this.shapePanelState.fillOpacity);
    if (shapeStrokeColorEl) shapeStrokeColorEl.value = this.shapePanelState.stroke;
    if (shapeStrokeWidthEl) shapeStrokeWidthEl.value = String(this.shapePanelState.strokeWidth);
    if (shapeStrokeWidthValueEl) shapeStrokeWidthValueEl.value = String(this.shapePanelState.strokeWidth);
    this.syncShapePanelTypeControls();
    this.syncShapeControlTooltips();
    this.syncShapeLayerActions();
  }

  saveShapePanelUiToState() {
    const {
      shapeFontSizeEl,
      shapeTextColorEl,
      shapeFillColorEl,
      shapeOpacityEl,
      shapeStrokeColorEl,
      shapeStrokeWidthEl,
    } = this.ui;

    this.shapePanelState = {
      ...this.shapePanelState,
      fill: shapeFillColorEl?.value ?? this.shapePanelState.fill,
      fillOpacity: Number(shapeOpacityEl?.value ?? this.shapePanelState.fillOpacity),
      stroke: shapeStrokeColorEl?.value ?? this.shapePanelState.stroke,
      strokeWidth: Number(shapeStrokeWidthEl?.value ?? this.shapePanelState.strokeWidth),
      textColor: shapeTextColorEl?.value ?? this.shapePanelState.textColor,
      fontSize: Number(shapeFontSizeEl?.value ?? this.shapePanelState.fontSize),
    };
    return this.shapePanelState;
  }

  emitShapePanelChange() {
    const { shapeFontSizeValueEl, shapeStrokeWidthValueEl, shapeOpacityValueEl } = this.ui;
    const state = this.saveShapePanelUiToState();

    if (shapeFontSizeValueEl) shapeFontSizeValueEl.value = String(state.fontSize);
    if (shapeStrokeWidthValueEl) shapeStrokeWidthValueEl.value = String(state.strokeWidth);
    if (shapeOpacityValueEl) shapeOpacityValueEl.value = formatPercentValue(state.fillOpacity);
    this.syncShapePanelTypeControls();
    this.syncShapeControlTooltips();

    const node = this.selectedShapeNode;
    if (this.app.getMode() !== "edit") return;
    if (node?.getAttr?.("componentType") !== "shape") return;

    this.app.events.emit("node:change:start", { node });
    applyShapeStyle(node, state);
    node.getLayer()?.batchDraw();
    this.app.overlayLayer?.batchDraw();
    this.app.events.emit("node:changed", { node });

    // Keep shapes plugin in sync for next shape creation
    this.app.events.emit("shape:style-change", {
      shapeType: normalizeShapeType(state.shapeType),
      fill: state.fill,
      fillOpacity: state.fillOpacity,
      stroke: state.stroke,
      strokeWidth: state.strokeWidth,
    });
  }

  syncShapePanelTypeControls() {
    const { shapePanelTypeControlsEl } = this.ui;
    const validShapeTypes = new Set(SHAPE_TYPES.map((entry) => entry.value));

    if (!validShapeTypes.has(this.shapePanelState.shapeType)) {
      this.shapePanelState.shapeType = "rectangle";
    }

    for (const button of (shapePanelTypeControlsEl?.querySelectorAll("[data-shape-type]") ?? [])) {
      const pressed = button.dataset.shapeType === this.shapePanelState.shapeType;
      if (!this.floatingToolbar?.setButtonState?.("shape-panel", button.dataset.shapeType, { pressed })) {
        button.setAttribute("aria-pressed", String(pressed));
      }
    }
  }

  setupShapeStyleSwatches() {
    this.shapeColorToolbar?.setup();
  }

  recordShapeCustomColor(target, color) {
    this.shapeColorToolbar?.recordCustomColor(target, color);
  }

  applyShapeTextSwatch(color) {
    this.shapeColorToolbar?.applySwatch("text", color);
  }

  applyShapeFillSwatch(color) {
    this.shapeColorToolbar?.applySwatch("fill", color);
  }

  applyShapeBorderSwatch(color) {
    this.shapeColorToolbar?.applySwatch("border", color);
  }

  setupShapeCustomColorPickers() {
    this.shapeColorToolbar?.setup();
  }

  syncShapeCustomPickers() {
    this.shapeColorToolbar?.sync();
  }

  syncShapePopoverOpenState() {
    if (this.floatingToolbar?.hasPanel?.("shape-panel")) {
      return this.floatingToolbar.syncPopoverOpenState("shape-panel");
    }

    const { shapePanelEl } = this.ui;
    if (!shapePanelEl) return false;

    const hasOpenPopover = Boolean(
      shapePanelEl.querySelector(".toolbar__button-popover-tool:focus-within"),
    );
    shapePanelEl.classList.toggle("is-button-popover-open", hasOpenPopover);
    return hasOpenPopover;
  }

  syncShapePopoverOffset({ nodeLeft, nodeRight, nodeTop, nodeBottom, placement, stageRect }) {
    if (this.floatingToolbar?.hasPanel?.("shape-panel")) {
      this.floatingToolbar.syncPopoverOffset("shape-panel", {
        nodeLeft,
        nodeRight,
        nodeTop,
        nodeBottom,
        placement,
        stageRect,
      });
      return;
    }

    const { shapePanelEl } = this.ui;
    if (!shapePanelEl) return;

    const tools = Array.from(shapePanelEl.querySelectorAll(".toolbar__button-popover-tool"));
    for (const tool of tools) {
      tool.style.removeProperty("--button-popover-offset");
    }

    const openTool = shapePanelEl.querySelector(".toolbar__button-popover-tool:focus-within");
    const popover = openTool?.querySelector?.(".toolbar__button-style-popover");
    if (!openTool || !popover || placement !== "top") return;

    const toolRect = openTool.getBoundingClientRect();
    const popoverWidth = popover.offsetWidth || popover.getBoundingClientRect().width;
    if (!toolRect.width || !popoverWidth) return;

    const viewportLeft = Math.max(SHAPE_PANEL_VIEWPORT_MARGIN, stageRect.left + SHAPE_PANEL_VIEWPORT_MARGIN);
    const viewportRight = Math.min(window.innerWidth - SHAPE_PANEL_VIEWPORT_MARGIN, stageRect.right - SHAPE_PANEL_VIEWPORT_MARGIN);
    const baseLeft = toolRect.left + toolRect.width / 2 - popoverWidth / 2;
    const baseRight = baseLeft + popoverWidth;
    const popoverRect = popover.getBoundingClientRect();
    const overlapsShapeVertically = Number.isFinite(nodeTop) &&
      Number.isFinite(nodeBottom) &&
      popoverRect.bottom > nodeTop - BUTTON_POPOVER_NODE_CLEARANCE &&
      popoverRect.top < nodeBottom + BUTTON_POPOVER_NODE_CLEARANCE;
    const overlapsShape = overlapsShapeVertically &&
      baseRight > nodeLeft - BUTTON_POPOVER_NODE_CLEARANCE &&
      baseLeft < nodeRight + BUTTON_POPOVER_NODE_CLEARANCE;

    let offset = 0;
    if (overlapsShape) {
      const rightOffset = nodeRight + BUTTON_POPOVER_NODE_CLEARANCE - baseLeft;
      const leftOffset = nodeLeft - BUTTON_POPOVER_NODE_CLEARANCE - baseRight;
      const rightFits = baseLeft + rightOffset >= viewportLeft &&
        baseRight + rightOffset <= viewportRight;
      const leftFits = baseLeft + leftOffset >= viewportLeft &&
        baseRight + leftOffset <= viewportRight;

      if (rightFits) {
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

  syncShapePanelPosition() {
    if (this.floatingToolbar?.hasPanel?.("shape-panel")) {
      this.floatingToolbar.updatePanelPosition("shape-panel");
      return;
    }

    const { shapePanelEl } = this.ui;
    const node = this.selectedShapeNode;
    const stageContainer = this.app.stage?.container?.();
    if (!shapePanelEl || shapePanelEl.hidden || !node?.getStage?.() || !stageContainer) return;

    const canvasRect = node.getClientRect?.({ relativeTo: this.app.stage }) ?? null;
    if (!isFiniteRect(canvasRect)) return;

    const stageRect = stageContainer.getBoundingClientRect();
    const topLeft = this.app.stageApi.canvasToScreen({ x: canvasRect.x, y: canvasRect.y });
    const bottomRight = this.app.stageApi.canvasToScreen({
      x: canvasRect.x + canvasRect.width,
      y: canvasRect.y + canvasRect.height,
    });
    const nodeLeft = stageRect.left + Math.min(topLeft.x, bottomRight.x);
    const nodeRight = stageRect.left + Math.max(topLeft.x, bottomRight.x);
    const nodeTop = stageRect.top + Math.min(topLeft.y, bottomRight.y);
    const nodeBottom = stageRect.top + Math.max(topLeft.y, bottomRight.y);
    const nodeCenterX = (nodeLeft + nodeRight) / 2;

    const panelWidth = shapePanelEl.offsetWidth;
    const panelHeight = shapePanelEl.offsetHeight;
    if (!panelWidth || !panelHeight) return;
    this.syncShapePopoverOpenState();

    let minLeft = panelWidth / 2 + SHAPE_PANEL_VIEWPORT_MARGIN;
    let maxLeft = window.innerWidth - panelWidth / 2 - SHAPE_PANEL_VIEWPORT_MARGIN;
    if (stageRect.width >= panelWidth + SHAPE_PANEL_VIEWPORT_MARGIN * 2) {
      minLeft = Math.max(minLeft, stageRect.left + panelWidth / 2 + SHAPE_PANEL_VIEWPORT_MARGIN);
      maxLeft = Math.min(maxLeft, stageRect.right - panelWidth / 2 - SHAPE_PANEL_VIEWPORT_MARGIN);
    }

    const verticalMin = Math.max(
      SHAPE_PANEL_VIEWPORT_MARGIN,
      stageRect.top + SHAPE_PANEL_VIEWPORT_MARGIN,
    );
    const verticalMax = Math.min(
      window.innerHeight - SHAPE_PANEL_VIEWPORT_MARGIN,
      stageRect.bottom - SHAPE_PANEL_VIEWPORT_MARGIN,
    );
    const availableAbove = nodeTop - verticalMin - SHAPE_PANEL_ANCHOR_GAP;
    const availableBelow = verticalMax - nodeBottom - SHAPE_PANEL_ANCHOR_GAP;
    const placeAbove = availableAbove >= panelHeight || availableAbove >= availableBelow;
    const placement = placeAbove ? "top" : "bottom";
    const top = placeAbove
      ? clamp(nodeTop - SHAPE_PANEL_ANCHOR_GAP, verticalMin + panelHeight, verticalMax)
      : clamp(nodeBottom + SHAPE_PANEL_ANCHOR_GAP, verticalMin, verticalMax - panelHeight);
    const left = clamp(nodeCenterX, minLeft, maxLeft);

    shapePanelEl.dataset.placement = placement;
    shapePanelEl.style.left = `${left}px`;
    shapePanelEl.style.top = `${top}px`;
    this.syncShapePopoverOffset({
      nodeLeft,
      nodeRight,
      nodeTop,
      nodeBottom,
      placement,
      stageRect,
    });
  }

  queueShapePanelPositionSync() {
    if (this.floatingToolbar?.hasPanel?.("shape-panel")) {
      this.floatingToolbar.queuePanelPosition("shape-panel");
      return;
    }

    if (this.shapePanelPositionFrame != null) return;
    this.shapePanelPositionFrame = window.requestAnimationFrame(() => {
      this.shapePanelPositionFrame = null;
      this.syncShapePanelPosition();
    });
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
    this.syncButtonLayerActions();
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
      const pressed = button.dataset.buttonShapeType === this.buttonPanelState.shapeType;
      if (!this.floatingToolbar?.setButtonState?.("button-panel", button.dataset.buttonShapeType, { pressed })) {
        button.setAttribute("aria-pressed", String(pressed));
      }
    }
  }

  setupButtonStyleSwatches() {
    this.buttonColorToolbar?.setup();
  }

  recordButtonCustomColor(target, color) {
    this.buttonColorToolbar?.recordCustomColor(target, color);
  }

  setupButtonCustomColorPickers() {
    this.buttonColorToolbar?.setup();
  }

  syncButtonCustomPickers() {
    this.buttonColorToolbar?.sync();
  }

  applyButtonTextSwatch(color) {
    this.buttonColorToolbar?.applySwatch("text", color);
  }

  applyButtonFillSwatch(color) {
    this.buttonColorToolbar?.applySwatch("fill", color);
  }

  applyButtonBorderSwatch(color) {
    this.buttonColorToolbar?.applySwatch("border", color);
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

  loadStickyUiFromSelection() {
    const {
      stickyFontSizeEl,
      stickyFontSizeValueEl,
      stickyTextColorEl,
      stickyFillColorEl,
      stickyOpacityEl,
      stickyOpacityValueEl,
    } = this.ui;
    const state = this.selectedStickyNode
      ? getStickyData(this.selectedStickyNode)
      : { ...DEFAULT_STICKY_PANEL_STATE };

    this.stickyPanelState = {
      ...this.stickyPanelState,
      fill: state.fill ?? this.stickyPanelState.fill,
      fillOpacity: Number.isFinite(state.fillOpacity) ? state.fillOpacity : this.stickyPanelState.fillOpacity,
      textColor: state.textColor ?? this.stickyPanelState.textColor,
      fontSize: Number.isFinite(state.fontSize) ? state.fontSize : this.stickyPanelState.fontSize,
    };

    if (stickyFontSizeEl) stickyFontSizeEl.value = String(this.stickyPanelState.fontSize);
    if (stickyFontSizeValueEl) stickyFontSizeValueEl.value = String(this.stickyPanelState.fontSize);
    if (stickyTextColorEl) stickyTextColorEl.value = this.stickyPanelState.textColor;
    if (stickyFillColorEl) stickyFillColorEl.value = this.stickyPanelState.fill;
    if (stickyOpacityEl) stickyOpacityEl.value = String(this.stickyPanelState.fillOpacity);
    if (stickyOpacityValueEl) stickyOpacityValueEl.value = formatPercentValue(this.stickyPanelState.fillOpacity);
    this.syncStickyControlTooltips();
    this.syncStickyLayerActions();
  }

  saveStickyUiToState() {
    const {
      stickyFontSizeEl,
      stickyTextColorEl,
      stickyFillColorEl,
      stickyOpacityEl,
    } = this.ui;

    this.stickyPanelState = {
      ...this.stickyPanelState,
      fontSize: Number(stickyFontSizeEl?.value ?? this.stickyPanelState.fontSize),
      textColor: stickyTextColorEl?.value ?? this.stickyPanelState.textColor,
      fill: stickyFillColorEl?.value ?? this.stickyPanelState.fill,
      fillOpacity: Number(stickyOpacityEl?.value ?? this.stickyPanelState.fillOpacity),
    };
    return this.stickyPanelState;
  }

  syncStickyControlTooltips() {
    const {
      stickyFontSizeEl,
      stickyFontSizeValueEl,
      stickyTextColorEl,
      stickyFillColorEl,
      stickyOpacityEl,
      stickyOpacityValueEl,
    } = this.ui;
    if (!stickyFontSizeEl || !stickyTextColorEl || !stickyFillColorEl || !stickyOpacityEl) return;

    const fontSizeTitle = `Font size: ${stickyFontSizeEl.value}`;
    const textTitle = "Text color";
    const fillTitle = "Fill color";
    const opacityTitle = `Opacity: ${formatPercentValue(stickyOpacityEl.value)}`;
    const textToolEl = stickyTextColorEl.closest(".toolbar__button-style-tool");
    const fontSizeToolEl = stickyFontSizeEl.closest(".toolbar__button-style-tool");
    const fillToolEl = stickyFillColorEl.closest(".toolbar__button-style-tool");

    stickyFontSizeEl.title = fontSizeTitle;
    if (stickyFontSizeValueEl) stickyFontSizeValueEl.title = fontSizeTitle;
    fontSizeToolEl?.querySelector?.(".toolbar__button-style-trigger")?.setAttribute("title", "Font size");
    stickyTextColorEl.title = textTitle;
    textToolEl?.querySelector?.(".toolbar__button-style-trigger")?.setAttribute("title", textTitle);
    textToolEl?.style.setProperty("--button-tool-color", stickyTextColorEl.value);
    stickyFillColorEl.title = fillTitle;
    fillToolEl?.querySelector?.(".toolbar__button-style-trigger")?.setAttribute("title", fillTitle);
    fillToolEl?.style.setProperty("--button-tool-fill", stickyFillColorEl.value);
    fillToolEl?.style.setProperty("--button-tool-opacity", formatOpacityValue(stickyOpacityEl.value));
    fillToolEl?.classList.toggle("is-button-fill-transparent", Number(stickyOpacityEl.value) <= 0);
    stickyOpacityEl.title = opacityTitle;
    if (stickyOpacityValueEl) stickyOpacityValueEl.title = opacityTitle;
    this.syncStickyCustomPickers();
  }

  setupStickyStyleSwatches() {
    this.stickyColorToolbar?.setup();
  }

  recordStickyCustomColor(target, color) {
    this.stickyColorToolbar?.recordCustomColor(target, color);
  }

  applyStickyTextSwatch(color) {
    this.stickyColorToolbar?.applySwatch("text", color);
  }

  applyStickyFillSwatch(color) {
    this.stickyColorToolbar?.applySwatch("fill", color);
  }

  setupStickyCustomColorPickers() {
    this.stickyColorToolbar?.setup();
  }

  syncStickyCustomPickers() {
    this.stickyColorToolbar?.sync();
  }

  emitStickyStyleChange() {
    const { stickyFontSizeValueEl, stickyOpacityValueEl } = this.ui;
    const state = this.saveStickyUiToState();

    if (stickyFontSizeValueEl) stickyFontSizeValueEl.value = String(state.fontSize);
    if (stickyOpacityValueEl) stickyOpacityValueEl.value = formatPercentValue(state.fillOpacity);
    this.syncStickyControlTooltips();

    const node = this.selectedStickyNode;
    if (this.app.getMode() !== "edit" || this.app.getEditorTool() !== "arrange") return;
    if (node?.getAttr?.("componentType") !== "sticky") return;

    this.app.events.emit("node:change:start", { node });
    applyStickyStyle(node, state);
    node.getLayer()?.batchDraw();
    this.app.overlayLayer?.batchDraw();
    this.app.uiLayer?.batchDraw();
    this.app.events.emit("node:changed", { node });
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
    if (this.ui.shapePanelTypeControlsEl) {
      renderIcons(this.ui.shapePanelTypeControlsEl, {
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
    if (this.ui.shapePanelEl) {
      renderIcons(this.ui.shapePanelEl, {
        width: 18,
        height: 18,
        "stroke-width": 2,
      });
    }
    if (this.ui.stickyPanelEl) {
      renderIcons(this.ui.stickyPanelEl, {
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
    if (this.floatingToolbar?.hasPanel?.("button-panel")) {
      this.floatingToolbar.queuePanelPosition("button-panel");
      return;
    }

    if (this.buttonPanelPositionFrame != null) return;

    this.buttonPanelPositionFrame = window.requestAnimationFrame(() => {
      this.buttonPanelPositionFrame = null;
      this.syncButtonPanelPosition();
    });
  }

  queueStickyPanelPositionSync() {
    if (this.floatingToolbar?.hasPanel?.("sticky-panel")) {
      this.floatingToolbar.queuePanelPosition("sticky-panel");
    }
  }

  syncStickyPopoverOpenState() {
    if (this.floatingToolbar?.hasPanel?.("sticky-panel")) {
      return this.floatingToolbar.syncPopoverOpenState("sticky-panel");
    }
    return false;
  }

  syncButtonPopoverOpenState() {
    if (this.floatingToolbar?.hasPanel?.("button-panel")) {
      return this.floatingToolbar.syncPopoverOpenState("button-panel");
    }

    const { buttonControlsEl } = this.ui;
    if (!buttonControlsEl) return false;

    const hasOpenPopover = Boolean(
      buttonControlsEl.querySelector(".toolbar__button-popover-tool:focus-within"),
    );
    buttonControlsEl.classList.toggle("is-button-popover-open", hasOpenPopover);
    return hasOpenPopover;
  }

  syncButtonPopoverOffset({ nodeLeft, nodeRight, nodeTop, nodeBottom, placement, stageRect }) {
    if (this.floatingToolbar?.hasPanel?.("button-panel")) {
      this.floatingToolbar.syncPopoverOffset("button-panel", {
        nodeLeft,
        nodeRight,
        nodeTop,
        nodeBottom,
        placement,
        stageRect,
      });
      return;
    }

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
    const popoverRect = popover.getBoundingClientRect();
    const overlapsButtonVertically = Number.isFinite(nodeTop) &&
      Number.isFinite(nodeBottom) &&
      popoverRect.bottom > nodeTop - BUTTON_POPOVER_NODE_CLEARANCE &&
      popoverRect.top < nodeBottom + BUTTON_POPOVER_NODE_CLEARANCE;
    const overlapsButton = overlapsButtonVertically &&
      baseRight > nodeLeft - BUTTON_POPOVER_NODE_CLEARANCE &&
      baseLeft < nodeRight + BUTTON_POPOVER_NODE_CLEARANCE;

    let offset = 0;
    if (overlapsButton) {
      const rightOffset = nodeRight + BUTTON_POPOVER_NODE_CLEARANCE - baseLeft;
      const leftOffset = nodeLeft - BUTTON_POPOVER_NODE_CLEARANCE - baseRight;
      const rightFits = baseLeft + rightOffset >= viewportLeft &&
        baseRight + rightOffset <= viewportRight;
      const leftFits = baseLeft + leftOffset >= viewportLeft &&
        baseRight + leftOffset <= viewportRight;

      if (rightFits) {
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

  isSelectedShapeAffectedByNode(node) {
    const selectedShape = this.selectedShapeNode;
    if (!node || !selectedShape?.getStage?.()) return false;
    if (node === selectedShape) return true;

    let parent = selectedShape.getParent?.() ?? null;
    while (parent) {
      if (parent === node) return true;
      parent = parent.getParent?.() ?? null;
    }

    return false;
  }

  isSelectedStickyAffectedByNode(node) {
    const selectedSticky = this.selectedStickyNode;
    if (!node || !selectedSticky?.getStage?.()) return false;
    if (node === selectedSticky) return true;

    let parent = selectedSticky.getParent?.() ?? null;
    while (parent) {
      if (parent === node) return true;
      parent = parent.getParent?.() ?? null;
    }

    return false;
  }

  syncButtonPanelPosition() {
    if (this.floatingToolbar?.hasPanel?.("button-panel")) {
      this.floatingToolbar.updatePanelPosition("button-panel");
      return;
    }

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
      nodeTop,
      nodeBottom,
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
    const state = this.shapeToolState;
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
      shapePanelEl,
      buttonControlsEl,
      stickyPanelEl,
      saveFocusEl,
      focusPositionModeEl,
      drawingVisibilityToggleEl,
      modeCapsuleEditEl,
      modeCapsulePresentEl,
    } = this.ui;

    const isEdit = this.app.getMode() === "edit";
    const activeToolId = this.app.getEditorTool();
    const hasSelectedButton = Boolean(this.selectedButtonNode?.getStage?.());
    const hasSelectedSticky = Boolean(this.selectedStickyNode?.getStage?.());
    const showButtonControls =
      isEdit
      && activeToolId === "arrange"
      && hasSelectedButton;
    const showStickyPanel =
      isEdit
      && activeToolId === "arrange"
      && hasSelectedSticky;
    const showShapePanel = isEdit && Boolean(this.selectedShapeNode?.getStage?.());
    const drawingPlugin = this.getDrawingPlugin();
    const isPresentation = !isEdit;
    const allowPresentationDrawingControls = isEdit || isPresentation;
    const drawLayerVisible = drawingPlugin?.isDrawLayerVisible?.() !== false;

    document.body.classList.toggle("is-edit-mode", isEdit);
    document.body.classList.toggle("is-presentation-mode", !isEdit);
    this.syncPresentationToolbarAutoHide();
    this.syncPresentationBrushFab();

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
      drawingVisibilityToggleEl.dataset.tooltip = drawLayerVisible
        ? "Hide drawings"
        : "Show drawings";
      drawingVisibilityToggleEl.innerHTML =
        `<i data-lucide="${drawLayerVisible ? "eye" : "eye-off"}" aria-hidden="true"></i>`;
      renderIcons(drawingVisibilityToggleEl, {
        width: 16,
        height: 16,
        "stroke-width": 2,
      });
    }

    if (shapePanelEl) {
      if (!this.floatingToolbar?.setPanelVisible?.("shape-panel", showShapePanel)) {
        shapePanelEl.hidden = !showShapePanel;
        if (showShapePanel) this.queueShapePanelPositionSync();
      }
    }
    if (buttonControlsEl) {
      if (!this.floatingToolbar?.setPanelVisible?.("button-panel", showButtonControls)) {
        buttonControlsEl.hidden = !showButtonControls;
      }
    }
    if (stickyPanelEl) {
      if (!this.floatingToolbar?.setPanelVisible?.("sticky-panel", showStickyPanel)) {
        stickyPanelEl.hidden = !showStickyPanel;
      }
    }
    this.syncShapeLayerActions();
    this.syncButtonLayerActions();
    this.syncStickyLayerActions();
    if (!(allowPresentationDrawingControls && this.isBrushFamilyActive(activeToolId))) {
      this.penDropdown?.close?.();
      this.penDropdown?.clearAnchorElement?.();
    }
    if (!(allowPresentationDrawingControls && activeToolId === "eraser")) {
      this.closeEraserPanel();
    }

    if (this.eraserPanelEl) {
      this.eraserPanelEl.hidden = !this.eraserPanelOpen;
    }
    if (this.clearStrokesEl) {
      this.clearStrokesEl.disabled = !drawingPlugin?.hasDrawings?.();
    }
    if (this.eraserRadiusEl) {
      this.eraserRadiusEl.disabled = !(allowPresentationDrawingControls && activeToolId === "eraser");
    }
    if (this.eraserRadiusValueEl) {
      this.eraserRadiusValueEl.disabled = !(allowPresentationDrawingControls && activeToolId === "eraser");
    }

    if (saveFocusEl) {
      saveFocusEl.hidden = true;
      saveFocusEl.disabled = true;
    }
    if (focusPositionModeEl) {
      focusPositionModeEl.hidden = true;
      focusPositionModeEl.disabled = true;
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
    for (const button of (this.ui.buttonTypeControlsEl?.querySelectorAll("[data-button-shape-type]") ?? [])) {
      this.floatingToolbar?.setButtonState?.("button-panel", button.dataset.buttonShapeType, {
        disabled: !buttonControlsEnabled,
      });
    }

    const stickyControlsEnabled = showStickyPanel;
    for (const control of [
      this.ui.stickyFontSizeEl,
      this.ui.stickyFontSizeValueEl,
      this.ui.stickyTextColorEl,
      this.ui.stickyFillColorEl,
    ]) {
      if (control) control.disabled = !stickyControlsEnabled;
    }

    if (this.isBrushFamilyActive(activeToolId)) {
      this.queueBrushPanelPositionSync();
    }
    if (showButtonControls) {
      this.queueButtonPanelPositionSync();
    }
    if (showStickyPanel) {
      this.queueStickyPanelPositionSync();
    }
  }
}
