import { BaseComponent, FileEditorField } from "../core/baseClasses.js";
import { Konva } from "../lib/konva.js";

const DEFAULT_WIDTH = 360;
const DEFAULT_HEIGHT = 240;
const HEADER_HEIGHT = 40;

function readFileAsDataUrl(file) {
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

  getEditorTitle() {
    return "Local Video";
  }

  editorFields() {
    return [
      new FileEditorField({
        id: "video",
        label: "Change Video",
        input: { accept: "video/mp4,video/webm,video/ogg" },
        getValue: () => null,
        setValue: async (node, file) => {
          if (file instanceof File) {
            const src = await readFileAsDataUrl(file);
            await this.updateNode(node, src);
          }
        },
      }),
    ];
  }

  async createNode({ x, y, src = null } = {}) {
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
      fill: "#fdf8f3",
      stroke: "#dcc7b1",
      strokeWidth: 1.5,
      cornerRadius: 14,
      name: "video-bg",
    }));

    group.add(new Konva.Rect({
      x: 0,
      y: HEADER_HEIGHT,
      width: DEFAULT_WIDTH,
      height: DEFAULT_HEIGHT,
      fill: "#1a1a2e",
      cornerRadius: [0, 0, 14, 14],
      name: "video-area",
    }));

    group.add(new Konva.Text({
      x: 0,
      y: HEADER_HEIGHT,
      width: DEFAULT_WIDTH,
      height: DEFAULT_HEIGHT,
      text: "Click ⚙ to upload video",
      fontSize: 14,
      fontFamily: "sans-serif",
      fill: "#a68b6d",
      align: "center",
      verticalAlign: "middle",
      name: "video-placeholder",
    }));

    group.setAttr("videoSrc", src);
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
    overlay.hidden = !isVisible;
    if (!isVisible) return;

    const [a, b, c, d, e, f] = node.getAbsoluteTransform().getMatrix();
    overlay.style.width = `${node.width()}px`;
    overlay.style.height = `${node.height()}px`;
    overlay.style.opacity = String(node.opacity?.() ?? 1);
    overlay.style.transform = `matrix(${a}, ${b}, ${c}, ${d}, ${e}, ${f})`;
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
    label.textContent = "Local Video";

    const actions = document.createElement("div");
    actions.className = "video-component__actions";

    const gearBtn = document.createElement("button");
    gearBtn.type = "button";
    gearBtn.className = "video-component__icon-button";
    gearBtn.title = "Change video";
    gearBtn.setAttribute("aria-label", "Change video");
    gearBtn.textContent = "⚙";

    const closeBtn = document.createElement("button");
    closeBtn.type = "button";
    closeBtn.className = "video-component__icon-button";
    closeBtn.title = "Remove video";
    closeBtn.setAttribute("aria-label", "Remove video");
    closeBtn.textContent = "✕";

    actions.append(gearBtn, closeBtn);
    topbar.append(label, actions);

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
      message.textContent = "Click ⚙ to upload video";
      body.append(message);
    }

    overlay.append(topbar, body);

    const stageContainer = stage.container();
    stageContainer.style.position = "relative";
    stageContainer.append(overlay);

    const selectionPlugin = this.app.getPlugin?.("selection") ?? null;
    const connectionsPlugin = this.app.getPlugin?.("connections") ?? null;
    const contextMenuPlugin = this.app.getPlugin?.("context-menu") ?? null;
    let dragging = false;
    let dragStartX = 0;
    let dragStartY = 0;
    let nodeStartX = 0;
    let nodeStartY = 0;

    const isEditableInteraction = () => (
      !this.app.isReadOnly?.() &&
      this.app.modeManager?.matches?.({ mode: "edit", editorTool: "arrange" }) === true
    );

    const hideContextMenu = () => {
      contextMenuPlugin?.hideMenu?.();
    };

    const openContextMenu = (clientPoint) => {
      if (!isEditableInteraction()) return;
      if (!contextMenuPlugin?.showMenu || contextMenuPlugin.isEnabled?.() === false) return;

      const items = this.app.contextMenu?.getItems?.(node) ?? [];
      if (!items.length) return;

      contextMenuPlugin.showMenu(node, clientPoint);
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
      openContextMenu({
        x: event.clientX,
        y: event.clientY,
      });
    };

    const beginDrag = (event) => {
      if (event.target.closest("button")) return;
      event.preventDefault();
      event.stopPropagation();
      dragging = true;
      dragStartX = event.clientX;
      dragStartY = event.clientY;
      nodeStartX = node.x();
      nodeStartY = node.y();
      selectionPlugin?.setSelected?.([node]);
      this.app.events.emit("node:change:start", { node });
      document.body.style.userSelect = "none";
      document.body.style.cursor = "grabbing";
      topbar.classList.add("is-dragging");
    };

    const onDragMove = (event) => {
      if (!dragging) return;
      const stageScale = this.app.stageApi?.getScale?.() ?? stage.scaleX() ?? 1;
      node.x(nodeStartX + (event.clientX - dragStartX) / stageScale);
      node.y(nodeStartY + (event.clientY - dragStartY) / stageScale);
      node.getLayer()?.batchDraw();
      this.#syncOverlay(node);
      this.app.events.emit("node:changing", { node });
    };

    const endDrag = () => {
      if (!dragging) return;
      dragging = false;
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
      topbar.classList.remove("is-dragging");
      this.app.events.emit("node:changed", { node });
    };

    overlay.addEventListener("mousedown", handleOverlayMouseDown, true);
    overlay.addEventListener("contextmenu", handleOverlayContextMenu, true);
    topbar.addEventListener("mousedown", beginDrag);
    document.addEventListener("mousemove", onDragMove);
    document.addEventListener("mouseup", endDrag);

    gearBtn.addEventListener("click", (event) => {
      event.stopPropagation();
      this.app.events.emit("component-editor:open", { node });
    });

    closeBtn.addEventListener("click", (event) => {
      event.stopPropagation();
      this.app.events.emit("node:removed", { node });
      node.destroy();
      this.app.mainLayer?.batchDraw();
    });

    const sync = () => this.#syncOverlay(node);
    node.on("dragmove.videoOverlay transform.videoOverlay absoluteTransformChange.videoOverlay", sync);
    stage.on(
      `xChange.video${node._id} yChange.video${node._id} scaleXChange.video${node._id} scaleYChange.video${node._id}`,
      sync,
    );

    node._videoOverlayEl = overlay;
    node._videoOverlayCleanup = () => {
      overlay.removeEventListener("mousedown", handleOverlayMouseDown, true);
      overlay.removeEventListener("contextmenu", handleOverlayContextMenu, true);
      document.removeEventListener("mousemove", onDragMove);
      document.removeEventListener("mouseup", endDrag);
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
      node.off(".videoOverlay");
      stage.off(`.video${node._id}`);
      overlay.remove();
    };
    node.setAttr("_overlayId", overlayId);

    this.#syncOverlay(node);
  }

  async updateNode(node, src) {
    node.setAttr("videoSrc", src);
    this.#mountOverlay(node, src);
    node.getLayer()?.batchDraw();
  }

  serializeNode(node) {
    return { src: node.getAttr("videoSrc") ?? null };
  }

  async applySerializedData(node, data = {}) {
    const src = data.src ?? null;
    node.setAttr("videoSrc", src);
    this.#mountOverlay(node, src);
  }
}
