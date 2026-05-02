import {
  BaseComponent,
  ColorEditorField,
  NumberEditorField,
  TextareaEditorField,
} from "../core/baseClasses.js";
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

function normalizeDimension(value, fallback, minimum) {
  return Number.isFinite(value) ? Math.max(minimum, value) : fallback;
}

function syncStickyVisuals(node, data = {}) {
  const width = normalizeDimension(data.width, DEFAULT_WIDTH, MIN_WIDTH);
  const height = normalizeDimension(data.height, DEFAULT_HEIGHT, MIN_HEIGHT);
  const text = typeof data.text === "string" && data.text ? data.text : "Sticky note";
  const fill = typeof data.fill === "string" && data.fill ? data.fill : DEFAULT_STICKY_FILL;
  const textColor = typeof data.textColor === "string" && data.textColor ? data.textColor : DEFAULT_STICKY_TEXT_COLOR;
  const fontSize = normalizeDimension(data.fontSize, DEFAULT_STICKY_FONT_SIZE, 12);
  const rect = node.findOne(".sticky-bg");
  const textNode = node.findOne(".sticky-text");

  node.width(width);
  node.height(height);

  if (rect) {
    rect.width(width);
    rect.height(height);
    rect.fill(fill);
  }

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
    fill: rect?.fill() ?? DEFAULT_STICKY_FILL,
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
      fill: rect?.fill() ?? "#ffe082",
      textColor: textNode?.fill() ?? "#47361c",
      fontSize: textNode?.fontSize() ?? DEFAULT_FONT_SIZE,
    });
  });
}

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
          syncStickyVisuals(node, {
            ...this.serializeNode(node),
            text: value || "Sticky note",
          });
        },
      }),
      new NumberEditorField({
        id: "fontSize",
        label: "Font Size",
        input: { min: 12, max: 72, step: 1 },
        getValue: (node) => node.findOne(".sticky-text")?.fontSize() ?? DEFAULT_FONT_SIZE,
        setValue: (node, value) => {
          syncStickyVisuals(node, {
            ...this.serializeNode(node),
            fontSize: value,
          });
        },
      }),
      new ColorEditorField({
        id: "fill",
        label: "Card Color",
        getValue: (node) => node.findOne(".sticky-bg")?.fill() ?? "#ffe082",
        setValue: (node, value) => {
          syncStickyVisuals(node, {
            ...this.serializeNode(node),
            fill: value,
          });
        },
      }),
      new ColorEditorField({
        id: "textColor",
        label: "Text Color",
        getValue: (node) => node.findOne(".sticky-text")?.fill() ?? "#47361c",
        setValue: (node, value) => {
          syncStickyVisuals(node, {
            ...this.serializeNode(node),
            textColor: value,
          });
        },
      }),
    ];
  }

  async createNode({
    x,
    y,
    width = DEFAULT_WIDTH,
    height = DEFAULT_HEIGHT,
    text = "Sticky note",
    fill = DEFAULT_STICKY_FILL,
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
