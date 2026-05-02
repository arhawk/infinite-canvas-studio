import { renderIcons } from "../lib/icons.js";

const DEFAULT_VIEWPORT_MARGIN = 12;
const DEFAULT_ANCHOR_GAP = 64;
const DEFAULT_POPOVER_NODE_CLEARANCE = 10;

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function isFiniteRect(rect) {
  return Boolean(
    rect &&
    Number.isFinite(rect.x) &&
    Number.isFinite(rect.y) &&
    Number.isFinite(rect.width) &&
    Number.isFinite(rect.height),
  );
}

function resolveElement(root, target) {
  if (!target) return null;
  if (target instanceof HTMLElement) return target;
  if (typeof target === "string") return root?.querySelector?.(target) ?? null;
  return null;
}

function defaultGetAnchorRect(app, node) {
  return node?.getClientRect?.({ relativeTo: app.stage }) ?? null;
}

export class FloatingToolbarManager {
  constructor(app) {
    this.app = app;
    this.panels = new Map();
    this.handleResize = () => this.queueAllPositions();

    if (typeof window !== "undefined") {
      window.addEventListener("resize", this.handleResize);
    }
  }

  registerPanel({
    id,
    element,
    getAnchorNode = () => null,
    getAnchorRect = null,
    viewportMargin = DEFAULT_VIEWPORT_MARGIN,
    anchorGap = DEFAULT_ANCHOR_GAP,
    popover = null,
  } = {}) {
    if (typeof id !== "string" || !id || !(element instanceof HTMLElement)) {
      throw new Error("Floating toolbar panels require an id and HTMLElement.");
    }

    this.unregisterPanel(id);

    const originalParent = element.parentElement;
    const originalNextSibling = element.nextSibling;
    if (originalParent && originalParent !== document.body) {
      document.body.append(element);
    }

    const panel = {
      id,
      element,
      getAnchorNode,
      getAnchorRect,
      viewportMargin,
      anchorGap,
      popover,
      buttons: new Map(),
      positionFrame: null,
      originalParent,
      originalNextSibling,
    };

    this.panels.set(id, panel);
    return this.createPanelHandle(id);
  }

  createPanelHandle(id) {
    return {
      id,
      registerButton: (buttonId, target) => this.registerButton(id, buttonId, target),
      setButtonState: (buttonId, state) => this.setButtonState(id, buttonId, state),
      setVisible: (visible) => this.setPanelVisible(id, visible),
      queuePosition: () => this.queuePanelPosition(id),
      updatePosition: () => this.updatePanelPosition(id),
      unregister: () => this.unregisterPanel(id),
    };
  }

  getPanel(id) {
    return this.panels.get(id) ?? null;
  }

  hasPanel(id) {
    return this.panels.has(id);
  }

  unregisterPanel(id) {
    const panel = this.panels.get(id);
    if (!panel) return false;

    if (panel.positionFrame != null) {
      window.cancelAnimationFrame(panel.positionFrame);
      panel.positionFrame = null;
    }

    if (panel.element.isConnected && panel.originalParent) {
      if (panel.originalNextSibling?.parentElement === panel.originalParent) {
        panel.originalParent.insertBefore(panel.element, panel.originalNextSibling);
      } else {
        panel.originalParent.append(panel.element);
      }
    }
    panel.element.style.removeProperty("transform");

    this.panels.delete(id);
    return true;
  }

  registerButton(panelId, buttonId, target) {
    const panel = this.getPanel(panelId);
    if (!panel || typeof buttonId !== "string" || !buttonId) return null;

    const element = resolveElement(panel.element, target);
    if (!element) return null;

    panel.buttons.set(buttonId, element);
    return element;
  }

  getButton(panelId, buttonId) {
    return this.getPanel(panelId)?.buttons.get(buttonId) ?? null;
  }

