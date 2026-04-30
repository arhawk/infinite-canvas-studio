import { BasePlugin } from "../../core/baseClasses.js";
import { renderIcons } from "../../lib/icons.js";
import { Konva } from "../../lib/konva.js";

const IMAGE_PLACEHOLDER_ICON = "image";

function buildIframePreview(previewDiv) {
  previewDiv.classList.add("comp-dropdown__preview--iframe");
  const tag = document.createElement("span");
  tag.className = "comp-dropdown__preview-iframe-tag";
  tag.textContent = "https://";
  previewDiv.append(tag);
}

function generatePreviewDataUrl(node, width, height) {
  const container = document.createElement("div");
  container.style.cssText = "position:absolute;left:-9999px;top:-9999px;";
  document.body.appendChild(container);

  const stage = new Konva.Stage({ container, width, height });
  const layer = new Konva.Layer();
  stage.add(layer);

  const wrapper = new Konva.Group();
  node.draggable(false);
  wrapper.add(node);
  layer.add(wrapper);
  layer.draw();

  const box = node.getClientRect();
  if (box.width === 0 || box.height === 0) {
    stage.destroy();
    container.remove();
    return null;
  }

  const scale = Math.min((width * 0.8) / box.width, (height * 0.75) / box.height, 1.3);
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  wrapper.setAttrs({
    scaleX: scale,
    scaleY: scale,
    x: width / 2 - cx * scale,
    y: height / 2 - cy * scale,
  });
  layer.draw();

  const dataUrl = stage.toDataURL({ pixelRatio: 2 });
  stage.destroy();
  container.remove();
  return dataUrl;
}

async function getCenterPlacementPoint(app, type) {
  const viewport = app.stageApi.getViewportBounds();
  const targetCenter = {
    x: viewport.x + viewport.width / 2,
    y: viewport.y + viewport.height / 2,
  };

  const component = app.components.get(type);
  if (!component?.createNode) {
    return targetCenter;
  }

  const probeNode = await component.createNode({ x: 0, y: 0 });
  try {
    if (!probeNode?.getClientRect) {
      return targetCenter;
    }

    const box = probeNode.getClientRect({ skipTransform: true });
    return {
      x: targetCenter.x - (box.x + box.width / 2),
      y: targetCenter.y - (box.y + box.height / 2),
    };
  } finally {
    probeNode?.destroy?.();
  }
}

export class ComponentsDropdownPlugin extends BasePlugin {
  static pluginId = "components-dropdown";
  static modes = {
    edit: {
      tools: {
        arrange: {},
      },
    },
  };

  onSetup() {
    this._open = false;
    this._paletteCards = [];
    this._buildDropdown();
    this._renderPalette();
    this._wireCanvasDrop();

    this.listen("interaction:change", () => this._syncInteractivity());

    this.cleanups.push(() => {
      this._dropdown?.remove();
      document.removeEventListener("mousedown", this._outsideHandler, true);
    });
  }

  onModeChange() {
    this._syncInteractivity();
  }

  // ── Trigger wiring (called by LeftToolbarPlugin) ───────────────────────────

  wireTrigger(triggerBtn) {
    if (!triggerBtn) return;
    this._triggerBtn = triggerBtn;
    this.listenDom(triggerBtn, "click", (e) => {
      e.stopPropagation();
      this._toggle();
    });
  }

  // ── Build DOM ──────────────────────────────────────────────────────────────

  _buildDropdown() {
    const el = document.createElement("div");
    el.className = "comp-dropdown";
    el.setAttribute("role", "dialog");
    el.setAttribute("aria-label", "Components");
    el.hidden = true;

    const title = document.createElement("div");
    title.className = "comp-dropdown__title";
    title.textContent = "COMPONENTS";
    el.appendChild(title);

    this._listEl = document.createElement("div");
    this._listEl.className = "comp-dropdown__list";
    el.appendChild(this._listEl);

    this._dropdown = el;

    // Append to app-shell so it can be positioned relative to the left toolbar
    document.querySelector(".app-shell").appendChild(el);

    // Outside click handler (capture phase so it fires before other click handlers)
    this._outsideHandler = (e) => {
      if (!this._open) return;
      if (this._dropdown.contains(e.target)) return;
      if (this._triggerBtn?.contains(e.target)) return;
      this._close();
    };
    document.addEventListener("mousedown", this._outsideHandler, true);

    // Esc key
    this.listenDom(document, "keydown", (e) => {
      if (e.key === "Escape" && this._open) this._close();
    });
  }

