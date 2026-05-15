import { BasePlugin } from "../core/baseClasses.js";
import {
  CONNECTION_KIND_DIRECTED,
  CONNECTION_KIND_TERMDEF,
  DEFAULT_STROKE,
  getConnectionConfiguredStyle,
  getConnectionKind,
  getConnectionLine,
} from "../component/connection.js";
import {
  ColorToolbarController,
  DEFAULT_COLOR_SWATCHES,
  normalizeHexColor,
} from "../lib/colorToolbar.js";
import { renderIcons } from "../lib/icons.js";

const MIN_STROKE_WIDTH = 1;
const MAX_STROKE_WIDTH = 16;
const MIN_POINTER_SIZE = 6;
const MAX_POINTER_SIZE = 36;

function clampNumber(value, fallback, min, max) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(Math.max(numeric, min), max);
}

function resolveSelectable(target) {
  if (!target) return null;
  if (target.hasName?.("selectable")) return target;
  return target.findAncestor?.(".selectable", true) ?? null;
}

function resolveSelectableFromStageEvent(app, event) {
  const direct = resolveSelectable(event?.target);
  if (direct?.listening?.() !== false) return direct;

  const stage = app.stage;
  if (!stage || typeof stage.getIntersection !== "function") return direct;
  if (event?.evt && typeof stage.setPointersPositions === "function") {
    stage.setPointersPositions(event.evt);
  }

  const pointer = stage.getPointerPosition?.() ?? null;
  const intersection = pointer ? stage.getIntersection(pointer) : null;
  const selectable = resolveSelectable(intersection);
  return selectable?.listening?.() !== false ? selectable : direct;
}

export class ConnectionToolbarPlugin extends BasePlugin {
  static pluginId = "connection-toolbar";
  static modes = {
    edit: {
      tools: {
        arrange: {},
      },
    },
  };

  onSetup() {
    this.selectedConnectionNode = null;
    this.panelEl = this.buildPanel();
    this.strokeColorEl = this.panelEl.querySelector("#connection-stroke-color");
    this.strokeWidthEl = this.panelEl.querySelector("#connection-stroke-width");
    this.strokeWidthValueEl = this.panelEl.querySelector("#connection-stroke-width-value");
    this.pointerLengthEl = this.panelEl.querySelector("#connection-pointer-length");
    this.pointerLengthValueEl = this.panelEl.querySelector("#connection-pointer-length-value");
    this.pointerWidthEl = this.panelEl.querySelector("#connection-pointer-width");
    this.pointerWidthValueEl = this.panelEl.querySelector("#connection-pointer-width-value");
    this.reverseDirectionEl = this.panelEl.querySelector("#connection-reverse-direction");
    this.termdefToggleEl = this.panelEl.querySelector("#connection-termdef-toggle");
    this.hiddenToggleEl = this.panelEl.querySelector("#connection-hidden-toggle");
    this.colorToolbar = null;

    this.panel = this.app.floatingToolbar?.registerPanel?.({
      id: "connection-panel",
      element: this.panelEl,
      getAnchorNode: () => this.selectedConnectionNode,
      getAnchorRect: (node, app) => (
        getConnectionLine(node)?.getClientRect?.({ relativeTo: app.stage })
        ?? node?.getClientRect?.({ relativeTo: app.stage })
        ?? null
      ),
      viewportMargin: 12,
      anchorGap: 64,
      popover: {
        nodeClearance: 10,
      },
    });

    this.cleanups.push(() => {
      this.panel?.unregister?.();
      this.panelEl?.remove?.();
    });

    this.registerPanelButtons();
    this.setupColorToolbar();
    this.bindEvents();
    this.syncToolbar();
  }

  onModeExit() {
    this.panel?.setVisible?.(false);
  }

