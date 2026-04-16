import { BaseCommand, BasePlugin } from "../core/baseClasses.js";
import { Konva } from "../lib/konva.js";

const PANE_MIN_SCALE = 0.08;
const PANE_MAX_SCALE = 6;
const PANE_ZOOM_STEP = 1.08;
const PANE_FIT_PADDING = 24;
const SNAPSHOT_MAX_PIXEL_RATIO = 4;
const SNAPSHOT_MAX_PIXELS = 16000000;
const SELECTION_STROKE = "#f2b84b";

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function isPositiveFinite(value) {
  return Number.isFinite(value) && value > 0;
}

function getPageSnapshotBox(pageNode) {
  const background = pageNode?.findOne?.(".page-bg") ?? pageNode?.findOne?.(".container-bg");
  const rect = background?.getClientRect?.({
    relativeTo: pageNode,
    skipShadow: true,
  });

  const width = isPositiveFinite(rect?.width)
    ? rect.width
    : pageNode?.width?.();
  const height = isPositiveFinite(rect?.height)
    ? rect.height
    : pageNode?.height?.();

  if (!isPositiveFinite(width) || !isPositiveFinite(height)) return null;

  return {
    x: Number.isFinite(rect?.x) ? rect.x : 0,
    y: Number.isFinite(rect?.y) ? rect.y : 0,
    width,
    height,
  };
}

function getSnapshotPixelRatio(box, viewportRect = null) {
  const devicePixelRatio = Math.max(1, window.devicePixelRatio || 1);
  const availableWidth = Math.max(
    1,
    (Number.isFinite(viewportRect?.width) ? viewportRect.width : box.width) - PANE_FIT_PADDING,
  );
  const availableHeight = Math.max(
    1,
    (Number.isFinite(viewportRect?.height) ? viewportRect.height : box.height) - PANE_FIT_PADDING,
  );
  const displayScale = Math.max(
    1,
    Math.min(availableWidth / box.width, availableHeight / box.height),
  );
  const pixelLimitRatio = Math.sqrt(SNAPSHOT_MAX_PIXELS / (box.width * box.height));
  const maxRatio = Math.max(1, Math.min(SNAPSHOT_MAX_PIXEL_RATIO, pixelLimitRatio));

  return clamp(devicePixelRatio * displayScale, 1, maxRatio);
}

function createSnapshotHost(width, height) {
  const host = document.createElement("div");
  host.style.position = "fixed";
  host.style.left = "-100000px";
  host.style.top = "0";
  host.style.width = `${Math.ceil(width)}px`;
  host.style.height = `${Math.ceil(height)}px`;
  host.style.overflow = "hidden";
  host.style.pointerEvents = "none";
  host.style.opacity = "0";
  document.body.append(host);
  return host;
}

function isPageNode(node) {
  return node?.getAttr?.("componentType") === "page";
}

function resolvePageNode(target) {
  if (!target || target.getStage?.() === target) return null;
  const page = target.findAncestor?.(".page-root", true);
  return isPageNode(page) ? page : null;
}

function getPageTitle(node) {
  const label = node?.findOne?.(".page-label");
  const text = label?.text?.();
  return typeof text === "string" && text.trim() ? text.trim() : "Page";
}

function createButton(label, testId) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "page-compare-button";
  button.textContent = label;
  button.dataset.testid = testId;
  return button;
}

class ComparePagesCommand extends BaseCommand {
  static commandId = "page:compare-selection";
  static label = "Compare Pages";
  static modes = {
    presentation: {},
  };

  execute() {
    return this.plugin.openForSelection();
  }
}

export class PageComparePlugin extends BasePlugin {
  static pluginId = "page-compare";
  static modes = {
    presentation: {},
  };

  commands() {
    return [ComparePagesCommand];
  }

