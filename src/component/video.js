import { BaseComponent } from "../core/baseClasses.js";
import { createOverlayNodeDragBridge } from "./overlayInteraction.js";
import { applyOverlayOcclusionStyles, getOverlayOcclusionRects } from "./overlayOcclusion.js";
import { Konva } from "../lib/konva.js";
import { getCanvasTheme } from "../theme/canvasTheme.js";

const DEFAULT_WIDTH = 360;
const DEFAULT_HEIGHT = 240;
const HEADER_HEIGHT = 40;
const DEFAULT_TITLE = "Local Video";

function normalizeTitle(title) {
  return typeof title === "string" && title.trim() ? title.trim() : DEFAULT_TITLE;
}

export function readVideoFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error ?? new Error("Failed to read video file."));
    reader.readAsDataURL(file);
  });
}

function syncVideoChrome(node) {
  const width = node.width() || DEFAULT_WIDTH;
  const height = node.height() || DEFAULT_HEIGHT + HEADER_HEIGHT;
  const bodyHeight = Math.max(0, height - HEADER_HEIGHT);
  const background = node.findOne(".video-bg");
  const videoArea = node.findOne(".video-area");
  const placeholder = node.findOne(".video-placeholder");

  if (background) {
    background.width(width);
    background.height(height);
  }

  if (videoArea) {
    videoArea.width(width);
    videoArea.height(bodyHeight);
  }

  if (placeholder) {
    placeholder.width(width);
    placeholder.height(bodyHeight);
  }
}

export class VideoComponent extends BaseComponent {
  static type = "video";
  static label = "Local Video";
  static description = "Play a local video file";

  async createNode({ x, y, src = null, title = DEFAULT_TITLE } = {}) {
    const theme = getCanvasTheme().video;
    const group = new Konva.Group({
      x,
      y,
      width: DEFAULT_WIDTH,
      height: DEFAULT_HEIGHT + HEADER_HEIGHT,
      draggable: true,
      name: "video-container",
    });

    group.add(new Konva.Rect({
      width: DEFAULT_WIDTH,
      height: DEFAULT_HEIGHT + HEADER_HEIGHT,
      fill: theme.fill,
      stroke: theme.stroke,
      strokeWidth: 1.5,
      cornerRadius: 14,
      name: "video-bg",
    }));

    group.add(new Konva.Rect({
      x: 0,
      y: HEADER_HEIGHT,
      width: DEFAULT_WIDTH,
      height: DEFAULT_HEIGHT,
      fill: theme.bodyFill,
      cornerRadius: [0, 0, 14, 14],
      name: "video-area",
    }));

    group.add(new Konva.Text({
      x: 0,
      y: HEADER_HEIGHT,
      width: DEFAULT_WIDTH,
      height: DEFAULT_HEIGHT,
      text: "Use toolbar to upload video",
      fontSize: 14,
      fontFamily: "sans-serif",
      fill: theme.placeholderColor,
      align: "center",
      verticalAlign: "middle",
      name: "video-placeholder",
    }));

    group.setAttr("videoSrc", src);
    group.setAttr("videoTitle", normalizeTitle(title));
    return group;
  }

  onCreated(node) {
    this.#bindLifecycle(node);

    const handleAdded = ({ node: added }) => {
      if (added !== node) return;
      this.app.off("node:added", handleAdded);
      this.#mountOverlay(node, node.getAttr("videoSrc") ?? null);
    };

    this.app.on("node:added", handleAdded);
  }

  #bindLifecycle(node) {
    if (node._videoLifecycleBound) return;
    node._videoLifecycleBound = true;

    const cleanup = () => {
      this.#removeOverlay(node);
      this.app.off("node:removed", handleRemoved);
      this.app.off("document:load:start", handleLoadStart);
      node._videoLifecycleBound = false;
    };

    const handleRemoved = ({ node: removed }) => {
      if (removed === node) cleanup();
    };

    const handleLoadStart = () => {
      cleanup();
    };

