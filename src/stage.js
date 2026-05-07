import { Konva } from "./lib/konva.js";
import {
  BACKGROUND_TYPES,
  cloneBackgroundState,
  DEFAULT_BACKGROUND_STATE,
  normalizeBackgroundState,
} from "./background/state.js";

const MIN_SCALE = 0.1;
const MAX_SCALE = 5;
const ZOOM_RATIO = 1.04;
const GRID_SPACING = 32;
const GRID_MAJOR_EVERY = 4;
const PAN_CLICK_THRESHOLD = 4;
const GRID_BUFFER_CELLS = 2;

function isRankingItemInteractionTarget(target) {
  return Boolean(target?.findAncestor?.(".ranking-item-card", true));
}

export class StageController {
  constructor(container, { onZoomChange, onViewportChange } = {}) {
    this.container = container;
    this.onZoomChange = onZoomChange;
    this.onViewportChange = onViewportChange;
    this.stage = new Konva.Stage({
      container,
      width: container.clientWidth,
      height: container.clientHeight,
      draggable: false,
    });

    this.gridLayer = new Konva.Layer({ listening: false });
    this.mainLayer = new Konva.Layer();
    this.drawLayer = new Konva.Layer();
    this.overlayLayer = new Konva.Layer({ listening: false });
    this.uiLayer = new Konva.Layer();

    this.stage.add(this.gridLayer);
    this.stage.add(this.mainLayer);
    this.stage.add(this.drawLayer);
    this.stage.add(this.overlayLayer);
    this.stage.add(this.uiLayer);

    this.isPanning = false;
    this.lastPointer = null;
    this.panStartPointer = null;
    this.didPanSincePointerDown = false;
    this.suppressNextClick = false;
    this.isSpacePressed = false;
    this.gridSignature = null;
    this.pendingResizeFrame = null;
    this.lastObservedSize = {
      width: container.clientWidth,
      height: container.clientHeight,
    };
    this.backgroundState = cloneBackgroundState(DEFAULT_BACKGROUND_STATE);

    this.onKeyDown = this.onKeyDown.bind(this);
    this.onKeyUp = this.onKeyUp.bind(this);
    this.onWheel = this.onWheel.bind(this);
    this.onPointerDown = this.onPointerDown.bind(this);
    this.onPointerMove = this.onPointerMove.bind(this);
    this.onPointerUp = this.onPointerUp.bind(this);
    this.onResize = this.onResize.bind(this);

    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    this.stage.on("wheel", this.onWheel);
    this.stage.on("mousedown touchstart", this.onPointerDown);
    this.stage.on("mousemove touchmove", this.onPointerMove);
    this.stage.on("mouseup touchend mouseleave", this.onPointerUp);

    this.resizeObserver = new ResizeObserver(this.onResize);
    this.resizeObserver.observe(container);
    this.applyBackgroundState();
    this.syncViewport(1);
  }

  getBackgroundState() {
    return cloneBackgroundState(this.backgroundState);
  }

  setBackgroundState(state = {}) {
    this.backgroundState = normalizeBackgroundState(state);
    this.applyBackgroundState();
    this.gridSignature = null;
    this.redrawGrid();
    this.stage.batchDraw();
    return this.getBackgroundState();
  }

  applyBackgroundState() {
    const { type, color, opacity } = this.backgroundState;
    this.container.dataset.backgroundType = type;
    this.container.style.setProperty("--canvas-bg-color", color);
    this.container.style.setProperty("--canvas-bg-alpha", String(opacity));

    const paperBase = type === BACKGROUND_TYPES.WARM_PAPER ? color : DEFAULT_BACKGROUND_STATE.color;
    this.container.style.setProperty("--canvas-paper-base", paperBase);
    this.container.style.setProperty("--canvas-paper-shadow", this.mixHexColor(paperBase, "#c9a16a", 0.18));
    this.container.style.setProperty("--canvas-paper-highlight", this.mixHexColor(paperBase, "#fffdf6", 0.52));
  }

  getGridStrokeColor(isMajor = false) {
    const alpha = (isMajor ? 0.18 : 0.1) * this.backgroundState.opacity;
    const hex = this.mixHexColor(this.backgroundState.color, "#4f4334", isMajor ? 0.55 : 0.4);
    const red = Number.parseInt(hex.slice(1, 3), 16);
    const green = Number.parseInt(hex.slice(3, 5), 16);
    const blue = Number.parseInt(hex.slice(5, 7), 16);
    return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
  }

  mixHexColor(baseHex, targetHex, ratio = 0.5) {
    const clampRatio = Math.max(0, Math.min(1, Number(ratio) || 0));
    const parse = (hex) => ({
      r: Number.parseInt(hex.slice(1, 3), 16),
      g: Number.parseInt(hex.slice(3, 5), 16),
      b: Number.parseInt(hex.slice(5, 7), 16),
    });
    const base = parse(baseHex);
    const target = parse(targetHex);
    const toHex = (value) => Math.round(value).toString(16).padStart(2, "0");

    return `#${toHex(base.r + (target.r - base.r) * clampRatio)}${toHex(base.g + (target.g - base.g) * clampRatio)}${toHex(base.b + (target.b - base.b) * clampRatio)}`;
  }

