import { BaseComponent } from "../core/baseClasses.js";
import { EditableTextBehavior } from "./editableText.js";
import { UI_FONT_FAMILY } from "../lib/fonts.js";
import { Konva } from "../lib/konva.js";
import {
  serializeNodeTextAnnotations,
  setNodeTextAnnotations,
} from "../lib/textAnnotations.js";

const DEFAULT_WIDTH = 180;
const DEFAULT_HEIGHT = 130;
const DEFAULT_FONT_SIZE = 20;
const MIN_WIDTH = 96;
const MIN_HEIGHT = 84;
const MIN_TEXT_WIDTH = 60;
const MIN_TEXT_HEIGHT = 40;
export const DEFAULT_STICKY_FILL = "#ffe082";
export const DEFAULT_STICKY_TEXT_COLOR = "#47361c";
export const DEFAULT_STICKY_FONT_SIZE = DEFAULT_FONT_SIZE;
export const DEFAULT_STICKY_FILL_OPACITY = 1;

function normalizeDimension(value, fallback, minimum) {
  return Number.isFinite(value) ? Math.max(minimum, value) : fallback;
}

function clamp01(value, fallback = 1) {
  if (!Number.isFinite(value)) return fallback;
  if (value <= 0) return 0;
  if (value >= 1) return 1;
  return value;
}

function fillWithOpacity(color, opacity) {
  const alpha = clamp01(opacity, DEFAULT_STICKY_FILL_OPACITY);
  if (alpha >= 1) return color;
  const hex = typeof color === "string" ? color.trim() : "";
  const shortMatch = hex.match(/^#([0-9a-f]{3})$/i);
  const longMatch = hex.match(/^#([0-9a-f]{6})$/i);
  const digits = shortMatch
    ? shortMatch[1].split("").map((char) => `${char}${char}`).join("")
    : longMatch?.[1] ?? null;
  if (!digits) return alpha <= 0 ? "rgba(0, 0, 0, 0)" : color;
  const red = Number.parseInt(digits.slice(0, 2), 16);
  const green = Number.parseInt(digits.slice(2, 4), 16);
  const blue = Number.parseInt(digits.slice(4, 6), 16);
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

function syncStickyVisuals(node, data = {}) {
  const width = normalizeDimension(data.width, DEFAULT_WIDTH, MIN_WIDTH);
  const height = normalizeDimension(data.height, DEFAULT_HEIGHT, MIN_HEIGHT);
  const text = typeof data.text === "string" && data.text ? data.text : "Sticky note";
  const fill = typeof data.fill === "string" && data.fill ? data.fill : DEFAULT_STICKY_FILL;
  const fillOpacity = clamp01(data.fillOpacity, DEFAULT_STICKY_FILL_OPACITY);
  const textColor = typeof data.textColor === "string" && data.textColor ? data.textColor : DEFAULT_STICKY_TEXT_COLOR;
  const fontSize = normalizeDimension(data.fontSize, DEFAULT_STICKY_FONT_SIZE, 12);
  const rect = node.findOne(".sticky-bg");
  const textNode = node.findOne(".sticky-text");

  node.width(width);
  node.height(height);

  if (rect) {
    rect.width(width);
    rect.height(height);
    rect.fill(fillWithOpacity(fill, fillOpacity));
  }
  node.setAttr("stickyFill", fill);
  node.setAttr("stickyFillOpacity", fillOpacity);

  if (textNode) {
    textNode.text(text);
    textNode.width(Math.max(width - 28, MIN_TEXT_WIDTH));
    textNode.height(Math.max(height - 28, MIN_TEXT_HEIGHT));
    textNode.fontSize(fontSize);
    textNode.fill(textColor);
    textNode.wrap("word");
    textNode.verticalAlign("top");
  }
}

export function getStickyData(node) {
  const rect = node?.findOne?.(".sticky-bg");
  const textNode = node?.findOne?.(".sticky-text");

  return {
    width: rect?.width() ?? node?.width?.() ?? DEFAULT_WIDTH,
    height: rect?.height() ?? node?.height?.() ?? DEFAULT_HEIGHT,
    text: textNode?.text() ?? "Sticky note",
    fill: node?.getAttr?.("stickyFill") ?? rect?.fill() ?? DEFAULT_STICKY_FILL,
    fillOpacity: clamp01(node?.getAttr?.("stickyFillOpacity"), DEFAULT_STICKY_FILL_OPACITY),
    textColor: textNode?.fill() ?? DEFAULT_STICKY_TEXT_COLOR,
    fontSize: textNode?.fontSize() ?? DEFAULT_STICKY_FONT_SIZE,
    annotations: serializeNodeTextAnnotations(node),
  };
}

export function applyStickyStyle(node, patch = {}) {
  syncStickyVisuals(node, {
    ...getStickyData(node),
    ...patch,
  });
}

function installStickyResize(group) {
  group.on("transform.stickyResize", () => {
    const rect = group.findOne(".sticky-bg");
    const textNode = group.findOne(".sticky-text");
    const scaleX = Math.abs(group.scaleX());
    const scaleY = Math.abs(group.scaleY());
    const currentWidth = rect?.width() ?? group.width() ?? DEFAULT_WIDTH;
    const currentHeight = rect?.height() ?? group.height() ?? DEFAULT_HEIGHT;

    group.scale({ x: 1, y: 1 });
    syncStickyVisuals(group, {
      width: currentWidth * scaleX,
      height: currentHeight * scaleY,
      text: textNode?.text() ?? "Sticky note",
      fill: group.getAttr("stickyFill") ?? "#ffe082",
      fillOpacity: clamp01(group.getAttr("stickyFillOpacity"), DEFAULT_STICKY_FILL_OPACITY),
      textColor: textNode?.fill() ?? "#47361c",
      fontSize: textNode?.fontSize() ?? DEFAULT_FONT_SIZE,
    });
  });
}

export class StickyComponent extends BaseComponent {
  static type = "sticky";
  static label = "Sticky Note";
  static description = "Colorful note block";

  async createNode({
    x,
    y,
    width = DEFAULT_WIDTH,
    height = DEFAULT_HEIGHT,
    text = "Sticky note",
    fill = DEFAULT_STICKY_FILL,
    fillOpacity = DEFAULT_STICKY_FILL_OPACITY,
    textColor = DEFAULT_STICKY_TEXT_COLOR,
    fontSize = DEFAULT_STICKY_FONT_SIZE,
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
      perfectDrawEnabled: false,
      name: "sticky-bg",
    });

    const textNode = new Konva.Text({
      x: 14,
      y: 14,
      width: Math.max(width - 28, MIN_TEXT_WIDTH),
      height: Math.max(height - 28, MIN_TEXT_HEIGHT),
      text,
      fontSize,
      lineHeight: 1.35,
      fontFamily: UI_FONT_FAMILY,
      fill: textColor,
      name: "sticky-text",
      wrap: "word",
      verticalAlign: "top",
    });
    EditableTextBehavior.attach(textNode, {
      fallbackText: "Sticky note",
      getHistoryNode: () => group,
    });

    group.add(rect, textNode);
    installStickyResize(group);
    syncStickyVisuals(group, {
      width,
      height,
      text,
      fill,
      fillOpacity,
      textColor,
      fontSize,
    });

    return group;
  }

  serializeNode(node) {
    return getStickyData(node);
  }

  async applySerializedData(node, data = {}) {
    syncStickyVisuals(node, data);
    setNodeTextAnnotations(node, data.annotations);
  }
}