  buildPanel() {
    const panel = document.createElement("div");
    panel.id = "connection-panel";
    panel.className = "toolbar__floating-panel toolbar__cluster toolbar__tool-panel toolbar__shape-panel toolbar__button-panel toolbar__connection-panel";
    panel.dataset.testid = "connection-panel";
    panel.hidden = true;
    panel.innerHTML = `
      <div class="toolbar__button-tools" role="group" aria-label="Connection actions">
        <div class="toolbar__button-style-tool toolbar__button-popover-tool toolbar__connection-color-tool" data-popover-role="color">
          <button
            id="connection-stroke-style-trigger"
            class="toolbar__button-style-trigger"
            type="button"
            title="Line color"
            aria-label="Line color"
            data-testid="connection-style-stroke"
          >
            <span class="toolbar__connection-line-icon" aria-hidden="true"></span>
          </button>
          <div class="toolbar__button-style-popover" role="group" aria-label="Connection line color settings">
            <div id="connection-stroke-swatches" class="toolbar__button-color-grid" role="group" aria-label="Connection line color swatches"></div>
            <div class="toolbar__button-custom-color" title="Custom line color">
              <span class="toolbar__sr-only">Custom line color</span>
              <input
                id="connection-stroke-color"
                type="color"
                value="${DEFAULT_STROKE}"
                aria-label="Custom line color"
                title="Line color"
                data-testid="connection-stroke-color"
              />
            </div>
          </div>
        </div>
        <div class="toolbar__button-style-tool toolbar__button-popover-tool toolbar__connection-width-tool">
          <button
            id="connection-stroke-width-style-trigger"
            class="toolbar__button-style-trigger"
            type="button"
            title="Line width"
            aria-label="Line width"
            data-testid="connection-style-stroke-width"
          >
            <i data-lucide="minus" aria-hidden="true"></i>
          </button>
          <div class="toolbar__button-style-popover" role="group" aria-label="Connection line width settings">
            <label class="toolbar__button-style-row">
              <span id="connection-stroke-width-label">Line width</span>
              <input
                id="connection-stroke-width"
                type="range"
                min="${MIN_STROKE_WIDTH}"
                max="${MAX_STROKE_WIDTH}"
                step="1"
                value="3"
                data-testid="connection-stroke-width"
                aria-labelledby="connection-stroke-width-label"
                title="Line width: 3"
              />
              <output id="connection-stroke-width-value" data-testid="connection-stroke-width-value" title="Line width: 3">3</output>
            </label>
          </div>
        </div>
        <div class="toolbar__button-style-tool toolbar__button-popover-tool toolbar__connection-arrow-tool">
          <button
            id="connection-arrow-style-trigger"
            class="toolbar__button-style-trigger"
            type="button"
            title="Arrow size"
            aria-label="Arrow size"
            data-testid="connection-style-arrow"
          >
            <i data-lucide="route" aria-hidden="true"></i>
          </button>
          <div class="toolbar__button-style-popover" role="group" aria-label="Connection arrow size settings">
            <label class="toolbar__button-style-row">
              <span id="connection-pointer-length-label">Arrow length</span>
              <input
                id="connection-pointer-length"
                type="range"
                min="${MIN_POINTER_SIZE}"
                max="${MAX_POINTER_SIZE}"
                step="1"
                value="10"
                data-testid="connection-pointer-length"
                aria-labelledby="connection-pointer-length-label"
                title="Arrow length: 10"
              />
              <output id="connection-pointer-length-value" data-testid="connection-pointer-length-value" title="Arrow length: 10">10</output>
            </label>
            <label class="toolbar__button-style-row">
              <span id="connection-pointer-width-label">Arrow width</span>
              <input
                id="connection-pointer-width"
                type="range"
                min="${MIN_POINTER_SIZE}"
                max="${MAX_POINTER_SIZE}"
                step="1"
                value="10"
                data-testid="connection-pointer-width"
                aria-labelledby="connection-pointer-width-label"
                title="Arrow width: 10"
              />
              <output id="connection-pointer-width-value" data-testid="connection-pointer-width-value" title="Arrow width: 10">10</output>
            </label>
          </div>
        </div>
        <div class="toolbar__button-style-tool toolbar__connection-toggle-tool">
          <button
            id="connection-reverse-direction"
            class="toolbar__button-style-trigger toolbar__connection-toggle"
            type="button"
            title="Reverse direction"
            aria-label="Reverse direction"
            data-testid="connection-reverse-direction"
          >
            <i data-lucide="arrow-left-right" aria-hidden="true"></i>
          </button>
        </div>
        <div class="toolbar__button-style-tool toolbar__connection-toggle-tool">
          <button
            id="connection-termdef-toggle"
            class="toolbar__button-style-trigger toolbar__connection-toggle"
            type="button"
            title="Term/Def"
            aria-label="Term/Def"
            aria-pressed="false"
            data-testid="connection-termdef-toggle"
          >
            <span class="toolbar__connection-termdef-icon" aria-hidden="true">1:1</span>
          </button>
        </div>
        <div class="toolbar__button-style-tool toolbar__connection-toggle-tool">
          <button
            id="connection-hidden-toggle"
            class="toolbar__button-style-trigger toolbar__connection-toggle"
            type="button"
            title="Hide until endpoint selected"
            aria-label="Hide until endpoint selected"
            aria-pressed="false"
            data-testid="connection-hidden-toggle"
          >
            <i data-lucide="eye-off" aria-hidden="true"></i>
          </button>
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
    this.panel?.registerButton?.("reverse", "#connection-reverse-direction");
    this.panel?.registerButton?.("termdef", "#connection-termdef-toggle");
    this.panel?.registerButton?.("hidden", "#connection-hidden-toggle");
  }

  setupColorToolbar() {
    this.colorToolbar = new ColorToolbarController({
      listenDom: this.listenDom.bind(this),
      renderIcons,
      targets: {
        stroke: {
          input: this.strokeColorEl,
          swatchesEl: this.panelEl.querySelector("#connection-stroke-swatches"),
          label: "Line color",
          baseColors: DEFAULT_COLOR_SWATCHES.filter((color) => color !== "transparent"),
          onChange: () => this.applyStyleFromPanel(),
        },
      },
    });
    this.colorToolbar.setup();
  }

  bindEvents() {
    this.listen("selection:change", ({ nodes = [] } = {}) => {
      this.selectedConnectionNode =
        nodes.length === 1 && nodes[0]?.getAttr?.("componentType") === "connection"
          ? nodes[0]
          : null;
      this.syncToolbar();
    });
    this.listen("interaction:change", () => this.syncToolbar());
    this.listen("document:load:end", () => this.syncToolbar());
    this.listen("viewport:change", () => this.panel?.queuePosition?.());
    this.listen("node:changing", ({ node } = {}) => {
      if (node === this.selectedConnectionNode) this.panel?.queuePosition?.();
    });
    this.listen("node:changed", ({ node } = {}) => {
      if (node === this.selectedConnectionNode) this.syncToolbar();
    });

    this.listenDom(this.strokeColorEl, "input", () => {
      this.colorToolbar?.recordCustomColor("stroke", this.strokeColorEl?.value);
      this.applyStyleFromPanel();
    });
    this.listenDom(this.strokeWidthEl, "input", () => this.applyStyleFromPanel());
    this.listenDom(this.pointerLengthEl, "input", () => this.applyStyleFromPanel());
    this.listenDom(this.pointerWidthEl, "input", () => this.applyStyleFromPanel());
    this.listenDom(this.reverseDirectionEl, "click", () => this.reverseConnectionDirection());
    this.listenDom(this.termdefToggleEl, "click", () => this.toggleConnectionKind());
    this.listenDom(this.hiddenToggleEl, "click", () => this.toggleHiddenUntilEndpointSelected());

    this.app.stage?.on?.("contextmenu.connectionToolbar mousedown.connectionToolbar", (event) => {
      this.handleStageContextMenu(event);
    });
    this.cleanups.push(() => this.app.stage?.off?.(".connectionToolbar"));

    this.listenDom(this.panelEl, "contextmenu", (event) => {
      event.preventDefault();
      event.stopPropagation();
    });
    this.listenDom(this.panelEl, "focusin", () => {
      this.syncPopoverOpenState();
      this.panel?.queuePosition?.();
    });
    this.listenDom(this.panelEl, "focusout", () => {
      window.setTimeout(() => {
        this.syncPopoverOpenState();
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

  getConnectionComponent() {
    return this.app.components.get("connection") ?? null;
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

  isTermdefEligible(node) {
    if (node?.getAttr?.("componentType") !== "connection") return false;
    const sourceId = node.getAttr("sourceNodeId");
    const targetId = node.getAttr("targetNodeId");
    const source = sourceId ? this.app.mainLayer.findOne(`#${sourceId}`) : null;
    const target = targetId ? this.app.mainLayer.findOne(`#${targetId}`) : null;
    return (
      source?.getAttr?.("componentType") === "text" &&
      target?.getAttr?.("componentType") === "text"
    );
  }

