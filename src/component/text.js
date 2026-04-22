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

const MIN_WIDTH = 48;
const MIN_HEIGHT = 32;

function normalizeDimension(value, fallback, minimum) {
  return Number.isFinite(value) ? Math.max(minimum, value) : fallback;
}

function measureDefaultTextBox(textNode, text, fontSize, padding, lineHeight) {
  const measured = textNode.measureSize?.(text) ?? {
    width: String(text ?? "").length * fontSize * 0.56,
    height: fontSize,
  };

  return {
    width: Math.ceil(Math.max(MIN_WIDTH, measured.width + padding * 2)),
    height: Math.ceil(Math.max(MIN_HEIGHT, measured.height * lineHeight + padding * 2)),
  };
}

function installTextBoxResize(textNode) {
  textNode.on("transform.textBoxResize", () => {
    const scaleX = textNode.scaleX();
    const scaleY = textNode.scaleY();

    textNode.scale({ x: 1, y: 1 });
    textNode.width(Math.max(MIN_WIDTH, textNode.width() * scaleX));
    textNode.height(Math.max(MIN_HEIGHT, textNode.height() * scaleY));
  });
}

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
        setValue: (node, value) => node.text(value ?? ""),
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

  async createNode({
    x,
    y,
    text = "New idea",
    fontSize = 24,
    fill = "#1d1b16",
    padding = 12,
    width,
    height,
  }) {
    const textNode = new Konva.Text({
      x,
      y,
      text,
      width: MIN_WIDTH,
      height: MIN_HEIGHT,
      fontSize,
      fontFamily: UI_FONT_FAMILY,
      fill,
      padding,
      lineHeight: 1.25,
      wrap: "word",
      verticalAlign: "top",
      draggable: true,
    });
    const autoSize = measureDefaultTextBox(textNode, text, fontSize, padding, textNode.lineHeight());
    textNode.width(normalizeDimension(width, autoSize.width, MIN_WIDTH));
    textNode.height(normalizeDimension(height, autoSize.height, MIN_HEIGHT));

    installTextBoxResize(textNode);
    EditableTextBehavior.attach(textNode, { fallbackText: "" });

    return textNode;
  }

  serializeNode(node) {
    return {
      text: node.text(),
      fontSize: node.fontSize(),
      fill: node.fill(),
      padding: node.padding(),
      width: node.width(),
      height: node.height(),
      lineHeight: node.lineHeight(),
      annotations: serializeNodeTextAnnotations(node),
    };
  }

  async applySerializedData(node, data = {}) {
    node.text(typeof data.text === "string" ? data.text : "New idea");
    if (Number.isFinite(data.fontSize)) node.fontSize(data.fontSize);
    if (typeof data.fill === "string" && data.fill) node.fill(data.fill);
    if (Number.isFinite(data.padding)) node.padding(data.padding);
    node.width(normalizeDimension(data.width, node.width(), MIN_WIDTH));
    node.height(normalizeDimension(data.height, node.height(), MIN_HEIGHT));
    node.lineHeight(Number.isFinite(data.lineHeight) ? data.lineHeight : 1.25);
    node.wrap("word");
    node.verticalAlign("top");
    setNodeTextAnnotations(node, data.annotations);
  }
}
