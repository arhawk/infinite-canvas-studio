import { BaseComponent } from "../core/baseClasses.js";
import { applyOverlayOcclusionStyles, getOverlayOcclusionRects } from "./overlayOcclusion.js";
import { DISPLAY_FONT_FAMILY } from "../lib/fonts.js";
import { renderIcons } from "../lib/icons.js";
import { Konva } from "../lib/konva.js";

const DEFAULT_WIDTH = 420;
const DEFAULT_HEIGHT = 280;
const MIN_WIDTH = 220;
const MIN_HEIGHT = 160;
const HEADER_HEIGHT = 44;
const BASE_VIEWPORT_WIDTH = 1440;
const BASE_VIEWPORT_HEIGHT = 960;
const MIN_ZOOM = 1;
const MAX_ZOOM = 2.4;
const FALLBACK_MESSAGE =
  "This website cannot be displayed here due to security policy or embedding restrictions.";

function normalizeDimension(value, fallback, minimum) {
  return Number.isFinite(value) ? Math.max(minimum, value) : fallback;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function normalizeUrl(value) {
  const trimmed = String(value ?? "").trim();
  if (!trimmed) return "";
  if (/^[a-zA-Z][a-zA-Z\d+.-]*:/.test(trimmed) || trimmed.startsWith("//")) {
    return trimmed;
  }
  return `https://${trimmed}`;
}

function syncFrameChrome(node, data = {}) {
  const width = normalizeDimension(data.width, DEFAULT_WIDTH, MIN_WIDTH);
  const height = normalizeDimension(data.height, DEFAULT_HEIGHT, MIN_HEIGHT);
  const url = typeof data.url === "string" ? data.url.trim() : "";

  const background = node.findOne(".iframe-bg");
  const header = node.findOne(".iframe-header");
  const placeholder = node.findOne(".iframe-placeholder");

  node.width(width);
  node.height(height);

  if (background) {
    background.width(width);
    background.height(height);
  }

  if (header) {
    header.points([0, HEADER_HEIGHT, width, HEADER_HEIGHT]);
  }

  if (placeholder) {
    placeholder.width(Math.max(0, width - 40));
    placeholder.height(Math.max(0, height - HEADER_HEIGHT - 28));
    placeholder.y(HEADER_HEIGHT + 14);
    placeholder.text(url ? "Use header bar to edit URL" : "Use header bar to\nadd webpage URL");
    placeholder.opacity(url ? 0.7 : 1);
  }
}

export class IframeComponent extends BaseComponent {
  static type = "iframe";
  static label = "Iframe";
  static description = "Embed a webpage in a small viewport";

  async createNode({
    x,
    y,
    width = DEFAULT_WIDTH,
    height = DEFAULT_HEIGHT,
    url = "",
  } = {}) {
    const resolvedWidth = normalizeDimension(width, DEFAULT_WIDTH, MIN_WIDTH);
    const resolvedHeight = normalizeDimension(height, DEFAULT_HEIGHT, MIN_HEIGHT);
    const group = new Konva.Group({
      x,
      y,
      width: resolvedWidth,
      height: resolvedHeight,
      draggable: true,
      name: "iframe-container",
    });

    group.add(
      new Konva.Rect({
        width: resolvedWidth,
        height: resolvedHeight,
        fill: "#fffdf8",
        stroke: "#dcc7b1",
        strokeWidth: 2,
        cornerRadius: 18,
        shadowColor: "rgba(54, 41, 25, 0.1)",
        shadowBlur: 18,
        shadowOffsetY: 8,
        shadowOpacity: 0.18,
        name: "iframe-bg",
      }),
    );

    group.add(
      new Konva.Line({
        points: [0, HEADER_HEIGHT, resolvedWidth, HEADER_HEIGHT],
        stroke: "rgba(171, 79, 40, 0.12)",
        strokeWidth: 1,
        listening: false,
        name: "iframe-header",
      }),
    );

    group.add(
      new Konva.Text({
        x: 20,
        y: HEADER_HEIGHT + 14,
        width: resolvedWidth - 40,
        height: resolvedHeight - HEADER_HEIGHT - 28,
        text: "Use header bar to\nadd webpage URL",
        fontSize: 15,
        fontFamily: DISPLAY_FONT_FAMILY,
        fill: "#8d7760",
        align: "center",
        verticalAlign: "middle",
        name: "iframe-placeholder",
      }),
    );

    group.setAttr("iframeUrl", "");
    group.setAttr("iframeZoom", 1);
    group.setAttr("iframePanX", 0);
    group.setAttr("iframePanY", 0);
    group.setAttr("iframeInteractive", false);
    group.setAttr("iframeInteractionMode", false);
    syncFrameChrome(group, { width: resolvedWidth, height: resolvedHeight, url: "" });

    group.on("transform.iframeResize", () => {
      const scaleX = Math.abs(group.scaleX());
      const scaleY = Math.abs(group.scaleY());
      const current = this.serializeNode(group);
      group.scale({ x: 1, y: 1 });
      syncFrameChrome(group, {
        ...current,
        width: current.width * scaleX,
        height: current.height * scaleY,
      });
      this.#syncOverlay(group);
    });

    if (url) {
      group.setAttr("iframeUrl", normalizeUrl(url));
      syncFrameChrome(group, {
        width: resolvedWidth,
        height: resolvedHeight,
        url: group.getAttr("iframeUrl"),
      });
    }

    return group;
  }

  onCreated(node) {
    this.#bindLifecycle(node);

    const handleAdded = ({ node: addedNode }) => {
      if (addedNode !== node) return;
      this.app.off("node:added", handleAdded);
      this.#mountOverlay(node);
    };

    this.app.on("node:added", handleAdded);
  }

  #bindLifecycle(node) {
    if (node._iframeLifecycleBound) return;
    node._iframeLifecycleBound = true;

    const cleanup = () => {
      this.#removeOverlay(node);
      this.app.off("node:removed", handleRemoved);
      this.app.off("document:load:start", handleLoadStart);
      node._iframeLifecycleBound = false;
    };

    const handleRemoved = ({ node: removedNode }) => {
      if (removedNode !== node) return;
      cleanup();
    };

    const handleLoadStart = () => {
      cleanup();
    };

    this.app.on("node:removed", handleRemoved);
    this.app.on("document:load:start", handleLoadStart);
  }

  #removeOverlay(node) {
    const cleanup = node._iframeOverlayCleanup;
    if (typeof cleanup === "function") {
      cleanup();
    }
    node._iframeOverlayCleanup = null;
  }

  #syncOverlay(node) {
    const overlay = node._iframeOverlayEl;
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
    if (!isVisible) return;
    node._iframeApplyViewport?.();
  }

  #mountOverlay(node) {
    this.#removeOverlay(node);

    const stage = node.getStage();
    if (!stage) return;

    const getCurrentUrl = () => node.getAttr("iframeUrl") ?? "";
    const getIsEditable = () => (
      !this.app.isReadOnly?.() &&
      this.app.modeManager?.matches?.({ mode: "edit", editorTool: "arrange" }) === true
    );

    const overlay = document.createElement("div");
    overlay.className = "iframe-component__overlay";
    overlay.hidden = !node.isVisible?.();
    overlay.dataset.iframeNodeId = node.id();

    const header = document.createElement("div");
    header.className = "iframe-component__topbar";
    header.setAttribute("data-testid", "iframe-header-bar");

    const urlForm = document.createElement("form");
    urlForm.className = "iframe-component__url-form";
    urlForm.setAttribute("data-testid", "iframe-url-form");
    urlForm.noValidate = true;

    const urlInput = document.createElement("input");
    urlInput.className = "iframe-component__url-input";
    urlInput.type = "text";
    urlInput.inputMode = "url";
    urlInput.placeholder = "https://example.com";
    urlInput.autocomplete = "off";
    urlInput.autocapitalize = "off";
    urlInput.spellcheck = false;
    urlInput.setAttribute("aria-label", "Iframe URL");
    urlInput.setAttribute("data-testid", "iframe-url-input");

    urlForm.append(urlInput);

    const actions = document.createElement("div");
    actions.className = "iframe-component__actions";

    const interactButton = document.createElement("button");
    interactButton.className = "iframe-component__action-btn iframe-component__interact";
    interactButton.type = "button";
    interactButton.title = "Interact with webpage";
    interactButton.setAttribute("aria-label", "Interact with webpage");
    interactButton.setAttribute("aria-pressed", "false");
    interactButton.setAttribute("data-testid", "iframe-interact");
    interactButton.textContent = "Interact";

    const connectButton = document.createElement("button");
    connectButton.className = "iframe-component__action-btn iframe-component__connect";
    connectButton.type = "button";
    connectButton.title = "Connect to";
    connectButton.setAttribute("aria-label", "Connect to");
    connectButton.setAttribute("data-testid", "iframe-connect");
    connectButton.innerHTML = `<i data-lucide="link-2" aria-hidden="true"></i>`;

    const menuTool = document.createElement("div");
    menuTool.className = "iframe-component__menu-tool";

    const menuTrigger = document.createElement("button");
    menuTrigger.className = "iframe-component__action-btn iframe-component__menu-trigger";
    menuTrigger.type = "button";
    menuTrigger.title = "More actions";
    menuTrigger.setAttribute("aria-label", "More actions");
    menuTrigger.setAttribute("data-testid", "iframe-layer-menu");
    menuTrigger.innerHTML = `<i data-lucide="ellipsis" aria-hidden="true"></i>`;

    const layerMenu = document.createElement("div");
    layerMenu.className = "toolbar__button-style-popover toolbar__shape-layer-popover toolbar__iframe-layer-popover iframe-component__layer-popover";
    layerMenu.setAttribute("role", "menu");
    layerMenu.setAttribute("aria-label", "Iframe actions");
    layerMenu.hidden = true;
    layerMenu.innerHTML = `
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
    `;

    menuTool.append(menuTrigger, layerMenu);
    actions.append(interactButton, connectButton, menuTool);
    header.append(urlForm, actions);

    const body = document.createElement("div");
    body.className = "iframe-component__body";

    const viewport = document.createElement("div");
    viewport.className = "iframe-component__viewport";

    const frame = document.createElement("iframe");
    frame.className = "iframe-component__frame";
    frame.loading = "lazy";
    frame.title = "Embedded webpage";
    frame.setAttribute("tabindex", "-1");

    const shield = document.createElement("div");
    shield.className = "iframe-component__shield";

    const status = document.createElement("div");
    status.className = "iframe-component__status";
    status.textContent = "Loading webpage...";

    viewport.append(frame);
    body.append(viewport, shield, status);
    overlay.append(header, body);

    const stageContainer = stage.container();
    stageContainer.style.position = "relative";
    stageContainer.appendChild(overlay);
    renderIcons(overlay, {
      width: 15,
      height: 15,
      "stroke-width": 2,
    });

    let fallbackTimer = null;

    const selectionPlugin = this.app.getPlugin?.("selection") ?? null;
    const connectionsPlugin = this.app.getPlugin?.("connections") ?? null;
    const contextMenuPlugin = this.app.getPlugin?.("context-menu") ?? null;
    let dragging = false;
    let dragStartX = 0;
    let dragStartY = 0;
    let nodeStartX = 0;
    let nodeStartY = 0;
    let menuOpen = false;
    let lastFrameUrl = "";
    let isEditingUrl = false;
    let stackSyncFrame = null;

    const getManualInteraction = () => node.getAttr("iframeInteractionMode") === true;
    const getInteractive = () => !getIsEditable() || getManualInteraction();

    const hideContextMenu = () => {
      contextMenuPlugin?.hideMenu?.();
    };

    const completePendingConnectionToSelf = () => {
      if (!connectionsPlugin?.connectingFromId) return false;
      if (typeof connectionsPlugin.completeConnectingTo !== "function") return false;

      void connectionsPlugin.completeConnectingTo(node);
      return true;
    };

    const cancelPendingConnection = () => {
      if (!connectionsPlugin?.connectingFromId) return false;
      if (typeof connectionsPlugin.cancelConnecting !== "function") return false;
      connectionsPlugin.cancelConnecting();
      return true;
    };

    const closeLayerMenu = () => {
      menuOpen = false;
      layerMenu.hidden = true;
      layerMenu.style.removeProperty("top");
      layerMenu.style.removeProperty("left");
      layerMenu.style.removeProperty("right");
      layerMenu.style.removeProperty("bottom");
      layerMenu.style.removeProperty("transform");
      menuTool.classList.remove("is-open");
    };

    const syncLayerActionState = () => {
      const bringForwardButton = layerMenu.querySelector("[data-iframe-layer-action='bring-forward']");
      const sendBackwardButton = layerMenu.querySelector("[data-iframe-layer-action='send-backward']");
      bringForwardButton.disabled = !selectionPlugin?.canBringForward?.(node);
      sendBackwardButton.disabled = !selectionPlugin?.canSendBackward?.(node);
    };

    const setInteractionMode = (nextInteractive) => {
      const resolved = Boolean(nextInteractive && getIsEditable() && getCurrentUrl());
      if (resolved === getManualInteraction()) return;
      node.setAttr("iframeInteractionMode", resolved);
      applyViewport();
      this.#syncOverlay(node);
    };

    const positionLayerMenuAtPoint = (clientPoint) => {
      if (!clientPoint) return;
      const overlayRect = overlay.getBoundingClientRect();
      const menuWidth = layerMenu.offsetWidth || layerMenu.getBoundingClientRect().width || 164;
      const menuHeight = layerMenu.offsetHeight || layerMenu.getBoundingClientRect().height || 72;
      const margin = 8;
      let left = clientPoint.x - overlayRect.left;
      let top = clientPoint.y - overlayRect.top;

      left = Math.max(margin, Math.min(left, overlayRect.width - menuWidth - margin));
      top = Math.max(margin, Math.min(top, overlayRect.height - menuHeight - margin));
      layerMenu.style.left = `${Math.round(left)}px`;
      layerMenu.style.top = `${Math.round(top)}px`;
      layerMenu.style.right = "auto";
      layerMenu.style.bottom = "auto";
      layerMenu.style.transform = "none";
    };

    const openLayerMenu = ({ clientPoint = null } = {}) => {
      if (!getIsEditable()) return;
      cancelPendingConnection();
      selectionPlugin?.setSelected?.([node]);
      syncLayerActionState();
      layerMenu.hidden = false;
      menuOpen = true;
      menuTool.classList.add("is-open");
      if (clientPoint) {
        positionLayerMenuAtPoint(clientPoint);
      } else {
        layerMenu.style.removeProperty("top");
        layerMenu.style.removeProperty("left");
        layerMenu.style.removeProperty("right");
        layerMenu.style.removeProperty("bottom");
        layerMenu.style.removeProperty("transform");
      }
    };

    const syncHeaderState = () => {
      const editable = getIsEditable();
      const url = getCurrentUrl();
      const canConnect = Boolean(
        editable &&
        connectionsPlugin?.isConnectable?.(node),
      );

      header.hidden = !editable;
      body.classList.toggle("has-header", editable);
      overlay.dataset.mode = editable ? "edit" : "interactive";
      urlInput.disabled = !editable;
      interactButton.disabled = !editable || !url;
      interactButton.setAttribute("aria-pressed", String(editable && getManualInteraction()));
      interactButton.classList.toggle("is-active", editable && getManualInteraction());
      interactButton.title = editable && getManualInteraction()
        ? "Exit webpage interaction"
        : "Interact with webpage";
      connectButton.disabled = !canConnect;
      if (!isEditingUrl && urlInput.value !== url) {
        urlInput.value = url;
      }
      syncLayerActionState();
      if (!editable) closeLayerMenu();
    };

    const syncFrameSource = () => {
      const url = getCurrentUrl();
      viewport.hidden = !url;
      if (url) {
        if (lastFrameUrl !== url) {
          lastFrameUrl = url;
          frame.setAttribute("src", url);
          status.hidden = false;
          status.dataset.tone = "info";
          status.textContent = "Loading webpage...";
          if (fallbackTimer != null) {
            window.clearTimeout(fallbackTimer);
          }
          fallbackTimer = window.setTimeout(() => {
            status.dataset.tone = "warning";
            status.textContent = FALLBACK_MESSAGE;
            status.hidden = false;
          }, 4000);
        }
      } else {
        lastFrameUrl = "";
        if (fallbackTimer != null) {
          window.clearTimeout(fallbackTimer);
          fallbackTimer = null;
        }
        frame.setAttribute("src", "about:blank");
        status.hidden = true;
        status.dataset.tone = "info";
      }
    };

    const applyUrlChange = async () => {
      if (!getIsEditable()) return;
      const nextUrl = urlInput.value ?? "";
      const normalizedUrl = normalizeUrl(nextUrl);
      const current = this.serializeNode(node);
      if (normalizedUrl === current.url) {
        isEditingUrl = false;
        syncHeaderState();
        return;
      }

      if (!normalizedUrl) {
        node.setAttr("iframeInteractionMode", false);
      }

      isEditingUrl = false;
      this.app.events.emit("node:change:start", { node });
      await this.applySerializedData(node, {
        ...current,
        url: normalizedUrl,
      });
      node.getLayer?.()?.batchDraw?.();
      this.app.overlayLayer?.batchDraw?.();
      this.app.uiLayer?.batchDraw?.();
      this.app.events.emit("node:changed", { node });
      syncHeaderState();
    };

    const handleOverlayMouseDown = (event) => {
      hideContextMenu();

      if (event.button === 0 && completePendingConnectionToSelf()) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }

      if (event.target instanceof Element && event.target.closest(".iframe-component__topbar")) {
        return;
      }

      if (!getIsEditable()) return;
      selectionPlugin?.setSelected?.([node]);
    };

    const handleOverlayContextMenu = (event) => {
      if (!getIsEditable()) return;
      event.preventDefault();
      event.stopPropagation();
      openLayerMenu({
        clientPoint: {
          x: event.clientX,
          y: event.clientY,
        },
      });
    };

    const beginDrag = (event) => {
      if (!getIsEditable()) return;
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
      this.app.events.emit("node:changed", { node });
    };

    const applyInteractiveMode = () => {
      const interactive = getInteractive();
      const hasUrl = Boolean(getCurrentUrl());
      node.setAttr("iframeInteractive", interactive);
      frame.style.pointerEvents = interactive && hasUrl ? "auto" : "none";
      shield.hidden = interactive;
      shield.style.pointerEvents = interactive ? "none" : "auto";
      body.classList.toggle("is-interactive", interactive);
    };

    const hideStatus = () => {
      status.hidden = true;
      status.dataset.tone = "info";
    };

    const showFailure = () => {
      status.hidden = false;
      status.dataset.tone = "warning";
      status.textContent = FALLBACK_MESSAGE;
    };

    const applyViewport = () => {
      syncFrameSource();
      syncHeaderState();
      if (getInteractive()) {
        viewport.style.left = "0";
        viewport.style.top = "0";
        viewport.style.width = "100%";
        viewport.style.height = "100%";
        viewport.style.transform = "none";
        frame.style.width = "100%";
        frame.style.height = "100%";
        applyInteractiveMode();
        return;
      }

      const bodyWidth = Math.max(1, body.clientWidth || node.width());
      const bodyHeight = Math.max(1, body.clientHeight || node.height());
      const fitScale = Math.min(
        bodyWidth / BASE_VIEWPORT_WIDTH,
        bodyHeight / BASE_VIEWPORT_HEIGHT,
      );
      const zoom = clamp(Number(node.getAttr("iframeZoom")) || 1, MIN_ZOOM, MAX_ZOOM);
      const isAtMinZoom = zoom <= MIN_ZOOM + 1e-6;
      const panX = isAtMinZoom ? 0 : (Number(node.getAttr("iframePanX")) || 0);
      const panY = isAtMinZoom ? 0 : (Number(node.getAttr("iframePanY")) || 0);
      const effectiveScale = Math.max(0.01, fitScale * zoom);
      const scaledWidth = BASE_VIEWPORT_WIDTH * effectiveScale;
      const scaledHeight = BASE_VIEWPORT_HEIGHT * effectiveScale;
      const baseX = (bodyWidth - scaledWidth) / 2;
      const baseY = (bodyHeight - scaledHeight) / 2;

      if (isAtMinZoom) {
        node.setAttr("iframePanX", 0);
        node.setAttr("iframePanY", 0);
      }

      viewport.style.width = `${BASE_VIEWPORT_WIDTH}px`;
      viewport.style.height = `${BASE_VIEWPORT_HEIGHT}px`;
      viewport.style.left = `${baseX + panX}px`;
      viewport.style.top = `${baseY + panY}px`;
      viewport.style.transform = `scale(${effectiveScale})`;
      frame.style.width = `${BASE_VIEWPORT_WIDTH}px`;
      frame.style.height = `${BASE_VIEWPORT_HEIGHT}px`;
      applyInteractiveMode();
    };

    const scheduleStackSync = ({ node: changedNode } = {}) => {
      if (changedNode === node) {
        applyViewport();
      }
      if (stackSyncFrame != null) return;
      stackSyncFrame = window.requestAnimationFrame(() => {
        stackSyncFrame = null;
        this.#syncOverlay(node);
      });
    };

    node._iframeApplyViewport = applyViewport;

    body.addEventListener("wheel", (event) => {
      if (!getIsEditable() || !getCurrentUrl() || getInteractive()) return;

      event.preventDefault();

      const rect = body.getBoundingClientRect();
      const pointerX = event.clientX - rect.left;
      const pointerY = event.clientY - rect.top;
      const bodyWidth = Math.max(1, rect.width);
      const bodyHeight = Math.max(1, rect.height);
      const fitScale = Math.min(
        bodyWidth / BASE_VIEWPORT_WIDTH,
        bodyHeight / BASE_VIEWPORT_HEIGHT,
      );
      const currentZoom = clamp(Number(node.getAttr("iframeZoom")) || 1, MIN_ZOOM, MAX_ZOOM);
      const nextZoom = clamp(
        currentZoom * (event.deltaY < 0 ? 1.08 : 0.92),
        MIN_ZOOM,
        MAX_ZOOM,
      );

      const oldScale = Math.max(0.01, fitScale * currentZoom);
      const newScale = Math.max(0.01, fitScale * nextZoom);
      const currentPanX = Number(node.getAttr("iframePanX")) || 0;
      const currentPanY = Number(node.getAttr("iframePanY")) || 0;
      const oldBaseX = (bodyWidth - BASE_VIEWPORT_WIDTH * oldScale) / 2;
      const oldBaseY = (bodyHeight - BASE_VIEWPORT_HEIGHT * oldScale) / 2;
      const oldTranslateX = oldBaseX + currentPanX;
      const oldTranslateY = oldBaseY + currentPanY;
      const contentX = (pointerX - oldTranslateX) / oldScale;
      const contentY = (pointerY - oldTranslateY) / oldScale;
      const newBaseX = (bodyWidth - BASE_VIEWPORT_WIDTH * newScale) / 2;
      const newBaseY = (bodyHeight - BASE_VIEWPORT_HEIGHT * newScale) / 2;
      const newPanX = pointerX - contentX * newScale - newBaseX;
      const newPanY = pointerY - contentY * newScale - newBaseY;

      node.setAttr("iframeZoom", nextZoom);
      if (nextZoom <= MIN_ZOOM + 1e-6) {
        node.setAttr("iframePanX", 0);
        node.setAttr("iframePanY", 0);
      } else {
        node.setAttr("iframePanX", newPanX);
        node.setAttr("iframePanY", newPanY);
      }
      applyViewport();
    }, { passive: false });

    urlForm.addEventListener("submit", (event) => {
      event.preventDefault();
      void applyUrlChange();
    });
    urlInput.addEventListener("mousedown", (event) => {
      event.stopPropagation();
      closeLayerMenu();
    });
    urlInput.addEventListener("focus", () => {
      isEditingUrl = true;
      cancelPendingConnection();
      closeLayerMenu();
    });
    urlInput.addEventListener("blur", () => {
      isEditingUrl = false;
      void applyUrlChange();
    });
    urlInput.addEventListener("keydown", (event) => {
      if (event.key !== "Enter") return;
      event.preventDefault();
      event.stopPropagation();
      void applyUrlChange();
    });
    interactButton.addEventListener("pointerdown", (event) => {
      event.stopPropagation();
    });
    interactButton.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (!getIsEditable() || !getCurrentUrl()) return;
      cancelPendingConnection();
      selectionPlugin?.setSelected?.([node]);
      closeLayerMenu();
      setInteractionMode(!getManualInteraction());
    });
    connectButton.addEventListener("pointerdown", (event) => {
      event.stopPropagation();
    });
    connectButton.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (!getIsEditable()) return;
      selectionPlugin?.setSelected?.([node]);
      closeLayerMenu();
      setInteractionMode(false);
      this.app.commands.execute("connection:connect", node.id());
      syncHeaderState();
    });
    menuTrigger.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      event.stopPropagation();
      selectionPlugin?.setSelected?.([node]);
      if (menuOpen) {
        closeLayerMenu();
        return;
      }
      openLayerMenu();
    });
    menuTrigger.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      selectionPlugin?.setSelected?.([node]);
      if (menuOpen) {
        closeLayerMenu();
        return;
      }
      openLayerMenu();
    });
    const bringForwardButton = layerMenu.querySelector("[data-iframe-layer-action='bring-forward']");
    const sendBackwardButton = layerMenu.querySelector("[data-iframe-layer-action='send-backward']");
    bringForwardButton.addEventListener("pointerdown", (event) => {
      event.preventDefault();
    });
    sendBackwardButton.addEventListener("pointerdown", (event) => {
      event.preventDefault();
    });
    bringForwardButton.addEventListener("click", (event) => {
      event.preventDefault();
      if (!selectionPlugin?.canBringForward?.(node)) return;
      selectionPlugin?.bringForward?.(node);
      node.getLayer?.()?.batchDraw?.();
      this.app.overlayLayer?.batchDraw?.();
      this.app.uiLayer?.batchDraw?.();
      syncHeaderState();
      closeLayerMenu();
    });
    sendBackwardButton.addEventListener("click", (event) => {
      event.preventDefault();
      if (!selectionPlugin?.canSendBackward?.(node)) return;
      selectionPlugin?.sendBackward?.(node);
      node.getLayer?.()?.batchDraw?.();
      this.app.overlayLayer?.batchDraw?.();
      this.app.uiLayer?.batchDraw?.();
      syncHeaderState();
      closeLayerMenu();
    });
    const handleDocumentPointerDown = (event) => {
      if (!overlay.contains(event.target)) {
        closeLayerMenu();
        if (getManualInteraction()) {
          setInteractionMode(false);
        }
      }
    };
    const handleWindowKeyDown = (event) => {
      if (event.key !== "Escape") return;
      if (!getManualInteraction()) return;
      setInteractionMode(false);
    };
    window.addEventListener("keydown", handleWindowKeyDown);
    document.addEventListener("pointerdown", handleDocumentPointerDown, true);
    document.addEventListener("mousedown", handleDocumentPointerDown, true);
    overlay.addEventListener("mousedown", handleOverlayMouseDown, true);
    overlay.addEventListener("contextmenu", handleOverlayContextMenu, true);
    shield.addEventListener("mousedown", beginDrag);
    document.addEventListener("mousemove", onDragMove);
    document.addEventListener("mouseup", endDrag);

    frame.addEventListener("load", () => {
      window.clearTimeout(fallbackTimer);
      fallbackTimer = null;
      hideStatus();
      applyViewport();
    });

    frame.addEventListener("error", () => {
      if (fallbackTimer != null) {
        window.clearTimeout(fallbackTimer);
        fallbackTimer = null;
      }
      showFailure();
    });

    const sync = () => this.#syncOverlay(node);
    node.on("dragmove.iframeOverlay transform.iframeOverlay absoluteTransformChange.iframeOverlay", sync);
    stage.on(
      `xChange.iframe${node._id} yChange.iframe${node._id} scaleXChange.iframe${node._id} scaleYChange.iframe${node._id}`,
      sync,
    );
    const stopListeningToInteraction = this.app.on?.("interaction:change", () => {
      applyViewport();
      this.#syncOverlay(node);
    });
    const stopListeningToSelection = this.app.on?.("selection:change", ({ nodes = [] } = {}) => {
      if (getManualInteraction() && !nodes.includes(node)) {
        setInteractionMode(false);
      }
      syncHeaderState();
      this.#syncOverlay(node);
    });
    const stopListeningToNodeAddedForStack = this.app.on?.("node:added", scheduleStackSync);
    const stopListeningToNodeRemovedForStack = this.app.on?.("node:removed", scheduleStackSync);
    const stopListeningToNodeChangingForStack = this.app.on?.("node:changing", scheduleStackSync);
    const stopListeningToNodeChangedForStack = this.app.on?.("node:changed", scheduleStackSync);

    node._iframeOverlayEl = overlay;
    node._iframeOverlayCleanup = () => {
      if (fallbackTimer != null) {
        window.clearTimeout(fallbackTimer);
      }
      if (stackSyncFrame != null) {
        window.cancelAnimationFrame(stackSyncFrame);
        stackSyncFrame = null;
      }
      closeLayerMenu();
      overlay.removeEventListener("mousedown", handleOverlayMouseDown, true);
      overlay.removeEventListener("contextmenu", handleOverlayContextMenu, true);
      document.removeEventListener("mousemove", onDragMove);
      document.removeEventListener("mouseup", endDrag);
      document.removeEventListener("pointerdown", handleDocumentPointerDown, true);
      document.removeEventListener("mousedown", handleDocumentPointerDown, true);
      window.removeEventListener("keydown", handleWindowKeyDown);
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
      stopListeningToInteraction?.();
      stopListeningToSelection?.();
      stopListeningToNodeAddedForStack?.();
      stopListeningToNodeRemovedForStack?.();
      stopListeningToNodeChangingForStack?.();
      stopListeningToNodeChangedForStack?.();
      node.off(".iframeOverlay");
      stage.off(`.iframe${node._id}`);
      node._iframeApplyViewport = null;
      overlay.remove();
      node._iframeOverlayEl = null;
      node._iframeOverlayCleanup = null;
    };

    this.#syncOverlay(node);
  }

  async updateNode(node, value) {
    if (!(node instanceof Konva.Group)) return;

    const url = normalizeUrl(value);
    node.setAttr("iframeUrl", url);
    const current = this.serializeNode(node);
    syncFrameChrome(node, current);

    if (node.getStage()) {
      if (node._iframeOverlayEl) {
        this.#syncOverlay(node);
      } else {
        this.#mountOverlay(node);
      }
    }

    node.getLayer()?.batchDraw();
  }

  serializeNode(node) {
    return {
      url: node.getAttr("iframeUrl") ?? "",
      zoom: Number(node.getAttr("iframeZoom")) || 1,
      panX: Number(node.getAttr("iframePanX")) || 0,
      panY: Number(node.getAttr("iframePanY")) || 0,
      width: node.width() ?? DEFAULT_WIDTH,
      height: node.height() ?? DEFAULT_HEIGHT,
    };
  }

  async applySerializedData(node, data = {}) {
    const width = normalizeDimension(data.width, DEFAULT_WIDTH, MIN_WIDTH);
    const height = normalizeDimension(data.height, DEFAULT_HEIGHT, MIN_HEIGHT);
    const url = normalizeUrl(data.url);
    const zoom = clamp(Number(data.zoom) || 1, MIN_ZOOM, MAX_ZOOM);

    node.setAttr("iframeUrl", url);
    node.setAttr("iframeZoom", zoom);
    node.setAttr("iframePanX", Number(data.panX) || 0);
    node.setAttr("iframePanY", Number(data.panY) || 0);
    node.setAttr("iframeInteractive", false);
    node.setAttr("iframeInteractionMode", false);
    syncFrameChrome(node, { width, height, url });

    if (node.getStage()) {
      if (node._iframeOverlayEl) {
        this.#syncOverlay(node);
      } else {
        this.#mountOverlay(node);
      }
    }
  }
}