  getPanelState(node = this.selectedConnectionNode) {
    if (node?.getAttr?.("componentType") !== "connection") {
      return {
        stroke: DEFAULT_STROKE,
        strokeWidth: 3,
        pointerLength: 10,
        pointerWidth: 10,
        hiddenUntilEndpointSelected: false,
        termdef: false,
        termdefEligible: false,
        canReverse: false,
      };
    }

    const line = getConnectionLine(node);
    const configured = getConnectionConfiguredStyle(node);
    const kind = getConnectionKind(node);
    const storedPointerLength = node?.getAttr?.("directedPointerLength");
    const storedPointerWidth = node?.getAttr?.("directedPointerWidth");
    return {
      sourceNodeId: node.getAttr("sourceNodeId") ?? null,
      targetNodeId: node.getAttr("targetNodeId") ?? null,
      stroke: normalizeHexColor(configured.stroke, DEFAULT_STROKE),
      strokeWidth: clampNumber(
        line?.strokeWidth?.(),
        3,
        MIN_STROKE_WIDTH,
        MAX_STROKE_WIDTH,
      ),
      pointerLength: clampNumber(
        kind === CONNECTION_KIND_TERMDEF ? storedPointerLength : line?.pointerLength?.(),
        10,
        MIN_POINTER_SIZE,
        MAX_POINTER_SIZE,
      ),
      pointerWidth: clampNumber(
        kind === CONNECTION_KIND_TERMDEF ? storedPointerWidth : line?.pointerWidth?.(),
        10,
        MIN_POINTER_SIZE,
        MAX_POINTER_SIZE,
      ),
      hiddenUntilEndpointSelected: configured.hiddenUntilEndpointSelected,
      termdef: kind === CONNECTION_KIND_TERMDEF,
      termdefEligible: this.isTermdefEligible(node),
      canReverse: Boolean(
        node.getAttr("sourceNodeId") &&
        node.getAttr("targetNodeId") &&
        node.getAttr("sourceNodeId") !== node.getAttr("targetNodeId") &&
        kind !== CONNECTION_KIND_TERMDEF,
      ),
    };
  }

