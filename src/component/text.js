import { BaseComponent } from "../core/baseClasses.js";
import { EditableTextBehavior } from "./editableText.js";
import { UI_FONT_FAMILY } from "../lib/fonts.js";
import { Konva } from "../lib/konva.js";
import {
  buildTextStylePayload,
  DEFAULT_TEXT_STYLE_PRESET_ID,
  inferTextStylePresetId,
  normalizeTextFontStyle,
  normalizeTextStylePresetId,
} from "./textStylePresets.js";

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

  getDefaultStylePayload() {
    const plugin = this.app?.getPlugin?.("text-style-toolbar");
    const presetId = plugin?.getDefaultPresetId?.() ?? DEFAULT_TEXT_STYLE_PRESET_ID;
    return buildTextStylePayload(presetId);
  }

  async createNode({
    x,
    y,
    text = "New idea",
    fontSize,
    fill,
    fontStyle,
    textStylePreset,
    padding = 12,
    width,
    height,
  } = {}) {
    const defaultStyle = this.getDefaultStylePayload();
    const presetId = normalizeTextStylePresetId(
      textStylePreset,
      defaultStyle.textStylePreset ?? DEFAULT_TEXT_STYLE_PRESET_ID,
    );
    const presetStyle = buildTextStylePayload(presetId);
    const resolvedFontSize = Number.isFinite(fontSize) ? fontSize : presetStyle.fontSize;
    const resolvedFill = typeof fill === "string" && fill ? fill : presetStyle.fill;
    const resolvedFontStyle = normalizeTextFontStyle(fontStyle, presetStyle.fontStyle);
    const textNode = new Konva.Text({
      x,
      y,
      text,
      width: MIN_WIDTH,
      height: MIN_HEIGHT,
      fontSize: resolvedFontSize,
      fontStyle: resolvedFontStyle,
      fontFamily: UI_FONT_FAMILY,
      fill: resolvedFill,
      padding,
      lineHeight: 1.25,
      wrap: "word",
      verticalAlign: "top",
      draggable: true,
      textStylePreset: presetId,
    });
    const autoSize = measureDefaultTextBox(
      textNode,
      text,
      resolvedFontSize,
      padding,
      textNode.lineHeight(),
    );
    textNode.width(normalizeDimension(width, autoSize.width, MIN_WIDTH));
    textNode.height(normalizeDimension(height, autoSize.height, MIN_HEIGHT));

    installTextBoxResize(textNode);
    EditableTextBehavior.attach(textNode, { fallbackText: "" });

    return textNode;
  }

  serializeNode(node) {
    const fontStyle = normalizeTextFontStyle(node.fontStyle?.(), "400");
    const textStylePreset = normalizeTextStylePresetId(
      node.getAttr?.("textStylePreset"),
      inferTextStylePresetId({
        fontSize: node.fontSize?.(),
        fontStyle,
        fill: node.fill?.(),
      }),
    );
    return {
      text: node.text(),
      fontSize: node.fontSize(),
      fontStyle,
      fill: node.fill(),
      textStylePreset,
      padding: node.padding(),
      width: node.width(),
      height: node.height(),
      lineHeight: node.lineHeight(),
    };
  }

  async applySerializedData(node, data = {}) {
    node.text(typeof data.text === "string" ? data.text : "New idea");
    if (Number.isFinite(data.fontSize)) node.fontSize(data.fontSize);
    node.fontStyle(normalizeTextFontStyle(data.fontStyle, node.fontStyle?.() ?? "400"));
    if (typeof data.fill === "string" && data.fill) node.fill(data.fill);
    if (Number.isFinite(data.padding)) node.padding(data.padding);
    node.width(normalizeDimension(data.width, node.width(), MIN_WIDTH));
    node.height(normalizeDimension(data.height, node.height(), MIN_HEIGHT));
    node.lineHeight(Number.isFinite(data.lineHeight) ? data.lineHeight : 1.25);
    node.wrap("word");
    node.verticalAlign("top");
    node.setAttr(
      "textStylePreset",
      normalizeTextStylePresetId(
        data.textStylePreset,
        inferTextStylePresetId({
          fontSize: node.fontSize(),
          fontStyle: node.fontStyle?.(),
          fill: node.fill(),
        }),
      ),
    );
  }
}