  // ── Open / close ──────────────────────────────────────────────────────────

  _toggle() {
    this._open ? this._close() : this._openDropdown();
  }

  _openDropdown() {
    this._open = true;
    this._dropdown.hidden = false;
    this._positionDropdown();
    this._triggerBtn?.setAttribute("aria-pressed", "true");
  }

  _close() {
    this._open = false;
    this._dropdown.hidden = true;
    this._triggerBtn?.setAttribute("aria-pressed", "false");
  }

  _positionDropdown() {
    if (!this._triggerBtn) return;
    const triggerRect = this._triggerBtn.getBoundingClientRect();
    const appShell = document.querySelector(".app-shell");
    const shellRect = appShell.getBoundingClientRect();

    this._dropdown.style.left = `${triggerRect.right - shellRect.left + 4}px`;
    this._dropdown.style.top = `${triggerRect.top - shellRect.top}px`;
  }

  // ── Palette rendering ─────────────────────────────────────────────────────

  async _renderPalette() {
    this._listEl.innerHTML = "";
    this._paletteCards = [];

    for (const item of this.app.components.paletteItems()) {
      const card = document.createElement("button");
      card.type = "button";
      card.className = "comp-dropdown__card";
      card.draggable = true;
      card.dataset.componentType = item.type;
      card.dataset.testid = `palette-card-${item.type}`;

      const previewDiv = document.createElement("div");
      previewDiv.className = "comp-dropdown__preview";

      if (item.type === "image") {
        const icon = document.createElement("i");
        icon.dataset.lucide = IMAGE_PLACEHOLDER_ICON;
        previewDiv.append(icon);
      } else if (item.type === "iframe") {
        buildIframePreview(previewDiv);
      } else {
        const component = this.app.components.get(item.type);
        if (component?.renderPalettePreview) {
          component.renderPalettePreview(previewDiv);
        } else {
          const node = component ? await component.createNode({ x: 0, y: 0 }) : null;
          const dataUrl = node ? generatePreviewDataUrl(node, 160, 96) : null;
          if (dataUrl) {
            const img = document.createElement("img");
            img.src = dataUrl;
            img.alt = item.label;
            img.draggable = false;
            previewDiv.append(img);
          }
        }
      }

      const label = document.createElement("strong");
      label.textContent = item.label;
      card.append(previewDiv, label);

      this.listenDom(card, "dragstart", (event) => {
        if (!this.isEnabled()) {
          event.preventDefault();
          return;
        }
        event.dataTransfer?.setData("text/component-type", item.type);
      });

      this.listenDom(card, "click", async () => {
        if (!this.isEnabled()) return;
        const point = await getCenterPlacementPoint(this.app, item.type);
        await this.app.addComponent(item.type, point);
        this._close();
      });

      this._listEl.append(card);
      this._paletteCards.push(card);
    }

    renderIcons(this._listEl, {
      width: 28,
      height: 28,
      "stroke-width": 1.5,
      stroke: "#b38a5e",
    });

    this._syncInteractivity();
  }

  // ── Canvas drag-drop support ───────────────────────────────────────────────

  _wireCanvasDrop() {
    const canvasEl = this.app.stageApi?.stage?.container?.();
    if (!canvasEl) return;

    this.listenDom(canvasEl, "dragover", (event) => {
      if (!this.isEnabled()) return;
      event.preventDefault();
      canvasEl.classList.add("is-drop-target");
    });

    this.listenDom(canvasEl, "dragleave", () => {
      canvasEl.classList.remove("is-drop-target");
    });

    this.listenDom(canvasEl, "drop", async (event) => {
      canvasEl.classList.remove("is-drop-target");
      if (!this.isEnabled()) return;
      event.preventDefault();

      const type = event.dataTransfer?.getData("text/component-type");
      if (!type) return;

      const point = this.app.stageApi.screenToCanvas({
        x: event.offsetX,
        y: event.offsetY,
      });
      await this.app.addComponent(type, point);
      this._close();
    });
  }

  // ── Interactivity sync ────────────────────────────────────────────────────

  _syncInteractivity() {
    const enabled = this.isEnabled();
    this._listEl?.classList.toggle("is-disabled", !enabled);

    for (const card of this._paletteCards) {
      card.draggable = enabled;
      card.disabled = !enabled;
      card.setAttribute("aria-disabled", String(!enabled));
    }
  }
}