  syncToolbar() {
    const isVisible =
      this.app.getMode() === "edit" &&
      this.app.getEditorTool() === "arrange" &&
      Boolean(this.selectedConnectionNode?.getStage?.());

    this.panel?.setVisible?.(isVisible);
    const state = this.getPanelState(this.selectedConnectionNode);

    this.syncColorUi(state.stroke);
    this.syncNumericUi({
      input: this.strokeWidthEl,
      output: this.strokeWidthValueEl,
      value: state.strokeWidth,
      label: "Line width",
      suffix: "",
    });
    this.syncNumericUi({
      input: this.pointerLengthEl,
      output: this.pointerLengthValueEl,
      value: state.pointerLength,
      label: "Arrow length",
      suffix: "",
    });
    this.syncNumericUi({
      input: this.pointerWidthEl,
      output: this.pointerWidthValueEl,
      value: state.pointerWidth,
      label: "Arrow width",
      suffix: "",
    });

    for (const input of [
      this.strokeColorEl,
      this.strokeWidthEl,
      this.pointerLengthEl,
      this.pointerWidthEl,
    ]) {
      if (input) input.disabled = !isVisible;
    }

    this.panel?.setButtonState?.("termdef", {
      disabled: !isVisible || (!state.termdefEligible && !state.termdef),
      pressed: state.termdef,
      title: state.termdefEligible || state.termdef
        ? "Term/Def"
        : "Only available for Text to Text connections",
      label: "Term/Def",
      classes: { "is-active": state.termdef },
    });
    this.panel?.setButtonState?.("reverse", {
      disabled: !isVisible || !state.canReverse,
      title: state.termdef ? "Term/Def connections are symmetric" : "Reverse direction",
      label: "Reverse direction",
    });
    this.panel?.setButtonState?.("hidden", {
      disabled: !isVisible,
      pressed: state.hiddenUntilEndpointSelected,
      title: "Hide until endpoint selected",
      label: "Hide until endpoint selected",
      classes: { "is-active": state.hiddenUntilEndpointSelected },
    });

    this.colorToolbar?.sync();

    if (isVisible) {
      this.panel?.queuePosition?.();
    }
  }

