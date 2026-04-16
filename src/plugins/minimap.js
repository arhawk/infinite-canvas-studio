import { BasePlugin } from "../core/baseClasses.js";

const MINIMAP_W = 180;
const MINIMAP_H = 110;
const NODE_PADDING = 80; // extra space around nodes when computing canvas bounds
const LASER_HIDE_DELAY = 1400;

export class MinimapPlugin extends BasePlugin {
  static pluginId = "minimap";

  onSetup() {
    this.stage = this.app.stage;
    this.mainLayer = this.app.mainLayer;
    this.minimapTransform = null;
    this.laserTimeout = null;
    this.collapsed = false;

    this.buildPanel();

    this.listen("viewport:change", () => this.update());
    this.listen("node:added", () => this.update());
    this.listen("node:removed", () => this.update());
    this.listen("node:changed", () => this.update());
    this.listen("selection:change", ({ nodes }) => this.onSelectionChange(nodes));

    this.update();

    this.cleanups.push(() => {
      clearTimeout(this.laserTimeout);
      this.panelEl?.remove();
    });
  }

  buildPanel() {
    // Outer panel
    this.panelEl = document.createElement("div");
    this.panelEl.className = "minimap";
    this.panelEl.dataset.testid = "minimap";

    // Header row (label + toggle button)
    const headerRow = document.createElement("div");
    headerRow.className = "minimap__header-row";

    const header = document.createElement("div");
    header.className = "minimap__header";
    header.textContent = "Overview";
    headerRow.appendChild(header);

    this.toggleBtn = document.createElement("button");
    this.toggleBtn.className = "minimap__toggle-btn";
    this.toggleBtn.setAttribute("aria-label", "Collapse minimap");
    this.toggleBtn.innerHTML =
      '<svg width="10" height="10" viewBox="0 0 10 10" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M2 3.5L5 6.5L8 3.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    this.listenDom(this.toggleBtn, "click", () => this.toggleCollapse());
    headerRow.appendChild(this.toggleBtn);

    this.panelEl.appendChild(headerRow);

    // Canvas wrapper (for relative positioning of the laser dot)
    const wrapper = document.createElement("div");
    wrapper.className = "minimap__canvas-wrap";
    this.panelEl.appendChild(wrapper);

    // Drawing canvas
    this.canvas = document.createElement("canvas");
    this.canvas.className = "minimap__canvas";
    this.canvas.width = MINIMAP_W;
    this.canvas.height = MINIMAP_H;
    wrapper.appendChild(this.canvas);

    // Laser dot (red glowing dot that appears on node click)
    this.laserEl = document.createElement("div");
    this.laserEl.className = "minimap__laser";
    wrapper.appendChild(this.laserEl);

    // Click minimap to pan main viewport
    this.listenDom(this.canvas, "click", (e) => this.handleClick(e));

    // Append to .board-shell (parent of the Konva canvas container)
    const boardShell = this.stage.container().parentElement;
    boardShell.appendChild(this.panelEl);
  }

  // ── Collapse / expand ────────────────────────────────────────────────────

  toggleCollapse() {
    this.collapsed = !this.collapsed;
    this.panelEl.classList.toggle("is-collapsed", this.collapsed);
    this.toggleBtn.setAttribute(
      "aria-label",
      this.collapsed ? "Expand minimap" : "Collapse minimap",
    );
    if (!this.collapsed) {
      // Resume rendering now that the panel is visible again
      this.update();
    }
  }

  // ── Coordinate helpers ────────────────────────────────────────────────────

  /** All selectable, visible nodes in the main layer. */
  selectableNodes() {
    return this.mainLayer.find(".selectable").filter((n) => n.visible());
  }

  /**
   * Returns the union bounding box (in canvas space) of all provided nodes,
   * with NODE_PADDING added on every side.
   */
  nodeBounds(nodes) {
    if (nodes.length === 0) return null;

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const node of nodes) {
      const r = node.getClientRect({ relativeTo: this.mainLayer });
      minX = Math.min(minX, r.x);
      minY = Math.min(minY, r.y);
      maxX = Math.max(maxX, r.x + r.width);
      maxY = Math.max(maxY, r.y + r.height);
    }

