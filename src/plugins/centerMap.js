import { BasePlugin } from "../core/baseClasses.js";
import { renderIcons } from "../lib/icons.js";

/**
 * CenterMapPlugin — Fit-all panorama toggle + zoom controls (1.9)
 *
 * BEHAVIOUR
 * ─────────
 * centerView() works as a toggle:
 *   • 1st click → fit ALL content into view (panorama)
 *   • 2nd click → restore the previous viewport (position + scale)
 *   • 3rd click → panorama again … and so on
 *
 * Zoom controls are injected as a small floating panel anchored to the
 * bottom-left of the board (same area as the minimap overview). They show:
 *   [ − ]  [ 75% ]  [ + ]
 * The percentage label updates live as the user pans/zooms.
 *
 * Keyboard shortcuts (unchanged):
 *   Home        — toggle panorama / previous view
 *   Ctrl/Cmd +  — zoom in  20 %
 *   Ctrl/Cmd -  — zoom out 20 %
 *
 * Registration in main.js (no HTML changes needed for zoom panel):
 *   app.use(CenterMapPlugin, {
 *     centerMapEl: ui.centerMapBtn,
 *   });
 *
 * Optional: if you still want toolbar zoom buttons pass them too:
 *   app.use(CenterMapPlugin, {
 *     centerMapEl: ui.centerMapBtn,
 *     zoomInEl:    document.getElementById("zoom-in-btn"),
 *     zoomOutEl:   document.getElementById("zoom-out-btn"),
 *   });
 */

const ZOOM_STEP = 0.2;    // 20 % per click
const MIN_SCALE = 0.05;
const MAX_SCALE = 8;
const PADDING   = 80;     // screen-px padding around fitted content

export class CenterMapPlugin extends BasePlugin {
  static pluginId = "center-map";