  syncColorUi(stroke) {
    const color = normalizeHexColor(stroke, DEFAULT_STROKE);
    const toolEl = this.strokeColorEl?.closest?.(".toolbar__button-style-tool");
    if (this.strokeColorEl) {
      this.strokeColorEl.value = color;
      this.strokeColorEl.title = "Line color";
    }
    toolEl?.style.setProperty("--button-tool-color", color);
    toolEl?.style.setProperty(
      "--button-tool-stroke-width",
      `${clampNumber(this.strokeWidthEl?.value, 3, MIN_STROKE_WIDTH, MAX_STROKE_WIDTH)}px`,
    );
  }

  syncNumericUi({ input, output, value, label }) {
    const numeric = Number(value);
    const display = Number.isFinite(numeric) ? String(numeric) : "";
    if (input) {
      input.value = display;
      input.title = `${label}: ${display}`;
    }
    if (output) {
      output.textContent = display;
      output.title = `${label}: ${display}`;
    }
    if (input === this.strokeWidthEl) {
      this.strokeColorEl
        ?.closest?.(".toolbar__button-style-tool")
        ?.style.setProperty("--button-tool-stroke-width", `${Math.max(1, numeric || 1)}px`);
    }
  }

  async applyStyleFromPanel() {
    const node = this.selectedConnectionNode;
    if (node?.getAttr?.("componentType") !== "connection") return;

    const component = this.getConnectionComponent();
    if (!component) return;

    const currentState = this.getPanelState(node);
    const stroke = normalizeHexColor(this.strokeColorEl?.value, currentState.stroke);
    const strokeWidth = clampNumber(
      this.strokeWidthEl?.value,
      currentState.strokeWidth,
      MIN_STROKE_WIDTH,
      MAX_STROKE_WIDTH,
    );
    const pointerLength = clampNumber(
      this.pointerLengthEl?.value,
      currentState.pointerLength,
      MIN_POINTER_SIZE,
      MAX_POINTER_SIZE,
    );
    const pointerWidth = clampNumber(
      this.pointerWidthEl?.value,
      currentState.pointerWidth,
      MIN_POINTER_SIZE,
      MAX_POINTER_SIZE,
    );

    if (
      currentState.stroke === stroke &&
      currentState.strokeWidth === strokeWidth &&
      currentState.pointerLength === pointerLength &&
      currentState.pointerWidth === pointerWidth
    ) {
      this.syncToolbar();
      return;
    }

    const current = component.serializeNode(node);
    await this.applyConnectionData(node, {
      ...current,
      stroke,
      strokeWidth,
      pointerLength,
      pointerWidth,
      directedPointerLength: pointerLength,
      directedPointerWidth: pointerWidth,
    });
  }

