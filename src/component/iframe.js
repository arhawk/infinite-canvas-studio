import { BaseComponent, TextEditorField } from "../core/baseClasses.js";
import { DISPLAY_FONT_FAMILY } from "../lib/fonts.js";
import { Konva } from "../lib/konva.js";

const DEFAULT_WIDTH = 420;
const DEFAULT_HEIGHT = 280;
const MIN_WIDTH = 220;
const MIN_HEIGHT = 160;
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

function getUrlDisplayText(url) {
  return String(url ?? "").trim() || "https://example.com";
}

function syncFrameChrome(node, data = {}) {
  const width = normalizeDimension(data.width, DEFAULT_WIDTH, MIN_WIDTH);
  const height = normalizeDimension(data.height, DEFAULT_HEIGHT, MIN_HEIGHT);
  const url = typeof data.url === "string" ? data.url.trim() : "";

  const background = node.findOne(".iframe-bg");
  const header = node.findOne(".iframe-header");
  const eyebrow = node.findOne(".iframe-eyebrow");
  const placeholder = node.findOne(".iframe-placeholder");

  node.width(width);
  node.height(height);

  if (background) {
    background.width(width);
    background.height(height);
  }

  if (header) {
    header.points([0, 40, width, 40]);
  }

  if (eyebrow) {
    eyebrow.width(Math.max(0, width - 28));
    eyebrow.text(url ? "Embedded Webpage" : "Iframe");
  }

  if (placeholder) {
    placeholder.width(Math.max(0, width - 40));
    placeholder.height(Math.max(0, height - 76));
    placeholder.y(54);
    placeholder.text(url ? "Double-click to edit URL" : "Double-click to\nadd webpage URL");
    placeholder.opacity(url ? 0.7 : 1);
  }
}

export class IframeComponent extends BaseComponent {
  static type = "iframe";
  static label = "Iframe";
  static description = "Embed a webpage in a small viewport";

  getEditorTitle() {
    return "Iframe";
  }

