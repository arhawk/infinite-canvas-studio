import {
  BaseComponent,
  ColorEditorField,
  NumberEditorField,
  TextareaEditorField,
} from "../core/baseClasses.js";
import { Konva } from "../lib/konva.js";

export class TextComponent extends BaseComponent {
  static type = "text";
  static label = "Text";
  static description = "Editable thought label";

  getEditorTitle() {
    return "Text Block";
  }

  editorFields() {
    return [
      new TextareaEditorField({
        id: "text",
        label: "Content",
        rows: 5,
        getValue: (node) => node.text(),
        setValue: (node, value) => node.text(value || "Text"),
      }),
      new NumberEditorField({
        id: "fontSize",
        label: "Font Size",
        input: { min: 12, max: 96, step: 1 },
        getValue: (node) => node.fontSize(),
        setValue: (node, value) => node.fontSize(value),
      }),
      new ColorEditorField({
        id: "fill",
        label: "Text Color",
        getValue: (node) => node.fill(),
        setValue: (node, value) => node.fill(value),
      }),
    ];
  }

  async createNode({ x, y }) {
    return new Konva.Text({
      x,
      y,
      text: "New idea",
      fontSize: 24,
      fontFamily: "IBM Plex Sans",
      fill: "#1d1b16",
      padding: 12,
      draggable: true,
    });
  }
}