  onSetup() {
    this.selectedPages = [];
    this.openPages = [];
    this.overlay = null;
    this.overlayAbortController = null;
    this.overlayResizeObserver = null;
    this.paneViews = [];
    this.pendingFitFrame = null;
    this.selectionBar = null;
    this.selectionBarCountEl = null;
    this.selectionBarHintEl = null;
    this.selectionBarCompareEl = null;
    this.selectionOutlineGroup = new Konva.Group({
      listening: false,
      visible: false,
    });
    this.previousViewport = null;
    this.previousSelectionIds = [];
    this.isOpen = false;

    this.app.overlayLayer.add(this.selectionOutlineGroup);
    this.buildSelectionBar();

    this.app.stage.on("click.pageCompare tap.pageCompare", (event) => {
      this.handleStageClick(event);
    });
    this.listen("interaction:change", () => this.handleInteractionChange());
    this.listen("viewport:change", () => this.syncSelectionOutlines());
    this.listen("document:load:start", () => {
      this.close({ restore: false });
      this.clearPageSelection();
    });
    this.listenDom(window, "keydown", (event) => {
      if (!this.isOpen || event.key !== "Escape") return;
      event.preventDefault();
      this.close();
    });

    this.handleInteractionChange();

    this.cleanups.push(() => {
      this.app.stage.off(".pageCompare");
      this.selectionOutlineGroup.destroy();
      this.selectionBar?.remove();
    });
  }

  onDestroy() {
    this.close({ restore: false });
  }

  canCompareSelection() {
    return (
      this.isEnabled() &&
      this.selectedPages.length === 2
    );
  }

  shouldShowCompareControl() {
    return (
      this.isEnabled() &&
      this.selectedPages.length > 0
    );
  }

  emitState() {
    this.syncSelectionBar();
    this.syncSelectionOutlines();
    this.app.events.emit("page-compare:state-change", {
      canCompare: this.canCompareSelection(),
      shouldShow: this.shouldShowCompareControl(),
      selectedCount: this.selectedPages.length,
      pageCount: this.selectedPages.length,
      isOpen: this.isOpen,
    });
  }

  handleInteractionChange() {
    if (!this.isEnabled()) {
      this.close({ restore: true });
      this.clearPageSelection();
      return;
    }

    this.emitState();
  }

  handleStageClick(event) {
    if (!this.isEnabled() || this.isOpen) return;
    if (this.app.stageApi.consumePanClickSuppression()) return;

    const page = resolvePageNode(event.target);
    if (!page) {
      this.clearPageSelection();
      return;
    }

    if (event.evt?.shiftKey) {
      this.togglePageSelection(page);
      return;
    }

    this.setPageSelection([page]);
  }

  setPageSelection(pages) {
    this.selectedPages = [...new Set(pages.filter((page) => isPageNode(page)))]
      .filter((page) => page.getStage?.());
    this.emitState();
  }

  togglePageSelection(page) {
    if (!isPageNode(page)) return;
    if (this.selectedPages.includes(page)) {
      this.setPageSelection(this.selectedPages.filter((selectedPage) => selectedPage !== page));
      return;
    }

    this.setPageSelection([...this.selectedPages, page]);
  }

  clearPageSelection() {
    if (!this.selectedPages.length) {
      this.emitState();
      return;
    }
    this.selectedPages = [];
    this.emitState();
  }

  buildSelectionBar() {
    const host = this.app.stage.container().parentElement ?? document.body;
    const bar = document.createElement("div");
    bar.className = "page-compare-selection-bar";
    bar.dataset.testid = "page-compare-selection-bar";
    bar.hidden = true;

    const count = document.createElement("strong");
    count.className = "page-compare-selection-bar__count";

    const hint = document.createElement("span");
    hint.className = "page-compare-selection-bar__hint";

    const compareButton = createButton("Compare", "page-compare-selection-action");
    compareButton.classList.add("page-compare-button--primary");
    compareButton.addEventListener("click", () => {
      this.app.commands.execute("page:compare-selection");
    });

    bar.append(count, hint, compareButton);
    host.append(bar);

    this.selectionBar = bar;
    this.selectionBarCountEl = count;
    this.selectionBarHintEl = hint;
    this.selectionBarCompareEl = compareButton;
  }

