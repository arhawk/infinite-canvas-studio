import { BasePlugin } from "../core/baseClasses.js";
import { renderIcons } from "../lib/icons.js";
import { Konva } from "../lib/konva.js";

const IMAGE_PLACEHOLDER_ICON = "image";

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

export class SidebarPlugin extends BasePlugin {
  static pluginId = "palette";
  static modes = {
    edit: {
      tools: {
        arrange: {},
      },
    },
  };

  onSetup() {
    const { paletteEl, canvasEl, imageInputEl } = this.options;
    this.ui = { paletteEl, canvasEl, imageInputEl };
    this.paletteCards = [];

    this.listen("interaction:change", () => this.syncInteractivity());
    this.listenDom(canvasEl, "dragover", (event) => this.handleDragOver(event));
    this.listenDom(canvasEl, "dragleave", () => canvasEl.classList.remove("is-drop-target"));
    this.listenDom(canvasEl, "drop", (event) => this.handleDrop(event));

    this.renderPalette();
  }

  onModeChange() {
    this.syncInteractivity();
  }

  syncInteractivity() {
    const { paletteEl, canvasEl } = this.ui;
    paletteEl.classList.toggle("is-disabled", !this.isEnabled());
    if (!this.isEnabled()) {
      canvasEl.classList.remove("is-drop-target");
    }

    for (const card of this.paletteCards) {
      card.draggable = this.isEnabled();
      card.disabled = !this.isEnabled();
      card.setAttribute("aria-disabled", String(!this.isEnabled()));
    }
  }

  async renderPalette() {
    const { paletteEl, imageInputEl } = this.ui;
    paletteEl.innerHTML = "";
    this.paletteCards = [];

    for (const item of this.app.components.paletteItems()) {
      const card = document.createElement("button");
      card.type = "button";
      card.className = "component-card";
      card.draggable = true;
      card.dataset.componentType = item.type;

      const previewDiv = document.createElement("div");
      previewDiv.className = "component-preview";

      if (item.type === "image") {
        const icon = document.createElement("i");
        icon.dataset.lucide = IMAGE_PLACEHOLDER_ICON;
        previewDiv.append(icon);
      } else {
        const component = this.app.components.get(item.type);
        const node = component ? await component.createNode({ x: 0, y: 0 }) : null;
        const dataUrl = node ? generatePreviewDataUrl(node, 200, 120) : null;
        if (dataUrl) {
          const img = document.createElement("img");
          img.src = dataUrl;
          img.alt = item.label;
          img.draggable = false;
          previewDiv.append(img);
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
        const point = { x: 180, y: 180 };
        await this.app.addComponent(item.type, point);
      });

      paletteEl.append(card);
      this.paletteCards.push(card);
    }

    renderIcons({
      width: 32,
      height: 32,
      "stroke-width": 1.5,
      stroke: "#b38a5e",
    });

    this.syncInteractivity();
  }

  handleDragOver(event) {
    if (!this.isEnabled()) return;
    event.preventDefault();
    this.ui.canvasEl.classList.add("is-drop-target");
  }

  async handleDrop(event) {
    if (!this.isEnabled()) {
      this.ui.canvasEl.classList.remove("is-drop-target");
      return;
    }
    event.preventDefault();
    this.ui.canvasEl.classList.remove("is-drop-target");

    const type = event.dataTransfer?.getData("text/component-type");
    if (!type) return;

    const point = this.app.stageApi.screenToCanvas({
      x: event.offsetX,
      y: event.offsetY,
    });

    await this.app.addComponent(type, point);
  }
}
