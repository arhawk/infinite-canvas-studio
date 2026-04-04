import {
  BaseComponent,
  ColorEditorField,
  TextareaEditorField,
} from "../core/baseClasses.js";
import { UI_FONT_FAMILY } from "../lib/fonts.js";
import { Konva } from "../lib/konva.js";

export class StickyComponent extends BaseComponent {
  static type = "sticky";
  static label = "Sticky Note";
  static description = "Colorful note block";

  getEditorTitle() {
    return "Sticky Note";
  }

  editorFields() {
    return [
      new TextareaEditorField({
        id: "text",
        label: "Content",
        rows: 6,
        getValue: (node) => node.findOne(".sticky-text")?.text() ?? "",
        setValue: (node, value) => {
          node.findOne(".sticky-text")?.text(value || "Sticky note");
        },
      }),
      new ColorEditorField({
        id: "fill",
        label: "Card Color",
        getValue: (node) => node.findOne(".sticky-bg")?.fill() ?? "#ffe082",
        setValue: (node, value) => {
          node.findOne(".sticky-bg")?.fill(value);
        },
      }),
      new ColorEditorField({
        id: "textColor",
        label: "Text Color",
        getValue: (node) => node.findOne(".sticky-text")?.fill() ?? "#47361c",
        setValue: (node, value) => {
          node.findOne(".sticky-text")?.fill(value);
        },
      }),
    ];
  }

  async createNode({
    x,
    y,
    width = 180,
    height = 130,
    text = "Sticky note",
    fill = "#ffe082",
    textColor = "#47361c",
  }) {
    const group = new Konva.Group({
      x,
      y,
      width,
      height,
      draggable: true,
    });

    const rect = new Konva.Rect({
      width,
      height,
      fill,
      cornerRadius: 18,
      shadowColor: "rgba(54, 41, 25, 0.2)",
      shadowBlur: 18,
      shadowOffsetY: 10,
      shadowOpacity: 0.4,
      name: "sticky-bg",
    });

    const textNode = new Konva.Text({
      x: 14,
      y: 14,
      width: Math.max(width - 28, 60),
      text,
      fontSize: 20,
      lineHeight: 1.35,
      fontFamily: UI_FONT_FAMILY,
      fill: textColor,
      name: "sticky-text",
    });

    group.add(rect, textNode);

    return group;
  }

  serializeNode(node) {
    const rect = node.findOne(".sticky-bg");
    const textNode = node.findOne(".sticky-text");

    return {
      width: rect?.width() ?? node.width() ?? 180,
      height: rect?.height() ?? node.height() ?? 130,
      text: textNode?.text() ?? "Sticky note",
      fill: rect?.fill() ?? "#ffe082",
      textColor: textNode?.fill() ?? "#47361c",
    };
  }

  async applySerializedData(node, data = {}) {
    const rect = node.findOne(".sticky-bg");
    const textNode = node.findOne(".sticky-text");

    if (rect) {
      if (Number.isFinite(data.width)) rect.width(data.width);
      if (Number.isFinite(data.height)) rect.height(data.height);
      if (typeof data.fill === "string" && data.fill) rect.fill(data.fill);
    }

    node.width(Number.isFinite(data.width) ? data.width : node.width());
    node.height(Number.isFinite(data.height) ? data.height : node.height());

    if (textNode) {
      textNode.text(data.text || "Sticky note");
      textNode.width(
        Number.isFinite(data.width) ? Math.max(data.width - 28, 60) : textNode.width(),
      );
      if (typeof data.textColor === "string" && data.textColor) {
        textNode.fill(data.textColor);
      }
    }
  }
}