    return {
      x: minX - NODE_PADDING,
      y: minY - NODE_PADDING,
      width: maxX - minX + NODE_PADDING * 2,
      height: maxY - minY + NODE_PADDING * 2,
    };
  }

  /**
   * Computes the canvas-space region to display in the minimap.
   * Always includes the current viewport, optionally the node bounds.
   */
  displayBounds(nodes) {
    const vp = this.app.stageApi.getViewportBounds();
    const nb = this.nodeBounds(nodes);

    const minX = nb ? Math.min(nb.x, vp.x) : vp.x;
    const minY = nb ? Math.min(nb.y, vp.y) : vp.y;
    const maxX = nb ? Math.max(nb.x + nb.width, vp.x + vp.width) : vp.x + vp.width;
    const maxY = nb ? Math.max(nb.y + nb.height, vp.y + vp.height) : vp.y + vp.height;

    return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
  }

  /** Map a canvas-space point to minimap pixel coordinates. */
  toMinimap(cx, cy) {
    const { bounds, scale, offsetX, offsetY } = this.minimapTransform;
    return {
      x: (cx - bounds.x) * scale + offsetX,
      y: (cy - bounds.y) * scale + offsetY,
    };
  }

  /** Map a minimap pixel point back to canvas space. */
  fromMinimap(mx, my) {
    const { bounds, scale, offsetX, offsetY } = this.minimapTransform;
    return {
      x: (mx - offsetX) / scale + bounds.x,
      y: (my - offsetY) / scale + bounds.y,
    };
  }

  // ── Drawing ───────────────────────────────────────────────────────────────

  update() {
    if (this.collapsed) return;

    const ctx = this.canvas.getContext("2d");
    const w = MINIMAP_W;
    const h = MINIMAP_H;

    ctx.clearRect(0, 0, w, h);

    const nodes = this.selectableNodes();
    const bounds = this.displayBounds(nodes);

    // Uniform scale that fits bounds into the canvas, letterboxed
    const scale = Math.min(w / bounds.width, h / bounds.height);
    const offsetX = (w - bounds.width * scale) / 2;
    const offsetY = (h - bounds.height * scale) / 2;

    this.minimapTransform = { bounds, scale, offsetX, offsetY };

    // Background wash
    ctx.fillStyle = "rgba(61, 47, 32, 0.03)";
    ctx.fillRect(0, 0, w, h);

    // Draw every selectable node as a small rounded rect
    for (const node of nodes) {
      const r = node.getClientRect({ relativeTo: this.mainLayer });
      const { x, y } = this.toMinimap(r.x, r.y);
      const nw = Math.max(2, r.width * scale);
      const nh = Math.max(2, r.height * scale);

      const isConnection = node.getAttr("componentType") === "connection";

      ctx.fillStyle = isConnection
        ? "rgba(84, 64, 43, 0.15)"
        : "rgba(84, 64, 43, 0.28)";
      ctx.strokeStyle = isConnection
        ? "rgba(84, 64, 43, 0.25)"
        : "rgba(84, 64, 43, 0.5)";
      ctx.lineWidth = 0.5;

      ctx.beginPath();
      if (ctx.roundRect) {
        ctx.roundRect(x, y, nw, nh, 1.5);
      } else {
        ctx.rect(x, y, nw, nh);
      }
      ctx.fill();
      ctx.stroke();
    }

    // Draw viewport rect
    const vp = this.app.stageApi.getViewportBounds();
    const vpTL = this.toMinimap(vp.x, vp.y);
    const vpW = vp.width * scale;
    const vpH = vp.height * scale;

    ctx.fillStyle = "rgba(215, 97, 47, 0.07)";
    ctx.strokeStyle = "rgba(215, 97, 47, 0.75)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.rect(vpTL.x, vpTL.y, vpW, vpH);
    ctx.fill();
    ctx.stroke();
  }

  // ── Laser dot ─────────────────────────────────────────────────────────────

  onSelectionChange(nodes) {
    if (this.collapsed) return;
    if (!nodes?.length) return;

    // Pick the first non-connection selectable node
    const node = nodes.find(
      (n) => n.hasName("selectable") && n.getAttr("componentType") !== "connection",
    );
    if (!node) return;

    // Refresh minimap first so transform is current
    this.update();

    const r = node.getClientRect({ relativeTo: this.mainLayer });
    const pos = this.toMinimap(r.x + r.width / 2, r.y + r.height / 2);

    this.showLaser(pos.x, pos.y);
  }

  showLaser(x, y) {
    clearTimeout(this.laserTimeout);

    // Clamp inside canvas bounds
    const cx = Math.max(0, Math.min(MINIMAP_W, x));
    const cy = Math.max(0, Math.min(MINIMAP_H, y));

    this.laserEl.style.left = `${cx}px`;
    this.laserEl.style.top = `${cy}px`;
    this.laserEl.classList.remove("is-visible"); // reset animation
    // Force reflow so removing + re-adding the class restarts the animation
    void this.laserEl.offsetWidth;
    this.laserEl.classList.add("is-visible");

    this.laserTimeout = setTimeout(() => {
      this.laserEl.classList.remove("is-visible");
    }, LASER_HIDE_DELAY);
  }

  // ── Click to navigate ─────────────────────────────────────────────────────

  handleClick(event) {
    if (!this.minimapTransform) return;

    const rect = this.canvas.getBoundingClientRect();
    const mx = event.clientX - rect.left;
    const my = event.clientY - rect.top;

    const canvasPos = this.fromMinimap(mx, my);
    this.app.stageApi.centerOn(canvasPos, { duration: 0.35 });
  }
}
