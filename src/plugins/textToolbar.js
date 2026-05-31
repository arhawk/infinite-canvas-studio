import { BasePlugin } from "../core/baseClasses.js";
import {
  ColorToolbarController,
  DEFAULT_COLOR_SWATCHES,
} from "../lib/colorToolbar.js";
import { renderIcons } from "../lib/icons.js";
import { withTrackedNodeMutation } from "./nodeMutation.js";
import { getClientPoint, getPluginById, resolveSelectableFromStageEvent } from "./toolbarShared.js";

const TEXT_LAYER_ACTIONS = [
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

const MIN_FONT_SIZE = 12;
const MAX_FONT_SIZE = 96;

function clampFontSize(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 24;
  return Math.min(Math.max(Math.round(numeric), MIN_FONT_SIZE), MAX_FONT_SIZE);
}

export class TextToolbarPlugin extends BasePlugin {
  static pluginId = "text-toolbar";
  static modes = {
    edit: {
      tools: {
        arrange: {},
      },
    },
  };

  onSetup() {
    this.selectedTextNode = null;
    this.panelEl = this.buildPanel();
    this.fontSizeEl = this.panelEl.querySelector("#text-font-size");
    this.fontSizeValueEl = this.panelEl.querySelector("#text-font-size-value");
    this.textColorEl = this.panelEl.querySelector("#text-color");

    this.panel = this.app.floatingToolbar?.registerPanel?.({
      id: "text-panel",
      element: this.panelEl,
      getAnchorNode: () => this.selectedTextNode,
      getAnchorRect: (node, app) => (
        node?.getClientRect?.({
          relativeTo: app.stage,
          skipShadow: true,
          skipStroke: true,
        }) ?? null
      ),
      viewportMargin: 12,
      anchorGap: 64,
      popover: {
        nodeClearance: 10,
      },
    });

    this.registerPanelButtons();
    this.setupColorToolbar();
    this.bindEvents();
    this.syncToolbar();

    this.cleanups.push(() => {
      this.app.stage?.off?.(".textToolbar");
      this.panel?.unregister?.();
      this.panelEl?.remove?.();
    });
  }

  buildPanel() {
    const panel = document.createElement("div");
    panel.id = "text-panel";
    panel.className = "toolbar__floating-panel toolbar__cluster toolbar__tool-panel toolbar__shape-panel toolbar__button-panel toolbar__text-panel";
    panel.dataset.testid = "text-panel";
    panel.hidden = true;
    panel.innerHTML = `
      <div class="toolbar__button-tools" role="group" aria-label="Text actions">
        <div class="toolbar__button-style-tool toolbar__button-popover-tool toolbar__button-tool--font-size">
          <button
            id="text-font-size-style-trigger"
            class="toolbar__button-style-trigger"
            type="button"
            title="Font size"
            aria-label="Font size"
            data-testid="text-style-font-size"
          >
            <span class="toolbar__button-font-size-icon" aria-hidden="true">
              <span class="toolbar__button-font-size-a">A</span>
              <span class="toolbar__button-font-size-mark"></span>
            </span>
          </button>
          <div class="toolbar__button-style-popover" role="group" aria-label="Text font size settings">
            <label class="toolbar__button-style-row">
              <span id="text-font-size-label">Font size</span>
              <input
                id="text-font-size"
                type="range"
                min="${MIN_FONT_SIZE}"
                max="${MAX_FONT_SIZE}"
                step="1"
                value="24"
                data-testid="text-font-size"
                aria-labelledby="text-font-size-label"
                title="Font size: 24"
              />
              <output id="text-font-size-value" data-testid="text-font-size-value" title="Font size: 24">24</output>
            </label>
          </div>
        </div>
        <div class="toolbar__button-style-tool toolbar__button-popover-tool toolbar__button-tool--text-color" data-popover-role="color">
          <button
            id="text-color-style-trigger"
            class="toolbar__button-style-trigger"
            type="button"
            title="Text color"
            aria-label="Text color"
            data-testid="text-style-color"
          >
            <span class="toolbar__button-text-icon" aria-hidden="true">A</span>
          </button>
          <div class="toolbar__button-style-popover" role="group" aria-label="Text color settings">
            <div id="text-color-swatches" class="toolbar__button-color-grid" role="group" aria-label="Text color swatches"></div>
            <div class="toolbar__button-custom-color" title="Custom text color">
              <span class="toolbar__sr-only">Custom text color</span>
              <input
                id="text-color"
                type="color"
                value="#1d1b16"
                aria-label="Custom text color"
                title="Text color"
                data-testid="text-color"
              />
            </div>
          </div>
        </div>
        <div class="toolbar__button-style-tool toolbar__button-connect-tool">
          <button
            id="text-connect-trigger"
            class="toolbar__button-style-trigger"
            type="button"
            title="Connect to"
            aria-label="Connect to"
            data-testid="text-connect"
          >
            <i data-lucide="link-2" aria-hidden="true"></i>
          </button>
        </div>
        <div class="toolbar__button-style-tool toolbar__button-popover-tool toolbar__shape-layer-tool toolbar__text-layer-tool" data-popover-offset="none">
          <button
            id="text-layer-menu-trigger"
            class="toolbar__button-style-trigger"
            type="button"
            title="Layer order"
            aria-label="Layer order"
            data-testid="text-layer-menu"
          >
            <i data-lucide="ellipsis" aria-hidden="true"></i>
          </button>
          <div class="toolbar__button-style-popover toolbar__shape-layer-popover toolbar__text-layer-popover" role="menu" aria-label="Text layer order">
            <button type="button" class="toolbar__shape-layer-action" data-text-layer-action="bring-forward" data-testid="text-layer-bring-forward">Bring Forward</button>
            <button type="button" class="toolbar__shape-layer-action" data-text-layer-action="bring-to-front" data-testid="text-layer-bring-to-front">Bring to Front</button>
            <button type="button" class="toolbar__shape-layer-action" data-text-layer-action="send-backward" data-testid="text-layer-send-backward">Send Backward</button>
            <button type="button" class="toolbar__shape-layer-action" data-text-layer-action="send-to-back" data-testid="text-layer-send-to-back">Send to Back</button>
          </div>
        </div>
      </div>
    `;
    document.body.append(panel);
    renderIcons(panel, {
      width: 16,
      height: 16,
      "stroke-width": 2,
    });
    return panel;
  }

  registerPanelButtons() {
    this.panel?.registerButton?.("connect", "#text-connect-trigger");
    for (const button of this.panelEl.querySelectorAll("[data-text-layer-action]")) {
      this.panel?.registerButton?.(`layer:${button.dataset.textLayerAction}`, button);
    }
  }

  setupColorToolbar() {
    this.colorToolbar = new ColorToolbarController({
      listenDom: this.listenDom.bind(this),
      renderIcons,
      targets: {
        text: {
          input: this.textColorEl,
          swatchesEl: this.panelEl.querySelector("#text-color-swatches"),
          label: "Text color",
          baseColors: DEFAULT_COLOR_SWATCHES.filter((color) => color !== "transparent"),
          onChange: () => this.applyStyleFromPanel(),
        },
      },
    });
    this.colorToolbar.setup();
  }

  bindEvents() {
    this.listen("selection:change", ({ nodes = [] } = {}) => {
      this.selectedTextNode =
        nodes.length === 1 && nodes[0]?.getAttr?.("componentType") === "text"
          ? nodes[0]
          : null;
      this.syncToolbar();
    });
    this.listen("interaction:change", () => this.syncToolbar());
    this.listen("document:load:end", () => this.syncToolbar());
    this.listen("viewport:change", () => this.panel?.queuePosition?.());
    this.listen("node:changing", ({ node } = {}) => {
      if (node === this.selectedTextNode) this.panel?.queuePosition?.();
    });
    this.listen("node:changed", ({ node } = {}) => {
      if (node === this.selectedTextNode) this.syncToolbar();
    });

    this.listenDom(this.fontSizeEl, "input", () => this.applyStyleFromPanel());
    this.listenDom(this.textColorEl, "input", () => {
      this.colorToolbar?.recordCustomColor("text", this.textColorEl?.value);
      this.applyStyleFromPanel();
    });
    this.listenDom(this.panelEl.querySelector("#text-connect-trigger"), "click", () => {
      this.startConnection();
    });

    const layerTrigger = this.panelEl.querySelector("#text-layer-menu-trigger");
    let closeLayerMenuOnClick = false;
    this.listenDom(layerTrigger, "pointerdown", (event) => {
      closeLayerMenuOnClick = this.isLayerMenuOpen();
      if (closeLayerMenuOnClick) {
        event.preventDefault();
      } else {
        this.clearLayerContextPosition();
      }
    });
    this.listenDom(layerTrigger, "click", (event) => {
      if (!closeLayerMenuOnClick) return;
      event.preventDefault();
      closeLayerMenuOnClick = false;
      this.closeLayerMenu();
    });

    for (const button of this.panelEl.querySelectorAll("[data-text-layer-action]")) {
      this.listenDom(button, "click", () => {
        this.runLayerAction(button.dataset.textLayerAction);
        button.blur();
      });
    }

    this.app.stage?.on?.("contextmenu.textToolbar mousedown.textToolbar", (event) => {
      this.handleStageContextMenu(event);
    });

    this.listenDom(this.panelEl, "focusin", () => {
      this.syncPopoverOpenState();
      this.panel?.queuePosition?.();
    });
    this.listenDom(this.panelEl, "focusout", () => {
      window.setTimeout(() => {
        this.syncPopoverOpenState();
        if (!this.panelEl.querySelector(".toolbar__text-layer-tool:focus-within")) {
          this.clearLayerContextPosition();
        }
        this.panel?.queuePosition?.();
      }, 0);
    });
    this.listenDom(this.panelEl, "pointerdown", () => {
      window.requestAnimationFrame(() => {
        this.syncPopoverOpenState();
        this.panel?.queuePosition?.();
      });
    }, true);
    this.listenDom(document, "pointerdown", (event) => {
      if (!this.colorToolbar?.activeTarget) return;
      if (this.colorToolbar.containsActiveTarget(event.target)) return;
      this.colorToolbar.closeActive();
    });
  }

  getTextComponent() {
    return this.app.components.get("text");
  }

  getSelectionPlugin() {
    return getPluginById(this.app, "selection");
  }

  getConnectionsPlugin() {
    return getPluginById(this.app, "connections");
  }

  getPanelState(node) {
    return {
      fontSize: clampFontSize(node?.fontSize?.() ?? 24),
      fill: node?.fill?.() ?? "#1d1b16",
    };
  }

  async applyStyleFromPanel() {
    const node = this.selectedTextNode;
    if (node?.getAttr?.("componentType") !== "text") return;
    if (!this.fontSizeEl || !this.textColorEl) return;

    const component = this.getTextComponent();
    if (!component) return;

    const fontSize = clampFontSize(this.fontSizeEl.value);
    const fill = this.textColorEl.value || "#1d1b16";
    const current = component.serializeNode(node);
    if (current.fontSize === fontSize && current.fill === fill) {
      this.syncFontSizeValue(fontSize);
      return;
    }

    await withTrackedNodeMutation(this.app, node, async () => {
      await component.applySerializedData(node, {
        ...current,
        fontSize,
        fill,
      });
      node.getLayer?.()?.batchDraw?.();
      this.app.overlayLayer?.batchDraw?.();
    });
    this.syncFontSizeValue(fontSize);
    this.syncColorUi(fill);
  }

  syncToolbar() {
    const isVisible =
      this.app.getMode() === "edit" &&
      this.app.getEditorTool() === "arrange" &&
      Boolean(this.selectedTextNode?.getStage?.());

    this.panel?.setVisible?.(isVisible);
    const state = this.getPanelState(this.selectedTextNode);
    if (this.fontSizeEl) {
      this.fontSizeEl.disabled = !isVisible;
      this.fontSizeEl.value = String(state.fontSize);
      this.fontSizeEl.title = `Font size: ${state.fontSize}`;
    }
    this.syncFontSizeValue(state.fontSize);
    if (this.textColorEl) {
      this.textColorEl.disabled = !isVisible;
      this.textColorEl.value = state.fill;
    }
    this.syncColorUi(state.fill);
    this.syncConnectAction();
    this.syncLayerActions();
    this.colorToolbar?.sync();

    if (isVisible) {
      this.panel?.queuePosition?.();
    } else {
      this.closeLayerMenu();
    }
  }

  syncFontSizeValue(fontSize) {
    if (this.fontSizeValueEl) {
      this.fontSizeValueEl.textContent = String(fontSize);
      this.fontSizeValueEl.title = `Font size: ${fontSize}`;
    }
    if (this.fontSizeEl) {
      this.fontSizeEl.value = String(fontSize);
      this.fontSizeEl.title = `Font size: ${fontSize}`;
    }
  }

  syncColorUi(fill) {
    const textToolEl = this.textColorEl?.closest?.(".toolbar__button-style-tool");
    if (this.textColorEl) {
      this.textColorEl.value = fill;
      this.textColorEl.title = "Text color";
    }
    textToolEl?.style.setProperty("--button-tool-color", fill);
  }

  startConnection() {
    const node = this.selectedTextNode;
    if (node?.getAttr?.("componentType") !== "text") return;

    this.closeLayerMenu();
    this.app.commands.execute("connection:connect", node.id());
    this.syncConnectAction();
  }

  syncConnectAction() {
    const connections = this.getConnectionsPlugin();
    const node = this.selectedTextNode;
    const canConnect = Boolean(
      connections &&
      node?.getStage?.() &&
      node.getAttr?.("componentType") === "text" &&
      connections.isConnectable?.(node),
    );

    this.panel?.setButtonState?.("connect", {
      disabled: !canConnect,
      title: "Connect to",
      label: "Connect to",
    });
  }

  syncLayerActions() {
    const selection = this.getSelectionPlugin();
    const node = this.selectedTextNode;
    const canTargetText = Boolean(
      selection &&
      node?.getStage?.() &&
      node.getAttr?.("componentType") === "text",
    );

    for (const action of TEXT_LAYER_ACTIONS) {
      this.panel?.setButtonState?.(`layer:${action.id}`, {
        disabled: !canTargetText || !selection[action.canRun]?.(node),
        title: action.label,
        label: action.label,
      });
    }
  }

  runLayerAction(actionId) {
    const action = TEXT_LAYER_ACTIONS.find((entry) => entry.id === actionId);
    const selection = this.getSelectionPlugin();
    const node = this.selectedTextNode;
    if (!action || !selection || node?.getAttr?.("componentType") !== "text") return;

    selection[action.run]?.(node);
    this.syncLayerActions();
    this.panel?.queuePosition?.();
  }

  handleStageContextMenu(event) {
    const isContextMenuEvent = event.type === "contextmenu";
    const isRightMouseDown = event.type === "mousedown" && event.evt?.button === 2;
    if (!isContextMenuEvent && !isRightMouseDown) return;
    if (this.app.getMode() !== "edit" || this.app.getEditorTool() !== "arrange") return;

    const node = resolveSelectableFromStageEvent(this.app, event);
    if (node?.getAttr?.("componentType") !== "text") return;

    event.evt?.preventDefault?.();
    event.cancelBubble = true;
    this.openLayerMenu(node, getClientPoint(this.app, event));
  }

  openLayerMenu(node, clientPoint = null) {
    if (node?.getAttr?.("componentType") !== "text") return;

    this.app.getPlugin?.("context-menu")?.hideMenu?.();
    this.getSelectionPlugin()?.setSelected?.([node]);
    this.selectedTextNode = node;
    this.syncToolbar();

    window.requestAnimationFrame(() => {
      const trigger = this.panelEl.querySelector("#text-layer-menu-trigger");
      trigger?.focus?.({ preventScroll: true });
      if (clientPoint) {
        this.positionLayerMenuAtPoint(clientPoint);
      }
      this.syncPopoverOpenState();
      this.panel?.queuePosition?.();
    });
  }

  getLayerToolEl() {
    return this.panelEl.querySelector(".toolbar__text-layer-tool");
  }

  getLayerPopoverEl() {
    return this.panelEl.querySelector(".toolbar__text-layer-popover");
  }

  isLayerMenuOpen() {
    return Boolean(this.getLayerToolEl()?.matches?.(":focus-within"));
  }

  closeLayerMenu() {
    const tool = this.getLayerToolEl();
    const activeElement = document.activeElement;
    if (tool?.contains?.(activeElement)) {
      activeElement.blur?.();
    }
    this.clearLayerContextPosition();
    this.syncPopoverOpenState();
    this.panel?.queuePosition?.();
  }

  clearLayerContextPosition() {
    const tool = this.getLayerToolEl();
    const popover = this.getLayerPopoverEl();
    if (!tool) return;

    tool.classList.remove("is-context-open");
    popover?.style.removeProperty("position");
    popover?.style.removeProperty("top");
    popover?.style.removeProperty("right");
    popover?.style.removeProperty("left");
    popover?.style.removeProperty("transform");
    popover?.style.removeProperty("z-index");
  }

  positionLayerMenuAtPoint(point) {
    const tool = this.getLayerToolEl();
    const popover = this.getLayerPopoverEl();
    const x = Number(point?.x);
    const y = Number(point?.y);
    if (!tool || !popover || !Number.isFinite(x) || !Number.isFinite(y)) return;

    tool.classList.add("is-context-open");
    const margin = 8;
    const width = popover.offsetWidth || popover.getBoundingClientRect().width || 140;
    const height = popover.offsetHeight || popover.getBoundingClientRect().height || 60;
    const left = Math.max(margin, Math.min(x, window.innerWidth - width - margin));
    const top = Math.max(margin, Math.min(y, window.innerHeight - height - margin));
    const toolRect = tool.getBoundingClientRect();
    popover.style.setProperty("position", "absolute", "important");
    popover.style.setProperty("top", `${Math.round(top - toolRect.top)}px`, "important");
    popover.style.setProperty("right", "auto", "important");
    popover.style.setProperty("left", `${Math.round(left - toolRect.left)}px`, "important");
    popover.style.setProperty("transform", "none", "important");
    popover.style.setProperty("z-index", "100", "important");
  }

  syncPopoverOpenState() {
    return this.app.floatingToolbar?.syncPopoverOpenState?.("text-panel");
  }
}
