import { BaseComponent } from "../core/baseClasses.js";
import { Konva } from "../lib/konva.js";
import { getCanvasTheme } from "../theme/canvasTheme.js";

export const DEFAULT_STROKE = "#d7612f";

export function getDefaultConnectionStroke() {
  return getCanvasTheme().connection?.stroke ?? DEFAULT_STROKE;
}
export const DEFAULT_LINE_OPACITY = 0.9;
export const CONNECTION_KIND_DIRECTED = "directed";
export const CONNECTION_KIND_TERMDEF = "termdef";
export const TERMDEF_LINE_OPACITY = 0.35;

export function getConnectionLine(node) {
  return node.findOne(".connection-line");
}

function normalizeConnectionKind(value) {
  return value === CONNECTION_KIND_TERMDEF ? CONNECTION_KIND_TERMDEF : CONNECTION_KIND_DIRECTED;
}

export function getConnectionKind(node) {
  return normalizeConnectionKind(node?.getAttr?.("connectionKind"));
}

export function applyConnectionKindStyle(node, {
  kind,
  directedPointerLength,
  directedPointerWidth,
} = {}) {
  if (!node?.setAttr) return null;
  const line = getConnectionLine(node);
  if (!line) return null;

  const nextKind = normalizeConnectionKind(kind ?? getConnectionKind(node));
  node.setAttr("connectionKind", nextKind);

  if (nextKind === CONNECTION_KIND_TERMDEF) {
    node.setAttrs({
      directedPointerLength: Number.isFinite(directedPointerLength)
        ? directedPointerLength
        : (node.getAttr("directedPointerLength") ?? line.pointerLength?.() ?? 10),
      directedPointerWidth: Number.isFinite(directedPointerWidth)
        ? directedPointerWidth
        : (node.getAttr("directedPointerWidth") ?? line.pointerWidth?.() ?? 10),
    });

    line.dash([8, 6]);
    line.pointerLength(0);
    line.pointerWidth(0);
    return { kind: nextKind };
  }

  const restoredPointerLength = node.getAttr("directedPointerLength");
  const restoredPointerWidth = node.getAttr("directedPointerWidth");
  line.dash([]);
  const currentPointerLength = line.pointerLength?.();
  const currentPointerWidth = line.pointerWidth?.();

  if (
    (currentPointerLength === 0 || currentPointerWidth === 0) &&
    Number.isFinite(restoredPointerLength) &&
    Number.isFinite(restoredPointerWidth)
  ) {
    line.pointerLength(restoredPointerLength);
    line.pointerWidth(restoredPointerWidth);
  } else if (Number.isFinite(currentPointerLength) && Number.isFinite(currentPointerWidth)) {
    node.setAttrs({
      directedPointerLength: currentPointerLength,
      directedPointerWidth: currentPointerWidth,
    });
  }

  return { kind: nextKind };
}

function normalizeHiddenUntilEndpointSelected(value) {
  return value === true;
}

export function getConnectionConfiguredStyle(node) {
  const line = getConnectionLine(node);
  const hiddenUntilEndpointSelected = node?.getAttr?.("connectionHiddenUntilEndpointSelected") === true;
  return {
    stroke:
      node?.getAttr?.("connectionStroke")
      ?? line?.stroke?.()
      ?? DEFAULT_STROKE,
    hiddenUntilEndpointSelected,
    kind: getConnectionKind(node),
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

  async createNode({
    stroke = getDefaultConnectionStroke(),
    hiddenUntilEndpointSelected = false,
    strokeWidth = 3,
    pointerLength = 10,
    pointerWidth = 10,
    connectionKind = CONNECTION_KIND_DIRECTED,
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
      perfectDrawEnabled: false,
      name: "connection-line",
    });

    group.add(line);
    group.setAttr("connectionKind", normalizeConnectionKind(connectionKind));
    applyConnectionKindStyle(group, { kind: connectionKind });
    return group;
  }

  onCreated(node, payload = {}) {
    node.setAttrs({
      sourceNodeId: payload.sourceNodeId ?? null,
      targetNodeId: payload.targetNodeId ?? null,
      controlOffsetStart: payload.controlOffsetStart ?? { x: 0, y: 0 },
      controlOffsetEnd: payload.controlOffsetEnd ?? { x: 0, y: 0 },
      connectionKind: normalizeConnectionKind(payload.connectionKind),
    });
    setConnectionConfiguredStyle(node, {
      stroke: payload.stroke ?? getDefaultConnectionStroke(),
      hiddenUntilEndpointSelected: payload.hiddenUntilEndpointSelected === true,
    });
    applyConnectionKindStyle(node, {
      kind: payload.connectionKind,
      directedPointerLength: payload.directedPointerLength,
      directedPointerWidth: payload.directedPointerWidth,
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
      connectionKind: getConnectionKind(node),
      stroke: configured.stroke,
      hiddenUntilEndpointSelected: configured.hiddenUntilEndpointSelected,
      strokeWidth: line?.strokeWidth() ?? 3,
      pointerLength: line?.pointerLength() ?? 10,
      pointerWidth: line?.pointerWidth() ?? 10,
      directedPointerLength: node.getAttr("directedPointerLength") ?? null,
      directedPointerWidth: node.getAttr("directedPointerWidth") ?? null,
    };
  }

  async applySerializedData(node, data = {}) {
    const line = getConnectionLine(node);
    if (!line) return;

    setConnectionConfiguredStyle(node, {
      stroke: typeof data.stroke === "string" && data.stroke ? data.stroke : DEFAULT_STROKE,
      hiddenUntilEndpointSelected: data.hiddenUntilEndpointSelected === true,
    });
    if (Number.isFinite(data.strokeWidth)) line.strokeWidth(data.strokeWidth);
    if (Number.isFinite(data.pointerLength)) line.pointerLength(data.pointerLength);
    if (Number.isFinite(data.pointerWidth)) line.pointerWidth(data.pointerWidth);

    node.setAttrs({
      sourceNodeId: data.sourceNodeId ?? null,
      targetNodeId: data.targetNodeId ?? null,
      controlOffsetStart: data.controlOffsetStart ?? { x: 0, y: 0 },
      controlOffsetEnd: data.controlOffsetEnd ?? { x: 0, y: 0 },
      connectionKind: normalizeConnectionKind(data.connectionKind),
      directedPointerLength: data.directedPointerLength ?? node.getAttr("directedPointerLength") ?? null,
      directedPointerWidth: data.directedPointerWidth ?? node.getAttr("directedPointerWidth") ?? null,
    });

    applyConnectionKindStyle(node, {
      kind: data.connectionKind,
      directedPointerLength: data.directedPointerLength,
      directedPointerWidth: data.directedPointerWidth,
    });
  }
}
