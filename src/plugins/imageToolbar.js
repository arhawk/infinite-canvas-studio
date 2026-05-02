import { BasePlugin } from "../core/baseClasses.js";
import { readImageFileAsDataUrl } from "../component/image.js";
import { renderIcons } from "../lib/icons.js";

const IMAGE_LAYER_ACTIONS = [
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

export class ImageToolbarPlugin extends BasePlugin {
  static pluginId = "image-toolbar";
  static modes = {
    edit: {
      tools: {
        arrange: {},
      },
    },
  };

  onSetup() {
    this.selectedImageNode = null;
    this.panelEl = this.buildPanel();
    this.fileInputEl = this.panelEl.querySelector("#image-toolbar-file-input");
    this.panel = this.app.floatingToolbar?.registerPanel?.({
      id: "image-panel",
      element: this.panelEl,
      getAnchorNode: () => this.selectedImageNode,
      getAnchorRect: (node, app) => (
        node?.getClientRect?.({ relativeTo: app.stage }) ?? null
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
    panel.id = "image-panel";
    panel.className = "toolbar__floating-panel toolbar__cluster toolbar__tool-panel toolbar__shape-panel toolbar__button-panel toolbar__image-panel";
    panel.dataset.testid = "image-panel";
    panel.hidden = true;
    panel.innerHTML = `
      <div class="toolbar__button-tools" role="group" aria-label="Image actions">
        <div class="toolbar__button-style-tool toolbar__image-upload-tool">
          <button
            id="image-upload-trigger"
            class="toolbar__button-style-trigger"
            type="button"
            title="Upload image"
            aria-label="Upload image"
            data-testid="image-upload"
          >
            <i data-lucide="upload" aria-hidden="true"></i>
          </button>
          <input
            id="image-toolbar-file-input"
            type="file"
            accept="image/*"
            hidden
            data-testid="image-upload-input"
          />
        </div>
        <div class="toolbar__button-style-tool toolbar__button-connect-tool">
          <button
            id="image-connect-trigger"
            class="toolbar__button-style-trigger"
            type="button"
            title="Connect to"
            aria-label="Connect to"
            data-testid="image-connect"
          >
            <i data-lucide="link-2" aria-hidden="true"></i>
          </button>
        </div>
        <div
          class="toolbar__button-style-tool toolbar__button-popover-tool toolbar__shape-layer-tool toolbar__image-layer-tool"
          data-popover-offset="none"
        >
          <button
            id="image-layer-menu-trigger"
            class="toolbar__button-style-trigger"
            type="button"
            title="Layer order"
            aria-label="Layer order"
            data-testid="image-layer-menu"
          >
            <i data-lucide="ellipsis" aria-hidden="true"></i>
          </button>
          <div class="toolbar__button-style-popover toolbar__shape-layer-popover toolbar__image-layer-popover" role="menu" aria-label="Image layer order">
            <button
              type="button"
              class="toolbar__shape-layer-action"
              data-image-layer-action="bring-forward"
              data-testid="image-layer-bring-forward"
            >
              Bring Forward
            </button>
            <button
              type="button"
              class="toolbar__shape-layer-action"
              data-image-layer-action="send-backward"
              data-testid="image-layer-send-backward"
            >
              Send Backward
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
    this.panel?.registerButton?.("upload", "#image-upload-trigger");
    this.panel?.registerButton?.("connect", "#image-connect-trigger");
    for (const button of this.panelEl.querySelectorAll("[data-image-layer-action]")) {
      this.panel?.registerButton?.(`layer:${button.dataset.imageLayerAction}`, button);
    }
  }

  bindEvents() {
    this.listen("selection:change", ({ nodes = [] } = {}) => {
      this.selectedImageNode =
        nodes.length === 1 && nodes[0]?.getAttr?.("componentType") === "image"
          ? nodes[0]
          : null;
      this.syncToolbar();
    });
    this.listen("interaction:change", () => this.syncToolbar());
    this.listen("viewport:change", () => this.panel?.queuePosition?.());
    this.listen("node:changing", ({ node } = {}) => {
      if (node === this.selectedImageNode) this.panel?.queuePosition?.();
    });
    this.listen("node:changed", ({ node } = {}) => {
      if (node === this.selectedImageNode) this.syncToolbar();
    });

    this.listenDom(this.panelEl.querySelector("#image-upload-trigger"), "click", () => {
      this.closeLayerMenu();
      this.fileInputEl?.click?.();
    });
    this.listenDom(this.fileInputEl, "change", async () => {
      const file = this.fileInputEl?.files?.[0] ?? null;
      this.fileInputEl.value = "";
      if (file) await this.applyImageFile(file);
    });
    this.listenDom(this.panelEl.querySelector("#image-connect-trigger"), "click", () => {
      this.startConnection();
    });

    const layerTrigger = this.panelEl.querySelector("#image-layer-menu-trigger");
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

    for (const button of this.panelEl.querySelectorAll("[data-image-layer-action]")) {
      this.listenDom(button, "click", () => {
        this.runLayerAction(button.dataset.imageLayerAction);
        button.blur();
      });
    }

    this.app.stage?.on?.("contextmenu.imageLayerMenu mousedown.imageLayerMenu", (event) => {
      this.handleStageContextMenu(event);
    });
    this.cleanups.push(() => this.app.stage?.off?.(".imageLayerMenu"));

    this.listenDom(this.panelEl, "focusin", () => {
      this.syncPopoverOpenState();
      this.panel?.queuePosition?.();
    });
    this.listenDom(this.panelEl, "focusout", () => {
      window.setTimeout(() => {
        this.syncPopoverOpenState();
        if (!this.panelEl.querySelector(".toolbar__image-layer-tool:focus-within")) {
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
      Boolean(this.selectedImageNode?.getStage?.());
    const hasImage = Boolean(this.selectedImageNode?.getAttr?.("imageSrc"));

    this.panel?.setVisible?.(isVisible);
    this.panel?.setButtonState?.("upload", {
      disabled: !isVisible,
      title: hasImage ? "Change image" : "Upload image",
      label: hasImage ? "Change image" : "Upload image",
    });
    this.syncConnectAction();
    this.syncLayerActions();
    if (isVisible) this.panel?.queuePosition?.();
  }

  async applyImageFile(file) {
    const node = this.selectedImageNode;
    if (this.app.getMode() !== "edit" || this.app.getEditorTool() !== "arrange") return;
    if (node?.getAttr?.("componentType") !== "image") return;

    const component = this.app.components.get("image");
    if (!component) return;

    const src = await readImageFileAsDataUrl(file);
    const current = component.serializeNode(node);
    this.app.events.emit("node:change:start", { node });
    await component.applySerializedData(node, {
      ...current,
      src,
    });
    node.getLayer?.()?.batchDraw?.();
    this.app.overlayLayer?.batchDraw?.();
    this.app.uiLayer?.batchDraw?.();
    this.app.events.emit("node:changed", { node });
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
    const node = this.selectedImageNode;
    if (node?.getAttr?.("componentType") !== "image") return;

    this.closeLayerMenu();
    this.app.commands.execute("connection:connect", node.id());
    this.syncConnectAction();
  }

  syncConnectAction() {
    const connections = this.getConnectionsPlugin();
    const node = this.selectedImageNode;
    const canConnect = Boolean(
      connections &&
      node?.getStage?.() &&
      node.getAttr?.("componentType") === "image" &&
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
    const node = this.selectedImageNode;
    const canTargetImage = Boolean(
      selection &&
      node?.getStage?.() &&
      node.getAttr?.("componentType") === "image",
    );

    for (const action of IMAGE_LAYER_ACTIONS) {
      this.panel?.setButtonState?.(`layer:${action.id}`, {
        disabled: !canTargetImage || !selection[action.canRun]?.(node),
        title: action.label,
        label: action.label,
      });
    }
  }

  runLayerAction(actionId) {
    const action = IMAGE_LAYER_ACTIONS.find((entry) => entry.id === actionId);
    const selection = this.getSelectionPlugin();
    const node = this.selectedImageNode;
    if (!action || !selection || node?.getAttr?.("componentType") !== "image") return;

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
    if (node?.getAttr?.("componentType") !== "image") return;

    event.evt?.preventDefault?.();
    event.cancelBubble = true;
    this.openLayerMenu(node, getClientPoint(this.app, event));
  }

  openLayerMenu(node, clientPoint = null) {
    if (node?.getAttr?.("componentType") !== "image") return;

    this.app.getPlugin?.("context-menu")?.hideMenu?.();
    this.getSelectionPlugin()?.setSelected?.([node]);
    this.selectedImageNode = node;
    this.syncToolbar();

    window.requestAnimationFrame(() => {
      const trigger = this.panelEl.querySelector("#image-layer-menu-trigger");
      trigger?.focus?.({ preventScroll: true });
      if (clientPoint) {
        this.positionLayerMenuAtPoint(clientPoint);
      }
      this.syncPopoverOpenState();
      this.panel?.queuePosition?.();
    });
  }

  getLayerToolEl() {
    return this.panelEl.querySelector(".toolbar__image-layer-tool");
  }

  getLayerPopoverEl() {
    return this.panelEl.querySelector(".toolbar__image-layer-popover");
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
    return this.app.floatingToolbar?.syncPopoverOpenState?.("image-panel");
  }
}
