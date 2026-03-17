import {
  BaseComponent,
  ColorEditorField,
  NumberEditorField,
} from "../core/baseClasses.js";
import { Konva } from "../lib/konva.js";

const DEFAULT_STROKE = "#d7612f";

function getLine(node) {
  return node.findOne(".connection-line");
}

export class ConnectionComponent extends BaseComponent {
  static type = "connection";
  static label = "Connection";
  static description = "Curved link between two components";
  static palette = false;

  getEditorTitle() {
    return "Connection";
  }

  editorFields() {
    return [
      new ColorEditorField({
        id: "stroke",
        label: "Line Color",
        getValue: (node) => getLine(node)?.stroke() ?? DEFAULT_STROKE,
        setValue: (node, value) => {
          const line = getLine(node);
          if (!line) return;
          line.stroke(value);
          line.fill(value);
        },
      }),
      new NumberEditorField({
        id: "strokeWidth",
        label: "Stroke Width",
        input: { min: 1, max: 16, step: 1 },
        getValue: (node) => getLine(node)?.strokeWidth() ?? 3,
        setValue: (node, value) => {
          getLine(node)?.strokeWidth(value);
        },
      }),
      new NumberEditorField({
        id: "pointerLength",
        label: "Arrow Length",
        input: { min: 6, max: 36, step: 1 },
        getValue: (node) => getLine(node)?.pointerLength() ?? 10,
        setValue: (node, value) => {
          getLine(node)?.pointerLength(value);
        },
      }),
      new NumberEditorField({
        id: "pointerWidth",
        label: "Arrow Width",
        input: { min: 6, max: 36, step: 1 },
        getValue: (node) => getLine(node)?.pointerWidth() ?? 10,
        setValue: (node, value) => {
          getLine(node)?.pointerWidth(value);
        },
      }),
    ];
  }

  async createNode({
    stroke = DEFAULT_STROKE,
    strokeWidth = 3,
    pointerLength = 10,
    pointerWidth = 10,
  } = {}) {
    const group = new Konva.Group({
      draggable: false,
      name: "connection-root",
    });

    const line = new Konva.Arrow({
      points: [0, 0, 0, 0, 0, 0, 0, 0],
      stroke,
      fill: stroke,
      strokeWidth,
      opacity: 0.9,
      pointerLength,
      pointerWidth,
      lineCap: "round",
      lineJoin: "round",
      bezier: true,
      hitStrokeWidth: 28,
      shadowColor: "#000",
      shadowBlur: 2,
      shadowOffset: { x: 1, y: 1 },
      shadowOpacity: 0.08,
      name: "connection-line",
    });

    group.add(line);
    return group;
  }

  onCreated(node, payload = {}) {
    node.setAttrs({
      sourceNodeId: payload.sourceNodeId ?? null,
      targetNodeId: payload.targetNodeId ?? null,
      controlOffsetStart: payload.controlOffsetStart ?? { x: 0, y: 0 },
      controlOffsetEnd: payload.controlOffsetEnd ?? { x: 0, y: 0 },
    });
  }
}