  setButtonState(panelId, buttonId, state = {}) {
    const button = this.getButton(panelId, buttonId);
    if (!button || !state || typeof state !== "object") return false;

    if (Object.hasOwn(state, "pressed")) {
      button.setAttribute("aria-pressed", String(Boolean(state.pressed)));
    }
    if (Object.hasOwn(state, "disabled")) {
      button.disabled = Boolean(state.disabled);
      button.setAttribute("aria-disabled", String(Boolean(state.disabled)));
    }
    if (Object.hasOwn(state, "hidden")) {
      button.hidden = Boolean(state.hidden);
    }
    if (typeof state.title === "string") {
      button.title = state.title;
    }
    if (typeof state.label === "string") {
      button.setAttribute("aria-label", state.label);
    }
    if (typeof state.text === "string") {
      button.textContent = state.text;
    }
    if (typeof state.icon === "string") {
      button.innerHTML = `<i data-lucide="${state.icon}" aria-hidden="true"></i>`;
      renderIcons(button, {
        width: state.iconSize ?? 16,
        height: state.iconSize ?? 16,
        "stroke-width": state.iconStrokeWidth ?? 2,
      });
    }

    for (const [name, value] of Object.entries(state.attributes ?? {})) {
      if (value == null || value === false) {
        button.removeAttribute(name);
      } else {
        button.setAttribute(name, String(value));
      }
    }

    for (const [name, value] of Object.entries(state.dataset ?? {})) {
      if (value == null) {
        delete button.dataset[name];
      } else {
        button.dataset[name] = String(value);
      }
    }

    for (const [name, value] of Object.entries(state.styles ?? state.style ?? {})) {
      if (value == null) {
        button.style.removeProperty(name);
      } else {
        button.style.setProperty(name, String(value));
      }
    }

    for (const [name, value] of Object.entries(state.classes ?? {})) {
      button.classList.toggle(name, Boolean(value));
    }

    return true;
  }

  setPanelVisible(id, visible) {
    const panel = this.getPanel(id);
    if (!panel) return false;

    panel.element.hidden = !visible;
    if (visible) {
      this.updatePanelPosition(id);
      this.queuePanelPosition(id);
    }
    return true;
  }

  queueAllPositions() {
    for (const id of this.panels.keys()) {
      this.queuePanelPosition(id);
    }
  }

  queuePanelPosition(id) {
    const panel = this.getPanel(id);
    if (!panel || panel.positionFrame != null) return false;

    panel.positionFrame = window.requestAnimationFrame(() => {
      panel.positionFrame = null;
      this.updatePanelPosition(id);
    });
    return true;
  }

  updatePanelPosition(id) {
    const panel = this.getPanel(id);
    if (!panel || panel.element.hidden) return false;

    const anchorNode = panel.getAnchorNode?.() ?? null;
    const stageContainer = this.app.stage?.container?.();
    if (!anchorNode?.getStage?.() || !stageContainer) return false;

    const canvasRect =
      panel.getAnchorRect?.(anchorNode, this.app) ??
      defaultGetAnchorRect(this.app, anchorNode);
    if (!isFiniteRect(canvasRect)) return false;

    const stageRect = stageContainer.getBoundingClientRect();
    const topLeft = this.app.stageApi.canvasToScreen({
      x: canvasRect.x,
      y: canvasRect.y,
    });
    const bottomRight = this.app.stageApi.canvasToScreen({
      x: canvasRect.x + canvasRect.width,
      y: canvasRect.y + canvasRect.height,
    });

    const nodeLeft = stageRect.left + Math.min(topLeft.x, bottomRight.x);
    const nodeRight = stageRect.left + Math.max(topLeft.x, bottomRight.x);
    const nodeTop = stageRect.top + Math.min(topLeft.y, bottomRight.y);
    const nodeBottom = stageRect.top + Math.max(topLeft.y, bottomRight.y);
    const nodeCenterX = (nodeLeft + nodeRight) / 2;

    this.syncPopoverOpenState(id);

    const panelWidth = panel.element.offsetWidth;
    const panelHeight = panel.element.offsetHeight;
    if (!panelWidth || !panelHeight) return false;

    const margin = panel.viewportMargin;
    let minLeft = panelWidth / 2 + margin;
    let maxLeft = window.innerWidth - panelWidth / 2 - margin;
    if (stageRect.width >= panelWidth + margin * 2) {
      minLeft = Math.max(minLeft, stageRect.left + panelWidth / 2 + margin);
      maxLeft = Math.min(maxLeft, stageRect.right - panelWidth / 2 - margin);
    }

    const verticalMin = Math.max(margin, stageRect.top + margin);
    const verticalMax = Math.min(window.innerHeight - margin, stageRect.bottom - margin);
    const availableAbove = nodeTop - verticalMin - panel.anchorGap;
    const availableBelow = verticalMax - nodeBottom - panel.anchorGap;
    const placeAbove = availableAbove >= panelHeight || availableAbove >= availableBelow;
    const placement = placeAbove ? "top" : "bottom";
    const anchorTop = placeAbove
      ? clamp(nodeTop - panel.anchorGap, verticalMin + panelHeight, verticalMax)
      : clamp(nodeBottom + panel.anchorGap, verticalMin, verticalMax - panelHeight);
    const centerLeft = clamp(nodeCenterX, minLeft, maxLeft);
    const left = centerLeft - panelWidth / 2;
    const top = placeAbove ? anchorTop - panelHeight : anchorTop;

    panel.element.dataset.placement = placement;
    panel.element.style.left = `${left}px`;
    panel.element.style.top = `${top}px`;
    panel.element.style.transform = "none";
    this.syncPopoverOffset(id, {
      nodeLeft,
      nodeRight,
      placement,
      stageRect,
    });
    return true;
  }

