import {
  BaseContextMenuItem,
  BasePlugin,
} from "../core/baseClasses.js";
import { Konva } from "../lib/konva.js";

const NAV_BUTTON_RADIUS = 16;
const NAV_BUTTON_OFFSET = NAV_BUTTON_RADIUS + 6;
const CURVE_SAMPLE_STEPS = 48;

function isConnectionNode(node) {
  return node?.getAttr?.("componentType") === "connection";
}

function isFocusableNode(node) {
  return !!node?.hasName?.("selectable") && !isConnectionNode(node);
}

function resolveFocusableNode(target) {
  if (!target) return null;

  const selectable = target.findAncestor?.(".selectable", true)
    ?? (target.hasName?.("selectable") ? target : null);

  return isFocusableNode(selectable) ? selectable : null;
}

function pointInRect(point, rect) {
  return (
    point.x >= rect.x &&
    point.x <= rect.x + rect.width &&
    point.y >= rect.y &&
    point.y <= rect.y + rect.height
  );
}

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function cubicBezierPoint(points, t) {
  const p0 = points[0];
  const p1 = points[1];
  const p2 = points[2];
  const p3 = points[3];
  const inv = 1 - t;
  const inv2 = inv * inv;
  const inv3 = inv2 * inv;
  const t2 = t * t;
  const t3 = t2 * t;

  return {
    x: inv3 * p0.x + 3 * inv2 * t * p1.x + 3 * inv * t2 * p2.x + t3 * p3.x,
    y: inv3 * p0.y + 3 * inv2 * t * p1.y + 3 * inv * t2 * p2.y + t3 * p3.y,
  };
}

function nudgePointInsideViewport(insidePoint, outsidePoint) {
  const dx = insidePoint.x - outsidePoint.x;
  const dy = insidePoint.y - outsidePoint.y;
  const length = Math.hypot(dx, dy) || 1;

  return {
    x: insidePoint.x + (dx / length) * NAV_BUTTON_OFFSET,
    y: insidePoint.y + (dy / length) * NAV_BUTTON_OFFSET,
  };
}

class SaveFocusMenuItem extends BaseContextMenuItem {
  static itemId = "focus:save-menu";
  static label = "Save Focus";
  static modes = {
    edit: {
      tools: {
        arrange: {},
      },
    },
  };

  condition(node) {
    return isFocusableNode(node);
  }

  execute(node) {
    this.plugin.saveFocus(node);
  }
}

export class FocusNavigationPlugin extends BasePlugin {
  static pluginId = "focus-navigation";
  static modes = {
    presentation: {},
    edit: {
      tools: {
        arrange: {},
      },
    },
  };

  menuItems() {
    return [SaveFocusMenuItem];
  }

  onSetup() {
    this.stage = this.app.stage;
    this.layer = this.app.mainLayer;
    this.uiLayer = this.app.uiLayer;

    this.navButtonGroup = new Konva.Group({
      visible: false,
      name: "presentation-nav-buttons",
    });
    this.uiLayer.add(this.navButtonGroup);

    this.listen("interaction:change", () => this.syncNavigationButtons());
    this.listen("viewport:change", () => this.syncNavigationButtons());
    this.listen("node:added", () => this.syncNavigationButtons());
    this.listen("node:removed", () => this.syncNavigationButtons());
    this.listen("node:changed", () => this.syncNavigationButtons());

    this.stage.on("dblclick.focusNavigation dbltap.focusNavigation", (event) => {
      this.handleStageDoubleClick(event);
    });

    this.cleanups.push(() => {
      this.stage.off(".focusNavigation");
      this.navButtonGroup.destroy();
    });
  }

  findNodeById(id) {
    return id ? this.layer.findOne(`#${id}`) : null;
  }

  getNodeBounds(node) {
    const anchorNode = node?.findOne?.(".container-bg") ?? node;
    return anchorNode?.getClientRect({ relativeTo: this.stage }) ?? null;
  }

  getViewportCenter() {
    return this.app.stageApi.screenToCanvas({
      x: this.stage.width() / 2,
      y: this.stage.height() / 2,
    });
  }

