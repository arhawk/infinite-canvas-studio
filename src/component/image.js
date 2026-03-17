import {
  BaseComponent,
  FileEditorField,
} from "../core/baseClasses.js";
import { Konva } from "../lib/konva.js";

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = src;
  });
}

export class ImageComponent extends BaseComponent {
  static type = "image";
  static label = "Image";
  static description = "Upload and place photo";

  getEditorTitle() {
    return "Image";
  }

  editorFields() {
    return [
      new FileEditorField({
        id: "image",
        label: "Change Image",
        description: "Select a new image file",
        input: { accept: "image/*" },
        getValue: () => null,
        setValue: (node, file) => {
          if (file instanceof File) {
            const src = URL.createObjectURL(file);
            this.updateNode(node, src);
          }
        },
      }),
    ];
  }

  async createNode({ x, y, src }) {
    const width = 220;
    const height = 150; // Placeholder default
    const group = new Konva.Group({
      x,
      y,
      width,
      height,
      draggable: true,
      name: "image-container",
    });

    if (!src) {
      this.#addPlaceholderToGroup(group);
    } else {
      await this.#addImageToGroup(group, src);
    }

    return group;
  }

  #addPlaceholderToGroup(group) {
    const width = group.width();
    const height = group.height();

    const rect = new Konva.Rect({
      width,
      height,
      fill: "#fdf8f3",
      stroke: "#dcc7b1",
      strokeWidth: 2,
      dash: [8, 4],
      cornerRadius: 18,
      name: "placeholder-rect",
    });

    const text = new Konva.Text({
      text: "Double-click to\nedit image",
      width,
      height,
      align: "center",
      verticalAlign: "middle",
      fontSize: 14,
      fontFamily: "Space Grotesk",
      fill: "#a68b6d",
      name: "placeholder-text",
    });

    group.add(rect, text);
  }

  async #addImageToGroup(group, src) {
    const image = await loadImage(src);
    const aspect = image.width / image.height || 1;
    const width = group.width();
    const height = width / aspect;

    const img = new Konva.Image({
      image,
      width,
      height,
      cornerRadius: 18,
      name: "image-node",
    });

    group.add(img);
    group.height(height);

    if (src.startsWith("blob:")) {
      group.on("removed", () => URL.revokeObjectURL(src));
    }
  }

  async updateNode(node, src) {
    if (!(node instanceof Konva.Group)) return;

    node.destroyChildren();
    await this.#addImageToGroup(node, src);
    node.getLayer()?.batchDraw();
  }
}
