import { BaseComponent } from "../core/baseClasses.js";
import { UI_FONT_FAMILY } from "../lib/fonts.js";
import { Konva } from "../lib/konva.js";

export class CatalogComponent extends BaseComponent {
  static type = "catalog";
  static label = "Catalog";
  static description = "Document outline data node";
  static palette = false;

  async createNode({
    x,
    y,
    title = "Catalog",
    items = [],
    width = 220,
    height = 80,
  }) {
    const safeItems = Array.isArray(items) ? items : [];

    const group = new Konva.Group({
      x,
      y,
      draggable: false,
      visible: false,
      listening: false,
      opacity: 0,
    });

    group.setAttr("data", {
      version: 1,
      title,
      items: safeItems,
    });

    const background = new Konva.Rect({
      width,
      height,
      fill: "#f4efe6",
      stroke: "#c9b79c",
      strokeWidth: 1,
      cornerRadius: 12,
    });

    const label = new Konva.Text({
      text: title,
      fontSize: 20,
      fontFamily: UI_FONT_FAMILY,
      fill: "#1d1b16",
      x: 12,
      y: 12,
      name: "catalog-label",
    });

    const subtitle = new Konva.Text({
      text: safeItems.length === 1 ? "1 item" : `${safeItems.length} items`,
      fontSize: 12,
      fontFamily: UI_FONT_FAMILY,
      fill: "#6b6257",
      x: 12,
      y: 42,
      name: "catalog-subtitle",
    });

    group.add(background);
    group.add(label);
    group.add(subtitle);

    return group;
  }

  serializeNode(node) {
    const data = node.getAttr("data") || {};

    return {
      version: 1,
      title: data.title || "Catalog",
      items: Array.isArray(data.items) ? data.items : [],
    };
  }

  async applySerializedData(node, serializedData = {}) {
    const nextData = {
      version: 1,
      title: serializedData.title || "Catalog",
      items: Array.isArray(serializedData.items) ? serializedData.items : [],
    };

    node.setAttr("data", nextData);

    const labelNode = node.findOne(".catalog-label");
    if (labelNode) {
      labelNode.text(nextData.title);
    }

    const subtitleNode = node.findOne(".catalog-subtitle");
    if (subtitleNode) {
      const count = nextData.items.length;
      subtitleNode.text(count === 1 ? "1 item" : `${count} items`);
    }
  }

  applySerializedState(node, snapshot = {}) {
    super.applySerializedState(node, snapshot);
    node.draggable(false);
    node.visible(false);
    node.opacity(0);
    node.listening(false);
  }
}
