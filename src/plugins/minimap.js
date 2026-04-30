import { BasePlugin } from "../core/baseClasses.js";

const MINIMAP_W = 180;
const MINIMAP_H = 110;
const NODE_PADDING = 80; // extra space around nodes when computing canvas bounds
const LASER_HIDE_DELAY = 1400;
const UNLINKED_PAGE_WARNING_SIZE = 9;
const UNLINKED_PAGE_WARNING_PULSE_MS = 1200;

function isPageNode(node) {
  return node?.getAttr?.("componentType") === "page";
}

function isConnectionNode(node) {
  return node?.getAttr?.("componentType") === "connection";
}

export class MinimapPlugin extends BasePlugin {
  static pluginId = "minimap";

  onSetup() {
    this.stage = this.app.stage;
    this.mainLayer = this.app.mainLayer;
    this.minimapTransform = null;
    this.laserTimeout = null;
    this.warningAnimationFrame = null;
    this.hasUnlinkedPageWarnings = false;
    this.unlinkedPageCursorId = null;
    this.collapsed = false;
    this.pendingHeaderActions ??= [];

    this.buildPanel();

    this.listen("viewport:change", () => this.update());
    this.listen("node:added", () => this.update());
    this.listen("node:removed", () => this.update());
    this.listen("node:changed", () => this.update());
    this.listen("selection:change", ({ nodes }) => this.onSelectionChange(nodes));

    this.update();

    this.cleanups.push(() => {
      clearTimeout(this.laserTimeout);
      this.stopWarningAnimation();
      this.panelEl?.remove();
    });
  }

