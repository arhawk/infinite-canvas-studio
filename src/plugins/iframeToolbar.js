import { BasePlugin } from "../core/baseClasses.js";
import { renderIcons } from "../lib/icons.js";

const IFRAME_LAYER_ACTIONS = [
  {
    id: "bring-forward",
    label: "Bring Forward",
    run: "bringForward",
    canRun: "canBringForward",
  },
  {
    id: "send-backward",
    label: "Send Backward",
    run: "sendBackward",
    canRun: "canSendBackward",
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

function clampToViewport(value, size, margin = 8, max = window.innerWidth) {
  return Math.max(margin, Math.min(value, max - size - margin));
}

export class IframeToolbarPlugin extends BasePlugin {
  static pluginId = "iframe-toolbar";
  static modes = {
    edit: {
      tools: {
        arrange: {},
      },
    },
  };

  onSetup() {
    this.selectedIframeNode = null;
    this.panelEl = this.buildPanel();
    this.formEl = this.panelEl.querySelector("#iframe-url-form");
    this.urlInputEl = this.panelEl.querySelector("#iframe-url-input");
    this.urlApplyEl = this.panelEl.querySelector("#iframe-url-apply");
    this.isApplyingEdit = false;
    this.lastSyncedUrl = "";
    this.panel = this.app.floatingToolbar?.registerPanel?.({
      id: "iframe-panel",
      element: this.panelEl,
      getAnchorNode: () => this.selectedIframeNode,
      getAnchorRect: (node, app) => (
        node?.getClientRect?.({ relativeTo: app.stage, skipShadow: true })
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
    panel.id = "iframe-panel";
    panel.className = "toolbar__floating-panel toolbar__cluster toolbar__tool-panel toolbar__shape-panel toolbar__button-panel toolbar__iframe-panel";
    panel.dataset.testid = "iframe-panel";
    panel.hidden = true;
    panel.innerHTML = `
      <div class="toolbar__button-tools" role="group" aria-label="Iframe actions">
        <div class="toolbar__iframe-url-tool">
          <form id="iframe-url-form" class="toolbar__iframe-url-form" data-testid="iframe-url-form">
            <label class="toolbar__sr-only" for="iframe-url-input">Iframe URL</label>
            <input
              id="iframe-url-input"
              class="toolbar__inline-field-input toolbar__iframe-url-input"
              type="url"
              placeholder="https://example.com"
              autocomplete="off"
              autocapitalize="off"
              spellcheck="false"
              aria-label="Iframe URL"
              data-testid="iframe-url-input"
            />
            <button
              id="iframe-url-apply"
              class="toolbar__button-style-trigger toolbar__iframe-url-apply"
              type="submit"
              title="Apply URL"
              aria-label="Apply URL"
              data-testid="iframe-url-apply"
            >
              Go
            </button>
          </form>
        </div>
        <div class="toolbar__button-style-tool toolbar__button-connect-tool">
          <button
            id="iframe-connect-trigger"
            class="toolbar__button-style-trigger"
            type="button"
            title="Connect to"
            aria-label="Connect to"
            data-testid="iframe-connect"
          >
            <i data-lucide="link-2" aria-hidden="true"></i>
          </button>
        </div>
        <div
          class="toolbar__button-style-tool toolbar__button-popover-tool toolbar__shape-layer-tool toolbar__iframe-layer-tool"
          data-popover-offset="none"
        >
          <button
            id="iframe-layer-menu-trigger"
            class="toolbar__button-style-trigger"
            type="button"
            title="Layer order"
            aria-label="Layer order"
            data-testid="iframe-layer-menu"
          >
            <i data-lucide="ellipsis" aria-hidden="true"></i>
          </button>
          <div
            class="toolbar__button-style-popover toolbar__shape-layer-popover toolbar__iframe-layer-popover"
            role="menu"
            aria-label="Iframe actions"
          >
            <button
              type="button"
              class="toolbar__shape-layer-action"
              data-iframe-layer-action="bring-forward"
              data-testid="iframe-layer-bring-forward"
            >
              Bring Forward
            </button>
            <button
              type="button"
              class="toolbar__shape-layer-action"
              data-iframe-layer-action="send-backward"
              data-testid="iframe-layer-send-backward"
            >
              Send Backward
            </button>
            <button
              type="button"
              class="toolbar__shape-layer-action"
              data-iframe-layer-action="edit"
              data-testid="iframe-layer-edit"
            >
              Edit
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
    this.panel?.registerButton?.("url:apply", "#iframe-url-apply");
    this.panel?.registerButton?.("connect", "#iframe-connect-trigger");
    for (const button of this.panelEl.querySelectorAll("[data-iframe-layer-action]")) {
      this.panel?.registerButton?.(`layer:${button.dataset.iframeLayerAction}`, button);
    }
    this.panel?.registerButton?.("edit", "#iframe-panel [data-iframe-layer-action='edit']");
  }

  bindEvents() {
    this.listen("selection:change", ({ nodes = [] } = {}) => {
      this.selectedIframeNode =
        nodes.length === 1 && nodes[0]?.getAttr?.("componentType") === "iframe"
          ? nodes[0]
          : null;
      this.syncToolbar();
    });
    this.listen("interaction:change", () => this.syncToolbar());
    this.listen("viewport:change", () => this.panel?.queuePosition?.());
    this.listen("node:changing", ({ node } = {}) => {
      if (node === this.selectedIframeNode) this.panel?.queuePosition?.();
    });
    this.listen("node:changed", ({ node } = {}) => {
      if (node === this.selectedIframeNode) {
        this.syncToolbar();
      }
    });
    this.listen("iframe:contextmenu", ({ node, clientPoint } = {}) => {
      this.openLayerMenu(node, clientPoint);
    });

    this.listenDom(this.panelEl.querySelector("#iframe-connect-trigger"), "click", () => {
      this.startConnection();
    });

    this.listenDom(this.formEl, "submit", (event) => {
      event.preventDefault();
      void this.applyEdit();
    });
    this.listenDom(this.urlInputEl, "blur", () => {
      if (this.isApplyingEdit) return;
      void this.applyEdit({ preserveFocus: false });
    });
    this.listenDom(this.urlInputEl, "keydown", (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        this.syncEditForm();
        this.urlInputEl.blur();
      }
    });

    const layerTrigger = this.panelEl.querySelector("#iframe-layer-menu-trigger");
    let closeLayerMenuOnClick = false;
    this.listenDom(layerTrigger, "pointerdown", (event) => {
      closeLayerMenuOnClick = this.isAnyPopoverOpen();
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

    for (const button of this.panelEl.querySelectorAll("[data-iframe-layer-action]")) {
      this.listenDom(button, "click", (event) => {
        event.preventDefault();
        this.runLayerAction(button.dataset.iframeLayerAction);
        button.blur();
      });
    }

    this.app.stage?.on?.("contextmenu.iframeLayerMenu mousedown.iframeLayerMenu", (event) => {
      this.handleStageContextMenu(event);
    });
    this.cleanups.push(() => this.app.stage?.off?.(".iframeLayerMenu"));

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
        if (!this.getLayerToolEl()?.matches?.(":focus-within")) {
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
      Boolean(this.selectedIframeNode?.getStage?.());

    this.panel?.setVisible?.(isVisible);
    this.setUrlInputState(isVisible);
    this.syncConnectAction();
    this.syncLayerActions();
    this.panel?.setButtonState?.("edit", {
      disabled: !isVisible,
      title: "Focus URL",
      label: "Edit",
    });
    if (!isVisible) {
      this.closeLayerMenu();
      return;
    }
    this.syncEditForm();
    this.panel?.queuePosition?.();
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
    const node = this.selectedIframeNode;
    if (node?.getAttr?.("componentType") !== "iframe") return;

    this.closeLayerMenu();
    this.app.commands.execute("connection:connect", node.id());
    this.syncConnectAction();
  }

  syncConnectAction() {
    const connections = this.getConnectionsPlugin();
    const node = this.selectedIframeNode;
    const canConnect = Boolean(
      connections &&
      node?.getStage?.() &&
      node.getAttr?.("componentType") === "iframe" &&
      connections.isConnectable?.(node),
    );

    this.panel?.setButtonState?.("connect", {
      disabled: !canConnect,
      title: "Connect to",
      label: "Connect to",
    });
  }

  setUrlInputState(isVisible) {
    if (!this.urlInputEl || !this.urlApplyEl) return;
    this.urlInputEl.disabled = !isVisible;
    this.urlApplyEl.disabled = !isVisible;
    this.panel?.setButtonState?.("url:apply", {
      disabled: !isVisible,
      title: "Apply URL",
      label: "Apply URL",
    });
  }

  syncLayerActions() {
    const selection = this.getSelectionPlugin();
    const node = this.selectedIframeNode;
    const canTargetIframe = Boolean(
      selection &&
      node?.getStage?.() &&
      node.getAttr?.("componentType") === "iframe",
    );

    for (const action of IFRAME_LAYER_ACTIONS) {
      this.panel?.setButtonState?.(`layer:${action.id}`, {
        disabled: !canTargetIframe || !selection[action.canRun]?.(node),
        title: action.label,
        label: action.label,
      });
    }
  }

  runLayerAction(actionId) {
    if (actionId === "edit") {
      this.closeLayerMenu();
      this.focusUrlInput();
      return;
    }

    const action = IFRAME_LAYER_ACTIONS.find((entry) => entry.id === actionId);
    const selection = this.getSelectionPlugin();
    const node = this.selectedIframeNode;
    if (!action || !selection || node?.getAttr?.("componentType") !== "iframe") return;

    selection[action.run]?.(node);
    node.getLayer?.()?.batchDraw?.();
    this.app.overlayLayer?.batchDraw?.();
    this.app.uiLayer?.batchDraw?.();
    this.syncLayerActions();
    this.panel?.queuePosition?.();
  }

  handleStageContextMenu(event) {
    const isContextMenuEvent = event.type === "contextmenu";
    const isRightMouseDown = event.type === "mousedown" && event.evt?.button === 2;
    if (!isContextMenuEvent && !isRightMouseDown) return;
    if (this.app.getMode() !== "edit" || this.app.getEditorTool() !== "arrange") return;

    const node = resolveSelectableFromStageEvent(this.app, event);
    if (node?.getAttr?.("componentType") !== "iframe") return;

    event.evt?.preventDefault?.();
    event.evt?.stopPropagation?.();
    event.cancelBubble = true;
    if (isRightMouseDown) return;

    this.openLayerMenu(node, getClientPoint(this.app, event));
  }

  handleNativeContextMenu(event) {
    if (this.app.getMode() !== "edit" || this.app.getEditorTool() !== "arrange") return;

    const node = this.resolveNodeFromNativeEvent(event);
    if (node?.getAttr?.("componentType") !== "iframe") return;

    event.preventDefault();
    event.stopPropagation();
    this.openLayerMenu(node, {
      x: event.clientX,
      y: event.clientY,
    });
  }

  resolveNodeFromNativeEvent(event) {
    const target = event.target instanceof Element ? event.target : null;
    const overlay = target?.closest?.(".iframe-component__overlay") ?? null;
    const nodeId = overlay?.dataset?.iframeNodeId ?? null;
    return nodeId ? this.app.mainLayer?.findOne?.(`#${nodeId}`) ?? null : null;
  }

  openLayerMenu(node, clientPoint = null) {
    if (node?.getAttr?.("componentType") !== "iframe") return;

    this.app.getPlugin?.("context-menu")?.hideMenu?.();
    this.getSelectionPlugin()?.setSelected?.([node]);
    this.selectedIframeNode = node;
    this.syncToolbar();

    window.requestAnimationFrame(() => {
      const trigger = this.panelEl.querySelector("#iframe-layer-menu-trigger");
      trigger?.focus?.({ preventScroll: true });
      if (clientPoint) {
        this.positionPopoverAtPoint(this.getLayerPopoverEl(), clientPoint);
      }
      this.syncPopoverOpenState();
      this.panel?.queuePosition?.();
    });
  }

  focusUrlInput() {
    const node = this.selectedIframeNode;
    if (node?.getAttr?.("componentType") !== "iframe") return;

    window.requestAnimationFrame(() => {
      this.urlInputEl?.focus?.();
      this.urlInputEl?.select?.();
      this.panel?.queuePosition?.();
    });
  }

  syncEditForm() {
    const node = this.selectedIframeNode;
    const component = this.app.components.get("iframe");
    if (!node || !component || !this.urlInputEl) return;

    const current = component.serializeNode(node);
    this.lastSyncedUrl = current.url ?? "";
    this.urlInputEl.value = this.lastSyncedUrl;
  }

  async applyEdit({ preserveFocus = true } = {}) {
    const node = this.selectedIframeNode;
    const component = this.app.components.get("iframe");
    if (
      this.app.getMode() !== "edit" ||
      this.app.getEditorTool() !== "arrange" ||
      node?.getAttr?.("componentType") !== "iframe" ||
      !component
    ) {
      return;
    }

    const current = component.serializeNode(node);
    const nextUrl = this.urlInputEl?.value ?? "";
    if (nextUrl === current.url) {
      this.lastSyncedUrl = current.url ?? "";
      if (preserveFocus) this.panel?.queuePosition?.();
      return;
    }

    const nextData = {
      ...current,
      url: nextUrl,
    };

    this.isApplyingEdit = true;
    this.app.events.emit("node:change:start", { node });
    try {
      await component.applySerializedData(node, nextData);
      node.getLayer?.()?.batchDraw?.();
      this.app.overlayLayer?.batchDraw?.();
      this.app.uiLayer?.batchDraw?.();
      this.app.events.emit("node:changed", { node });
      this.lastSyncedUrl = component.serializeNode(node)?.url ?? "";
      if (this.urlInputEl) {
        this.urlInputEl.value = this.lastSyncedUrl;
      }
    } finally {
      this.isApplyingEdit = false;
    }

    if (preserveFocus) {
      this.urlInputEl?.focus?.();
      this.urlInputEl?.select?.();
    }
    this.closeLayerMenu();
    this.syncToolbar();
  }

  getLayerToolEl() {
    return this.panelEl.querySelector(".toolbar__iframe-layer-tool");
  }

  getLayerPopoverEl() {
    return this.panelEl.querySelector(".toolbar__iframe-layer-popover");
  }

  isAnyPopoverOpen() {
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
    const popovers = [this.getLayerPopoverEl()];
    if (!tool) return;

    tool.classList.remove("is-context-open");
    tool.removeAttribute("data-context-x");
    tool.removeAttribute("data-context-y");
    popovers.forEach((popover) => {
      popover?.style.removeProperty("position");
      popover?.style.removeProperty("top");
      popover?.style.removeProperty("right");
      popover?.style.removeProperty("left");
      popover?.style.removeProperty("transform");
      popover?.style.removeProperty("z-index");
    });
  }

  getStoredContextPoint() {
    const tool = this.getLayerToolEl();
    const x = Number(tool?.dataset?.contextX);
    const y = Number(tool?.dataset?.contextY);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    return { x, y };
  }

  positionPopoverAtPoint(popover, point) {
    const tool = this.getLayerToolEl();
    const x = Number(point?.x);
    const y = Number(point?.y);
    if (!tool || !popover || !Number.isFinite(x) || !Number.isFinite(y)) return;

    tool.classList.add("is-context-open");
    tool.dataset.contextX = String(x);
    tool.dataset.contextY = String(y);
    const margin = 8;
    const width = popover.offsetWidth || popover.getBoundingClientRect().width || 164;
    const height = popover.offsetHeight || popover.getBoundingClientRect().height || 72;
    const left = clampToViewport(x, width, margin);
    const top = clampToViewport(y, height, margin, window.innerHeight);
    const toolRect = tool.getBoundingClientRect();

    popover.style.setProperty("position", "absolute", "important");
    popover.style.setProperty("top", `${Math.round(top - toolRect.top)}px`, "important");
    popover.style.setProperty("right", "auto", "important");
    popover.style.setProperty("left", `${Math.round(left - toolRect.left)}px`, "important");
    popover.style.setProperty("transform", "none", "important");
    popover.style.setProperty("z-index", "100", "important");
  }

  syncPopoverOpenState() {
    return this.app.floatingToolbar?.syncPopoverOpenState?.("iframe-panel");
  }
}