  syncPopoverOpenState(id) {
    const panel = this.getPanel(id);
    if (!panel?.popover) return false;

    const {
      toolSelector = ".toolbar__button-popover-tool",
      openClass = "is-button-popover-open",
    } = panel.popover;
    const hasOpenPopover = Boolean(panel.element.querySelector(`${toolSelector}:focus-within`));
    panel.element.classList.toggle(openClass, hasOpenPopover);
    return hasOpenPopover;
  }

  syncPopoverOffset(id, { nodeLeft, nodeRight, placement, stageRect } = {}) {
    const panel = this.getPanel(id);
    if (!panel?.popover || !stageRect) return false;

    const {
      toolSelector = ".toolbar__button-popover-tool",
      popoverSelector = ".toolbar__button-style-popover",
      skipOffsetSelector = "[data-popover-offset='none']",
      offsetProperty = "--button-popover-offset",
      nodeClearance = DEFAULT_POPOVER_NODE_CLEARANCE,
    } = panel.popover;

    const tools = Array.from(panel.element.querySelectorAll(toolSelector));
    for (const tool of tools) {
      tool.style.removeProperty(offsetProperty);
    }

    const openTool = panel.element.querySelector(`${toolSelector}:focus-within`);
    const popover = openTool?.querySelector?.(popoverSelector);
    if (!openTool || !popover || placement !== "top") return true;
    if (openTool.matches(skipOffsetSelector)) return true;

    const toolRect = openTool.getBoundingClientRect();
    const popoverWidth = popover.offsetWidth || popover.getBoundingClientRect().width;
    if (!toolRect.width || !popoverWidth) return true;

    const margin = panel.viewportMargin;
    const viewportLeft = Math.max(margin, stageRect.left + margin);
    const viewportRight = Math.min(window.innerWidth - margin, stageRect.right - margin);
    const baseLeft = toolRect.left + toolRect.width / 2 - popoverWidth / 2;
    const baseRight = baseLeft + popoverWidth;
    const overlapsAnchor =
      baseRight > nodeLeft - nodeClearance &&
      baseLeft < nodeRight + nodeClearance;

    let offset = 0;
    if (overlapsAnchor) {
      const rightOffset = nodeRight + nodeClearance - baseLeft;
      const leftOffset = nodeLeft - nodeClearance - baseRight;
      const rightFits =
        baseLeft + rightOffset >= viewportLeft &&
        baseRight + rightOffset <= viewportRight;
      const leftFits =
        baseLeft + leftOffset >= viewportLeft &&
        baseRight + leftOffset <= viewportRight;

      if (rightFits && (!leftFits || Math.abs(rightOffset) <= Math.abs(leftOffset))) {
        offset = rightOffset;
      } else if (leftFits) {
        offset = leftOffset;
      } else {
        const clampedRight = clamp(baseRight, viewportLeft + popoverWidth, viewportRight);
        const viewportOffset = clampedRight - baseRight;
        const candidateRight = baseRight + viewportOffset <= nodeLeft
          ? viewportOffset
          : rightOffset;
        const candidateLeft = baseLeft + viewportOffset >= nodeRight
          ? viewportOffset
          : leftOffset;
        offset = Math.abs(candidateRight) < Math.abs(candidateLeft)
          ? candidateRight
          : candidateLeft;
        offset = clamp(offset, viewportLeft - baseLeft, viewportRight - baseRight);
      }
    } else {
      offset = clamp(0, viewportLeft - baseLeft, viewportRight - baseRight);
    }

    if (Math.abs(offset) > 0.5) {
      openTool.style.setProperty(offsetProperty, `${Math.round(offset)}px`);
    }
    return true;
  }

  destroy() {
    if (typeof window !== "undefined") {
      window.removeEventListener("resize", this.handleResize);
    }

    for (const id of [...this.panels.keys()]) {
      this.unregisterPanel(id);
    }
  }
}