  screenToCanvas(screenPos) {
    const scale = this.stage.scaleX();
    return {
      x: (screenPos.x - this.stage.x()) / scale,
      y: (screenPos.y - this.stage.y()) / scale,
    };
  }

  canvasToScreen(canvasPos) {
    const scale = this.stage.scaleX();
    return {
      x: canvasPos.x * scale + this.stage.x(),
      y: canvasPos.y * scale + this.stage.y(),
    };
  }

  redrawGrid() {
    if (this.backgroundState.type !== BACKGROUND_TYPES.GRID) {
      this.gridSignature = "hidden";
      this.gridLayer.destroyChildren();
      this.gridLayer.batchDraw();
      return;
    }

    const topLeft = this.screenToCanvas({ x: 0, y: 0 });
    const bottomRight = this.screenToCanvas({
      x: this.stage.width(),
      y: this.stage.height(),
    });
    const minX = Math.floor((topLeft.x - GRID_BUFFER_CELLS * GRID_SPACING) / GRID_SPACING) * GRID_SPACING;
    const maxX = Math.ceil((bottomRight.x + GRID_BUFFER_CELLS * GRID_SPACING) / GRID_SPACING) * GRID_SPACING;
    const minY = Math.floor((topLeft.y - GRID_BUFFER_CELLS * GRID_SPACING) / GRID_SPACING) * GRID_SPACING;
    const maxY = Math.ceil((bottomRight.y + GRID_BUFFER_CELLS * GRID_SPACING) / GRID_SPACING) * GRID_SPACING;
    const nextSignature = `${minX}:${maxX}:${minY}:${maxY}`;

    if (nextSignature === this.gridSignature) {
      return;
    }

    this.gridSignature = nextSignature;

    this.gridLayer.destroyChildren();

    for (let x = minX; x <= maxX; x += GRID_SPACING) {
      const isMajor = Math.round(x / GRID_SPACING) % GRID_MAJOR_EVERY === 0;
      this.gridLayer.add(new Konva.Line({
        points: [x, minY, x, maxY],
        stroke: this.getGridStrokeColor(isMajor),
        strokeWidth: 1,
        listening: false,
        perfectDrawEnabled: false,
      }));
    }

    for (let y = minY; y <= maxY; y += GRID_SPACING) {
      const isMajor = Math.round(y / GRID_SPACING) % GRID_MAJOR_EVERY === 0;
      this.gridLayer.add(new Konva.Line({
        points: [minX, y, maxX, y],
        stroke: this.getGridStrokeColor(isMajor),
        strokeWidth: 1,
        listening: false,
        perfectDrawEnabled: false,
      }));
    }

    this.gridLayer.batchDraw();
  }

  syncViewport(scale = this.stage.scaleX()) {
    this.redrawGrid();
    this.stage.batchDraw();
    this.onZoomChange?.(Math.round(scale * 100));
    this.onViewportChange?.({
      scale,
      viewport: this.getViewportBounds(),
      size: this.getScreenSize(),
      position: {
        x: this.stage.x(),
        y: this.stage.y(),
      },
    });
  }

  setViewport({
    scale = this.stage.scaleX(),
    position = { x: this.stage.x(), y: this.stage.y() },
  }) {
    this.stage.scale({ x: scale, y: scale });
    this.stage.position(position);
    this.syncViewport(scale);
  }

