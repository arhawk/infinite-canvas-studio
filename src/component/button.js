import {
  BaseComponent,
  ColorEditorField,
  NumberEditorField,
  TextEditorField,
} from "../core/baseClasses.js";
import { DISPLAY_FONT_FAMILY } from "../lib/fonts.js";
import { Konva } from "../lib/konva.js";

const DEFAULT_WIDTH = 132;
const DEFAULT_HEIGHT = 44;
const MIN_WIDTH = 84;
const MIN_HEIGHT = 32;
const DEFAULT_LABEL = "Jump";
const DEFAULT_FILL = "#f7e7c6";
const DEFAULT_STROKE = "#b9782f";
const DEFAULT_TEXT_COLOR = "#5b3b12";

function normalizeDimension(value, fallback, minimum) {
  return Number.isFinite(value) ? Math.max(minimum, value) : fallback;
}

function syncButtonVisuals(node, data = {}) {
  const width = normalizeDimension(data.width, DEFAULT_WIDTH, MIN_WIDTH);
  const height = normalizeDimension(data.height, DEFAULT_HEIGHT, MIN_HEIGHT);
  const label = typeof data.label === "string" && data.label.trim()
    ? data.label.trim()
    : DEFAULT_LABEL;
  const fill = typeof data.fill === "string" && data.fill
    ? data.fill
    : DEFAULT_FILL;
  const stroke = typeof data.stroke === "string" && data.stroke
    ? data.stroke
    : DEFAULT_STROKE;
  const textColor = typeof data.textColor === "string" && data.textColor
    ? data.textColor
    : DEFAULT_TEXT_COLOR;

  const background = node.findOne(".button-bg");
  const labelNode = node.findOne(".button-label");

  node.width(width);
  node.height(height);

  if (background) {
    background.width(width);
    background.height(height);
    background.fill(fill);
    background.stroke(stroke);
    background.cornerRadius(Math.min(18, height / 2));
  }

  if (labelNode) {
    labelNode.width(width);
    labelNode.height(height);
    labelNode.text(label);
    labelNode.fill(textColor);
  }
}

function installButtonResize(group) {
  group.on("transform.buttonResize", () => {
    const background = group.findOne(".button-bg");
    const labelNode = group.findOne(".button-label");
    const scaleX = Math.abs(group.scaleX());
    const scaleY = Math.abs(group.scaleY());
    const currentWidth = background?.width() ?? group.width() ?? DEFAULT_WIDTH;
    const currentHeight = background?.height() ?? group.height() ?? DEFAULT_HEIGHT;

    group.scale({ x: 1, y: 1 });
    syncButtonVisuals(group, {
      width: currentWidth * scaleX,
      height: currentHeight * scaleY,
      label: labelNode?.text() ?? DEFAULT_LABEL,
      fill: background?.fill() ?? DEFAULT_FILL,
      stroke: background?.stroke() ?? DEFAULT_STROKE,
      textColor: labelNode?.fill() ?? DEFAULT_TEXT_COLOR,
    });
  });
}

export class ButtonComponent extends BaseComponent {
  static type = "button";
  static label = "Button";
  static description = "Presentation button that jumps to a connected focus";

  getEditorTitle() {
    return "Button";
  }

  editorFields() {
    return [
      new TextEditorField({
        id: "label",
        label: "Label",
        getValue: (node) => node.findOne(".button-label")?.text() ?? DEFAULT_LABEL,
        setValue: (node, value) => {
          const current = this.serializeNode(node);
          syncButtonVisuals(node, {
            ...current,
            label: value || DEFAULT_LABEL,
          });
        },
      }),
      new NumberEditorField({
        id: "width",
        label: "Width",
        input: { min: MIN_WIDTH, max: 480, step: 1 },
        getValue: (node) => this.serializeNode(node).width,
        setValue: (node, value) => {
          const current = this.serializeNode(node);
          syncButtonVisuals(node, {
            ...current,
            width: value,
          });
        },
      }),
      new NumberEditorField({
        id: "height",
        label: "Height",
        input: { min: MIN_HEIGHT, max: 240, step: 1 },
        getValue: (node) => this.serializeNode(node).height,
        setValue: (node, value) => {
          const current = this.serializeNode(node);
          syncButtonVisuals(node, {
            ...current,
            height: value,
          });
        },
      }),
      new ColorEditorField({
        id: "fill",
        label: "Button Color",
        getValue: (node) => node.findOne(".button-bg")?.fill() ?? DEFAULT_FILL,
        setValue: (node, value) => {
          const current = this.serializeNode(node);
          syncButtonVisuals(node, {
            ...current,
            fill: value,
          });
        },
      }),
      new ColorEditorField({
        id: "stroke",
        label: "Border Color",
        getValue: (node) => node.findOne(".button-bg")?.stroke() ?? DEFAULT_STROKE,
        setValue: (node, value) => {
          const current = this.serializeNode(node);
          syncButtonVisuals(node, {
            ...current,
            stroke: value,
          });
        },
      }),
      new ColorEditorField({
        id: "textColor",
        label: "Text Color",
        getValue: (node) => node.findOne(".button-label")?.fill() ?? DEFAULT_TEXT_COLOR,
        setValue: (node, value) => {
          const current = this.serializeNode(node);
          syncButtonVisuals(node, {
            ...current,
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
    label = DEFAULT_LABEL,
    fill = DEFAULT_FILL,
    stroke = DEFAULT_STROKE,
    textColor = DEFAULT_TEXT_COLOR,
  } = {}) {
    const group = new Konva.Group({
      x,
      y,
      width,
      height,
      draggable: true,
      name: "button-root",
    });

    const background = new Konva.Rect({
      width,
      height,
      fill,
      stroke,
      strokeWidth: 2,
      cornerRadius: 18,
      shadowColor: "rgba(54, 41, 25, 0.16)",
      shadowBlur: 14,
      shadowOffsetY: 8,
      shadowOpacity: 0.3,
      name: "button-bg",
    });

    const labelNode = new Konva.Text({
      width,
      height,
      text: label,
      align: "center",
      verticalAlign: "middle",
      fontSize: 16,
      fontFamily: DISPLAY_FONT_FAMILY,
      fontStyle: "700",
      fill: textColor,
      name: "button-label",
      listening: true,
    });

    group.add(background, labelNode);
    installButtonResize(group);
    syncButtonVisuals(group, {
      width,
      height,
      label,
      fill,
      stroke,
      textColor,
    });
    return group;
  }

  onCreated(node) {
    node.setAttr("transformLocked", false);
  }

  serializeNode(node) {
    const background = node.findOne(".button-bg");
    const labelNode = node.findOne(".button-label");

    return {
      width: background?.width() ?? node.width() ?? DEFAULT_WIDTH,
      height: background?.height() ?? node.height() ?? DEFAULT_HEIGHT,
      label: labelNode?.text() ?? DEFAULT_LABEL,
      fill: background?.fill() ?? DEFAULT_FILL,
      stroke: background?.stroke() ?? DEFAULT_STROKE,
      textColor: labelNode?.fill() ?? DEFAULT_TEXT_COLOR,
    };
  }

  async applySerializedData(node, data = {}) {
    node.setAttr("transformLocked", false);
    syncButtonVisuals(node, data);
  }
}
