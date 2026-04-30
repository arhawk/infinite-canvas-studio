import {
  BaseComponent,
  ColorEditorField,
  NumberEditorField,
  SelectEditorField,
  TextEditorField,
} from "../core/baseClasses.js";
import { DISPLAY_FONT_FAMILY } from "../lib/fonts.js";
import { Konva } from "../lib/konva.js";
import { SHAPE_TYPES } from "./shape.js";

const DEFAULT_WIDTH = 132;
const DEFAULT_HEIGHT = 44;
const MIN_WIDTH = 84;
const MIN_HEIGHT = 32;
const DEFAULT_LABEL = "Jump";
const DEFAULT_FILL = "#f7e7c6";
const DEFAULT_STROKE = "#b9782f";
const DEFAULT_TEXT_COLOR = "#5b3b12";
const DEFAULT_SHAPE_TYPE = "rounded";
const DEFAULT_FONT_SIZE = 16;
const BUTTON_SHAPE_TYPES = [
  { value: DEFAULT_SHAPE_TYPE, label: "Rounded" },
  ...SHAPE_TYPES.filter((entry) => entry.value !== "line"),
];
const BUTTON_STROKE_WIDTH = 2;
const DEFAULT_FILL_OPACITY = 1;
const BUTTON_SHADOW = {
  shadowColor: "rgba(54, 41, 25, 0.16)",
  shadowBlur: 14,
  shadowOffsetY: 8,
  shadowOpacity: 0.3,
};

function normalizeDimension(value, fallback, minimum) {
  return Number.isFinite(value) ? Math.max(minimum, value) : fallback;
}

function normalizeButtonShapeType(value) {
  return BUTTON_SHAPE_TYPES.some((entry) => entry.value === value)
    ? value
    : DEFAULT_SHAPE_TYPE;
}

function normalizeColor(value, fallback) {
  return typeof value === "string" && value ? value : fallback;
}

function clampNumber(value, fallback, min = Number.NEGATIVE_INFINITY, max = Number.POSITIVE_INFINITY) {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, value));
}