  saveFocus(node) {
    if (!isFocusableNode(node)) return;

    node.setAttr("savedFocus", {
      center: this.getViewportCenter(),
      scale: this.app.stageApi.getScale(),
    });

    this.app.events.emit("node:changed", { node });
  }

  getSavedFocus(node) {
    const savedFocus = node?.getAttr?.("savedFocus");
    if (
      !savedFocus ||
      !Number.isFinite(savedFocus.scale) ||
      !Number.isFinite(savedFocus.center?.x) ||
      !Number.isFinite(savedFocus.center?.y)
    ) {
      return null;
    }

    return savedFocus;
  }

  navigateToSavedFocus(node, savedFocus = this.getSavedFocus(node)) {
    if (!savedFocus || !node?.getStage?.()) return false;

    this.app.stageApi.centerOn(savedFocus.center, {
      duration: 0.45,
      scale: savedFocus.scale,
    });

    return true;
  }

  clearNavigationButtons() {
    this.app.clearCursorOverride();
    this.navButtonGroup.destroyChildren();
    this.navButtonGroup.visible(false);
    this.uiLayer.batchDraw();
  }

  isBoxFullyVisible(bounds) {
    if (!bounds) return false;

    const viewport = this.app.stageApi.getViewportBounds();
    return (
      bounds.x >= viewport.x &&
      bounds.y >= viewport.y &&
      bounds.x + bounds.width <= viewport.x + viewport.width &&
      bounds.y + bounds.height <= viewport.y + viewport.height
    );
  }

  getConnectionScreenCurve(connectionNode, { reverse = false } = {}) {
    const line = connectionNode.findOne(".connection-line");
    const points = line?.points?.() ?? [];
    if (points.length < 8) return null;

    const curvePoints = [
      this.app.stageApi.canvasToScreen({ x: points[0], y: points[1] }),
      this.app.stageApi.canvasToScreen({ x: points[2], y: points[3] }),
      this.app.stageApi.canvasToScreen({ x: points[4], y: points[5] }),
      this.app.stageApi.canvasToScreen({ x: points[6], y: points[7] }),
    ];

    return reverse
      ? [curvePoints[3], curvePoints[2], curvePoints[1], curvePoints[0]]
      : curvePoints;
  }

  findNavigationButtonPoint(connectionNode, options = {}) {
    const curvePoints = this.getConnectionScreenCurve(connectionNode, options);
    if (!curvePoints) return null;

    const rect = {
      x: 0,
      y: 0,
      width: this.stage.width(),
      height: this.stage.height(),
    };

    const startPoint = cubicBezierPoint(curvePoints, 0);
    if (!pointInRect(startPoint, rect)) return null;

    let previousT = 0;
    let previousPoint = startPoint;

    for (let index = 1; index <= CURVE_SAMPLE_STEPS; index += 1) {
      const t = index / CURVE_SAMPLE_STEPS;
      const point = cubicBezierPoint(curvePoints, t);

      if (pointInRect(previousPoint, rect) && !pointInRect(point, rect)) {
        let low = previousT;
        let high = t;

        for (let iteration = 0; iteration < 12; iteration += 1) {
          const mid = (low + high) / 2;
          const midPoint = cubicBezierPoint(curvePoints, mid);
          if (pointInRect(midPoint, rect)) {
            low = mid;
          } else {
            high = mid;
          }
        }

        const insidePoint = cubicBezierPoint(curvePoints, low);
        const outsidePoint = cubicBezierPoint(curvePoints, high);
        const adjustedPoint = nudgePointInsideViewport(insidePoint, outsidePoint);

        return {
          x: Math.min(rect.width - NAV_BUTTON_RADIUS, Math.max(NAV_BUTTON_RADIUS, adjustedPoint.x)),
          y: Math.min(rect.height - NAV_BUTTON_RADIUS, Math.max(NAV_BUTTON_RADIUS, adjustedPoint.y)),
        };
      }

      previousT = t;
      previousPoint = point;
    }

    return null;
  }