    this.app.on("node:removed", handleRemoved);
    this.app.on("document:load:start", handleLoadStart);
  }

  #removeOverlay(node) {
    const cleanup = node._videoOverlayCleanup;
    if (typeof cleanup === "function") {
      cleanup();
    }

    const oldId = node.getAttr("_overlayId");
    if (oldId) {
      document.getElementById(oldId)?.remove();
      node.setAttr("_overlayId", null);
    }

    node._videoOverlayCleanup = null;
    node._videoOverlayEl = null;
  }

  #syncOverlay(node) {
    const overlay = node._videoOverlayEl;
    if (!overlay || !node.getStage?.()) return;

    const isVisible = node.isVisible?.() !== false;
    const [a, b, c, d, e, f] = node.getAbsoluteTransform().getMatrix();
    overlay.style.width = `${node.width()}px`;
    overlay.style.height = `${node.height()}px`;
    overlay.style.opacity = String(node.opacity?.() ?? 1);
    overlay.style.zIndex = String(Math.max(1, this.app.getSelectableStackIndex?.(node) ?? 1));
    overlay.style.transform = `matrix(${a}, ${b}, ${c}, ${d}, ${e}, ${f})`;
    const occlusionRects = isVisible
      ? getOverlayOcclusionRects(this.app, node, node.width(), node.height())
      : [];
    applyOverlayOcclusionStyles(overlay, node.width(), node.height(), occlusionRects);
    overlay.hidden = !isVisible;
  }

  #mountOverlay(node, src) {
    this.#removeOverlay(node);
    syncVideoChrome(node);

    const stage = node.getStage();
    if (!stage) return;

    const overlayId = `video-overlay-${node._id}`;
    const overlay = document.createElement("div");
    overlay.id = overlayId;
    overlay.className = "video-component__overlay";
    overlay.hidden = !node.isVisible?.();

    const topbar = document.createElement("div");
    topbar.className = "video-component__topbar";

    const label = document.createElement("span");
    label.className = "video-component__title";
    label.textContent = node.getAttr("videoTitle") ?? DEFAULT_TITLE;

    topbar.append(label);

    const body = document.createElement("div");
    body.className = "video-component__body";

    if (src) {
      const videoEl = document.createElement("video");
      videoEl.className = "video-component__video";
      videoEl.src = src;
      videoEl.controls = true;
      body.append(videoEl);
    } else {
      const message = document.createElement("div");
      message.className = "video-component__placeholder";
      message.textContent = "Use toolbar to upload video";
      body.append(message);
    }

    overlay.append(topbar, body);
    overlay.dataset.videoNodeId = node.id();

    const stageContainer = stage.container();
    stageContainer.style.position = "relative";
    stageContainer.append(overlay);

    const selectionPlugin = this.app.getPlugin?.("selection") ?? null;
    const connectionsPlugin = this.app.getPlugin?.("connections") ?? null;
    const contextMenuPlugin = this.app.getPlugin?.("context-menu") ?? null;
    let stackSyncFrame = null;

    const isEditableInteraction = () => (
      !this.app.isReadOnly?.() &&
      this.app.modeManager?.matches?.({ mode: "edit", editorTool: "arrange" }) === true
    );

    const hideContextMenu = () => {
      contextMenuPlugin?.hideMenu?.();
    };

    const scheduleStackSync = () => {
      if (stackSyncFrame != null) return;
      stackSyncFrame = window.requestAnimationFrame(() => {
        stackSyncFrame = null;
        this.#syncOverlay(node);
      });
    };

    const syncPointerInterception = () => {
      const isShapeMode =
        this.app.getMode?.() === "edit" &&
        this.app.getEditorTool?.() === "shape";
      overlay.classList.toggle("is-pointer-pass-through", isShapeMode);
    };

    const completePendingConnectionToSelf = () => {
      if (!connectionsPlugin?.connectingFromId) return false;
      if (typeof connectionsPlugin.completeConnectingTo !== "function") return false;

      void connectionsPlugin.completeConnectingTo(node);
      return true;
    };

    const handleOverlayMouseDown = (event) => {
      hideContextMenu();

      if (event.button === 0 && completePendingConnectionToSelf()) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }

      if (!isEditableInteraction()) return;
      if (event.target.closest("button")) return;

      selectionPlugin?.setSelected?.([node]);
    };

    const handleOverlayContextMenu = (event) => {
      if (!isEditableInteraction()) return;
      event.preventDefault();
      event.stopPropagation();
      this.app.events.emit("video:contextmenu", {
        node,
        clientPoint: {
          x: event.clientX,
          y: event.clientY,
        },
      });
    };

    overlay.addEventListener("mousedown", handleOverlayMouseDown, true);
    overlay.addEventListener("contextmenu", handleOverlayContextMenu, true);
    const cleanupDragBridge = createOverlayNodeDragBridge({
      app: this.app,
      node,
      handle: topbar,
      canStartDrag: () => isEditableInteraction(),
      isInteractiveTarget: (target) => target instanceof Element && Boolean(target.closest("button")),
      onPointerDown: () => {
        hideContextMenu();
        selectionPlugin?.setSelected?.([node]);
      },
    });

    const sync = () => this.#syncOverlay(node);
    node.on("dragmove.videoOverlay transform.videoOverlay absoluteTransformChange.videoOverlay", sync);
    node.on("dragstart.videoOverlayState dragend.videoOverlayState", () => {
      topbar.classList.toggle("is-dragging", node.isDragging?.() === true);
    });
    stage.on(
      `xChange.video${node._id} yChange.video${node._id} scaleXChange.video${node._id} scaleYChange.video${node._id}`,
      sync,
    );
    const offInteractionChange = this.app.on("interaction:change", syncPointerInterception);
    const offNodeAddedForStack = this.app.on("node:added", scheduleStackSync);
    const offNodeRemovedForStack = this.app.on("node:removed", scheduleStackSync);
    const offNodeChangingForStack = this.app.on("node:changing", scheduleStackSync);
    const offNodeChangedForStack = this.app.on("node:changed", scheduleStackSync);

    node._videoOverlayEl = overlay;
    node._videoOverlayCleanup = () => {
      if (stackSyncFrame != null) {
        window.cancelAnimationFrame(stackSyncFrame);
        stackSyncFrame = null;
      }
      offNodeAddedForStack?.();
      offNodeRemovedForStack?.();
      offNodeChangingForStack?.();
      offNodeChangedForStack?.();
      offInteractionChange?.();
      cleanupDragBridge?.();
      overlay.removeEventListener("mousedown", handleOverlayMouseDown, true);
      overlay.removeEventListener("contextmenu", handleOverlayContextMenu, true);
      node.off(".videoOverlay");
      node.off(".videoOverlayState");
      stage.off(`.video${node._id}`);
      overlay.remove();
    };
    node.setAttr("_overlayId", overlayId);

    syncPointerInterception();
    this.#syncOverlay(node);
  }

  async updateNode(node, src) {
    node.setAttr("videoSrc", src);
    this.#mountOverlay(node, src);
    node.getLayer()?.batchDraw();
  }

  serializeNode(node) {
    return {
      src: node.getAttr("videoSrc") ?? null,
      title: node.getAttr("videoTitle") ?? DEFAULT_TITLE,
    };
  }

  async applySerializedData(node, data = {}) {
    const src = data.src ?? null;
    const title = normalizeTitle(data.title);
    node.setAttr("videoSrc", src);
    node.setAttr("videoTitle", title);
    this.#mountOverlay(node, src);
  }
}
