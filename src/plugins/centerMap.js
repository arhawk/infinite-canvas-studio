import { BasePlugin } from "../core/baseClasses.js";
import { renderIcons } from "../lib/icons.js";

/**
 * CenterMapPlugin — Fit all pages into view + zoom controls (1.9)
 *
 * centerView():
 *   Finds every node with componentType "page" on the canvas, computes
 *   their bounding box, then animates the stage so ALL pages are visible
 *   with comfortable padding (the "full panorama" view).
 *   Falls back to origin reset if no nodes exist yet.
 *
 * Zoom controls (optional — only wired if zoomInEl / zoomOutEl are passed):
 *   zoomInEl  — scale up 20 %
 *   zoomOutEl — scale down 20 %
 *
 * Keyboard shortcuts:
 *   Home        — fit all pages (same as button click)
 *   Ctrl/Cmd +  — zoom in
 *   Ctrl/Cmd -  — zoom out
 *
 * HTML needed in index.html (already present for center-map-btn):
 *   <button id="zoom-in-btn"  ...>＋</button>
 *   <button id="zoom-out-btn" ...>－</button>
 *
 * main.js registration:
 *   app.use(CenterMapPlugin, {
 *     centerMapEl: ui.centerMapBtn,
 *     zoomInEl:    document.getElementById("zoom-in-btn"),
 *     zoomOutEl:   document.getElementById("zoom-out-btn"),
 *   });
 */

const ZOOM_STEP  = 0.2;   // 20 % per click
const MIN_SCALE  = 0.05;
const MAX_SCALE  = 8;
const PADDING    = 80;    // screen-px padding around the fitted view

export class CenterMapPlugin extends BasePlugin {
  static pluginId = "center-map";

  onSetup() {
    const { centerMapEl, zoomInEl, zoomOutEl } = this.options;
    this.ui = { centerMapEl, zoomInEl, zoomOutEl };

    renderIcons(centerMapEl, { width: 16, height: 16, "stroke-width": 2 });
    if (zoomInEl)  renderIcons(zoomInEl,  { width: 14, height: 14, "stroke-width": 2 });
    if (zoomOutEl) renderIcons(zoomOutEl, { width: 14, height: 14, "stroke-width": 2 });

    // Fit-all button
    this.listenDom(centerMapEl, "click", () => this.centerView());

    // Zoom buttons (optional)
    if (zoomInEl)  this.listenDom(zoomInEl,  "click", () => this.zoomIn());
    if (zoomOutEl) this.listenDom(zoomOutEl, "click", () => this.zoomOut());

    // Keyboard shortcuts
    this.listenDom(window, "keydown", (e) => {
      if (["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement?.tagName)) return;

      // Home — fit all pages
      if (e.key === "Home" && !e.ctrlKey && !e.metaKey && !e.shiftKey) {
        e.preventDefault();
        this.centerView();
        return;
      }

      // Ctrl/Cmd + = or + — zoom in
      if ((e.ctrlKey || e.metaKey) && (e.key === "=" || e.key === "+")) {
        e.preventDefault();
        this.zoomIn();
        return;
      }

      // Ctrl/Cmd + - — zoom out
      if ((e.ctrlKey || e.metaKey) && e.key === "-") {
        e.preventDefault();
        this.zoomOut();
      }
    });
  }

  // ─── Fit all pages ───────────────────────────────────────────────────────

  centerView() {
    const stage = this.app.stage;

    // 1. Collect page nodes (componentType === "page")
    const allNodes = stage.find("Group") ?? [];
    const pageNodes = allNodes.filter(
      (n) => n.getAttr("componentType") === "page",
    );

    // Fall back to all selectable nodes if no pages found yet
    const targets =
      pageNodes.length > 0
        ? pageNodes
        : (stage.find(".selectable") ?? []);

    if (targets.length === 0) {
      // Empty canvas — reset to origin at scale 1
      this.app.stageApi.centerOn({ x: 0, y: 0 }, { duration: 0.4, scale: 1 });
      return;
    }

    // 2. Compute bounding box in canvas coordinates
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

    for (const node of targets) {
      // getClientRect returns screen-space rect relative to the container
      const rect = node.getClientRect({ skipTransform: false, relativeTo: stage });
      const curScale = stage.scaleX();

      // Convert back to canvas coords
      const x1 = (rect.x)           / curScale;
      const y1 = (rect.y)           / curScale;
      const x2 = (rect.x + rect.width)  / curScale;
      const y2 = (rect.y + rect.height) / curScale;

      if (x1 < minX) minX = x1;
      if (y1 < minY) minY = y1;
      if (x2 > maxX) maxX = x2;
      if (y2 > maxY) maxY = y2;
    }

    const contentW = maxX - minX;
    const contentH = maxY - minY;
    if (contentW <= 0 || contentH <= 0) return;

    // 3. Calculate scale that fits the bounding box with padding
    const stageW = stage.width();
    const stageH = stage.height();
    const scaleX = (stageW - PADDING * 2) / contentW;
    const scaleY = (stageH - PADDING * 2) / contentH;
    const newScale = Math.min(scaleX, scaleY, MAX_SCALE);
    const clampedScale = Math.max(newScale, MIN_SCALE);

    // 4. Center point of the bounding box (canvas coords)
    const centerX = minX + contentW / 2;
    const centerY = minY + contentH / 2;

    // 5. Animate to the fitted view
    this.app.stageApi.centerOn(
      { x: centerX, y: centerY },
      { duration: 0.45, scale: clampedScale },
    );
  }

  // ─── Zoom helpers ────────────────────────────────────────────────────────

  _zoomBy(factor) {
    const current = this.app.stageApi.getScale();
    const next = Math.min(MAX_SCALE, Math.max(MIN_SCALE, current * factor));
    // Zoom toward centre of the visible stage
    const stage = this.app.stage;
    const screenCenter = {
      x: stage.width()  / 2,
      y: stage.height() / 2,
    };
    // stageApi.setScale zooms toward the given screen-space pointer
    this.app.stageApi.setScale(next, screenCenter);
  }

  zoomIn()  { this._zoomBy(1 + ZOOM_STEP); }
  zoomOut() { this._zoomBy(1 - ZOOM_STEP); }
}