  buildNavigationButton(screenPoint, targetNode, savedFocus) {
    const canvasPoint = this.app.stageApi.screenToCanvas(screenPoint);
    const inverseScale = 1 / this.app.stageApi.getScale();

    const group = new Konva.Group({
      x: canvasPoint.x,
      y: canvasPoint.y,
      scaleX: inverseScale,
      scaleY: inverseScale,
      name: "presentation-nav-button",
    });

    const outer = new Konva.Circle({
      radius: NAV_BUTTON_RADIUS,
      fill: "rgba(255, 250, 240, 0.98)",
      stroke: "#d7612f",
      strokeWidth: 2,
      shadowColor: "rgba(54, 41, 25, 0.22)",
      shadowBlur: 18,
      shadowOpacity: 0.35,
    });

    const inner = new Konva.Text({
      text: ">",
      x: -5,
      y: -10,
      width: 10,
      height: 20,
      align: "center",
      verticalAlign: "middle",
      fontSize: 18,
      fontFamily: "Space Grotesk",
      fontStyle: "700",
      fill: "#ab4f28",
      listening: false,
    });

    const setHoverState = (hovered) => {
      if (hovered) {
        this.app.setCursorOverride("pointer");
      } else {
        this.app.clearCursorOverride();
      }
      outer.fill(hovered ? "rgba(255, 244, 230, 1)" : "rgba(255, 250, 240, 0.98)");
      outer.scale({
        x: hovered ? 1.08 : 1,
        y: hovered ? 1.08 : 1,
      });
      this.uiLayer.batchDraw();
    };

    group.on("mouseenter", () => setHoverState(true));
    group.on("mouseleave", () => setHoverState(false));
    group.on("mousedown touchstart", (event) => {
      event.cancelBubble = true;
    });
    group.on("click tap", (event) => {
      event.cancelBubble = true;
      this.navigateToSavedFocus(targetNode, savedFocus);
    });

    group.add(outer, inner);
    return group;
  }

  handleStageDoubleClick(event) {
    if (!this.app.isReadOnly()) return;

    const button = event.evt?.button;
    if (button != null && button !== 0) return;

    const targetNode = resolveFocusableNode(event.target);
    if (!targetNode) return;

    this.navigateToSavedFocus(targetNode);
  }

  tryAddNavigationButton(connectionNode, fromNode, toNode, {
    reverse = false,
    centerScreen,
    diagonalDistance,
  }) {
    if (!isFocusableNode(fromNode) || !isFocusableNode(toNode)) return;

    const savedFocus = this.getSavedFocus(toNode);
    if (!savedFocus) return;

    const fromBounds = this.getNodeBounds(fromNode);
    if (!this.isBoxFullyVisible(fromBounds)) return;

    const targetFocusScreen = this.app.stageApi.canvasToScreen(savedFocus.center);
    if (distance(targetFocusScreen, centerScreen) <= diagonalDistance) return;

    const screenPoint = this.findNavigationButtonPoint(connectionNode, { reverse });
    if (!screenPoint) return;

    this.navButtonGroup.add(this.buildNavigationButton(screenPoint, toNode, savedFocus));
  }

  syncNavigationButtons() {
    if (!this.app.isReadOnly()) {
      this.clearNavigationButtons();
      return;
    }

    const screenSize = this.app.stageApi.getScreenSize();
    const centerScreen = {
      x: screenSize.width / 2,
      y: screenSize.height / 2,
    };
    const diagonalDistance = Math.hypot(screenSize.width, screenSize.height);

    this.app.clearCursorOverride();
    this.navButtonGroup.destroyChildren();

    this.layer.find((node) => isConnectionNode(node)).forEach((connectionNode) => {
      const source = this.findNodeById(connectionNode.getAttr("sourceNodeId"));
      const target = this.findNodeById(connectionNode.getAttr("targetNodeId"));
      this.tryAddNavigationButton(connectionNode, source, target, {
        reverse: false,
        centerScreen,
        diagonalDistance,
      });
      this.tryAddNavigationButton(connectionNode, target, source, {
        reverse: true,
        centerScreen,
        diagonalDistance,
      });
    });

    this.navButtonGroup.visible(this.navButtonGroup.getChildren().length > 0);
    this.uiLayer.batchDraw();
  }
}
