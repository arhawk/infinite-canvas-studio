import {
  BaseComponent,
  ColorEditorField,
  TextareaEditorField,
} from "../core/baseClasses.js";

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

  async createNode({ x, y }) {
    const group = new window.Konva.Group({
      x,
      y,
      draggable: true,
    });

    const rect = new window.Konva.Rect({
      width: 180,
      height: 130,
      fill: "#ffe082",
      cornerRadius: 18,
      shadowColor: "rgba(54, 41, 25, 0.2)",
      shadowBlur: 18,
      shadowOffsetY: 10,
      shadowOpacity: 0.4,
      name: "sticky-bg",
    });

    const text = new window.Konva.Text({
      x: 14,
      y: 14,
      width: 152,
      text: "Sticky note",
      fontSize: 20,
      lineHeight: 1.35,
      fontFamily: "IBM Plex Sans",
      fill: "#47361c",
      name: "sticky-text",
    });

    group.add(rect, text);

    return group;
  }
}
