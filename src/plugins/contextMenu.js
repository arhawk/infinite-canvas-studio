import { BasePlugin } from "../core/baseClasses.js";
import { Konva } from "../lib/konva.js";

export class ContextMenuPlugin extends BasePlugin {
  static pluginId = "context-menu";
  static modes = {
    edit: {
      tools: {
        arrange: {},
      },
    },
  };

  onSetup() {
    const { stage, uiLayer } = this.app;
    this.stage = stage;
    this.uiLayer = uiLayer;
    this.contextTarget = null;
    this.menuCanvasPoint = null;

    this.itemHeight = 36;
    this.paddingY = 6;
    this.menuWidth = 180;

    this.menuGroup = new Konva.Group({
      visible: false,
      name: "context-menu",
    });

    this.menuBackground = new Konva.Rect({
      width: this.menuWidth,
      cornerRadius: 16,
      fill: "rgba(255, 253, 249, 0.98)",
      stroke: "rgba(61, 47, 32, 0.12)",
      shadowColor: "rgba(54, 41, 25, 0.12)",
      shadowBlur: 24,
      shadowOffsetY: 10,
      shadowOpacity: 0.35,
    });

    this.menuGroup.add(this.menuBackground);
    uiLayer.add(this.menuGroup);

    stage.on("contextmenu.ctxmenu", (event) => this.handleContextMenu(event));
    stage.on("click.ctxmenu tap.ctxmenu dragstart.ctxmenu wheel.ctxmenu", (event) => {
      if (event.evt && event.evt.button === 2) return; // Ignore right click
      if (event.target.findAncestor?.(".context-menu", true)) return;
      if (this.menuGroup.visible()) this.hideMenu();
    });

    this.cleanups.push(() => {
      stage.off(".ctxmenu");
      this.menuGroup.destroy();
    });
  }

  onModeExit() {
    this.hideMenu();
  }

  hideMenu() {
    this.menuGroup.visible(false);
    this.uiLayer.batchDraw();
    this.contextTarget = null;
    this.menuCanvasPoint = null;
    this.app.syncCursor();
  }

  buildMenu(items) {
    this.menuGroup.destroyChildren();
    this.menuGroup.add(this.menuBackground);
    this.menuBackground.height(this.paddingY * 2 + items.length * this.itemHeight);

    items.forEach((item, index) => {
      const y = this.paddingY + index * this.itemHeight;
      const hitRect = new Konva.Rect({
        x: 0,
        y,
        width: this.menuWidth,
        height: this.itemHeight,
        fill: "transparent",
      });
      const label = new Konva.Text({
        x: 16,
        y: y + 9,
        text: item.label,
        fontSize: 14,
        fontFamily: "IBM Plex Sans",
        fontStyle: "600",
        fill: "#1d1b16",
        listening: false,
      });

      hitRect.on("mouseenter", () => {
        this.app.setCursorOverride("pointer");
        hitRect.fill("rgba(215, 97, 47, 0.08)");
        this.uiLayer.batchDraw();
      });

      hitRect.on("mouseleave", () => {
        this.app.clearCursorOverride();
        hitRect.fill("transparent");
        this.uiLayer.batchDraw();
      });

      hitRect.on("mousedown touchstart", (event) => {
        event.cancelBubble = true;
      });

      hitRect.on("click tap", (event) => {
        event.cancelBubble = true;
        const target = this.contextTarget;
        this.hideMenu();
        item.execute(target);
      });

      this.menuGroup.add(hitRect, label);
    });
  }

  syncMenuPosition() {
    if (!this.menuCanvasPoint) return;
    const scale = this.app.stageApi.getScale();
    this.menuGroup.position(this.menuCanvasPoint);
    this.menuGroup.scale({ x: 1 / scale, y: 1 / scale });
  }

  showMenu(target, clientPoint) {
    const containerRect = this.stage.container().getBoundingClientRect();
    this.contextTarget = target;
    this.menuCanvasPoint = this.app.stageApi.screenToCanvas({
      x: clientPoint.x - containerRect.left,
      y: clientPoint.y - containerRect.top,
    });

    const node = target?.findAncestor?.(".selectable", true) ?? target;
    const items = this.app.contextMenu.getItems(node);
    if (!items.length) return;

    this.buildMenu(items);
    this.syncMenuPosition();
    this.menuGroup.visible(true);
    this.uiLayer.batchDraw();
  }

  handleContextMenu(event) {
    if (!this.isEnabled()) {
      this.hideMenu();
      return;
    }

    const node = event.target.findAncestor(".selectable", true) ?? event.target;
    if (node === this.stage || !node?.hasName?.("selectable")) {
      this.hideMenu();
      return;
    }

    event.evt.preventDefault();
    this.showMenu(node, { x: event.evt.clientX, y: event.evt.clientY });
  }
}
