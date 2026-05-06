import {
  BaseCommand,
  BasePlugin,
} from "../core/baseClasses.js";
import { getConnectionConfiguredStyle } from "../component/connection.js";
import { DISPLAY_FONT_FAMILY } from "../lib/fonts.js";
import { Konva } from "../lib/konva.js";
import { chooseDirectionalNavigationCandidate } from "../lib/pageDirectionNavigation.js";

const NAV_BUTTON_RADIUS = 16;
const NAV_BUTTON_OFFSET = NAV_BUTTON_RADIUS + 6;
const CURVE_SAMPLE_STEPS = 48;
const IN_VIEWPORT_NAV_BUTTON_T = 0.82;
const FOCUS_VIEWPORT_MARGIN_RATIO = 0.1;
const MIN_FOCUS_SCALE = 0.1;
const MAX_FOCUS_SCALE = 5;

function isConnectionNode(node) {
  return node?.getAttr?.("componentType") === "connection";
}

function isHiddenConnectionNode(node) {
  return isConnectionNode(node) && getConnectionConfiguredStyle(node).hiddenUntilEndpointSelected === true;
}

function isRankingBoxNode(node) {
  return node?.getAttr?.("componentType") === "rankingBox";
}

function isButtonNode(node) {
  return node?.getAttr?.("componentType") === "button";
}

function isPageNode(node) {
  return node?.getAttr?.("componentType") === "page";
}

function isFocusableNode(node) {
  return !!node?.hasName?.("selectable") && !isConnectionNode(node) && !isRankingBoxNode(node);
}

function isFinitePoint(point) {
  return Number.isFinite(point?.x) && Number.isFinite(point?.y);
}