  editorFields() {
    return [
      new TextEditorField({
        id: "url",
        label: "URL",
        description: "Enter the webpage address to embed.",
        placeholder: "https://example.com",
        input: {
          autocomplete: "off",
          autocapitalize: "off",
          spellcheck: "false",
        },
        getValue: (node) => node.getAttr("iframeUrl") ?? "",
        setValue: async (node, value) => {
          await this.updateNode(node, value);
        },
      }),
    ];
  }

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
        points: [0, 40, resolvedWidth, 40],
        stroke: "rgba(171, 79, 40, 0.12)",
        strokeWidth: 1,
        listening: false,
        name: "iframe-header",
      }),
    );

    group.add(
      new Konva.Text({
        x: 14,
        y: 13,
        width: resolvedWidth - 28,
        height: 18,
        text: "Iframe",
        fontSize: 11,
        fontFamily: DISPLAY_FONT_FAMILY,
        fontStyle: "700",
        letterSpacing: 1.2,
        fill: "#ab4f28",
        name: "iframe-eyebrow",
      }),
    );

    group.add(
      new Konva.Text({
        x: 20,
        y: 54,
        width: resolvedWidth - 40,
        height: resolvedHeight - 76,
        text: "Double-click to\nadd webpage URL",
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
      const url = node.getAttr("iframeUrl");
      if (url) {
        this.#mountOverlay(node, url);
      }
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
    overlay.hidden = !isVisible;
    if (!isVisible) return;

    const [a, b, c, d, e, f] = node.getAbsoluteTransform().getMatrix();
    overlay.style.width = `${node.width()}px`;
    overlay.style.height = `${node.height()}px`;
    overlay.style.opacity = String(node.opacity?.() ?? 1);
    overlay.style.transform = `matrix(${a}, ${b}, ${c}, ${d}, ${e}, ${f})`;
    node._iframeApplyViewport?.();
  }

  #mountOverlay(node, url) {
    this.#removeOverlay(node);

    const stage = node.getStage();
    if (!stage || !url) return;

    const overlay = document.createElement("div");
    overlay.className = "iframe-component__overlay";
    overlay.hidden = !node.isVisible?.();

    const topbar = document.createElement("div");
    topbar.className = "iframe-component__topbar";

    const urlLabel = document.createElement("span");
    urlLabel.className = "iframe-component__url";
    urlLabel.textContent = getUrlDisplayText(url);
    urlLabel.title = "Double-click to edit URL";

    const actions = document.createElement("div");
    actions.className = "iframe-component__actions";

    const modeBtn = document.createElement("button");
    modeBtn.type = "button";
    modeBtn.className = "iframe-component__mode";

    const closeBtn = document.createElement("button");
    closeBtn.type = "button";
    closeBtn.className = "iframe-component__close calc-widget__close";
    closeBtn.setAttribute("aria-label", "Close iframe");
    closeBtn.textContent = "✕";

    actions.append(modeBtn, closeBtn);
    topbar.append(urlLabel, actions);

    const body = document.createElement("div");
    body.className = "iframe-component__body";

    const viewport = document.createElement("div");
    viewport.className = "iframe-component__viewport";

    const frame = document.createElement("iframe");
    frame.className = "iframe-component__frame";
    frame.src = url;
    frame.loading = "lazy";
    frame.title = "Embedded webpage";
    frame.setAttribute("tabindex", "-1");

    const status = document.createElement("div");
    status.className = "iframe-component__status";
    status.textContent = "Loading webpage...";

    const shield = document.createElement("div");
    shield.className = "iframe-component__shield";

    viewport.append(frame);
    body.append(viewport, shield, status);
    overlay.append(topbar, body);

    const stageContainer = stage.container();
    stageContainer.style.position = "relative";
    stageContainer.appendChild(overlay);

    let fallbackTimer = window.setTimeout(() => {
      status.dataset.tone = "warning";
      status.textContent = FALLBACK_MESSAGE;
      status.hidden = false;
    }, 4000);

    const selectionPlugin = this.app.getPlugin?.("selection") ?? null;
    let dragging = false;
    let dragStartX = 0;
    let dragStartY = 0;
    let nodeStartX = 0;
    let nodeStartY = 0;

    const getInteractive = () => node.getAttr("iframeInteractive") === true;

    const beginDrag = (event) => {
      if (getInteractive()) return;
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
      overlay.dataset.mode = interactive ? "interactive" : "canvas";
      modeBtn.textContent = interactive ? "Done" : "Interact";
      modeBtn.setAttribute("aria-pressed", String(interactive));
      modeBtn.title = interactive ? "Exit webpage interaction mode" : "Enter webpage interaction mode";
      frame.style.pointerEvents = interactive ? "auto" : "none";
      shield.hidden = interactive;
      shield.style.pointerEvents = interactive ? "none" : "auto";
      body.classList.toggle("is-interactive", interactive);
      topbar.classList.toggle("is-interactive", interactive);
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
      const bodyHeight = Math.max(1, body.clientHeight || (node.height() - topbar.offsetHeight));
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

    node._iframeApplyViewport = applyViewport;

    const commitUrlChange = async (nextValue) => {
      this.app.events.emit("node:change:start", { node });
      await this.updateNode(node, nextValue);
      this.app.events.emit("node:changed", { node });
    };

    urlLabel.addEventListener("dblclick", () => {
      const input = document.createElement("input");
      input.type = "text";
      input.className = "iframe-component__url-input";
      input.value = node.getAttr("iframeUrl") ?? url;
      input.setAttribute("aria-label", "Edit iframe URL");
      urlLabel.replaceWith(input);
      input.focus();
      input.select();

      let cancelled = false;
      const finish = async () => {
        if (cancelled) {
          if (input.parentNode) {
            input.replaceWith(urlLabel);
          }
          return;
        }

        const nextValue = input.value;
        if (input.parentNode) {
          input.replaceWith(urlLabel);
        }
        await commitUrlChange(nextValue);
      };

      input.addEventListener("blur", () => {
        void finish();
      }, { once: true });

      input.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          input.blur();
        }
        if (event.key === "Escape") {
          event.preventDefault();
          cancelled = true;
          input.blur();
        }
      });
    });

    modeBtn.addEventListener("click", (event) => {
      event.stopPropagation();
      node.setAttr("iframeInteractive", !getInteractive());
      applyViewport();
    });

    closeBtn.addEventListener("click", (event) => {
      event.stopPropagation();
      this.app.events.emit("node:removed", { node });
      node.destroy();
      this.app.mainLayer.batchDraw();
    });

    body.addEventListener("wheel", (event) => {
      if (getInteractive()) return;

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

    shield.addEventListener("mousedown", beginDrag);
    topbar.addEventListener("mousedown", (event) => {
      if (getInteractive()) return;
      if (event.target.closest("button, input, .iframe-component__url")) return;
      beginDrag(event);
    });
    document.addEventListener("mousemove", onDragMove);
    document.addEventListener("mouseup", endDrag);

    topbar.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && getInteractive()) {
        event.preventDefault();
        node.setAttr("iframeInteractive", false);
        applyViewport();
      }
    });

    frame.addEventListener("load", () => {
      window.clearTimeout(fallbackTimer);
      fallbackTimer = null;
      hideStatus();
      urlLabel.textContent = getUrlDisplayText(node.getAttr("iframeUrl") ?? url);
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

    node._iframeOverlayEl = overlay;
    node._iframeOverlayCleanup = () => {
      if (fallbackTimer != null) {
        window.clearTimeout(fallbackTimer);
      }
      document.removeEventListener("mousemove", onDragMove);
      document.removeEventListener("mouseup", endDrag);
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

    if (url && node.getStage()) {
      this.#mountOverlay(node, url);
    } else {
      this.#removeOverlay(node);
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
    syncFrameChrome(node, { width, height, url });

    if (url && node.getStage()) {
      this.#mountOverlay(node, url);
    } else {
      this.#removeOverlay(node);
    }
  }
}