function fillWithOpacity(color, opacity) {
  const alpha = clampNumber(opacity, DEFAULT_FILL_OPACITY, 0, 1);
  if (alpha >= 1) return color;

  const hex = typeof color === "string" ? color.trim() : "";
  const shortMatch = hex.match(/^#([0-9a-f]{3})$/i);
  const longMatch = hex.match(/^#([0-9a-f]{6})$/i);
  const digits = shortMatch
    ? shortMatch[1].split("").map((char) => `${char}${char}`).join("")
    : longMatch?.[1] ?? null;

  if (!digits) {
    return alpha <= 0 ? "rgba(0, 0, 0, 0)" : color;
  }

  const red = Number.parseInt(digits.slice(0, 2), 16);
  const green = Number.parseInt(digits.slice(2, 4), 16);
  const blue = Number.parseInt(digits.slice(4, 6), 16);
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

function getButtonData(node, overrides = {}) {
  const background = node.findOne?.(".button-bg");
  const labelNode = node.findOne?.(".button-label");
  const currentLabel = labelNode?.text?.();
  const currentStrokeWidth = node.getAttr?.("buttonStrokeWidth");

  return {
    shapeType: normalizeButtonShapeType(
      overrides.shapeType ?? node.getAttr?.("buttonShapeType"),
    ),
    width: normalizeDimension(
      overrides.width,
      background?.width?.() ?? node.width?.() ?? DEFAULT_WIDTH,
      MIN_WIDTH,
    ),
    height: normalizeDimension(
      overrides.height,
      background?.height?.() ?? node.height?.() ?? DEFAULT_HEIGHT,
      MIN_HEIGHT,
    ),
    label: typeof overrides.label === "string"
      ? overrides.label.trim() || DEFAULT_LABEL
      : currentLabel?.trim?.() || DEFAULT_LABEL,
    fill: normalizeColor(
      overrides.fill,
      node.getAttr?.("buttonFill") ?? background?.fill?.() ?? DEFAULT_FILL,
    ),
    stroke: normalizeColor(
      overrides.stroke,
      node.getAttr?.("buttonStroke") ?? background?.stroke?.() ?? DEFAULT_STROKE,
    ),
    strokeWidth: clampNumber(
      Number(overrides.strokeWidth),
      Number.isFinite(currentStrokeWidth) ? currentStrokeWidth : BUTTON_STROKE_WIDTH,
      0,
      24,
    ),
    fillOpacity: clampNumber(
      Number(overrides.fillOpacity),
      Number.isFinite(node.getAttr?.("buttonFillOpacity"))
        ? node.getAttr("buttonFillOpacity")
        : DEFAULT_FILL_OPACITY,
      0,
      1,
    ),
    textColor: normalizeColor(
      overrides.textColor,
      node.getAttr?.("buttonTextColor") ?? labelNode?.fill?.() ?? DEFAULT_TEXT_COLOR,
    ),
    fontSize: clampNumber(
      Number(overrides.fontSize),
      Number.isFinite(node.getAttr?.("buttonFontSize"))
        ? node.getAttr("buttonFontSize")
        : labelNode?.fontSize?.() ?? DEFAULT_FONT_SIZE,
      8,
      72,
    ),
  };
}

function syncButtonVisuals(node, data = {}) {
  const {
    shapeType,
    width,
    height,
    label,
    fill,
    stroke,
    strokeWidth,
    fillOpacity,
    textColor,
    fontSize,
  } = getButtonData(node, data);

  const background = node.findOne(".button-bg");
  const rounded = node.findOne(".button-rounded");
  const rectangle = node.findOne(".button-rectangle");
  const oval = node.findOne(".button-oval");
  const rhombus = node.findOne(".button-rhombus");
  const triangle = node.findOne(".button-triangle");
  const labelNode = node.findOne(".button-label");
  const commonVisualAttrs = {
    ...BUTTON_SHADOW,
    fill: fillWithOpacity(fill, fillOpacity),
    stroke,
    strokeWidth,
    listening: true,
  };

  node.width(width);
  node.height(height);
  node.setAttrs({
    buttonShapeType: shapeType,
    buttonFill: fill,
    buttonFillOpacity: fillOpacity,
    buttonStroke: stroke,
    buttonStrokeWidth: strokeWidth,
    buttonTextColor: textColor,
    buttonFontSize: fontSize,
  });

  if (background) {
    background.setAttrs({
      width,
      height,
      fill,
      stroke,
      strokeWidth: 0,
      opacity: 0,
      cornerRadius: 0,
      listening: true,
    });
  }

  rounded?.setAttrs({
    ...commonVisualAttrs,
    width,
    height,
    cornerRadius: Math.min(18, height / 2),
    visible: shapeType === "rounded",
  });

  rectangle?.setAttrs({
    ...commonVisualAttrs,
    width,
    height,
    cornerRadius: 4,
    visible: shapeType === "rectangle",
  });

  oval?.setAttrs({
    ...commonVisualAttrs,
    x: width / 2,
    y: height / 2,
    radiusX: width / 2,
    radiusY: height / 2,
    visible: shapeType === "oval",
  });

  rhombus?.setAttrs({
    ...commonVisualAttrs,
    points: [width / 2, 0, width, height / 2, width / 2, height, 0, height / 2],
    visible: shapeType === "rhombus",
  });

  triangle?.setAttrs({
    ...commonVisualAttrs,
    points: [width / 2, 0, width, height, 0, height],
    visible: shapeType === "triangle",
  });

  if (labelNode) {
    labelNode.width(width);
    labelNode.height(height);
    labelNode.text(label);
    labelNode.fill(textColor);
    labelNode.fontSize(fontSize);
  }
}

function applyButtonStyle(node, style = {}) {
  if (node?.getAttr?.("componentType") !== "button") return null;
  const current = getButtonData(node);

  return syncButtonVisuals(node, {
    ...current,
    shapeType: normalizeButtonShapeType(style.shapeType ?? current.shapeType),
    fill: normalizeColor(style.fill, current.fill),
    fillOpacity: clampNumber(Number(style.fillOpacity), current.fillOpacity, 0, 1),
    stroke: normalizeColor(style.stroke, current.stroke),
    strokeWidth: clampNumber(Number(style.strokeWidth), current.strokeWidth, 0, 24),
    textColor: normalizeColor(style.textColor, current.textColor),
    fontSize: clampNumber(Number(style.fontSize), current.fontSize, 8, 72),
  });
}

export {
  BUTTON_SHAPE_TYPES,
  BUTTON_STROKE_WIDTH as DEFAULT_BUTTON_STROKE_WIDTH,
  DEFAULT_FILL as DEFAULT_BUTTON_FILL,
  DEFAULT_FILL_OPACITY as DEFAULT_BUTTON_FILL_OPACITY,
  DEFAULT_FONT_SIZE as DEFAULT_BUTTON_FONT_SIZE,
  DEFAULT_SHAPE_TYPE as DEFAULT_BUTTON_SHAPE_TYPE,
  DEFAULT_STROKE as DEFAULT_BUTTON_STROKE,
  DEFAULT_TEXT_COLOR as DEFAULT_BUTTON_TEXT_COLOR,
  applyButtonStyle,
  getButtonData,
  normalizeButtonShapeType,
  syncButtonVisuals,
};

function installButtonResize(group) {
  group.off(".buttonResize");
  group.on("transform.buttonResize", () => {
    const scaleX = Math.abs(group.scaleX());
    const scaleY = Math.abs(group.scaleY());
    const data = getButtonData(group);

    group.scale({ x: 1, y: 1 });
    syncButtonVisuals(group, {
      ...data,
      width: data.width * scaleX,
      height: data.height * scaleY,
    });
  });
}

function attachButtonInlineEditor(group) {
  const openInlineEditor = (event = {}) => {
    if (group.getAttr("inlineEditing")) return;

    const stage = group.getStage();
    const app = stage?.getAttr("app");
    if (!stage || !app?.modeManager?.matches?.({ mode: "edit", editorTool: "arrange" })) {
      return;
    }

    const button = event.evt?.button;
    if (button != null && button !== 0) return;

    event.cancelBubble = true;
    event.evt?.preventDefault?.();
    event.evt?.stopPropagation?.();

    const label = group.findOne(".button-label");
    if (!label) return;

    group.setAttr("inlineEditing", true);
    const previousOpacity = label.opacity();
    const previousListening = group.listening();
    const wasDraggable = group.draggable();
    group.stopDrag();
    group.draggable(false);
    label.opacity(0);
    group.listening(false);
    group.getLayer()?.batchDraw();

    const stageBox = stage.container().getBoundingClientRect();
    const stageScale = app.stageApi?.getScale?.() ?? stage.scaleX();
    const anchorNode = group.findOne(".button-bg") ?? group;
    const buttonBox = anchorNode.getClientRect({
      relativeTo: stage,
      skipShadow: true,
      skipStroke: true,
    });
    const currentText = label.text();

    const area = document.createElement("textarea");
    area.value = currentText;
    area.className = "canvas-text-editor";
    area.dataset.testid = "canvas-button-text-editor";
    area.rows = 1;
    document.body.append(area);

    const measureText = (value) => {
      const lines = String(value || DEFAULT_LABEL).split(/\r?\n/);
      const widestLine = lines.reduce((widest, line) => (line.length > widest.length ? line : widest), "");
      const measured = label.measureSize?.(widestLine || DEFAULT_LABEL);
      const fallbackWidth = Math.max((widestLine.length || 1) * label.fontSize() * 0.58, label.fontSize() * 1.6);
      return {
        width: measured?.width ?? fallbackWidth,
        lines: Math.max(lines.length, 1),
      };
    };

    const syncEditorSize = () => {
      const padding = Math.max(5 * stageScale, 3);
      const lineHeight = label.fontSize() * label.lineHeight();
      const textSize = measureText(area.value);
      const maxWidth = Math.max((buttonBox.width - 12) * stageScale, 56);
      const maxHeight = Math.max((buttonBox.height - 8) * stageScale, lineHeight * stageScale + padding * 2);
      const width = Math.min(
        Math.max(textSize.width * stageScale + padding * 2, 58),
        maxWidth,
      );
      const height = Math.min(
        Math.max(lineHeight * textSize.lines * stageScale + padding * 2, 28),
        maxHeight,
      );
      const screenPos = app.stageApi.canvasToScreen({
        x: buttonBox.x + buttonBox.width / 2,
        y: buttonBox.y + buttonBox.height / 2,
      });

      Object.assign(area.style, {
        left: `${stageBox.left + screenPos.x - width / 2}px`,
        top: `${stageBox.top + screenPos.y - height / 2}px`,
        width: `${width}px`,
        height: `${height}px`,
        padding: `${padding}px`,
      });
    };

    Object.assign(area.style, {
      fontFamily: label.fontFamily(),
      fontSize: `${label.fontSize() * stageScale}px`,
      lineHeight: String(label.lineHeight()),
      color: label.fill(),
      textAlign: label.align(),
    });
    syncEditorSize();

    area.focus();
    area.select();

    let cancelled = false;
    let committed = false;
    let cleanedUp = false;

    const restoreNodeState = () => {
      label.opacity(previousOpacity);
      group.listening(previousListening);
      group.draggable(wasDraggable);
      group.setAttr("inlineEditing", false);
      group.getLayer()?.batchDraw();
    };

    const removeOutsideListeners = () => {
      if (cleanedUp) return;
      cleanedUp = true;
      document.removeEventListener("pointerdown", handleOutsidePointerDown, true);
      document.removeEventListener("mousedown", handleOutsidePointerDown, true);
      document.removeEventListener("touchstart", handleOutsidePointerDown, true);
    };

    const closeEditor = () => {
      removeOutsideListeners();
      restoreNodeState();
      area.remove();
    };

    const commit = () => {
      if (cancelled || committed) return;
      committed = true;

      const nextText = area.value.trim() || DEFAULT_LABEL;
      removeOutsideListeners();
      restoreNodeState();
      if (nextText !== currentText) {
        app.events.emit("node:change:start", { node: group });
        syncButtonVisuals(group, {
          ...getButtonData(group),
          label: nextText,
        });
        app.events.emit("node:changed", { node: group });
      }

      group.getLayer()?.batchDraw();
      area.remove();
    };

    function handleOutsidePointerDown(pointerEvent) {
      if (area.contains(pointerEvent.target)) return;
      commit();
    }

    document.addEventListener("pointerdown", handleOutsidePointerDown, true);
    document.addEventListener("mousedown", handleOutsidePointerDown, true);
    document.addEventListener("touchstart", handleOutsidePointerDown, true);

    area.addEventListener("keydown", (keyboardEvent) => {
      if (keyboardEvent.key === "Escape") {
        cancelled = true;
        closeEditor();
        return;
      }

      if ((keyboardEvent.metaKey || keyboardEvent.ctrlKey) && keyboardEvent.key === "Enter") {
        keyboardEvent.preventDefault();
        commit();
      }
    });

    area.addEventListener("input", syncEditorSize);
    area.addEventListener("blur", commit, { once: true });
  };

  const openIfSelected = (event = {}) => {
    const stage = group.getStage();
    const app = stage?.getAttr("app");
    const selectedNodes = app?.getPlugin?.("selection")?.getSelectedNodes?.() ?? [];
    if (selectedNodes.length !== 1 || selectedNodes[0] !== group) return;
    openInlineEditor(event);
  };

  group.openInlineEditor = openInlineEditor;
  group.off(".buttonInlineEditor");
  group.on("click.buttonInlineEditor tap.buttonInlineEditor", openIfSelected);
  group.find(".button-visual").forEach((visual) => {
    visual.off(".buttonInlineEditor");
    visual.on("click.buttonInlineEditor tap.buttonInlineEditor", openIfSelected);
  });
  const label = group.findOne(".button-label");
  label?.off(".buttonInlineEditor");
  label?.on("click.buttonInlineEditor tap.buttonInlineEditor", openIfSelected);
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
      new SelectEditorField({
        id: "shapeType",
        label: "Shape",
        options: BUTTON_SHAPE_TYPES,
        getValue: (node) => getButtonData(node).shapeType,
        setValue: (node, value) => {
          const current = this.serializeNode(node);
          syncButtonVisuals(node, {
            ...current,
            shapeType: value,
          });
        },
      }),
      new NumberEditorField({
        id: "fontSize",
        label: "Font Size",
        input: { min: 8, max: 72, step: 1 },
        getValue: (node) => getButtonData(node).fontSize,
        setValue: (node, value) => {
          const current = this.serializeNode(node);
          syncButtonVisuals(node, {
            ...current,
            fontSize: value,
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
        getValue: (node) => getButtonData(node).fill,
        setValue: (node, value) => {
          const current = this.serializeNode(node);
          syncButtonVisuals(node, {
            ...current,
            fill: value,
          });
        },
      }),
      new NumberEditorField({
        id: "fillOpacity",
        label: "Button Opacity",
        input: { min: 0, max: 1, step: 0.05 },
        getValue: (node) => getButtonData(node).fillOpacity,
        setValue: (node, value) => {
          const current = this.serializeNode(node);
          syncButtonVisuals(node, {
            ...current,
            fillOpacity: value,
          });
        },
      }),
      new ColorEditorField({
        id: "stroke",
        label: "Border Color",
        getValue: (node) => getButtonData(node).stroke,
        setValue: (node, value) => {
          const current = this.serializeNode(node);
          syncButtonVisuals(node, {
            ...current,
            stroke: value,
          });
        },
      }),
      new NumberEditorField({
        id: "strokeWidth",
        label: "Border Width",
        input: { min: 0, max: 24, step: 1 },
        getValue: (node) => getButtonData(node).strokeWidth,
        setValue: (node, value) => {
          const current = this.serializeNode(node);
          syncButtonVisuals(node, {
            ...current,
            strokeWidth: value,
          });
        },
      }),
      new ColorEditorField({
        id: "textColor",
        label: "Text Color",
        getValue: (node) => getButtonData(node).textColor,
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
    fillOpacity = DEFAULT_FILL_OPACITY,
    stroke = DEFAULT_STROKE,
    strokeWidth = BUTTON_STROKE_WIDTH,
    textColor = DEFAULT_TEXT_COLOR,
    fontSize = DEFAULT_FONT_SIZE,
    shapeType = DEFAULT_SHAPE_TYPE,
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
      strokeWidth: 0,
      opacity: 0,
      name: "button-bg",
    });

    const rounded = new Konva.Rect({
      name: "button-visual button-rounded",
    });
    const rectangle = new Konva.Rect({
      name: "button-visual button-rectangle",
    });
    const oval = new Konva.Ellipse({
      name: "button-visual button-oval",
    });
    const rhombus = new Konva.Line({
      name: "button-visual button-rhombus",
      closed: true,
    });
    const triangle = new Konva.Line({
      name: "button-visual button-triangle",
      closed: true,
    });

    const labelNode = new Konva.Text({
      width,
      height,
      text: label,
      align: "center",
      verticalAlign: "middle",
      fontSize,
      fontFamily: DISPLAY_FONT_FAMILY,
      fontStyle: "700",
      fill: textColor,
      name: "button-label",
      listening: true,
    });

    group.add(background, rounded, rectangle, oval, rhombus, triangle, labelNode);
    installButtonResize(group);
    attachButtonInlineEditor(group);
    syncButtonVisuals(group, {
      shapeType,
      width,
      height,
      label,
      fill,
      fillOpacity,
      stroke,
      strokeWidth,
      textColor,
      fontSize,
    });
    return group;
  }

  onCreated(node) {
    node.setAttr("transformLocked", false);
  }

  serializeNode(node) {
    return getButtonData(node);
  }

  async applySerializedData(node, data = {}) {
    node.setAttr("transformLocked", false);
    syncButtonVisuals(node, data);
    installButtonResize(node);
    attachButtonInlineEditor(node);
  }
}