function normalizeFocusPositionMode(mode) {
  if (mode === "relative") return "relative";
  if (mode === "absolute") return "absolute";
  return null;
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

function clampPointToNavigationBounds(point, rect) {
  return {
    x: Math.min(rect.width - NAV_BUTTON_RADIUS, Math.max(NAV_BUTTON_RADIUS, point.x)),
    y: Math.min(rect.height - NAV_BUTTON_RADIUS, Math.max(NAV_BUTTON_RADIUS, point.y)),
  };
}

class SaveSelectionFocusCommand extends BaseCommand {
  static commandId = "focus:save-selection";
  static label = "Save Focus";
  static modes = {
    edit: {
      tools: {
        arrange: {},
      },
    },
  };

  execute() {
    this.plugin.saveFocusForSelection();
  }
}

class SetFocusPositionModeCommand extends BaseCommand {
  static commandId = "focus:position-mode:set";
  static label = "Set Focus Position Mode";
  static modes = {
    edit: {
      tools: {
        arrange: {},
        brush: {},
      },
    },
  };

  execute(mode) {
    this.plugin.setFocusPositionMode(mode);
  }
}

class NavigatePageUpCommand extends BaseCommand {
  static commandId = "page:navigate-up";
  static label = "Navigate Up";
  static modes = {
    presentation: {},
  };

  execute() {
    return this.plugin.navigatePageDirection("up");
  }
}

class NavigatePageDownCommand extends BaseCommand {
  static commandId = "page:navigate-down";
  static label = "Navigate Down";
  static modes = {
    presentation: {},
  };

  execute() {
    return this.plugin.navigatePageDirection("down");
  }
}

class NavigatePageLeftCommand extends BaseCommand {
  static commandId = "page:navigate-left";
  static label = "Navigate Left";
  static modes = {
    presentation: {},
  };

  execute() {
    return this.plugin.navigatePageDirection("left");
  }
}

class NavigatePageRightCommand extends BaseCommand {
  static commandId = "page:navigate-right";
  static label = "Navigate Right";
  static modes = {
    presentation: {},
  };

  execute() {
    return this.plugin.navigatePageDirection("right");
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

  commands() {
    return [
      SaveSelectionFocusCommand,
      SetFocusPositionModeCommand,
      NavigatePageUpCommand,
      NavigatePageDownCommand,
      NavigatePageLeftCommand,
      NavigatePageRightCommand,
    ];
  }

  menuItems() {
    return [];
  }

  onSetup() {
    this.stage = this.app.stage;
    this.layer = this.app.mainLayer;
    this.uiLayer = this.app.uiLayer;
    this.selectedNode = null;
    this.focusPositionMode = "relative";
    this.saveToastTimeout = null;
    this.navigationCorrectionTimeout = null;
    this.navigationCorrectionTimeout2 = null;

    this.navButtonGroup = new Konva.Group({
      visible: false,
      name: "presentation-nav-buttons",
    });
    this.uiLayer.add(this.navButtonGroup);
    this.buildSaveToast();
    this.layer.find(".selectable").forEach((node) => {
      this.ensureNodeFocusPositionMode(node);
    });

    this.listen("interaction:change", () => {
      this.syncNavigationButtons();
      this.emitToolbarState();
    });
    this.listen("viewport:change", () => this.syncNavigationButtons());
    this.listen("node:added", ({ node }) => {
      this.syncNavigationButtons();
      this.ensureNodeFocusPositionMode(node);
      if (node === this.selectedNode) {
        this.syncFocusPositionModeFromNode(node);
        this.emitToolbarState();
      }
    });
    this.listen("node:removed", () => this.syncNavigationButtons());
    this.listen("node:changed", ({ node }) => {
      this.syncNavigationButtons();
      if (node === this.selectedNode) {
        this.syncFocusPositionModeFromNode(node);
        this.emitToolbarState();
      }
    });
    this.listen("selection:change", ({ nodes }) => {
      this.selectedNode =
        nodes.length === 1 && isFocusableNode(nodes[0]) ? nodes[0] : null;
      this.syncFocusPositionModeFromNode(this.selectedNode);
      this.emitToolbarState();
    });

    this.stage.on("dblclick.focusNavigation dbltap.focusNavigation", (event) => {
      this.handleStageDoubleClick(event);
    });
    this.stage.on("click.focusNavigation tap.focusNavigation", (event) => {
      this.handleStageClick(event);
    });
    this.app.keybindings.register("ArrowUp", "page:navigate-up");
    this.app.keybindings.register("ArrowDown", "page:navigate-down");
    this.app.keybindings.register("ArrowLeft", "page:navigate-left");
    this.app.keybindings.register("ArrowRight", "page:navigate-right");

    this.emitToolbarState();

    this.cleanups.push(() => {
      window.clearTimeout(this.saveToastTimeout);
      window.clearTimeout(this.navigationCorrectionTimeout);
      window.clearTimeout(this.navigationCorrectionTimeout2);
      this.saveToastEl?.remove();
      this.stage.off(".focusNavigation");
      this.navButtonGroup.destroy();
      this.app.keybindings.unregister("ArrowUp");
      this.app.keybindings.unregister("ArrowDown");
      this.app.keybindings.unregister("ArrowLeft");
      this.app.keybindings.unregister("ArrowRight");
    });
  }

  findNodeById(id) {
    return id ? this.layer.findOne(`#${id}`) : null;
  }

  getButtonTargetNode(buttonNode) {
    if (!isButtonNode(buttonNode)) return null;

    const outgoingConnection = this.layer.find((node) => (
      isConnectionNode(node) &&
      node.getAttr("sourceNodeId") === buttonNode.id()
    )).at(-1) ?? null;

    if (!outgoingConnection) return null;
    return this.findNodeById(outgoingConnection.getAttr("targetNodeId"));
  }

  getNodeBounds(node) {
    const anchorNode = node?.findOne?.(".container-bg") ?? node?.findOne?.(".button-bg") ?? node;
    return anchorNode?.getClientRect({ relativeTo: this.stage }) ?? null;
  }

  getNodeVisibilityBounds(node) {
    const anchorNode = node?.findOne?.(".container-bg") ?? node?.findOne?.(".button-bg") ?? node;
    return anchorNode?.getClientRect({ relativeTo: this.stage, skipShadow: true }) ?? null;
  }

  getNodeFocusAnchor(node) {
    const bounds = this.getNodeBounds(node);
    if (!bounds) return null;

    return {
      x: bounds.x + bounds.width / 2,
      y: bounds.y + bounds.height / 2,
    };
  }

  getSelectedFocusableNode() {
    return isFocusableNode(this.selectedNode) ? this.selectedNode : null;
  }

  canSaveSelectionFocus() {
    return (
      this.app.modeManager.matches({ mode: "edit", editorTool: "arrange" })
      && isFocusableNode(this.selectedNode)
    );
  }

  getNodeFocusPositionMode(node) {
    return normalizeFocusPositionMode(node?.getAttr?.("focusPositionMode"));
  }

  setNodeFocusPositionMode(node, mode) {
    if (!isFocusableNode(node)) return false;

    const nextMode = normalizeFocusPositionMode(mode);
    if (!nextMode) return false;

    const currentMode = this.getNodeFocusPositionMode(node);
    const didChange = currentMode !== nextMode;

    node.setAttr("focusPositionMode", nextMode);
    return didChange;
  }

  ensureNodeFocusPositionMode(node, fallbackMode = "relative") {
    if (!isFocusableNode(node)) return null;

    const currentMode = this.getNodeFocusPositionMode(node);
    if (currentMode) return currentMode;

    const nextMode = this.getSavedFocusMode(node)
      ?? normalizeFocusPositionMode(fallbackMode)
      ?? "absolute";

    this.setNodeFocusPositionMode(node, nextMode);
    return nextMode;
  }

  getSavedFocusMode(node) {
    const savedFocus = node?.getAttr?.("savedFocus");
    if (!savedFocus || !Number.isFinite(savedFocus.scale)) {
      return null;
    }

    const positionMode = savedFocus.positionMode === "relative" ? "relative" : "absolute";
    if (positionMode === "relative") {
      return isFinitePoint(savedFocus.offset) ? positionMode : null;
    }

    return isFinitePoint(savedFocus.center) ? positionMode : null;
  }

  getFocusPositionModeForNode(node) {
    if (isFocusableNode(node)) {
      return this.ensureNodeFocusPositionMode(node);
    }

    return this.focusPositionMode;
  }

  syncFocusPositionModeFromNode(node) {
    const nodeMode = this.getFocusPositionModeForNode(node);
    if (nodeMode) {
      this.focusPositionMode = nodeMode;
    }
  }

  getNodeFocusView(node) {
    if (!isFocusableNode(node)) {
      return null;
    }

    const center = this.getNodeFocusAnchor(node);
    const bounds = this.getNodeBounds(node);
    const screen = this.app.stageApi.getScreenSize();
    if (!isFinitePoint(center) || !bounds) return null;

    const width = Math.max(1, bounds.width);
    const height = Math.max(1, bounds.height);
    const availableWidth = Math.max(1, screen.width * (1 - FOCUS_VIEWPORT_MARGIN_RATIO * 2));
    const availableHeight = Math.max(1, screen.height * (1 - FOCUS_VIEWPORT_MARGIN_RATIO * 2));
    const scale = Math.min(availableWidth / width, availableHeight / height);

    return {
      center,
      scale: Math.max(MIN_FOCUS_SCALE, Math.min(MAX_FOCUS_SCALE, scale)),
    };
  }

  createSavedFocus(node) {
    const focusView = this.getNodeFocusView(node);
    if (!focusView) return null;

    return {
      positionMode: "relative",
      offset: { x: 0, y: 0 },
      center: focusView.center,
      scale: focusView.scale,
    };
  }

  setFocusPositionMode(mode) {
    normalizeFocusPositionMode(mode);
    this.focusPositionMode = "relative";
    const node = this.getSelectedFocusableNode();
    const savedFocus = node ? this.getSavedFocus(node) : null;
    const willChangeNodeMode = Boolean(node) && this.getNodeFocusPositionMode(node) !== "relative";
    const willChangeSavedFocus =
      Boolean(node && savedFocus) && this.getSavedFocusMode(node) !== "relative";
    let didChangeNode = false;

    if ((willChangeNodeMode || willChangeSavedFocus) && node) {
      this.app.events.emit("node:change:start", { node });
    }

    if (node) {
      didChangeNode = this.setNodeFocusPositionMode(node, "relative");
    }

    if (savedFocus && this.getSavedFocusMode(node) !== "relative") {
      const nextSavedFocus = this.createSavedFocus(node);

      if (nextSavedFocus) {
        node.setAttr("savedFocus", nextSavedFocus);
        didChangeNode = true;
      }
    }

    if (didChangeNode && node) {
      this.app.events.emit("node:changed", { node });
    }

    this.emitToolbarState();
  }

  emitToolbarState() {
    this.app.events.emit("focus:state-change", {
      selectedNodeId: this.selectedNode?.id?.() ?? null,
      positionMode: "relative",
      canSave: this.canSaveSelectionFocus(),
      canTogglePositionMode: false,
    });
  }

  buildSaveToast() {
    this.saveToastEl = document.createElement("div");
    this.saveToastEl.className = "focus-save-toast";
    this.saveToastEl.dataset.testid = "focus-save-toast";
    this.saveToastEl.textContent = "Focus saved";
    document.body.append(this.saveToastEl);
  }

  showSaveToast(message = "Focus saved") {
    if (!this.saveToastEl) return;

    window.clearTimeout(this.saveToastTimeout);
    this.saveToastEl.textContent = message;
    this.saveToastEl.classList.add("is-visible");

    this.saveToastTimeout = window.setTimeout(() => {
      this.saveToastEl?.classList.remove("is-visible");
    }, 1400);
  }

  saveFocus(node) {
    if (!isFocusableNode(node)) return false;

    const savedFocus = this.createSavedFocus(node);
    if (!savedFocus) return false;

    const currentSavedFocus = node.getAttr("savedFocus") ?? null;
    const didChangeSavedFocus =
      JSON.stringify(currentSavedFocus) !== JSON.stringify(savedFocus) ||
      this.getNodeFocusPositionMode(node) !== "relative";

    if (didChangeSavedFocus) {
      this.app.events.emit("node:change:start", { node });
    }

    this.setNodeFocusPositionMode(node, "relative");
    node.setAttr("savedFocus", savedFocus);
    this.focusPositionMode = "relative";

    if (didChangeSavedFocus) {
      this.app.events.emit("node:changed", { node });
    }
    this.showSaveToast();
    return true;
  }

  saveFocusForSelection() {
    const node = this.getSelectedFocusableNode();
    if (!node || !this.canSaveSelectionFocus()) return false;

    return this.saveFocus(node);
  }

  getSavedFocus(node) {
    const focusView = this.getNodeFocusView(node);
    if (!focusView) return null;

    return {
      positionMode: "relative",
      center: focusView.center,
      scale: focusView.scale,
    };
  }

  navigateToSavedFocus(node, savedFocus = this.getSavedFocus(node)) {
    if (!savedFocus || !node?.getStage?.()) return false;

    this.app.stageApi.centerOn(savedFocus.center, {
      duration: 0.45,
      scale: savedFocus.scale,
    });
    window.clearTimeout(this.navigationCorrectionTimeout);
    window.clearTimeout(this.navigationCorrectionTimeout2);
    const correct = () => {
      if (!node?.getStage?.()) return;
      this.app.stageApi.centerOn(savedFocus.center, {
        duration: 0,
        scale: savedFocus.scale,
      });
    };
    this.navigationCorrectionTimeout = window.setTimeout(correct, 420);
    this.navigationCorrectionTimeout2 = window.setTimeout(correct, 900);

    return true;
  }

  navigateButtonTarget(buttonNode) {
    if (!isButtonNode(buttonNode)) return false;

    const targetNode = this.getButtonTargetNode(buttonNode);
    if (!targetNode?.getStage?.()) return false;

    if (this.navigateToSavedFocus(targetNode)) {
      return true;
    }

    const anchor = this.getNodeFocusAnchor(targetNode);
    if (!anchor) return false;

    this.app.stageApi.centerOn(anchor, {
      duration: 0.45,
      scale: this.app.stageApi.getScale(),
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

  getViewportOverlapArea(bounds, viewport) {
    if (!bounds || !viewport) return 0;

    const overlapWidth = Math.min(bounds.x + bounds.width, viewport.x + viewport.width)
      - Math.max(bounds.x, viewport.x);
    const overlapHeight = Math.min(bounds.y + bounds.height, viewport.y + viewport.height)
      - Math.max(bounds.y, viewport.y);

    if (!(overlapWidth > 0) || !(overlapHeight > 0)) {
      return 0;
    }

    return overlapWidth * overlapHeight;
  }

  getCurrentPresentationPage() {
    if (!this.app.modeManager.matches({ mode: "presentation" })) {
      return null;
    }

    const viewport = this.app.stageApi.getViewportBounds();
    const viewportCenter = {
      x: viewport.x + viewport.width / 2,
      y: viewport.y + viewport.height / 2,
    };

    const rankedPages = this.layer.find((node) => isPageNode(node))
      .map((node) => {
        const bounds = this.getNodeVisibilityBounds(node);
        const overlapArea = this.getViewportOverlapArea(bounds, viewport);
        if (!(overlapArea > 0)) return null;

        const anchor = this.getNodeFocusAnchor(node);
        const centerDistance = isFinitePoint(anchor)
          ? Math.hypot(anchor.x - viewportCenter.x, anchor.y - viewportCenter.y)
          : Number.POSITIVE_INFINITY;

        return {
          node,
          overlapArea,
          centerDistance,
          fullyVisible: this.isBoxFullyVisible(bounds),
        };
      })
      .filter(Boolean)
      .sort((left, right) => (
        Number(right.fullyVisible) - Number(left.fullyVisible)
        || left.centerDistance - right.centerDistance
        || right.overlapArea - left.overlapArea
      ));

    return rankedPages[0]?.node ?? null;
  }

  getConnectedPageTargets(pageNode) {
    if (!isPageNode(pageNode)) return [];

    const targets = new Map();
    this.layer.find((node) => isConnectionNode(node)).forEach((connectionNode) => {
      if (isHiddenConnectionNode(connectionNode)) return;

      const source = this.findNodeById(connectionNode.getAttr("sourceNodeId"));
      const target = this.findNodeById(connectionNode.getAttr("targetNodeId"));

      if (source === pageNode && isPageNode(target)) {
        targets.set(target.id(), target);
      }

      if (target === pageNode && isPageNode(source)) {
        targets.set(source.id(), source);
      }
    });

    return [...targets.values()];
  }

  getDirectionalPageNavigationTarget(direction) {
    const currentPage = this.getCurrentPresentationPage();
    const origin = this.getNodeFocusAnchor(currentPage);
    if (!isPageNode(currentPage) || !isFinitePoint(origin)) {
      return null;
    }

    const candidates = this.getConnectedPageTargets(currentPage)
      .map((node) => ({
        node,
        target: this.getNodeFocusAnchor(node),
      }))
      .filter((candidate) => isPageNode(candidate.node) && isFinitePoint(candidate.target));

    return chooseDirectionalNavigationCandidate({
      origin,
      direction,
      candidates,
    })?.node ?? null;
  }

  navigatePageDirection(direction) {
    const targetNode = this.getDirectionalPageNavigationTarget(direction);
    if (!targetNode) return false;

    return this.navigateToSavedFocus(targetNode);
  }

  handleStageClick(event) {
    if (!this.app.modeManager.matches({ mode: "presentation" })) return;
    if (this.app.stageApi.consumePanClickSuppression()) return;
    if (event.evt?.button != null && event.evt.button !== 0) return;

    const target = resolveFocusableNode(event.target);
    if (!isButtonNode(target)) return;

    if (this.navigateButtonTarget(target)) {
      event.cancelBubble = true;
    }
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

        return clampPointToNavigationBounds(adjustedPoint, rect);
      }

      previousT = t;
      previousPoint = point;
    }

    return clampPointToNavigationBounds(
      cubicBezierPoint(curvePoints, IN_VIEWPORT_NAV_BUTTON_T),
      rect,
    );
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
      fontFamily: DISPLAY_FONT_FAMILY,
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

    if (isButtonNode(targetNode)) {
      if (this.navigateButtonTarget(targetNode)) {
        event.cancelBubble = true;
      }
      return;
    }

    this.navigateToSavedFocus(targetNode);
  }

  tryAddNavigationButton(connectionNode, fromNode, toNode, {
    reverse = false,
  }) {
    if (!isFocusableNode(fromNode) || !isFocusableNode(toNode)) return;
    if (!isPageNode(fromNode) || !isPageNode(toNode)) return;

    const savedFocus = this.getSavedFocus(toNode);
    if (!savedFocus) return;

    const fromBounds = this.getNodeVisibilityBounds(fromNode);
    if (!this.isBoxFullyVisible(fromBounds)) return;

    const toBounds = this.getNodeVisibilityBounds(toNode);
    if (this.isBoxFullyVisible(toBounds)) return;

    const screenPoint = this.findNavigationButtonPoint(connectionNode, { reverse });
    if (!screenPoint) return;

    this.navButtonGroup.add(this.buildNavigationButton(screenPoint, toNode, savedFocus));
  }

  syncNavigationButtons() {
    if (!this.app.isReadOnly()) {
      this.clearNavigationButtons();
      return;
    }

    this.app.clearCursorOverride();
    this.navButtonGroup.destroyChildren();

    this.layer.find((node) => isConnectionNode(node)).forEach((connectionNode) => {
      if (isHiddenConnectionNode(connectionNode)) return;

      const source = this.findNodeById(connectionNode.getAttr("sourceNodeId"));
      const target = this.findNodeById(connectionNode.getAttr("targetNodeId"));
      this.tryAddNavigationButton(connectionNode, source, target, {
        reverse: false,
      });
      this.tryAddNavigationButton(connectionNode, target, source, {
        reverse: true,
      });
    });

    this.navButtonGroup.visible(this.navButtonGroup.getChildren().length > 0);
    this.uiLayer.batchDraw();
  }
}