  onSetup() {
    const { centerMapEl, zoomInEl, zoomOutEl } = this.options;
    this.ui = { centerMapEl, zoomInEl, zoomOutEl };

    // Saved viewport before entering panorama (for toggle-back)
    this._savedViewport = null;
    this._isPanorama    = false;

    renderIcons(centerMapEl, { width: 16, height: 16, "stroke-width": 2 });

    // Toolbar center button
    this.listenDom(centerMapEl, "click", () => this.centerView());

    // Optional toolbar zoom buttons
    if (zoomInEl)  {
      renderIcons(zoomInEl,  { width: 14, height: 14, "stroke-width": 2 });
      this.listenDom(zoomInEl,  "click", () => this.zoomIn());
    }
    if (zoomOutEl) {
      renderIcons(zoomOutEl, { width: 14, height: 14, "stroke-width": 2 });
      this.listenDom(zoomOutEl, "click", () => this.zoomOut());
    }

    // Keyboard shortcuts
    this.listenDom(window, "keydown", (e) => {
      if (["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement?.tagName)) return;
      if (e.key === "Home" && !e.ctrlKey && !e.metaKey && !e.shiftKey) {
        e.preventDefault();
        this.centerView();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && (e.key === "=" || e.key === "+")) {
        e.preventDefault();
        this.zoomIn();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "-") {
        e.preventDefault();
        this.zoomOut();
      }
    });

    // Build the floating zoom-level panel (bottom-left of board)
    this._buildZoomPanel();

    // Reset toggle state when user manually pans/zooms
    this.listen("viewport:change", () => this._onViewportChange());

    this.cleanups.push(() => this._zoomPanel?.remove());
  }

  // ─── Panorama toggle ──────────────────────────────────────────────────────

  centerView() {
    if (this._isPanorama) {
      // Toggle back to previous viewport
      this._restoreSavedViewport();
      return;
    }

    // Save current viewport before jumping to panorama
    this._saveCurrentViewport();
    this._fitAllContent();
  }

  _saveCurrentViewport() {
    const stage = this.app.stage;
    this._savedViewport = {
      x:     stage.x(),
      y:     stage.y(),
      scale: stage.scaleX(),
    };
  }

  _restoreSavedViewport() {
    if (!this._savedViewport) return;
    const { x, y, scale } = this._savedViewport;
    this._suppressToggleReset = true;
    this.app.stageApi.centerOn(
      {
        x: (this.app.stage.width()  / 2 - x) / scale,
        y: (this.app.stage.height() / 2 - y) / scale,
      },
      { duration: 0.4, scale },
    );
    setTimeout(() => { this._suppressToggleReset = false; }, 500);
    this._isPanorama = false;
    this._syncToggleButton();
  }

  _fitAllContent() {
    const stage = this.app.stage;

    // Collect all selectable nodes (page, text, sticky, container, image…)
    const nodes = (stage.find(".selectable") ?? []).filter((n) => n.visible());

    if (nodes.length === 0) {
      // Empty canvas — reset to origin
      this._suppressToggleReset = true;
      this.app.stageApi.centerOn({ x: 0, y: 0 }, { duration: 0.4, scale: 1 });
      setTimeout(() => { this._suppressToggleReset = false; }, 500);
      this._isPanorama = true;
      this._syncToggleButton();
      return;
    }

    // Bounding box in canvas coordinates (use mainLayer as reference so
    // positions are NOT affected by current stage transform)
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const node of nodes) {
      const r = node.getClientRect({ relativeTo: this.app.mainLayer });
      if (r.x           < minX) minX = r.x;
      if (r.y           < minY) minY = r.y;
      if (r.x + r.width > maxX) maxX = r.x + r.width;
      if (r.y + r.height> maxY) maxY = r.y + r.height;
    }

    const contentW = maxX - minX;
    const contentH = maxY - minY;
    if (contentW <= 0 || contentH <= 0) return;

    const stageW = stage.width();
    const stageH = stage.height();
    const newScale = Math.min(
      (stageW - PADDING * 2) / contentW,
      (stageH - PADDING * 2) / contentH,
      MAX_SCALE,
    );
    const clampedScale = Math.max(newScale, MIN_SCALE);
    const centerX = minX + contentW / 2;
    const centerY = minY + contentH / 2;

    this._suppressToggleReset = true;
    this.app.stageApi.centerOn(
      { x: centerX, y: centerY },
      { duration: 0.45, scale: clampedScale },
    );
    setTimeout(() => { this._suppressToggleReset = false; }, 600);

    this._isPanorama = true;
    this._syncToggleButton();
  }

  /** If the user manually pans/zooms, cancel the toggle state. */
  _onViewportChange() {
    if (this._suppressToggleReset) return;
    if (this._isPanorama) {
      this._isPanorama    = false;
      this._savedViewport = null;
      this._syncToggleButton();
    }
  }

  _syncToggleButton() {
    const { centerMapEl } = this.ui;
    centerMapEl.setAttribute("aria-pressed", String(this._isPanorama));
    centerMapEl.classList.toggle("is-active", this._isPanorama);
    centerMapEl.title = this._isPanorama
      ? "Back to previous view (Home)"
      : "Fit all content (Home)";
  }

  // ─── Zoom helpers ─────────────────────────────────────────────────────────

  _zoomBy(factor) {
    const current = this.app.stageApi.getScale();
    const next = Math.min(MAX_SCALE, Math.max(MIN_SCALE, current * factor));
    const stage = this.app.stage;
    this.app.stageApi.setScale(next, {
      x: stage.width()  / 2,
      y: stage.height() / 2,
    });
  }

  zoomIn()  { this._zoomBy(1 + ZOOM_STEP); }
  zoomOut() { this._zoomBy(1 - ZOOM_STEP); }

  // ─── Floating zoom panel ──────────────────────────────────────────────────

  _buildZoomPanel() {
    const panel = document.createElement("div");
    panel.className = "zoom-controls";
    panel.dataset.testid = "zoom-controls";
    panel.innerHTML = `
      <button class="zoom-controls__btn" data-action="out"  title="Zoom out (Ctrl -)">−</button>
      <button class="zoom-controls__label" data-action="fit" title="Fit all content (Home)">100%</button>
      <button class="zoom-controls__btn" data-action="in" title="Zoom in (Ctrl +)">+</button>
    `;

    this._zoomLabel = panel.querySelector("[data-action='fit']");

    panel.addEventListener("click", (e) => {
      const action = e.target.closest("[data-action]")?.dataset.action;
      if (action === "in")  this.zoomIn();
      if (action === "out") this.zoomOut();
      if (action === "fit") this.centerView();
    });

    // Inject styles (scoped — won't conflict with existing CSS)
    const style = document.createElement("style");
    style.textContent = `
      .zoom-controls {
        position: absolute;
        bottom: 16px;
        left: 16px;
        display: flex;
        align-items: center;
        gap: 2px;
        background: var(--color-background-primary, #fff);
        border: 1px solid var(--color-border-secondary, #e0d6cc);
        border-radius: 8px;
        padding: 3px 4px;
        box-shadow: 0 1px 4px rgba(0,0,0,.10);
        z-index: 100;
        user-select: none;
      }
      .zoom-controls__btn,
      .zoom-controls__label {
        background: none;
        border: none;
        cursor: pointer;
        font-size: 13px;
        font-family: inherit;
        color: var(--color-text-primary, #2d2418);
        padding: 3px 7px;
        border-radius: 5px;
        line-height: 1;
        transition: background 0.1s;
      }
      .zoom-controls__btn:hover,
      .zoom-controls__label:hover {
        background: var(--color-background-secondary, #f5f0eb);
      }
      .zoom-controls__label {
        min-width: 44px;
        text-align: center;
        font-variant-numeric: tabular-nums;
        font-size: 12px;
      }
    `;
    document.head.appendChild(style);

    // Attach to board-shell (same parent as minimap)
    const boardShell = this.app.stage.container().parentElement;
    boardShell.appendChild(panel);
    this._zoomPanel = panel;
    this._styleEl   = style;

    // Keep label in sync with viewport changes
    this.listen("viewport:change", ({ scale }) => {
      if (this._zoomLabel) {
        this._zoomLabel.textContent = `${Math.round(scale * 100)}%`;
      }
    });

    this.cleanups.push(() => style.remove());
  }
}
