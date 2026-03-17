import {
  BaseComponent,
  ColorEditorField,
  NumberEditorField,
} from "../core/baseClasses.js";
import { Konva } from "../lib/konva.js";

export class ArrowComponent extends BaseComponent {
  static type = "arrow";
  static label = "Arrow";
  static description = "Direction connector";

  getEditorTitle() {
    return "Arrow";
  }

  editorFields() {
    return [
      new NumberEditorField({
        id: "length",
        label: "Length",
        input: { min: 40, max: 1200, step: 10 },
        getValue: (node) => node.points()?.[2] ?? 180,
        setValue: (node, value) => node.points([0, 0, value, 0]),
      }),
      new NumberEditorField({
        id: "strokeWidth",
        label: "Stroke Width",
        input: { min: 1, max: 24, step: 1 },
        getValue: (node) => node.strokeWidth(),
        setValue: (node, value) => node.strokeWidth(value),
      }),
      new ColorEditorField({
        id: "stroke",
        label: "Line Color",
        getValue: (node) => node.stroke(),
        setValue: (node, value) => {
          node.stroke(value);
          node.fill(value);
        },
      }),
    ];
  }

  async createNode({ x, y }) {
    return new Konva.Arrow({
      x,
      y,
      points: [0, 0, 180, 0],
      stroke: "#ab4f28",
      fill: "#ab4f28",
      strokeWidth: 4,
      pointerLength: 14,
      pointerWidth: 14,
      draggable: true,
    });
  }
}
