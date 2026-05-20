import { BasePlugin } from "../core/baseClasses.js";
import { readVideoFileAsDataUrl } from "../component/video.js";
import { renderIcons } from "../lib/icons.js";
import { withTrackedNodeMutation } from "./nodeMutation.js";
import { clampToViewport, getClientPoint, getPluginById, resolveSelectableFromStageEvent } from "./toolbarShared.js";

const VIDEO_LAYER_ACTIONS = [
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

export class VideoToolbarPlugin extends BasePlugin {
  static pluginId = "video-toolbar";
  static modes = {
    edit: {
      tools: {
        arrange: {},
      },
    },
  };

  onSetup() {
    this.selectedVideoNode = null;
    this.panelEl = this.buildPanel();
    this.fileInputEl = this.panelEl.querySelector("#video-toolbar-file-input");
    this.panel = this.app.floatingToolbar?.registerPanel?.({
      id: "video-panel",
      element: this.panelEl,
      getAnchorNode: () => this.selectedVideoNode,
      getAnchorRect: (node, app) => (
        node?.findOne?.(".video-bg")?.getClientRect?.({ relativeTo: app.stage, skipShadow: true })
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
    panel.id = "video-panel";
    panel.className = "toolbar__floating-panel toolbar__cluster toolbar__tool-panel toolbar__shape-panel toolbar__button-panel toolbar__video-panel";
    panel.dataset.testid = "video-panel";
    panel.hidden = true;
    panel.innerHTML = `
      <div class="toolbar__button-tools" role="group" aria-label="Video actions">
        <div class="toolbar__button-style-tool toolbar__video-upload-tool">
          <button
            id="video-upload-trigger"
            class="toolbar__button-style-trigger"
            type="button"
            title="Upload video"
            aria-label="Upload video"
            data-testid="video-upload"
          >
            <i data-lucide="upload" aria-hidden="true"></i>
          </button>
          <input
            id="video-toolbar-file-input"
            type="file"
            accept="video/mp4,video/webm,video/ogg"
            hidden
            data-testid="video-upload-input"
          />
        </div>
        <div class="toolbar__button-style-tool toolbar__button-connect-tool">
          <button
            id="video-connect-trigger"
            class="toolbar__button-style-trigger"
            type="button"
            title="Connect to"
            aria-label="Connect to"
            data-testid="video-connect"
          >
            <i data-lucide="link-2" aria-hidden="true"></i>
          </button>
        </div>
        <div
          class="toolbar__button-style-tool toolbar__button-popover-tool toolbar__shape-layer-tool toolbar__video-layer-tool"
          data-popover-offset="none"
        >
          <button
            id="video-layer-menu-trigger"
            class="toolbar__button-style-trigger"
            type="button"
            title="Layer order"
            aria-label="Layer order"
            data-testid="video-layer-menu"
          >
            <i data-lucide="ellipsis" aria-hidden="true"></i>
          </button>
          <div class="toolbar__button-style-popover toolbar__shape-layer-popover toolbar__video-layer-popover" role="menu" aria-label="Video layer order">
            <button
              type="button"
              class="toolbar__shape-layer-action"
              data-video-layer-action="bring-forward"
              data-testid="video-layer-bring-forward"
            >
              Bring Forward
            </button>
            <button
              type="button"
              class="toolbar__shape-layer-action"
              data-video-layer-action="bring-to-front"
              data-testid="video-layer-bring-to-front"
            >
              Bring to Front
            </button>
            <button
              type="button"
              class="toolbar__shape-layer-action"
              data-video-layer-action="send-backward"
              data-testid="video-layer-send-backward"
            >
              Send Backward
            </button>
            <button
              type="button"
              class="toolbar__shape-layer-action"
              data-video-layer-action="send-to-back"
              data-testid="video-layer-send-to-back"
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
    this.panel?.registerButton?.("upload", "#video-upload-trigger");
    this.panel?.registerButton?.("connect", "#video-connect-trigger");
    for (const button of this.panelEl.querySelectorAll("[data-video-layer-action]")) {
      this.panel?.registerButton?.(`layer:${button.dataset.videoLayerAction}`, button);
    }
  }

  bindEvents() {
    this.listen("selection:change", ({ nodes = [] } = {}) => {
      this.selectedVideoNode =
        nodes.length === 1 && nodes[0]?.getAttr?.("componentType") === "video"
          ? nodes[0]
          : null;
      this.syncToolbar();
    });
    this.listen("interaction:change", () => this.syncToolbar());
    this.listen("viewport:change", () => this.panel?.queuePosition?.());
    this.listen("node:changing", ({ node } = {}) => {
      if (node === this.selectedVideoNode) this.panel?.queuePosition?.();
    });
    this.listen("node:changed", ({ node } = {}) => {
      if (node === this.selectedVideoNode) this.syncToolbar();
    });
    this.listen("video:contextmenu", ({ node, clientPoint } = {}) => {
      this.openLayerMenu(node, clientPoint);
    });

    this.listenDom(this.panelEl.querySelector("#video-upload-trigger"), "click", () => {
      this.closeLayerMenu();
      this.fileInputEl?.click?.();
    });
    this.listenDom(this.fileInputEl, "change", async () => {
      const file = this.fileInputEl?.files?.[0] ?? null;
      this.fileInputEl.value = "";
      if (file) await this.applyVideoFile(file);
    });
    this.listenDom(this.panelEl.querySelector("#video-connect-trigger"), "click", () => {
      this.startConnection();
    });

    const layerTrigger = this.panelEl.querySelector("#video-layer-menu-trigger");
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

    for (const button of this.panelEl.querySelectorAll("[data-video-layer-action]")) {
      this.listenDom(button, "click", () => {
        this.runLayerAction(button.dataset.videoLayerAction);
        button.blur();
      });
    }

    this.app.stage?.on?.("contextmenu.videoLayerMenu mousedown.videoLayerMenu", (event) => {
      this.handleStageContextMenu(event);
    });
    this.cleanups.push(() => this.app.stage?.off?.(".videoLayerMenu"));

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
        if (!this.panelEl.querySelector(".toolbar__video-layer-tool:focus-within")) {
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
      Boolean(this.selectedVideoNode?.getStage?.());
    const hasVideo = Boolean(this.selectedVideoNode?.getAttr?.("videoSrc"));

    this.panel?.setVisible?.(isVisible);
    this.panel?.setButtonState?.("upload", {
      disabled: !isVisible,
      title: hasVideo ? "Change video" : "Upload video",
      label: hasVideo ? "Change video" : "Upload video",
    });
    this.syncConnectAction();
    this.syncLayerActions();
    if (isVisible) this.panel?.queuePosition?.();
  }

  async applyVideoFile(file) {
    const node = this.selectedVideoNode;
    if (this.app.getMode() !== "edit" || this.app.getEditorTool() !== "arrange") return;
    if (node?.getAttr?.("componentType") !== "video") return;

    const component = this.app.components.get("video");
    if (!component) return;

    const src = await readVideoFileAsDataUrl(file);
    const current = component.serializeNode(node);
    await withTrackedNodeMutation(this.app, node, async () => {
      await component.applySerializedData(node, {
        ...current,
        src,
      });
      node.getLayer?.()?.batchDraw?.();
      this.app.overlayLayer?.batchDraw?.();
      this.app.uiLayer?.batchDraw?.();
    });
  }

  getSelectionPlugin() {
    return getPluginById(this.app, "selection");
  }

  getConnectionsPlugin() {
    return getPluginById(this.app, "connections");
  }

  startConnection() {
    const node = this.selectedVideoNode;
    if (node?.getAttr?.("componentType") !== "video") return;

    this.closeLayerMenu();
    this.app.commands.execute("connection:connect", node.id());
    this.syncConnectAction();
  }

  syncConnectAction() {
    const connections = this.getConnectionsPlugin();
    const node = this.selectedVideoNode;
    const canConnect = Boolean(
      connections &&
      node?.getStage?.() &&
      node.getAttr?.("componentType") === "video" &&
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
    const node = this.selectedVideoNode;
    const canTargetVideo = Boolean(
      selection &&
      node?.getStage?.() &&
      node.getAttr?.("componentType") === "video",
    );

    for (const action of VIDEO_LAYER_ACTIONS) {
      this.panel?.setButtonState?.(`layer:${action.id}`, {
        disabled: !canTargetVideo || !selection[action.canRun]?.(node),
        title: action.label,
        label: action.label,
      });
    }
  }

  runLayerAction(actionId) {
    const action = VIDEO_LAYER_ACTIONS.find((entry) => entry.id === actionId);
    const selection = this.getSelectionPlugin();
    const node = this.selectedVideoNode;
    if (!action || !selection || node?.getAttr?.("componentType") !== "video") return;

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
    if (node?.getAttr?.("componentType") !== "video") return;

    event.evt?.preventDefault?.();
    event.evt?.stopPropagation?.();
    event.cancelBubble = true;
    if (isRightMouseDown) return;

    this.openLayerMenu(node, getClientPoint(this.app, event));
  }

  handleNativeContextMenu(event) {
    if (this.app.getMode() !== "edit" || this.app.getEditorTool() !== "arrange") return;

    const node = this.resolveNodeFromNativeEvent(event);
    if (node?.getAttr?.("componentType") !== "video") return;

    event.preventDefault();
    event.stopPropagation();
    this.openLayerMenu(node, {
      x: event.clientX,
      y: event.clientY,
    });
  }

  resolveNodeFromNativeEvent(event) {
    const target = event.target instanceof Element ? event.target : null;
    const overlay = target?.closest?.(".video-component__overlay") ?? null;
    const nodeId = overlay?.dataset?.videoNodeId ?? null;
    return nodeId ? this.app.mainLayer?.findOne?.(`#${nodeId}`) ?? null : null;
  }

  openLayerMenu(node, clientPoint = null) {
    if (node?.getAttr?.("componentType") !== "video") return;

    this.app.getPlugin?.("context-menu")?.hideMenu?.();
    this.getSelectionPlugin()?.setSelected?.([node]);
    this.selectedVideoNode = node;
    this.syncToolbar();

    window.requestAnimationFrame(() => {
      const trigger = this.panelEl.querySelector("#video-layer-menu-trigger");
      trigger?.focus?.({ preventScroll: true });
      if (clientPoint) {
        this.positionLayerMenuAtPoint(clientPoint);
      }
      this.syncPopoverOpenState();
      this.panel?.queuePosition?.();
    });
  }

  getLayerToolEl() {
    return this.panelEl.querySelector(".toolbar__video-layer-tool");
  }

  getLayerPopoverEl() {
    return this.panelEl.querySelector(".toolbar__video-layer-popover");
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
    return this.app.floatingToolbar?.syncPopoverOpenState?.("video-panel");
  }
}
