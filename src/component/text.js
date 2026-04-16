import {
  BaseComponent,
  ColorEditorField,
  NumberEditorField,
  TextareaEditorField,
} from "../core/baseClasses.js";
import { EditableTextBehavior } from "./editableText.js";
import { UI_FONT_FAMILY } from "../lib/fonts.js";
import { Konva } from "../lib/konva.js";

const DEFAULT_WIDTH = 240;
const DEFAULT_HEIGHT = 96;
const MIN_WIDTH = 80;
const MIN_HEIGHT = 40;

function normalizeDimension(value, fallback, minimum) {
  return Number.isFinite(value) ? Math.max(minimum, value) : fallback;
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
    width = DEFAULT_WIDTH,
    height = DEFAULT_HEIGHT,
  }) {
    const textNode = new Konva.Text({
      x,
      y,
      text,
      width: normalizeDimension(width, DEFAULT_WIDTH, MIN_WIDTH),
      height: normalizeDimension(height, DEFAULT_HEIGHT, MIN_HEIGHT),
      fontSize,
      fontFamily: UI_FONT_FAMILY,
      fill,
      padding,
      lineHeight: 1.25,
      wrap: "word",
      verticalAlign: "top",
      draggable: true,
    });

    installTextBoxResize(textNode);
    EditableTextBehavior.attach(textNode, { fallbackText: "" });

    return textNode;
  }

  serializeNode(node) {
    const peerId = node.getAttr("termDefPeerId");
    const pairId = node.getAttr("termDefPairId");
    const required = node.getAttr("termDefRequired");
    return {
      text: node.text(),
      fontSize: node.fontSize(),
      fill: node.fill(),
      padding: node.padding(),
      width: node.width(),
      height: node.height(),
      lineHeight: node.lineHeight(),
      termDefinition: peerId || pairId || required
        ? {
          peerId: typeof peerId === "string" ? peerId : null,
          pairId: typeof pairId === "string" ? pairId : null,
          required: required === true,
        }
        : null,
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

    const td = data.termDefinition;
    if (td && typeof td === "object") {
      if (typeof td.peerId === "string" && td.peerId) node.setAttr("termDefPeerId", td.peerId);
      if (typeof td.pairId === "string" && td.pairId) node.setAttr("termDefPairId", td.pairId);
      node.setAttr("termDefRequired", td.required === true);
    }
  }
}