  buildPanel() {
    // Outer panel
    this.panelEl = document.createElement("div");
    this.panelEl.className = "minimap";
    this.panelEl.dataset.testid = "minimap";

    // Header row (label + action buttons)
    const headerRow = document.createElement("div");
    headerRow.className = "minimap__header-row";

    const header = document.createElement("div");
    header.className = "minimap__header";
    header.textContent = "Overview";
    headerRow.appendChild(header);

    this.headerActionsEl = document.createElement("div");
    this.headerActionsEl.className = "minimap__header-actions";

    this.unlinkedPageBtn = document.createElement("button");
    this.unlinkedPageBtn.type = "button";
    this.unlinkedPageBtn.className = "minimap__action-btn minimap__unlinked-page-btn";
    this.unlinkedPageBtn.dataset.testid = "minimap-unlinked-page-next";
    this.unlinkedPageBtn.disabled = true;
    this.unlinkedPageBtn.setAttribute("aria-label", "No unlinked pages");
    this.unlinkedPageBtn.title = "No unlinked pages";
    this.unlinkedPageBtn.innerHTML = `
      <svg width="13" height="13" viewBox="0 0 13 13" aria-hidden="true" focusable="false">
        <path d="M6.5 1.35 12 11.35H1L6.5 1.35Z" fill="#facc15" stroke="#7c4a03" stroke-width="1" stroke-linejoin="round"/>
        <path d="M6.5 4.35v3.35" stroke="#5f3b00" stroke-width="1.25" stroke-linecap="round"/>
        <circle cx="6.5" cy="9.55" r=".72" fill="#5f3b00"/>
      </svg>
    `;
    this.listenDom(this.unlinkedPageBtn, "click", () => this.goToNextUnlinkedPage());

    this.toggleBtn = document.createElement("button");
    this.toggleBtn.className = "minimap__toggle-btn";
    this.toggleBtn.setAttribute("aria-label", "Collapse minimap");
    this.toggleBtn.innerHTML =
      '<svg width="10" height="10" viewBox="0 0 10 10" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M2 3.5L5 6.5L8 3.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    this.listenDom(this.toggleBtn, "click", () => this.toggleCollapse());
    for (const actionEl of this.pendingHeaderActions) {
      this.attachHeaderAction(actionEl);
    }
    this.pendingHeaderActions = [];
    this.headerActionsEl.appendChild(this.unlinkedPageBtn);
    this.headerActionsEl.appendChild(this.toggleBtn);
    headerRow.appendChild(this.headerActionsEl);

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

  attachHeaderAction(actionEl) {
    if (!actionEl) return;
    if (!this.headerActionsEl) {
      this.pendingHeaderActions ??= [];
      this.pendingHeaderActions.push(actionEl);
      return;
    }
    actionEl.classList.remove("left-toolbar__btn");
    actionEl.classList.add("minimap__action-btn");
    this.headerActionsEl.prepend(actionEl);
  }

  // ── Collapse / expand ────────────────────────────────────────────────────

  toggleCollapse() {
    this.collapsed = !this.collapsed;
    this.panelEl.classList.toggle("is-collapsed", this.collapsed);
    this.toggleBtn.setAttribute(
      "aria-label",
      this.collapsed ? "Expand minimap" : "Collapse minimap",
    );
    if (this.collapsed) {
      this.stopWarningAnimation();
    }
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

  minimapCanvasToDom(x, y) {
    const canvasRect = this.canvas.getBoundingClientRect();
    const wrapperRect = this.canvas.parentElement.getBoundingClientRect();
    const canvasWidth = this.canvas.width || MINIMAP_W;
    const canvasHeight = this.canvas.height || MINIMAP_H;
    const renderedWidth = canvasRect.width || canvasWidth;
    const renderedHeight = canvasRect.height || canvasHeight;
    return {
      x: canvasRect.left - wrapperRect.left + (x / canvasWidth) * renderedWidth,
      y: canvasRect.top - wrapperRect.top + (y / canvasHeight) * renderedHeight,
    };
  }

  minimapDomToCanvas(clientX, clientY) {
    const rect = this.canvas.getBoundingClientRect();
    const canvasWidth = this.canvas.width || MINIMAP_W;
    const canvasHeight = this.canvas.height || MINIMAP_H;
    const renderedWidth = rect.width || canvasWidth;
    const renderedHeight = rect.height || canvasHeight;
    return {
      x: ((clientX - rect.left) / renderedWidth) * canvasWidth,
      y: ((clientY - rect.top) / renderedHeight) * canvasHeight,
    };
  }

  connectionPoints(node) {
    const line = node.findOne(".connection-line");
    const points = line?.points?.() ?? [];
    if (points.length < 4) return null;

    const mapped = [];
    for (let i = 0; i < points.length; i += 2) {
      mapped.push(this.toMinimap(points[i], points[i + 1]));
    }
    return { line, points: mapped };
  }

  drawConnection(ctx, node) {
    const connection = this.connectionPoints(node);
    if (!connection) return;

    const { line, points } = connection;
    ctx.save();
    ctx.strokeStyle = "rgba(84, 64, 43, 0.35)";
    ctx.lineWidth = 1;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.setLineDash(line.dash?.() ?? []);

    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    if (line.bezier?.() && points.length >= 4) {
      ctx.bezierCurveTo(
        points[1].x,
        points[1].y,
        points[2].x,
        points[2].y,
        points[3].x,
        points[3].y,
      );
    } else {
      for (let i = 1; i < points.length; i += 1) {
        ctx.lineTo(points[i].x, points[i].y);
      }
    }
    ctx.stroke();
    ctx.restore();
  }

  getUnlinkedPageIds(nodes) {
    const pageIds = new Set(
      nodes
        .filter((node) => isPageNode(node))
        .map((node) => node.id())
        .filter(Boolean),
    );
    if (!pageIds.size) return new Set();

    const linkedPageIds = new Set();
    nodes
      .filter((node) => isConnectionNode(node))
      .forEach((connection) => {
        const sourceId = connection.getAttr("sourceNodeId");
        const targetId = connection.getAttr("targetNodeId");
        if (!pageIds.has(sourceId) || !pageIds.has(targetId) || sourceId === targetId) {
          return;
        }

        linkedPageIds.add(sourceId);
        linkedPageIds.add(targetId);
      });

    return new Set([...pageIds].filter((id) => !linkedPageIds.has(id)));
  }

  getUnlinkedPageNodes(nodes = this.selectableNodes()) {
    const unlinkedPageIds = this.getUnlinkedPageIds(nodes);
    return nodes.filter((node) => unlinkedPageIds.has(node.id()));
  }

  sortPageNodesForTraversal(nodes) {
    return [...nodes].sort((a, b) => {
      const aRect = a.getClientRect({ relativeTo: this.mainLayer });
      const bRect = b.getClientRect({ relativeTo: this.mainLayer });
      return (
        aRect.y - bRect.y
        || aRect.x - bRect.x
        || String(a.id()).localeCompare(String(b.id()))
      );
    });
  }

  syncUnlinkedPageButton(unlinkedPageCount) {
    if (!this.unlinkedPageBtn) return;

    const hasUnlinkedPages = unlinkedPageCount > 0;
    this.unlinkedPageBtn.disabled = !hasUnlinkedPages;
    this.unlinkedPageBtn.setAttribute(
      "aria-label",
      hasUnlinkedPages
        ? `Go to next unlinked page (${unlinkedPageCount})`
        : "No unlinked pages",
    );
    this.unlinkedPageBtn.title = hasUnlinkedPages
      ? `Go to next unlinked page (${unlinkedPageCount})`
      : "No unlinked pages";
  }

  goToNextUnlinkedPage() {
    const unlinkedPages = this.sortPageNodesForTraversal(this.getUnlinkedPageNodes());
    this.syncUnlinkedPageButton(unlinkedPages.length);
    if (!unlinkedPages.length) {
      this.unlinkedPageCursorId = null;
      return;
    }

    const selection = this.app.getPlugin("selection");
    const selectedIds = new Set(
      (selection?.getSelectedNodes?.() ?? [])
        .map((node) => node.id?.())
        .filter(Boolean),
    );
    const selectedIndex = unlinkedPages.findIndex((node) => selectedIds.has(node.id()));
    const cursorIndex = unlinkedPages.findIndex((node) => node.id() === this.unlinkedPageCursorId);
    const startIndex = selectedIndex >= 0 ? selectedIndex : cursorIndex;
    const nextIndex = (startIndex + 1) % unlinkedPages.length;
    const target = unlinkedPages[nextIndex];
    const targetRect = target.getClientRect({ relativeTo: this.mainLayer });
    const targetCenter = {
      x: targetRect.x + targetRect.width / 2,
      y: targetRect.y + targetRect.height / 2,
    };

    this.unlinkedPageCursorId = target.id();
    selection?.setSelected?.([target]);
    this.app.stageApi.centerOn(targetCenter, { duration: 0.35 });
  }

  getWarningPulse() {
    const phase = (performance.now() % UNLINKED_PAGE_WARNING_PULSE_MS) / UNLINKED_PAGE_WARNING_PULSE_MS;
    return 0.66 + 0.34 * ((Math.sin(phase * Math.PI * 2) + 1) / 2);
  }

  drawUnlinkedPageWarning(ctx, { x, y, width }, pulse = 1) {
    const size = UNLINKED_PAGE_WARNING_SIZE;
    const half = size / 2;
    const cx = Math.max(half + 1, Math.min(MINIMAP_W - half - 1, x + width - 1));
    const top = Math.max(1, Math.min(MINIMAP_H - size - 1, y - 2));

    ctx.save();
    ctx.beginPath();
    ctx.moveTo(cx, top);
    ctx.lineTo(cx - half, top + size);
    ctx.lineTo(cx + half, top + size);
    ctx.closePath();
    ctx.globalAlpha = pulse;
    ctx.shadowColor = `rgba(250, 204, 21, ${0.25 + pulse * 0.45})`;
    ctx.shadowBlur = 2 + pulse * 5;
    ctx.fillStyle = "#facc15";
    ctx.strokeStyle = "#7c4a03";
    ctx.lineWidth = 1;
    ctx.fill();
    ctx.stroke();

    ctx.strokeStyle = "#5f3b00";
    ctx.fillStyle = "#5f3b00";
    ctx.lineWidth = 1.15;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(cx, top + 3);
    ctx.lineTo(cx, top + 6.1);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx, top + 7.7, 0.65, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  stopWarningAnimation() {
    if (this.warningAnimationFrame == null) return;
    cancelAnimationFrame(this.warningAnimationFrame);
    this.warningAnimationFrame = null;
  }

  syncWarningAnimation(shouldAnimate) {
    this.hasUnlinkedPageWarnings = shouldAnimate;
    if (!shouldAnimate || this.collapsed) {
      this.stopWarningAnimation();
      return;
    }

    if (this.warningAnimationFrame != null) return;
    this.warningAnimationFrame = requestAnimationFrame(() => {
      this.warningAnimationFrame = null;
      if (!this.collapsed) {
        this.update();
      }
    });
  }

  // ── Drawing ───────────────────────────────────────────────────────────────

  update() {
    const nodes = this.selectableNodes();
    const unlinkedPageIds = this.getUnlinkedPageIds(nodes);
    this.syncUnlinkedPageButton(unlinkedPageIds.size);

    if (this.collapsed) {
      this.stopWarningAnimation();
      return;
    }

    const ctx = this.canvas.getContext("2d");
    const w = MINIMAP_W;
    const h = MINIMAP_H;

    ctx.clearRect(0, 0, w, h);

    const bounds = this.displayBounds(nodes);

    // Uniform scale that fits bounds into the canvas, letterboxed
    const scale = Math.min(w / bounds.width, h / bounds.height);
    const offsetX = (w - bounds.width * scale) / 2;
    const offsetY = (h - bounds.height * scale) / 2;

    this.minimapTransform = { bounds, scale, offsetX, offsetY };

    // Background wash
    ctx.fillStyle = "rgba(61, 47, 32, 0.03)";
    ctx.fillRect(0, 0, w, h);

    // Draw every selectable node as a small rounded rect, except connections
    // which keep their actual curve shape in the overview.
    const unlinkedPageMarkers = [];
    for (const node of nodes) {
      if (isConnectionNode(node)) {
        this.drawConnection(ctx, node);
        continue;
      }

      const r = node.getClientRect({ relativeTo: this.mainLayer });
      const { x, y } = this.toMinimap(r.x, r.y);
      const nw = Math.max(2, r.width * scale);
      const nh = Math.max(2, r.height * scale);

      ctx.fillStyle = "rgba(84, 64, 43, 0.28)";
      ctx.strokeStyle = "rgba(84, 64, 43, 0.5)";
      ctx.lineWidth = 0.5;

      ctx.beginPath();
      if (ctx.roundRect) {
        ctx.roundRect(x, y, nw, nh, 1.5);
      } else {
        ctx.rect(x, y, nw, nh);
      }
      ctx.fill();
      ctx.stroke();

      if (unlinkedPageIds.has(node.id())) {
        unlinkedPageMarkers.push({ x, y, width: nw });
      }
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

    const warningPulse = this.getWarningPulse();
    unlinkedPageMarkers.forEach((marker) => this.drawUnlinkedPageWarning(ctx, marker, warningPulse));
    this.syncWarningAnimation(unlinkedPageMarkers.length > 0);
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
    const domPos = this.minimapCanvasToDom(cx, cy);

    this.laserEl.style.left = `${domPos.x}px`;
    this.laserEl.style.top = `${domPos.y}px`;
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

    const { x: mx, y: my } = this.minimapDomToCanvas(event.clientX, event.clientY);

    const canvasPos = this.fromMinimap(mx, my);
    this.app.stageApi.centerOn(canvasPos, { duration: 0.35 });
  }
}