  async toggleHiddenUntilEndpointSelected() {
    const node = this.selectedConnectionNode;
    if (node?.getAttr?.("componentType") !== "connection") return;

    const component = this.getConnectionComponent();
    if (!component) return;

    const current = component.serializeNode(node);
    await this.applyConnectionData(node, {
      ...current,
      hiddenUntilEndpointSelected: !current.hiddenUntilEndpointSelected,
    });
  }

  async reverseConnectionDirection() {
    const node = this.selectedConnectionNode;
    if (node?.getAttr?.("componentType") !== "connection") return;
    if (getConnectionKind(node) === CONNECTION_KIND_TERMDEF) return;

    const component = this.getConnectionComponent();
    if (!component) return;

    const current = component.serializeNode(node);
    if (!current.sourceNodeId || !current.targetNodeId || current.sourceNodeId === current.targetNodeId) {
      this.syncToolbar();
      return;
    }

    await this.applyConnectionData(node, {
      ...current,
      sourceNodeId: current.targetNodeId,
      targetNodeId: current.sourceNodeId,
    });
  }

  toggleConnectionKind() {
    const node = this.selectedConnectionNode;
    if (node?.getAttr?.("componentType") !== "connection") return;

    const nextKind = getConnectionKind(node) === CONNECTION_KIND_TERMDEF
      ? CONNECTION_KIND_DIRECTED
      : CONNECTION_KIND_TERMDEF;
    const connections = this.getConnectionsPlugin();
    if (!connections?.setConnectionKind?.(node, nextKind)) {
      this.syncToolbar();
      return;
    }

    node.getLayer?.()?.batchDraw?.();
    this.app.uiLayer?.batchDraw?.();
    this.syncToolbar();
  }

  async applyConnectionData(node, nextData) {
    const component = this.getConnectionComponent();
    if (!component || node?.getAttr?.("componentType") !== "connection") return false;

    this.app.events.emit("node:change:start", { node });
    await component.applySerializedData(node, nextData);
    node.getLayer?.()?.batchDraw?.();
    this.app.overlayLayer?.batchDraw?.();
    this.app.uiLayer?.batchDraw?.();
    this.app.events.emit("node:changed", { node });
    this.syncToolbar();
    return true;
  }

  handleStageContextMenu(event) {
    const isContextMenuEvent = event.type === "contextmenu";
    const isRightMouseDown = event.type === "mousedown" && event.evt?.button === 2;
    if (!isContextMenuEvent && !isRightMouseDown) return;
    if (this.app.getMode() !== "edit" || this.app.getEditorTool() !== "arrange") return;

    const node = resolveSelectableFromStageEvent(this.app, event);
    if (node?.getAttr?.("componentType") !== "connection") return;

    event.evt?.preventDefault?.();
    event.evt?.stopPropagation?.();
    event.cancelBubble = true;
    this.openToolbarForNode(node);
  }

  openToolbarForNode(node) {
    if (node?.getAttr?.("componentType") !== "connection") return;

    this.app.getPlugin?.("context-menu")?.hideMenu?.();
    this.getSelectionPlugin()?.setSelected?.([node]);
    this.selectedConnectionNode = node;
    this.syncToolbar();

    window.requestAnimationFrame(() => {
      this.syncPopoverOpenState();
      this.panel?.queuePosition?.();
    });
  }

  syncPopoverOpenState() {
    return this.app.floatingToolbar?.syncPopoverOpenState?.("connection-panel");
  }
}
