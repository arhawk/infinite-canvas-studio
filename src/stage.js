const MIN_SCALE = 0.1;
const MAX_SCALE = 5;
const ZOOM_RATIO = 1.04;
const GRID_SPACING = 32;
const GRID_COLOR = "rgba(84, 64, 43, 0.08)";
const GRID_MAJOR_COLOR = "rgba(84, 64, 43, 0.14)";
const GRID_MAJOR_EVERY = 4;

export class StageController {
  constructor(container, { onZoomChange } = {}) {
    this.container = container;
    this.onZoomChange = onZoomChange;
    this.stage = new window.Konva.Stage({
      container,
      width: container.clientWidth,
      height: container.clientHeight,
      draggable: false,
    });

    this.gridLayer = new window.Konva.Layer({ listening: false });
    this.mainLayer = new window.Konva.Layer();
    this.drawLayer = new window.Konva.Layer();
    this.overlayLayer = new window.Konva.Layer({ listening: false });
    this.uiLayer = new window.Konva.Layer();

    this.stage.add(this.gridLayer);
    this.stage.add(this.mainLayer);
    this.stage.add(this.drawLayer);
    this.stage.add(this.overlayLayer);
    this.stage.add(this.uiLayer);

    this.isPanning = false;
    this.lastPointer = null;
    this.isSpacePressed = false;

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
    this.syncViewport(1);
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
    const topLeft = this.screenToCanvas({ x: 0, y: 0 });
    const bottomRight = this.screenToCanvas({
      x: this.stage.width(),
      y: this.stage.height(),
    });
    const minX = Math.floor(topLeft.x / GRID_SPACING) * GRID_SPACING;
    const maxX = Math.ceil(bottomRight.x / GRID_SPACING) * GRID_SPACING;
    const minY = Math.floor(topLeft.y / GRID_SPACING) * GRID_SPACING;
    const maxY = Math.ceil(bottomRight.y / GRID_SPACING) * GRID_SPACING;

    this.gridLayer.destroyChildren();

    for (let x = minX; x <= maxX; x += GRID_SPACING) {
      const isMajor = Math.round(x / GRID_SPACING) % GRID_MAJOR_EVERY === 0;
      this.gridLayer.add(new window.Konva.Line({
        points: [x, minY, x, maxY],
        stroke: isMajor ? GRID_MAJOR_COLOR : GRID_COLOR,
        strokeWidth: 1,
        listening: false,
        perfectDrawEnabled: false,
      }));
    }

    for (let y = minY; y <= maxY; y += GRID_SPACING) {
      const isMajor = Math.round(y / GRID_SPACING) % GRID_MAJOR_EVERY === 0;
      this.gridLayer.add(new window.Konva.Line({
        points: [minX, y, maxX, y],
        stroke: isMajor ? GRID_MAJOR_COLOR : GRID_COLOR,
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

  centerOn(canvasPoint, { duration = 0.35 } = {}) {
    const scale = this.stage.scaleX();
    const position = {
      x: this.stage.width() / 2 - canvasPoint.x * scale,
      y: this.stage.height() / 2 - canvasPoint.y * scale,
    };

    if (duration <= 0) {
      this.setViewport({ scale, position });
      return null;
    }

    const tween = new window.Konva.Tween({
      node: this.stage,
      x: position.x,
      y: position.y,
      duration,
      easing: window.Konva.Easings.EaseInOut,
      onUpdate: () => this.syncViewport(scale),
      onFinish: () => this.syncViewport(scale),
    });
    tween.play();
    return tween;
  }

  resetZoom() {
    this.setScale(1);
  }

  fitNodes(nodes) {
    const visibleNodes = nodes.filter((node) => node.isVisible());
    if (!visibleNodes.length) return;

    const boxes = visibleNodes.map((node) => node.getClientRect({ skipTransform: false }));
    const bounds = boxes.reduce(
      (acc, box) => ({
        x: Math.min(acc.x, box.x),
        y: Math.min(acc.y, box.y),
        maxX: Math.max(acc.maxX, box.x + box.width),
        maxY: Math.max(acc.maxY, box.y + box.height),
      }),
      { x: Infinity, y: Infinity, maxX: -Infinity, maxY: -Infinity },
    );

    const width = Math.max(bounds.maxX - bounds.x, 100);
    const height = Math.max(bounds.maxY - bounds.y, 100);
    const padding = 80;
    const scale = Math.max(
      MIN_SCALE,
      Math.min(
        MAX_SCALE,
        Math.min(
          (this.stage.width() - padding * 2) / width,
          (this.stage.height() - padding * 2) / height,
        ),
      ),
    );

    this.setViewport({
      scale,
      position: {
        x: this.stage.width() / 2 - (bounds.x + width / 2) * scale,
        y: this.stage.height() / 2 - (bounds.y + height / 2) * scale,
      },
    });
  }

  onWheel(event) {
    event.evt.preventDefault();
    const pointer = this.stage.getPointerPosition();
    if (!pointer) return;
    const direction = event.evt.deltaY > 0 ? -1 : 1;
    const nextScale =
      direction > 0 ? this.stage.scaleX() * ZOOM_RATIO : this.stage.scaleX() / ZOOM_RATIO;
    this.setScale(nextScale, pointer);
  }

  onKeyDown(event) {
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
    const isMiddleButton = event.evt.button === 1;
    const app = this.stage.getAttr("app");
    const isPrimaryPointer = event.evt.button == null || event.evt.button === 0;
    const shouldPan =
      isMiddleButton ||
      this.isSpacePressed ||
      (app?.isReadOnly?.() && isPrimaryPointer);
    if (!shouldPan) return;

    this.isPanning = true;
    this.lastPointer = this.stage.getPointerPosition();
    this.container.style.cursor = "grabbing";
  }

  onPointerMove() {
    if (!this.isPanning) return;
    const pointer = this.stage.getPointerPosition();
    if (!pointer || !this.lastPointer) return;

    this.stage.position({
      x: this.stage.x() + pointer.x - this.lastPointer.x,
      y: this.stage.y() + pointer.y - this.lastPointer.y,
    });
    this.lastPointer = pointer;
    this.syncViewport();
  }

  onPointerUp() {
    this.isPanning = false;
    this.lastPointer = null;
    const app = this.stage.getAttr("app");
    if (app) {
      app.syncCursor();
    } else {
      this.container.style.cursor = "default";
    }
  }

  onResize() {
    this.stage.size({
      width: this.container.clientWidth,
      height: this.container.clientHeight,
    });
    this.syncViewport();
  }

  destroy() {
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    this.resizeObserver.disconnect();
    this.stage.destroy();
  }
}