  syncSelectionBar() {
    if (!this.selectionBar) return;

    const count = this.selectedPages.length;
    const visible = this.isEnabled() && !this.isOpen && count > 0;
    this.selectionBar.hidden = !visible;
    if (!visible) return;

    this.selectionBarCountEl.textContent = `${count} page${count === 1 ? "" : "s"} selected`;
    this.selectionBarHintEl.textContent =
      count === 1
        ? "Shift-click another page to compare."
        : count === 2
          ? "Ready to compare."
          : "Select exactly 2 pages.";
    this.selectionBarCompareEl.disabled = !this.canCompareSelection();
  }

  syncSelectionOutlines() {
    if (!this.selectionOutlineGroup) return;

    this.selectionOutlineGroup.destroyChildren();

    if (!this.isEnabled() || this.isOpen || !this.selectedPages.length) {
      this.selectionOutlineGroup.visible(false);
      this.app.overlayLayer.batchDraw();
      return;
    }

    this.selectedPages.forEach((page, index) => {
      const bounds = page.getClientRect({ relativeTo: this.app.stage });
      const outline = new Konva.Rect({
        x: bounds.x - 8,
        y: bounds.y - 8,
        width: bounds.width + 16,
        height: bounds.height + 16,
        stroke: SELECTION_STROKE,
        strokeWidth: 3,
        dash: index === 0 ? [] : [10, 7],
        cornerRadius: 22,
        listening: false,
        shadowColor: "rgba(29, 27, 22, 0.22)",
        shadowBlur: 16,
        shadowOpacity: 0.35,
      });
      this.selectionOutlineGroup.add(outline);
    });

    this.selectionOutlineGroup.visible(true);
    this.app.overlayLayer.batchDraw();
  }

  openForSelection() {
    if (!this.canCompareSelection()) {
      return false;
    }

    this.previousViewport = {
      scale: this.app.stageApi.getScale(),
      position: {
        x: this.app.stage.x(),
        y: this.app.stage.y(),
      },
    };
    this.previousSelectionIds = this.selectedPages.map((page) => page.id());
    this.openPages = [...this.selectedPages];
    this.isOpen = true;
    this.renderOverlay();
    this.emitState();
    return true;
  }

  close({ restore = true } = {}) {
    if (!this.isOpen && !this.overlay) return;

    const fullscreenTarget = this.overlay;
    if (document.fullscreenElement === fullscreenTarget) {
      const exitPromise = document.exitFullscreen?.();
      exitPromise?.catch?.(() => {});
    }

    this.destroyOverlay();
    this.isOpen = false;

    if (restore) {
      this.restorePreviousViewport();
      this.restorePreviousSelection();
    }

    this.previousViewport = null;
    this.previousSelectionIds = [];
    this.openPages = [];
    this.emitState();
  }

  restorePreviousViewport() {
    if (!this.previousViewport) return;
    this.app.stageApi.setViewport({
      scale: this.previousViewport.scale,
      position: this.previousViewport.position,
    });
  }

  restorePreviousSelection() {
    const pages = this.previousSelectionIds
      .map((id) => this.app.mainLayer.findOne(`#${id}`))
      .filter((node) => isPageNode(node));
    this.setPageSelection(pages);
  }

