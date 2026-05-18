import { BasePlugin } from "../core/baseClasses.js";
import { renderIcons } from "../lib/icons.js";

const JAVASCRIPT_EDITOR_LAYER_ACTIONS = [
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

function getClientPoint(app, event) {
  const nativeEvent = event?.evt ?? event;
  const clientX = nativeEvent?.clientX;
  const clientY = nativeEvent?.clientY;
  if (Number.isFinite(clientX) && Number.isFinite(clientY)) {
    return { x: clientX, y: clientY };
  }

  const pointer = app.stage?.getPointerPosition?.() ?? null;
  const rect = app.stage?.container?.()?.getBoundingClientRect?.() ?? null;
  if (pointer && rect) {
    return { x: rect.left + pointer.x, y: rect.top + pointer.y };
  }

  return null;
}

function clampToViewport(value, size, margin = 8) {
  return Math.max(margin, Math.min(value, window.innerWidth - size - margin));
}

export class JavaScriptEditorToolbarPlugin extends BasePlugin {
  static pluginId = "javascript-editor-toolbar";
  static modes = {
    edit: {
      tools: {
        arrange: {},
      },
    },
  };

  onSetup() {
    this.selectedEditorNode = null;
    this.panelEl = this.buildPanel();
    this.panel = this.app.floatingToolbar?.registerPanel?.({
      id: "javascript-editor-panel",
      element: this.panelEl,
      getAnchorNode: () => this.selectedEditorNode,
      getAnchorRect: (node, app) => (
        node?.findOne?.(".javascript-editor-bg")?.getClientRect?.({ relativeTo: app.stage, skipShadow: true })
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
    this.bindEvents();
    this.syncToolbar();
  }

  buildPanel() {
    const panel = document.createElement("div");
    panel.id = "javascript-editor-panel";
    panel.className = "toolbar__floating-panel toolbar__cluster toolbar__tool-panel toolbar__shape-panel toolbar__button-panel toolbar__javascript-editor-panel";
    panel.dataset.testid = "javascript-editor-panel";
    panel.hidden = true;
    panel.innerHTML = `
      <div class="toolbar__button-tools" role="group" aria-label="JavaScript editor actions">
        <div class="toolbar__button-style-tool toolbar__button-connect-tool">
          <button
            id="javascript-editor-connect-trigger"
            class="toolbar__button-style-trigger"
            type="button"
            title="Connect to"
            aria-label="Connect to"
            data-testid="javascript-editor-connect"
          >
            <i data-lucide="link-2" aria-hidden="true"></i>
          </button>
        </div>
        <div
          class="toolbar__button-style-tool toolbar__button-popover-tool toolbar__shape-layer-tool toolbar__javascript-editor-layer-tool"
          data-popover-offset="none"
        >
          <button
            id="javascript-editor-layer-menu-trigger"
            class="toolbar__button-style-trigger"
            type="button"
            title="Layer order"
            aria-label="Layer order"
            data-testid="javascript-editor-layer-menu"
          >
            <i data-lucide="ellipsis" aria-hidden="true"></i>
          </button>
          <div class="toolbar__button-style-popover toolbar__shape-layer-popover toolbar__javascript-editor-layer-popover" role="menu" aria-label="JavaScript editor layer order">
            <button
              type="button"
              class="toolbar__shape-layer-action"
              data-javascript-editor-layer-action="bring-forward"
              data-testid="javascript-editor-layer-bring-forward"
            >
              Bring Forward
            </button>
            <button
              type="button"
              class="toolbar__shape-layer-action"
              data-javascript-editor-layer-action="bring-to-front"
              data-testid="javascript-editor-layer-bring-to-front"
            >
              Bring to Front
            </button>
            <button
              type="button"
              class="toolbar__shape-layer-action"
              data-javascript-editor-layer-action="send-backward"
              data-testid="javascript-editor-layer-send-backward"
            >
              Send Backward
            </button>
            <button
              type="button"
              class="toolbar__shape-layer-action"
              data-javascript-editor-layer-action="send-to-back"
              data-testid="javascript-editor-layer-send-to-back"
            >
              Send to Back
            </button>
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
    this.panel?.registerButton?.("connect", "#javascript-editor-connect-trigger");
    for (const button of this.panelEl.querySelectorAll("[data-javascript-editor-layer-action]")) {
      this.panel?.registerButton?.(
        `layer:${button.dataset.javascriptEditorLayerAction}`,
        button,
      );
    }
  }

  bindEvents() {
    this.listen("selection:change", ({ nodes = [] } = {}) => {
      this.selectedEditorNode =
        nodes.length === 1 && nodes[0]?.getAttr?.("componentType") === "javascriptEditor"
          ? nodes[0]
          : null;
      this.syncToolbar();
    });
    this.listen("interaction:change", () => this.syncToolbar());
    this.listen("viewport:change", () => this.panel?.queuePosition?.());
    this.listen("node:changing", ({ node } = {}) => {
      if (node === this.selectedEditorNode) this.panel?.queuePosition?.();
    });
    this.listen("node:changed", ({ node } = {}) => {
      if (node === this.selectedEditorNode) {
        this.syncToolbar();
      }
    });
    this.listen("javascript-editor:contextmenu", ({ node, clientPoint } = {}) => {
      this.openLayerMenu(node, clientPoint);
    });

    this.listenDom(this.panelEl.querySelector("#javascript-editor-connect-trigger"), "click", () => {
      this.startConnection();
    });

    const layerTrigger = this.panelEl.querySelector("#javascript-editor-layer-menu-trigger");
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

    for (const button of this.panelEl.querySelectorAll("[data-javascript-editor-layer-action]")) {
      this.listenDom(button, "click", () => {
        this.runLayerAction(button.dataset.javascriptEditorLayerAction);
        button.blur();
      });
    }

    this.app.stage?.on?.(
      "contextmenu.javascriptEditorLayerMenu mousedown.javascriptEditorLayerMenu",
      (event) => this.handleStageContextMenu(event),
    );
    this.cleanups.push(() => this.app.stage?.off?.(".javascriptEditorLayerMenu"));

    const captureOptions = { capture: true };
    this.listenDom(document, "contextmenu", (event) => {
      this.handleNativeContextMenu(event);
    }, captureOptions);

    this.listenDom(this.panelEl, "focusin", () => {
      this.syncPopoverOpenState();
      this.panel?.queuePosition?.();
    });
    this.listenDom(this.panelEl, "focusout", () => {
      window.setTimeout(() => {
        this.syncPopoverOpenState();
        if (!this.panelEl.querySelector(".toolbar__javascript-editor-layer-tool:focus-within")) {
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
  }

  syncToolbar() {
    const isVisible =
      this.app.getMode() === "edit" &&
      this.app.getEditorTool() === "arrange" &&
      Boolean(this.selectedEditorNode?.getStage?.());

    this.panel?.setVisible?.(isVisible);
    this.syncConnectAction();
    this.syncLayerActions();
    if (isVisible) this.panel?.queuePosition?.();
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

  startConnection() {
    const node = this.selectedEditorNode;
    if (node?.getAttr?.("componentType") !== "javascriptEditor") return;

    this.closeLayerMenu();
    this.app.commands.execute("connection:connect", node.id());
    this.syncConnectAction();
  }

  syncConnectAction() {
    const connections = this.getConnectionsPlugin();
    const node = this.selectedEditorNode;
    const canConnect = Boolean(
      connections &&
      node?.getStage?.() &&
      node.getAttr?.("componentType") === "javascriptEditor" &&
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
    const node = this.selectedEditorNode;
    const canTargetEditor = Boolean(
      selection &&
      node?.getStage?.() &&
      node.getAttr?.("componentType") === "javascriptEditor",
    );

    for (const action of JAVASCRIPT_EDITOR_LAYER_ACTIONS) {
      this.panel?.setButtonState?.(`layer:${action.id}`, {
        disabled: !canTargetEditor || !selection[action.canRun]?.(node),
        title: action.label,
        label: action.label,
      });
    }
  }

  runLayerAction(actionId) {
    const action = JAVASCRIPT_EDITOR_LAYER_ACTIONS.find((entry) => entry.id === actionId);
    const selection = this.getSelectionPlugin();
    const node = this.selectedEditorNode;
    if (!action || !selection || node?.getAttr?.("componentType") !== "javascriptEditor") return;

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
    if (node?.getAttr?.("componentType") !== "javascriptEditor") return;

    event.evt?.preventDefault?.();
    event.evt?.stopPropagation?.();
    event.cancelBubble = true;
    if (isRightMouseDown) return;

    this.openLayerMenu(node, getClientPoint(this.app, event));
  }

  handleNativeContextMenu(event) {
    if (this.app.getMode() !== "edit" || this.app.getEditorTool() !== "arrange") return;

    const node = this.resolveNodeFromNativeEvent(event);
    if (node?.getAttr?.("componentType") !== "javascriptEditor") return;

    event.preventDefault();
    event.stopPropagation();
    this.openLayerMenu(node, {
      x: event.clientX,
      y: event.clientY,
    });
  }

  resolveNodeFromNativeEvent(event) {
    const target = event.target instanceof Element ? event.target : null;
    const overlay = target?.closest?.(".javascript-editor-component__overlay") ?? null;
    const nodeId = overlay?.dataset?.javascriptEditorNodeId ?? null;
    return nodeId ? this.app.mainLayer?.findOne?.(`#${nodeId}`) ?? null : null;
  }

  openLayerMenu(node, clientPoint = null) {
    if (node?.getAttr?.("componentType") !== "javascriptEditor") return;

    this.app.getPlugin?.("context-menu")?.hideMenu?.();
    this.getSelectionPlugin()?.setSelected?.([node]);
    this.selectedEditorNode = node;
    this.syncToolbar();

    window.requestAnimationFrame(() => {
      const trigger = this.panelEl.querySelector("#javascript-editor-layer-menu-trigger");
      trigger?.focus?.({ preventScroll: true });
      if (clientPoint) {
        this.positionLayerMenuAtPoint(clientPoint);
      }
      this.syncPopoverOpenState();
      this.panel?.queuePosition?.();
    });
  }

  getLayerToolEl() {
    return this.panelEl.querySelector(".toolbar__javascript-editor-layer-tool");
  }

  getLayerPopoverEl() {
    return this.panelEl.querySelector(".toolbar__javascript-editor-layer-popover");
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
    const left = clampToViewport(x, width, margin);
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
    return this.app.floatingToolbar?.syncPopoverOpenState?.("javascript-editor-panel");
  }
}
