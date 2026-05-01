import { BasePlugin } from "../core/baseClasses.js";
import { UI_FONT_FAMILY } from "../lib/fonts.js";
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
    this.menuState = [];
    this.activeTooltipLabel = null;
    this.uiCanvasPreviousStyle = null;

    this.itemHeight = 38;
    this.paddingY = 6;
    this.menuWidth = 220;
    this.accessoryButtonSize = 22;
    this.accessoryGap = 10;

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

    this.tooltipGroup = new Konva.Group({
      visible: false,
      listening: false,
      name: "context-menu-tooltip",
    });
    this.tooltipBackground = new Konva.Rect({
      cornerRadius: 10,
      fill: "rgba(32, 24, 17, 0.94)",
      shadowColor: "rgba(0, 0, 0, 0.18)",
      shadowBlur: 10,
      shadowOpacity: 0.25,
      shadowOffsetY: 4,
    });
    this.tooltipLabel = new Konva.Text({
      text: "",
      fontSize: 12,
      fontFamily: UI_FONT_FAMILY,
      fontStyle: "600",
      fill: "#fffaf2",
      padding: 8,
      listening: false,
    });
    this.tooltipGroup.add(this.tooltipBackground, this.tooltipLabel);

    this.menuGroup.add(this.menuBackground, this.tooltipGroup);
    uiLayer.add(this.menuGroup);

    stage.on("contextmenu.ctxmenu", (event) => this.handleContextMenu(event));
    stage.on("mousedown.ctxmenu", (event) => {
      if (event.evt?.button !== 2) return;
      this.handleContextMenu(event);
    });
    stage.on("click.ctxmenu tap.ctxmenu dragstart.ctxmenu wheel.ctxmenu", (event) => {
      if (event.evt && event.evt.button === 2) return; // Ignore right click
      if (event.target.findAncestor?.(".context-menu", true)) return;
      if (this.menuGroup.visible()) this.hideMenu();
    });

    this.cleanups.push(() => {
      this.restoreUiLayerStacking();
      stage.off(".ctxmenu");
      this.menuGroup.destroy();
    });
  }

  onModeExit() {
    this.hideMenu();
  }

  hideMenu() {
    this.menuGroup.visible(false);
    this.hideTooltip();
    this.restoreUiLayerStacking();
    this.uiLayer.batchDraw();
    this.contextTarget = null;
    this.menuCanvasPoint = null;
    this.menuState = [];
    this.app.syncCursor();
  }

  getUiLayerCanvasElement() {
    return this.uiLayer?.getCanvas?.()?._canvas
      ?? this.uiLayer?.getNativeCanvasElement?.()
      ?? null;
  }

  elevateUiLayerStacking() {
    const canvas = this.getUiLayerCanvasElement();
    if (!canvas || this.uiCanvasPreviousStyle) return;

    this.uiCanvasPreviousStyle = {
      position: canvas.style.position,
      zIndex: canvas.style.zIndex,
    };
    if (!canvas.style.position) {
      canvas.style.position = "absolute";
    }
    canvas.style.zIndex = "80";
  }

  restoreUiLayerStacking() {
    const canvas = this.getUiLayerCanvasElement();
    if (!canvas || !this.uiCanvasPreviousStyle) return;

    canvas.style.position = this.uiCanvasPreviousStyle.position;
    canvas.style.zIndex = this.uiCanvasPreviousStyle.zIndex;
    this.uiCanvasPreviousStyle = null;
  }

  hideTooltip() {
    this.tooltipGroup.visible(false);
    this.activeTooltipLabel = null;
  }

  showTooltip(label, position) {
    if (!label || !position) {
      this.hideTooltip();
      return;
    }

    this.activeTooltipLabel = label;
    this.tooltipLabel.text(label);
    this.tooltipBackground.size({
      width: this.tooltipLabel.width(),
      height: this.tooltipLabel.height(),
    });
    this.tooltipGroup.position(position);
    this.tooltipGroup.visible(true);
  }

  createAccessoryButton(accessory, y, x) {
    const disabled = accessory.disabled === true;
    const button = new Konva.Rect({
      x,
      y: y + (this.itemHeight - this.accessoryButtonSize) / 2,
      width: this.accessoryButtonSize,
      height: this.accessoryButtonSize,
      cornerRadius: 8,
      fill: "transparent",
    });
    const icon = new Konva.Text({
      x,
      y: y + 5,
      width: this.accessoryButtonSize,
      align: "center",
      text: accessory.iconText ?? "",
      fontSize: 14,
      fontFamily: UI_FONT_FAMILY,
      fontStyle: "700",
      fill: disabled ? "rgba(96, 78, 58, 0.35)" : "#6d4c36",
      listening: false,
      name: "context-menu-item-accessory-icon",
    });

    const tooltipPosition = {
      x: x - 8,
      y: y - 30,
    };

    button.on("mouseenter", () => {
      if (!disabled) {
        this.app.setCursorOverride("pointer");
        button.fill("rgba(215, 97, 47, 0.1)");
      }
      this.showTooltip(accessory.label, tooltipPosition);
      this.uiLayer.batchDraw();
    });

    button.on("mouseleave", () => {
      if (!disabled) {
        this.app.clearCursorOverride();
        button.fill("transparent");
      }
      this.hideTooltip();
      this.uiLayer.batchDraw();
    });

    button.on("mousedown touchstart", (event) => {
      event.cancelBubble = true;
    });

    button.on("click tap", (event) => {
      event.cancelBubble = true;
      if (disabled) return;
      this.hideMenu();
      accessory.execute?.(this.contextTarget);
    });

    return [button, icon];
  }

  buildMenu(target, items) {
    this.menuGroup.removeChildren();
    this.menuGroup.add(this.menuBackground, this.tooltipGroup);
    this.menuBackground.height(this.paddingY * 2 + items.length * this.itemHeight);
    this.menuState = [];

    items.forEach((item, index) => {
      const disabled = item.isDisabled?.(target) === true;
      const accessories = (item.getAccessories?.(target) ?? []).filter(Boolean);
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
        fontFamily: UI_FONT_FAMILY,
        fontStyle: "600",
        fill: disabled ? "rgba(84, 64, 43, 0.38)" : "#1d1b16",
        listening: false,
        name: "context-menu-item-label",
      });

      hitRect.on("mouseenter", () => {
        if (disabled) return;
        this.app.setCursorOverride("pointer");
        hitRect.fill("rgba(215, 97, 47, 0.08)");
        this.uiLayer.batchDraw();
      });

      hitRect.on("mouseleave", () => {
        if (!disabled) {
          this.app.clearCursorOverride();
          hitRect.fill("transparent");
        }
        this.uiLayer.batchDraw();
      });

      hitRect.on("mousedown touchstart", (event) => {
        event.cancelBubble = true;
      });

      hitRect.on("click tap", (event) => {
        event.cancelBubble = true;
        if (disabled) return;
        const target = this.contextTarget;
        this.hideMenu();
        item.execute(target);
      });

      this.menuState.push({
        label: item.label,
        disabled,
        accessories: accessories.map((accessory) => ({
          label: accessory.label,
          disabled: accessory.disabled === true,
        })),
      });

      this.menuGroup.add(hitRect, label);

      accessories.forEach((accessory, accessoryIndex) => {
        const x = this.menuWidth - 14 - this.accessoryButtonSize - accessoryIndex * (this.accessoryButtonSize + this.accessoryGap);
        const [button, icon] = this.createAccessoryButton(accessory, y, x);
        this.menuGroup.add(button, icon);
      });
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

    this.elevateUiLayerStacking();
    this.buildMenu(node, items);
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