  renderOverlay() {
    this.destroyOverlay();

    const host = this.app.stage.container().parentElement ?? document.body;
    const overlay = document.createElement("div");
    overlay.className = "page-compare-overlay";
    overlay.dataset.testid = "page-compare-overlay";
    overlay.tabIndex = -1;

    const toolbar = document.createElement("div");
    toolbar.className = "page-compare-toolbar";

    const title = document.createElement("div");
    title.className = "page-compare-toolbar__title";
    title.textContent = "Compare pages";

    const actions = document.createElement("div");
    actions.className = "page-compare-toolbar__actions";

    const fitButton = createButton("Fit", "page-compare-fit");
    const swapButton = createButton("Swap", "page-compare-swap");
    const fullscreenButton = createButton("Fullscreen", "page-compare-fullscreen");
    const exitButton = createButton("Exit", "page-compare-exit");
    actions.append(fitButton, swapButton, fullscreenButton, exitButton);
    toolbar.append(title, actions);

    const panes = document.createElement("div");
    panes.className = "page-compare-panes";

    const paneViews = this.openPages.map((page, index) => this.createPane(page, index));
    paneViews.forEach(({ pane }) => panes.append(pane));

    overlay.append(toolbar, panes);
    host.append(overlay);

    this.overlay = overlay;
    this.paneViews = paneViews;
    this.overlayAbortController = new AbortController();
    const { signal } = this.overlayAbortController;

    if (typeof ResizeObserver !== "undefined") {
      this.overlayResizeObserver = new ResizeObserver(() => this.schedulePaneFit());
      this.overlayResizeObserver.observe(overlay);
      paneViews.forEach((view) => this.overlayResizeObserver.observe(view.viewport));
    }

    fitButton.addEventListener("click", () => this.fitOpenPanes({ force: true }), { signal });
    swapButton.addEventListener("click", () => this.swapPages(), { signal });
    fullscreenButton.addEventListener("click", () => this.toggleFullscreen(), { signal });
    exitButton.addEventListener("click", () => this.close(), { signal });
    document.addEventListener("fullscreenchange", () => {
      window.requestAnimationFrame(() => {
        this.refreshPaneSnapshots({ fitAfterLoad: true });
      });
    }, { signal });
    overlay.addEventListener("keydown", (event) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      this.close();
    }, { signal });

