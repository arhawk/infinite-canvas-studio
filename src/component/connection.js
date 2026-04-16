import {
  BaseComponent,
  CheckboxEditorField,
  ColorEditorField,
  NumberEditorField,
} from "../core/baseClasses.js";
import { Konva } from "../lib/konva.js";

export const DEFAULT_STROKE = "#d7612f";
export const DEFAULT_LINE_OPACITY = 0.9;

export function getConnectionLine(node) {
  return node.findOne(".connection-line");
}

function normalizeHiddenUntilEndpointSelected(value) {
  return value === true;
}

export function getConnectionConfiguredStyle(node) {
  const line = getConnectionLine(node);
  const legacyLineOpacity = node?.getAttr?.("connectionLineOpacity");
  const hiddenUntilEndpointSelected =
    node?.getAttr?.("connectionHiddenUntilEndpointSelected") === true ||
    (Number.isFinite(legacyLineOpacity) && legacyLineOpacity <= 0.001);
  return {
    stroke:
      node?.getAttr?.("connectionStroke")
      ?? line?.stroke?.()
      ?? DEFAULT_STROKE,
    hiddenUntilEndpointSelected,
  };
}

export function setConnectionConfiguredStyle(node, {
  stroke,
  hiddenUntilEndpointSelected,
} = {}) {
  if (!node?.setAttrs) return null;

  const line = getConnectionLine(node);
  const current = getConnectionConfiguredStyle(node);
  const nextStroke = typeof stroke === "string" && stroke ? stroke : current.stroke;
  const nextHiddenUntilEndpointSelected =
    hiddenUntilEndpointSelected == null
      ? current.hiddenUntilEndpointSelected
      : normalizeHiddenUntilEndpointSelected(hiddenUntilEndpointSelected);

  node.setAttrs({
    connectionStroke: nextStroke,
    connectionHiddenUntilEndpointSelected: nextHiddenUntilEndpointSelected,
  });

  if (line) {
    line.stroke(nextStroke);
    line.fill(nextStroke);
    line.opacity(nextHiddenUntilEndpointSelected ? 0 : DEFAULT_LINE_OPACITY);
    line.listening(!nextHiddenUntilEndpointSelected);
  }

  return {
    stroke: nextStroke,
    hiddenUntilEndpointSelected: nextHiddenUntilEndpointSelected,
  };
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
        getValue: (node) => getConnectionConfiguredStyle(node).stroke,
        setValue: (node, value) => {
          setConnectionConfiguredStyle(node, { stroke: value });
        },
      }),
      new CheckboxEditorField({
        id: "hiddenUntilEndpointSelected",
        label: "Hide Until Endpoint Selected",
        description: "Makes the link fully transparent until one endpoint is selected.",
        getValue: (node) => getConnectionConfiguredStyle(node).hiddenUntilEndpointSelected,
        setValue: (node, value) => {
          setConnectionConfiguredStyle(node, {
            hiddenUntilEndpointSelected: value === true,
          });
        },
      }),
      new NumberEditorField({
        id: "strokeWidth",
        label: "Stroke Width",
        input: { min: 1, max: 16, step: 1 },
        getValue: (node) => getConnectionLine(node)?.strokeWidth() ?? 3,
        setValue: (node, value) => {
          getConnectionLine(node)?.strokeWidth(value);
        },
      }),
      new NumberEditorField({
        id: "pointerLength",
        label: "Arrow Length",
        input: { min: 6, max: 36, step: 1 },
        getValue: (node) => getConnectionLine(node)?.pointerLength() ?? 10,
        setValue: (node, value) => {
          getConnectionLine(node)?.pointerLength(value);
        },
      }),
      new NumberEditorField({
        id: "pointerWidth",
        label: "Arrow Width",
        input: { min: 6, max: 36, step: 1 },
        getValue: (node) => getConnectionLine(node)?.pointerWidth() ?? 10,
        setValue: (node, value) => {
          getConnectionLine(node)?.pointerWidth(value);
        },
      }),
    ];
  }

  async createNode({
    stroke = DEFAULT_STROKE,
    hiddenUntilEndpointSelected = false,
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
      opacity: hiddenUntilEndpointSelected ? 0 : DEFAULT_LINE_OPACITY,
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
    setConnectionConfiguredStyle(node, {
      stroke: payload.stroke ?? DEFAULT_STROKE,
      hiddenUntilEndpointSelected:
        payload.hiddenUntilEndpointSelected === true ||
        payload.lineOpacity === 0,
    });
  }

  serializeNode(node) {
    const line = getConnectionLine(node);
    const configured = getConnectionConfiguredStyle(node);
    return {
      sourceNodeId: node.getAttr("sourceNodeId") ?? null,
      targetNodeId: node.getAttr("targetNodeId") ?? null,
      controlOffsetStart: node.getAttr("controlOffsetStart") ?? { x: 0, y: 0 },
      controlOffsetEnd: node.getAttr("controlOffsetEnd") ?? { x: 0, y: 0 },
      stroke: configured.stroke,
      hiddenUntilEndpointSelected: configured.hiddenUntilEndpointSelected,
      strokeWidth: line?.strokeWidth() ?? 3,
      pointerLength: line?.pointerLength() ?? 10,
      pointerWidth: line?.pointerWidth() ?? 10,
    };
  }

  async applySerializedData(node, data = {}) {
    const line = getConnectionLine(node);
    if (!line) return;

    setConnectionConfiguredStyle(node, {
      stroke: typeof data.stroke === "string" && data.stroke ? data.stroke : DEFAULT_STROKE,
      hiddenUntilEndpointSelected:
        data.hiddenUntilEndpointSelected === true ||
        data.lineOpacity === 0,
    });
    if (Number.isFinite(data.strokeWidth)) line.strokeWidth(data.strokeWidth);
    if (Number.isFinite(data.pointerLength)) line.pointerLength(data.pointerLength);
    if (Number.isFinite(data.pointerWidth)) line.pointerWidth(data.pointerWidth);

    node.setAttrs({
      sourceNodeId: data.sourceNodeId ?? null,
      targetNodeId: data.targetNodeId ?? null,
      controlOffsetStart: data.controlOffsetStart ?? { x: 0, y: 0 },
      controlOffsetEnd: data.controlOffsetEnd ?? { x: 0, y: 0 },
    });
  }
}
