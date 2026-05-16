import { BasePlugin } from "../core/baseClasses.js";

const TOOLTIP_TARGET_REGION_SELECTOR = [
  ".left-toolbar",
  ".toolbar",
  ".toolbar__floating-panel",
  ".components-dropdown",
  ".sidebar",
  ".presentation-brush-fab",
].join(", ");

const INTERACTIVE_SELECTOR = [
  "button",
  "a[href]",
  "input",
  "select",
  "textarea",
  "[role='button']",
  "[data-tooltip]",
].join(", ");

function isInTargetRegion(element) {
  return Boolean(element?.closest?.(TOOLTIP_TARGET_REGION_SELECTOR));
}

function isTooltipTarget(element) {
  if (!(element instanceof HTMLElement)) return false;
  if (!isInTargetRegion(element)) return false;
  return element.matches(INTERACTIVE_SELECTOR);
}

function getTooltipText(element) {
  if (!(element instanceof HTMLElement)) return "";
  const dataTooltip = element.dataset?.tooltip?.trim?.() ?? "";
  if (dataTooltip) return dataTooltip;
  const ariaLabel = element.getAttribute("aria-label")?.trim() ?? "";
  return ariaLabel;
}

function normalizeTooltipAttrs(element) {
  if (!(element instanceof HTMLElement) || !isInTargetRegion(element)) return;
  const title = element.getAttribute("title")?.trim() ?? "";
  const dataTooltip = element.dataset?.tooltip?.trim?.() ?? "";
  const nextTooltip = dataTooltip || title;
  if (nextTooltip) {
    if (element.dataset.tooltip !== nextTooltip) {
      element.dataset.tooltip = nextTooltip;
    }
    if (!element.getAttribute("aria-label")) {
      element.setAttribute("aria-label", nextTooltip);
    }
  }
}

export class InstantTooltipPlugin extends BasePlugin {
  static pluginId = "instant-tooltip";

  onSetup() {
    this.tooltipEl = document.createElement("div");
    this.tooltipEl.className = "instant-tooltip";
    this.tooltipEl.hidden = true;
    document.body.append(this.tooltipEl);
    this.activeTarget = null;

    this.listenDom(document, "pointerover", (event) => this.onPointerOver(event), true);
    this.listenDom(document, "pointerout", (event) => this.onPointerOut(event), true);
    this.listenDom(document, "focusin", (event) => this.onFocusIn(event), true);
    this.listenDom(document, "focusout", () => this.hideTooltip(), true);
    this.listenDom(window, "scroll", () => this.hideTooltip(), true);
    this.listenDom(window, "resize", () => this.hideTooltip());
    this.listenDom(document, "pointerdown", () => this.hideTooltip(), true);
    this.listenDom(document, "keydown", (event) => {
      if (event.key === "Escape") this.hideTooltip();
    }, true);

    this.observer = new MutationObserver((records) => {
      for (const record of records) {
        if (record.type === "attributes" && record.target instanceof HTMLElement) {
          normalizeTooltipAttrs(record.target);
          if (record.target === this.activeTarget) {
            this.showTooltip(record.target);
          }
        }
        if (record.type === "childList") {
          for (const node of record.addedNodes) {
            if (!(node instanceof HTMLElement)) continue;
            normalizeTooltipAttrs(node);
            for (const child of node.querySelectorAll("*")) normalizeTooltipAttrs(child);
          }
        }
      }
    });
    this.observer.observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["title"],
    });

    normalizeTooltipAttrs(document.body);
    for (const el of document.querySelectorAll("*")) normalizeTooltipAttrs(el);

    this.cleanups.push(() => {
      this.observer?.disconnect();
      this.hideTooltip();
      this.tooltipEl?.remove();
      this.tooltipEl = null;
      this.activeTarget = null;
    });
  }

  onPointerOver(event) {
    const target = event.target instanceof Element
      ? event.target.closest(INTERACTIVE_SELECTOR)
      : null;
    if (!isTooltipTarget(target)) {
      this.hideTooltip();
      return;
    }
    this.showTooltip(target);
  }

  onPointerOut(event) {
    if (!this.activeTarget) return;
    const related = event.relatedTarget instanceof Element ? event.relatedTarget : null;
    if (related && this.activeTarget.contains(related)) return;
    this.hideTooltip();
  }

  onFocusIn(event) {
    const target = event.target instanceof Element
      ? event.target.closest(INTERACTIVE_SELECTOR)
      : null;
    if (!isTooltipTarget(target)) {
      this.hideTooltip();
      return;
    }
    this.showTooltip(target);
  }

  showTooltip(target) {
    if (!(target instanceof HTMLElement) || !isTooltipTarget(target)) {
      this.hideTooltip();
      return;
    }
    const text = getTooltipText(target);
    if (!text) {
      this.hideTooltip();
      return;
    }

    this.activeTarget = target;
    this.tooltipEl.textContent = text;
    this.tooltipEl.hidden = false;
    this.positionTooltip(target);
  }

  hideTooltip() {
    this.activeTarget = null;
    if (this.tooltipEl) this.tooltipEl.hidden = true;
  }

  positionTooltip(target) {
    if (!(target instanceof HTMLElement) || !this.tooltipEl || this.tooltipEl.hidden) return;
    const rect = target.getBoundingClientRect();
    const tipRect = this.tooltipEl.getBoundingClientRect();
    const pad = 8;
    const gap = 10;

    let left = rect.left + rect.width / 2 - tipRect.width / 2;
    left = Math.max(pad, Math.min(left, window.innerWidth - tipRect.width - pad));

    let top = rect.top - tipRect.height - gap;
    if (top < pad) top = rect.bottom + gap;

    this.tooltipEl.style.left = `${Math.round(left)}px`;
    this.tooltipEl.style.top = `${Math.round(top)}px`;
  }
}