  setScale(nextScale, pointer = { x: this.stage.width() / 2, y: this.stage.height() / 2 }) {
    const oldScale = this.stage.scaleX();
    const scale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, nextScale));
    const mousePoint = {
      x: (pointer.x - this.stage.x()) / oldScale,
      y: (pointer.y - this.stage.y()) / oldScale,
    };

    this.setViewport({
      scale,
      position: {
        x: pointer.x - mousePoint.x * scale,
        y: pointer.y - mousePoint.y * scale,
      },
    });
  }

  getScale() {
    return this.stage.scaleX();
  }

  getScreenSize() {
    return {
      width: this.stage.width(),
      height: this.stage.height(),
    };
  }

  getViewportBounds() {
    const topLeft = this.screenToCanvas({ x: 0, y: 0 });
    const bottomRight = this.screenToCanvas({
      x: this.stage.width(),
      y: this.stage.height(),
    });

    return {
      x: topLeft.x,
      y: topLeft.y,
      width: bottomRight.x - topLeft.x,
      height: bottomRight.y - topLeft.y,
    };
  }

  centerOn(canvasPoint, { duration = 0.35, scale = this.stage.scaleX() } = {}) {
    const nextScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, scale));
    const position = {
      x: this.stage.width() / 2 - canvasPoint.x * nextScale,
      y: this.stage.height() / 2 - canvasPoint.y * nextScale,
    };

    if (duration <= 0) {
      this.setViewport({ scale: nextScale, position });
      return null;
    }

    const tween = new Konva.Tween({
      node: this.stage,
      x: position.x,
      y: position.y,
      scaleX: nextScale,
      scaleY: nextScale,
      duration,
      easing: Konva.Easings.EaseInOut,
      onUpdate: () => this.syncViewport(this.stage.scaleX()),
      onFinish: () => this.syncViewport(this.stage.scaleX()),
    });
    tween.play();
    return tween;
  }

  consumePanClickSuppression() {
    const shouldSuppress = this.suppressNextClick;
    this.suppressNextClick = false;
    return shouldSuppress;
  }

  onWheel(event) {
    event.evt.preventDefault();
    const pointer = this.stage.getPointerPosition();
    if (!pointer) return;
    const app = this.stage.getAttr("app");
    app?.roomShare?.handleUserViewportIntent?.("zoom");
    const direction = event.evt.deltaY > 0 ? -1 : 1;
    const nextScale =
      direction > 0 ? this.stage.scaleX() * ZOOM_RATIO : this.stage.scaleX() / ZOOM_RATIO;
    this.setScale(nextScale, pointer);
  }

  onKeyDown(event) {
    if (
      event.target instanceof HTMLInputElement ||
      event.target instanceof HTMLTextAreaElement
    ) {
      return;
    }
    if (event.code === "Space") {
      this.isSpacePressed = true;
      const app = this.stage.getAttr("app");
      if (app) {
        app.syncCursor();
      } else {
        this.container.style.cursor = "grab";
      }
    }
  }

  onKeyUp(event) {
    if (event.code === "Space") {
      this.isSpacePressed = false;
      const app = this.stage.getAttr("app");
      if (app) {
        app.syncCursor();
      } else {
        this.container.style.cursor = "default";
      }
    }
  }

  onPointerDown(event) {
    this.suppressNextClick = false;
    const isMiddleButton = event.evt.button === 1;
    const app = this.stage.getAttr("app");
    const isPrimaryPointer = event.evt.button == null || event.evt.button === 0;
    const activeToolId = app?.getEditorTool?.() ?? null;
    const isReadOnlyDrawingTool =
      app?.isReadOnly?.()
      && ["pen", "pencil", "highlighter", "eraser"].includes(activeToolId);
    const target = event.target;
    const hasSelectableTarget = Boolean(
      target?.hasName?.("selectable") || target?.findAncestor?.(".selectable", true),
    );
    const isRankingItemTarget = isRankingItemInteractionTarget(target);
    const isInteractiveTarget =
      hasSelectableTarget ||
      isRankingItemTarget ||
      Boolean(target?.draggable?.()) ||
      (target !== this.stage && target?.getLayer?.() === app?.uiLayer);
    const isArrangeViewportPan =
      app?.modeManager?.matches?.({ mode: "edit", editorTool: "arrange" }) === true &&
      isPrimaryPointer &&
      !event.evt?.shiftKey &&
      !isInteractiveTarget;
    const shouldPan =
      isMiddleButton ||
      this.isSpacePressed ||
      (app?.isReadOnly?.() && isPrimaryPointer && !isRankingItemTarget && !isReadOnlyDrawingTool) ||
      isArrangeViewportPan;
    if (!shouldPan) return;

    app?.roomShare?.handleUserViewportIntent?.("pan");
    this.isPanning = true;
    this.lastPointer = this.stage.getPointerPosition();
    this.panStartPointer = this.lastPointer;
    this.didPanSincePointerDown = false;
    this.container.style.cursor = "grabbing";
  }

  onPointerMove() {
    if (!this.isPanning) return;
    const pointer = this.stage.getPointerPosition();
    if (!pointer || !this.lastPointer) return;

    if (
      this.panStartPointer &&
      Math.hypot(pointer.x - this.panStartPointer.x, pointer.y - this.panStartPointer.y) >=
        PAN_CLICK_THRESHOLD
    ) {
      this.didPanSincePointerDown = true;
    }

    this.stage.position({
      x: this.stage.x() + pointer.x - this.lastPointer.x,
      y: this.stage.y() + pointer.y - this.lastPointer.y,
    });
    this.lastPointer = pointer;
    this.syncViewport();
  }

  onPointerUp() {
    this.suppressNextClick = this.didPanSincePointerDown;
    this.isPanning = false;
    this.lastPointer = null;
    this.panStartPointer = null;
    this.didPanSincePointerDown = false;
    const app = this.stage.getAttr("app");
    if (app) {
      app.syncCursor();
    } else {
      this.container.style.cursor = "default";
    }
  }

  onResize() {
    this.lastObservedSize = {
      width: this.container.clientWidth,
      height: this.container.clientHeight,
    };

    if (this.pendingResizeFrame != null) return;

    this.pendingResizeFrame = window.requestAnimationFrame(() => {
      this.pendingResizeFrame = null;
      const { width, height } = this.lastObservedSize;

      if (
        width === this.stage.width() &&
        height === this.stage.height()
      ) {
        return;
      }

      this.stage.size({ width, height });
      this.gridSignature = null;
      this.syncViewport();
    });
  }

  destroy() {
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    this.resizeObserver.disconnect();
    if (this.pendingResizeFrame != null) {
      window.cancelAnimationFrame(this.pendingResizeFrame);
      this.pendingResizeFrame = null;
    }
    this.stage.destroy();
  }
}
