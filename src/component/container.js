import {
  BaseComponent,
  ColorEditorField,
  TextEditorField,
} from "../core/baseClasses.js";
import { DISPLAY_FONT_FAMILY } from "../lib/fonts.js";
import { Konva } from "../lib/konva.js";

export class ContainerComponent extends BaseComponent {
  static type = "container";
  static label = "Container";
  static description = "A box to group and organize components";
  static attachments = true;

  getEditorTitle() {
    return "Container";
  }

  editorFields() {
    const getRect = (node) => node.findOne(".container-bg");
    const getLabel = (node) => node.findOne(".container-label");

    return [
      new TextEditorField({
        id: "label",
        label: "Label",
        getValue: (node) => getLabel(node)?.text() ?? "",
        setValue: (node, value) => {
          getLabel(node)?.text(value || "Container");
        },
      }),
      new ColorEditorField({
        id: "stroke",
        label: "Border Color",
        getValue: (node) => getRect(node)?.stroke() ?? "#d7612f",
        setValue: (node, value) => {
          getRect(node)?.stroke(value);
          getLabel(node)?.fill(value);
        },
      }),
    ];
  }

  async createNode({ x, y, width = 300, height = 200, label = "New Container" }) {
    const group = new Konva.Group({
      x,
      y,
      width,
      height,
      draggable: true,
      name: "selectable container-root",
    });

    const rect = new Konva.Rect({
      width,
      height,
      fill: "rgba(255, 255, 255, 0.4)",
      stroke: "#d7612f",
      strokeWidth: 2,
      dash: [8, 4],
      cornerRadius: 12,
      name: "container-bg",
    });

    const text = new Konva.Text({
      text: label,
      fontSize: 14,
      fontFamily: DISPLAY_FONT_FAMILY,
      fontStyle: "700",
      fill: "#ab4f28",
      padding: 12,
      name: "container-label",
      listening: true,
    });

    group.add(rect, text);

    // Handle resizing: update the background rect when the group is transformed
    group.on("transform", () => {
      const scaleX = group.scaleX();
      const scaleY = group.scaleY();

      // Reset scale and update dimensions instead for better visual consistency
      group.scaleX(1);
      group.scaleY(1);

      const newWidth = Math.max(50, rect.width() * scaleX);
      const newHeight = Math.max(50, rect.height() * scaleY);

      rect.width(newWidth);
      rect.height(newHeight);
      group.width(newWidth);
      group.height(newHeight);
    });

    return group;
  }

  serializeNode(node) {
    const rect = node.findOne(".container-bg");
    const label = node.findOne(".container-label");

    return {
      width: rect?.width() ?? node.width() ?? 300,
      height: rect?.height() ?? node.height() ?? 200,
      label: label?.text() ?? "New Container",
      stroke: rect?.stroke() ?? "#d7612f",
      fill: rect?.fill() ?? "rgba(255, 255, 255, 0.4)",
      labelColor: label?.fill() ?? "#ab4f28",
    };
  }

  async applySerializedData(node, data = {}) {
    const rect = node.findOne(".container-bg");
    const label = node.findOne(".container-label");

    if (rect) {
      if (Number.isFinite(data.width)) rect.width(data.width);
      if (Number.isFinite(data.height)) rect.height(data.height);
      if (typeof data.stroke === "string" && data.stroke) rect.stroke(data.stroke);
      if (typeof data.fill === "string" && data.fill) rect.fill(data.fill);
    }

    node.width(Number.isFinite(data.width) ? data.width : node.width());
    node.height(Number.isFinite(data.height) ? data.height : node.height());

    if (label) {
      label.text(data.label || "Container");
      if (typeof data.labelColor === "string" && data.labelColor) {
        label.fill(data.labelColor);
      } else if (typeof data.stroke === "string" && data.stroke) {
        label.fill(data.stroke);
      }
    }
  }
}