    window.requestAnimationFrame(() => {
      this.refreshPaneSnapshots({ fitAfterLoad: true });
    });
    overlay.focus({ preventScroll: true });
  }

  destroyOverlay() {
    if (this.pendingFitFrame != null) {
      window.cancelAnimationFrame(this.pendingFitFrame);
      this.pendingFitFrame = null;
    }
    this.overlayResizeObserver?.disconnect();
    this.overlayResizeObserver = null;
    this.overlayAbortController?.abort();
    this.overlayAbortController = null;
    this.overlay?.remove();
    this.overlay = null;
    this.paneViews = [];
  }

  fitOpenPanes({ force = false } = {}) {
    this.paneViews.forEach((view) => view.fit({ force }));
  }

  refreshPaneSnapshots({ fitAfterLoad = false } = {}) {
    this.paneViews.forEach((view) => view.refreshSnapshot({ fitAfterLoad }));
  }

  schedulePaneFit() {
    if (!this.isOpen || this.pendingFitFrame != null) return;

    this.pendingFitFrame = window.requestAnimationFrame(() => {
      this.pendingFitFrame = null;
      this.fitOpenPanes();
    });
  }

  createPane(pageNode, index) {
    const pane = document.createElement("section");
    pane.className = "page-compare-pane";
    pane.dataset.testid = `page-compare-pane-${index + 1}`;

    const header = document.createElement("div");
    header.className = "page-compare-pane__header";
    header.textContent = getPageTitle(pageNode);

    const viewport = document.createElement("div");
    viewport.className = "page-compare-pane__viewport";

    const image = document.createElement("img");
    image.className = "page-compare-pane__image";
    image.alt = getPageTitle(pageNode);
    image.draggable = false;

    const error = document.createElement("p");
    error.className = "page-compare-pane__empty";
    error.textContent = "This page preview is unavailable.";
    error.hidden = true;

    viewport.append(image, error);
    pane.append(header, viewport);

    const state = {
      x: 0,
      y: 0,
      scale: 1,
      isFit: true,
      snapshot: null,
      pointerId: null,
      dragStart: null,
    };

    const applyTransform = () => {
      image.style.transform = `translate(${state.x}px, ${state.y}px) scale(${state.scale})`;
      image.dataset.compareX = String(state.x);
      image.dataset.compareY = String(state.y);
      image.dataset.compareScale = String(state.scale);
    };

    const showUnavailable = () => {
      state.snapshot = null;
      image.hidden = true;
      image.removeAttribute("src");
      image.style.removeProperty("width");
      image.style.removeProperty("height");
      error.hidden = false;
    };

    const fit = ({ force = false } = {}) => {
      if (!state.snapshot || (!force && !state.isFit)) return;

      const rect = viewport.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;

      const nextScale = Math.min(
        Math.max(1, rect.width - PANE_FIT_PADDING) / state.snapshot.width,
        Math.max(1, rect.height - PANE_FIT_PADDING) / state.snapshot.height,
      );
      state.scale = Math.max(PANE_MIN_SCALE, Math.min(PANE_MAX_SCALE, nextScale));
      state.x = (rect.width - state.snapshot.width * state.scale) / 2;
      state.y = (rect.height - state.snapshot.height * state.scale) / 2;
      state.isFit = true;
      applyTransform();
    };

    const showSnapshot = (snapshot, { fitAfterLoad = false } = {}) => {
      state.snapshot = snapshot;
      image.hidden = false;
      error.hidden = true;
      image.style.width = `${snapshot.width}px`;
      image.style.height = `${snapshot.height}px`;
      image.dataset.snapshotPixelRatio = String(snapshot.pixelRatio);
      image.dataset.snapshotWidth = String(snapshot.width);
      image.dataset.snapshotHeight = String(snapshot.height);

      const shouldFit = fitAfterLoad || state.isFit;
      image.onload = () => {
        if (shouldFit) {
          fit({ force: true });
        } else {
          applyTransform();
        }
      };
      image.onerror = () => showUnavailable();
      image.src = snapshot.url;

      window.setTimeout(() => {
        if (image.complete && state.snapshot === snapshot) {
          if (shouldFit) {
            fit({ force: true });
          } else {
            applyTransform();
          }
        }
      }, 0);
    };

    const refreshSnapshot = ({ fitAfterLoad = false } = {}) => {
      const snapshot = this.createPageSnapshot(pageNode, {
        viewportRect: viewport.getBoundingClientRect(),
      });

      if (!snapshot) {
        showUnavailable();
        return;
      }

      showSnapshot(snapshot, { fitAfterLoad: fitAfterLoad || state.isFit });
    };

    viewport.addEventListener("wheel", (event) => {
      if (!state.snapshot) return;
      event.preventDefault();

      const rect = viewport.getBoundingClientRect();
      const pointer = {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top,
      };
      const oldScale = state.scale;
      const zoomFactor = event.deltaY > 0 ? 1 / PANE_ZOOM_STEP : PANE_ZOOM_STEP;
      const nextScale = Math.max(
        PANE_MIN_SCALE,
        Math.min(PANE_MAX_SCALE, oldScale * zoomFactor),
      );

      state.x = pointer.x - ((pointer.x - state.x) / oldScale) * nextScale;
      state.y = pointer.y - ((pointer.y - state.y) / oldScale) * nextScale;
      state.scale = nextScale;
      state.isFit = false;
      applyTransform();
    }, { passive: false });

    viewport.addEventListener("pointerdown", (event) => {
      if (!state.snapshot || event.button !== 0) return;
      viewport.setPointerCapture(event.pointerId);
      state.pointerId = event.pointerId;
      state.dragStart = {
        clientX: event.clientX,
        clientY: event.clientY,
        x: state.x,
        y: state.y,
      };
      viewport.classList.add("is-dragging");
    });

    viewport.addEventListener("pointermove", (event) => {
      if (state.pointerId !== event.pointerId || !state.dragStart) return;
      state.x = state.dragStart.x + event.clientX - state.dragStart.clientX;
      state.y = state.dragStart.y + event.clientY - state.dragStart.clientY;
      state.isFit = false;
      applyTransform();
    });

    const finishDrag = (event) => {
      if (state.pointerId !== event.pointerId) return;
      state.pointerId = null;
      state.dragStart = null;
      viewport.classList.remove("is-dragging");
    };
    viewport.addEventListener("pointerup", finishDrag);
    viewport.addEventListener("pointercancel", finishDrag);

    const getState = () => {
      const rect = viewport.getBoundingClientRect();
      return {
        pageId: pageNode.id(),
        title: getPageTitle(pageNode),
        hasSnapshot: Boolean(state.snapshot),
        snapshot: state.snapshot
          ? {
              width: state.snapshot.width,
              height: state.snapshot.height,
              pixelRatio: state.snapshot.pixelRatio,
              urlLength: state.snapshot.url.length,
            }
          : null,
        viewport: {
          width: rect.width,
          height: rect.height,
        },
        transform: {
          x: state.x,
          y: state.y,
          scale: state.scale,
          isFit: state.isFit,
        },
        image: {
          naturalWidth: image.naturalWidth,
          naturalHeight: image.naturalHeight,
          displayWidth: state.snapshot ? state.snapshot.width * state.scale : 0,
          displayHeight: state.snapshot ? state.snapshot.height * state.scale : 0,
          hidden: image.hidden,
        },
      };
    };

    return { pane, viewport, fit, refreshSnapshot, getState };
  }

  createPageSnapshot(pageNode, { viewportRect = null } = {}) {
    if (!pageNode?.clone) return null;

    const box = getPageSnapshotBox(pageNode);
    if (!box) return null;

    const width = Math.ceil(box.width);
    const height = Math.ceil(box.height);
    const pixelRatio = getSnapshotPixelRatio({ width, height }, viewportRect);
    const host = createSnapshotHost(width, height);
    let stage = null;

    try {
      stage = new Konva.Stage({
        container: host,
        width,
        height,
        listening: false,
      });
      const layer = new Konva.Layer({ listening: false });
      const clone = pageNode.clone();

      clone.position({
        x: -box.x,
        y: -box.y,
      });
      clone.scale({ x: 1, y: 1 });
      clone.rotation(0);
      clone.offset({ x: 0, y: 0 });
      clone.draggable(false);
      clone.listening(false);
      layer.add(clone);
      stage.add(layer);
      layer.draw();

      const url = stage.toDataURL({
        x: 0,
        y: 0,
        width,
        height,
        pixelRatio,
        mimeType: "image/png",
      });

      return {
        url,
        width,
        height,
        pixelRatio,
      };
    } catch (error) {
      console.warn("Unable to create page comparison preview.", error);
      return null;
    } finally {
      stage?.destroy();
      host.remove();
    }
  }

  getDebugState() {
    return {
      isOpen: this.isOpen,
      selectedPageIds: this.selectedPages.map((page) => page.id()),
      openPageIds: this.openPages.map((page) => page.id()),
      isFullscreen: Boolean(this.overlay && document.fullscreenElement === this.overlay),
      panes: this.paneViews.map((view) => view.getState()),
    };
  }

  swapPages() {
    if (!this.isOpen || this.openPages.length !== 2) return;
    this.openPages = [this.openPages[1], this.openPages[0]];
    this.renderOverlay();
  }

  toggleFullscreen() {
    if (!this.overlay) return;

    if (document.fullscreenElement) {
      const exitPromise = document.exitFullscreen?.();
      exitPromise?.catch?.(() => {});
      return;
    }

    const fullscreenPromise = this.overlay.requestFullscreen?.();
    fullscreenPromise?.catch?.(() => {});
  }
}
