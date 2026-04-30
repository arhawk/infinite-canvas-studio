import {
  BaseComponent,
  ColorEditorField,
  NumberEditorField,
  SelectEditorField,
  TextareaEditorField,
} from "../core/baseClasses.js";
import { UI_FONT_FAMILY } from "../lib/fonts.js";
import { Konva } from "../lib/konva.js";
import {
  DEFAULT_SHAPE_FILL as DEFAULT_FILL,
  DEFAULT_SHAPE_FILL_OPACITY as DEFAULT_FILL_OPACITY,
  DEFAULT_SHAPE_FONT_SIZE as DEFAULT_FONT_SIZE,
  DEFAULT_SHAPE_HEIGHT as DEFAULT_HEIGHT,
  DEFAULT_SHAPE_LINE_HEIGHT as DEFAULT_LINE_HEIGHT,
  DEFAULT_SHAPE_STROKE as DEFAULT_STROKE,
  DEFAULT_SHAPE_TEXT_COLOR as DEFAULT_TEXT_COLOR,
  DEFAULT_SHAPE_WIDTH as DEFAULT_WIDTH,
  MIN_SHAPE_HEIGHT as MIN_HEIGHT,
  MIN_SHAPE_LINE_HEIGHT as MIN_LINE_HEIGHT,
  MIN_SHAPE_WIDTH as MIN_WIDTH,
  SHAPE_TYPES,
  normalizeShapeType,
} from "./shapeModel.js";

export { SHAPE_TYPES, normalizeShapeType } from "./shapeModel.js";

function clampNumber(value, fallback, min = Number.NEGATIVE_INFINITY, max = Number.POSITIVE_INFINITY) {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, value));
}

function normalizeColor(value, fallback) {
  return typeof value === "string" && value ? value : fallback;
}

function normalizeDimension(value, fallback, minimum) {
  return Number.isFinite(value) ? Math.max(minimum, value) : fallback;
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

function getShapeData(node, overrides = {}) {
  const shapeType = normalizeShapeType(overrides.shapeType ?? node.getAttr("shapeType"));
  const defaultHeight = shapeType === "line" ? DEFAULT_LINE_HEIGHT : DEFAULT_HEIGHT;
  const minHeight = shapeType === "line" ? MIN_LINE_HEIGHT : MIN_HEIGHT;
  const fillOpacity = clampNumber(
    overrides.fillOpacity ?? overrides.opacity,
    Number.isFinite(node.getAttr("shapeFillOpacity"))
      ? node.getAttr("shapeFillOpacity")
      : DEFAULT_FILL_OPACITY,
    0,
    1,
  );

  return {
    shapeType,
    width: normalizeDimension(overrides.width, node.width?.() ?? DEFAULT_WIDTH, MIN_WIDTH),
    height: normalizeDimension(overrides.height, node.height?.() ?? defaultHeight, minHeight),
    fill: normalizeColor(overrides.fill, node.getAttr("shapeFill") ?? DEFAULT_FILL),
    fillOpacity,
    stroke: normalizeColor(overrides.stroke, node.getAttr("shapeStroke") ?? DEFAULT_STROKE),
    strokeWidth: clampNumber(
      overrides.strokeWidth,
      Number(node.getAttr("shapeStrokeWidth")) || 2,
      0,
      24,
    ),
    text: typeof overrides.text === "string"
      ? overrides.text
      : String(node.getAttr("shapeText") ?? ""),
    textColor: normalizeColor(overrides.textColor, node.getAttr("shapeTextColor") ?? DEFAULT_TEXT_COLOR),
    fontSize: clampNumber(
      overrides.fontSize,
      Number(node.getAttr("shapeFontSize")) || DEFAULT_FONT_SIZE,
      10,
      96,
    ),
  };
}

function syncShapeVisuals(node, overrides = {}) {
  const data = getShapeData(node, overrides);
  const {
    shapeType,
    width,
    height,
    fill,
    fillOpacity,
    stroke,
    strokeWidth,
    text,
    textColor,
    fontSize,
  } = data;

  node.width(width);
  node.height(height);
  node.setAttrs({
    shapeType,
    shapeFill: fill,
    shapeFillOpacity: fillOpacity,
    shapeStroke: stroke,
    shapeStrokeWidth: strokeWidth,
    shapeText: text,
    shapeTextColor: textColor,
    shapeFontSize: fontSize,
  });

  const rect = node.findOne(".shape-rect");
  const oval = node.findOne(".shape-oval");
  const rhombus = node.findOne(".shape-rhombus");
  const triangle = node.findOne(".shape-triangle");
  const line = node.findOne(".shape-line");
  const label = node.findOne(".shape-text");
  const commonShapeAttrs = {
    stroke,
    strokeWidth,
    opacity: 1,
    listening: true,
  };
  const visibleFill = fillWithOpacity(fill, fillOpacity);

  rect?.setAttrs({
    ...commonShapeAttrs,
    width,
    height,
    fill: visibleFill,
    cornerRadius: 4,
    visible: shapeType === "rectangle",
  });

  oval?.setAttrs({
    ...commonShapeAttrs,
    x: width / 2,
    y: height / 2,
    radiusX: width / 2,
    radiusY: height / 2,
    fill: visibleFill,
    visible: shapeType === "oval",
  });

  rhombus?.setAttrs({
    ...commonShapeAttrs,
    points: [width / 2, 0, width, height / 2, width / 2, height, 0, height / 2],
    fill: visibleFill,
    visible: shapeType === "rhombus",
  });

  triangle?.setAttrs({
    ...commonShapeAttrs,
    points: [width / 2, 0, width, height, 0, height],
    fill: visibleFill,
    visible: shapeType === "triangle",
  });

  line?.setAttrs({
    stroke,
    strokeWidth: Math.max(1, strokeWidth),
    points: [0, height / 2, width, height / 2],
    hitStrokeWidth: Math.max(12, strokeWidth + 8),
    visible: shapeType === "line",
    listening: true,
  });

  if (label) {
    const padding = Math.max(8, strokeWidth + 8);
    label.setAttrs({
      x: padding,
      y: shapeType === "line" ? -height : padding,
      width: Math.max(1, width - padding * 2),
      height: shapeType === "line" ? height * 3 : Math.max(1, height - padding * 2),
      text,
      fontSize,
      fontFamily: UI_FONT_FAMILY,
      fill: textColor,
      align: "center",
      verticalAlign: "middle",
      wrap: "word",
      lineHeight: 1.25,
      listening: false,
    });
  }

  return data;
}

export function applyShapeStyle(node, style = {}) {
  if (node?.getAttr?.("componentType") !== "shape") return null;
  return syncShapeVisuals(node, {
    ...getShapeData(node),
    shapeType: normalizeShapeType(style.shapeType ?? node.getAttr("shapeType")),
    fill: normalizeColor(style.fill, node.getAttr("shapeFill") ?? DEFAULT_FILL),
    fillOpacity: clampNumber(
      style.fillOpacity,
      Number.isFinite(node.getAttr("shapeFillOpacity"))
        ? node.getAttr("shapeFillOpacity")
        : DEFAULT_FILL_OPACITY,
      0,
      1,
    ),
    stroke: normalizeColor(style.stroke, node.getAttr("shapeStroke") ?? DEFAULT_STROKE),
    strokeWidth: clampNumber(
      style.strokeWidth,
      Number(node.getAttr("shapeStrokeWidth")) || 2,
      0,
      24,
    ),
  });
}

function installShapeResize(group) {
  group.off(".shapeResize");
  group.on("transform.shapeResize", () => {
    const scaleX = Math.abs(group.scaleX());
    const scaleY = Math.abs(group.scaleY());
    const data = getShapeData(group);

    group.scale({ x: 1, y: 1 });
    syncShapeVisuals(group, {
      ...data,
      width: data.width * scaleX,
      height: data.height * scaleY,
    });
  });
}

function attachShapeInlineEditor(group) {
  const openInlineEditor = (event = {}) => {
    if (group.getAttr("inlineEditing")) return;

    const stage = group.getStage();
    const app = stage?.getAttr("app");
    const editorTool = app?.getEditorTool?.();
    if (!stage || app?.getMode?.() !== "edit" || !["arrange", "shape"].includes(editorTool)) {
      return;
    }

    const button = event.evt?.button;
    if (button != null && button !== 0) return;

    event.cancelBubble = true;
    event.evt?.preventDefault?.();
    event.evt?.stopPropagation?.();

    const label = group.findOne(".shape-text");
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
    const textBox = label.getClientRect({
      relativeTo: stage,
      skipShadow: true,
      skipStroke: true,
    });
    const groupBox = group.getClientRect({
      relativeTo: stage,
      skipShadow: true,
      skipStroke: true,
    });
    const box = textBox.width > 1 && textBox.height > 1 ? textBox : groupBox;
    const screenPos = app.stageApi.canvasToScreen({
      x: box.x,
      y: box.y,
    });
    const currentText = label.text();

    const area = document.createElement("textarea");
    area.value = currentText;
    area.className = "canvas-text-editor";
    area.dataset.testid = "canvas-shape-text-editor";
    document.body.append(area);

    Object.assign(area.style, {
      left: `${stageBox.left + screenPos.x}px`,
      top: `${stageBox.top + screenPos.y}px`,
      width: `${Math.max(box.width * stageScale, 72)}px`,
      height: `${Math.max(box.height * stageScale, 36)}px`,
      padding: `${Math.max(4 * stageScale, 2)}px`,
      fontFamily: label.fontFamily(),
      fontSize: `${label.fontSize() * stageScale}px`,
      lineHeight: String(label.lineHeight()),
      color: label.fill(),
      textAlign: label.align(),
    });

    area.focus();
    area.select();

    let cancelled = false;
    let committed = false;
    let cleanedUp = false;

    const handleOutsidePointerDown = (pointerEvent) => {
      if (area.contains(pointerEvent.target)) return;
      commit();
    };

    const removeOutsideListeners = () => {
      if (cleanedUp) return;
      cleanedUp = true;
      document.removeEventListener("pointerdown", handleOutsidePointerDown, true);
      document.removeEventListener("mousedown", handleOutsidePointerDown, true);
      document.removeEventListener("touchstart", handleOutsidePointerDown, true);
    };

    const restoreNodeState = () => {
      label.opacity(previousOpacity);
      group.listening(previousListening);
      group.draggable(wasDraggable);
      group.setAttr("inlineEditing", false);
      group.getLayer()?.batchDraw();
    };

    const closeEditor = () => {
      removeOutsideListeners();
      restoreNodeState();
      area.remove();
    };

    const commit = () => {
      if (cancelled || committed) return;
      committed = true;

      const nextText = area.value;
      removeOutsideListeners();
      restoreNodeState();
      if (nextText !== currentText) {
        app.events.emit("node:change:start", { node: group });
        syncShapeVisuals(group, {
          ...getShapeData(group),
          text: nextText,
        });
        app.events.emit("node:changed", { node: group });
      }

      group.getLayer()?.batchDraw();
      area.remove();
    };

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
  group.off(".shapeInlineEditor");
  group.on("click.shapeInlineEditor tap.shapeInlineEditor", openIfSelected);
  group.find(".shape-visual").forEach((visual) => {
    visual.off(".shapeInlineEditor");
    visual.on("click.shapeInlineEditor tap.shapeInlineEditor", openIfSelected);
  });
}

export class ShapeComponent extends BaseComponent {
  static type = "shape";
  static label = "Shape";
  static description = "Resizable geometric shape";

  getEditorTitle() {
    return "Shape";
  }

  editorFields() {
    return [
      new SelectEditorField({
        id: "shapeType",
        label: "Shape",
        options: SHAPE_TYPES,
        getValue: (node) => getShapeData(node).shapeType,
        setValue: (node, value) => syncShapeVisuals(node, {
          ...getShapeData(node),
          shapeType: value,
        }),
      }),
      new TextareaEditorField({
        id: "text",
        label: "Text",
        rows: 4,
        getValue: (node) => getShapeData(node).text,
        setValue: (node, value) => syncShapeVisuals(node, {
          ...getShapeData(node),
          text: value,
        }),
      }),
      new ColorEditorField({
        id: "fill",
        label: "Fill Color",
        getValue: (node) => getShapeData(node).fill,
        setValue: (node, value) => syncShapeVisuals(node, {
          ...getShapeData(node),
          fill: value,
        }),
      }),
      new ColorEditorField({
        id: "stroke",
        label: "Border Color",
        getValue: (node) => getShapeData(node).stroke,
        setValue: (node, value) => syncShapeVisuals(node, {
          ...getShapeData(node),
          stroke: value,
        }),
      }),
      new NumberEditorField({
        id: "strokeWidth",
        label: "Border Width",
        input: { min: 0, max: 24, step: 1 },
        getValue: (node) => getShapeData(node).strokeWidth,
        setValue: (node, value) => syncShapeVisuals(node, {
          ...getShapeData(node),
          strokeWidth: value,
        }),
      }),
      new NumberEditorField({
        id: "fillOpacity",
        label: "Opacity",
        input: { min: 0, max: 1, step: 0.05 },
        getValue: (node) => getShapeData(node).fillOpacity,
        setValue: (node, value) => syncShapeVisuals(node, {
          ...getShapeData(node),
          fillOpacity: value,
        }),
      }),
      new ColorEditorField({
        id: "textColor",
        label: "Text Color",
        getValue: (node) => getShapeData(node).textColor,
        setValue: (node, value) => syncShapeVisuals(node, {
          ...getShapeData(node),
          textColor: value,
        }),
      }),
      new NumberEditorField({
        id: "fontSize",
        label: "Font Size",
        input: { min: 10, max: 96, step: 1 },
        getValue: (node) => getShapeData(node).fontSize,
        setValue: (node, value) => syncShapeVisuals(node, {
          ...getShapeData(node),
          fontSize: value,
        }),
      }),
    ];
  }

  createVisualNode(shapeVisualType, node) {
    node.setAttr("shapeVisualType", shapeVisualType);
    return node;
  }

  async createNode({
    x = 0,
    y = 0,
    width = DEFAULT_WIDTH,
    height = DEFAULT_HEIGHT,
    rotation = 0,
    shapeType = "rectangle",
    fill = DEFAULT_FILL,
    fillOpacity = DEFAULT_FILL_OPACITY,
    stroke = DEFAULT_STROKE,
    strokeWidth = 2,
    opacity = 1,
    text = "",
    textColor = DEFAULT_TEXT_COLOR,
    fontSize = DEFAULT_FONT_SIZE,
    draggable = true,
    listening = true,
    editable = true,
  } = {}) {
    const normalizedType = normalizeShapeType(shapeType);
    const group = new Konva.Group({
      x,
      y,
      width,
      height: normalizedType === "line"
        ? normalizeDimension(height, DEFAULT_LINE_HEIGHT, MIN_LINE_HEIGHT)
        : height,
      rotation,
      opacity: clampNumber(opacity, 1, 0, 1),
      draggable,
      listening,
    });

    group.add(
      this.createVisualNode("rectangle", new Konva.Rect({ name: "shape-visual shape-rect" })),
      this.createVisualNode("oval", new Konva.Ellipse({ name: "shape-visual shape-oval" })),
      this.createVisualNode("rhombus", new Konva.Line({
        name: "shape-visual shape-rhombus",
        closed: true,
      })),
      this.createVisualNode("triangle", new Konva.Line({
        name: "shape-visual shape-triangle",
        closed: true,
      })),
      this.createVisualNode("line", new Konva.Line({
        name: "shape-visual shape-line",
        lineCap: "round",
        lineJoin: "round",
      })),
      new Konva.Text({ name: "shape-text" }),
    );

    syncShapeVisuals(group, {
      shapeType: normalizedType,
      width,
      height,
      fill,
      fillOpacity,
      stroke,
      strokeWidth,
      text,
      textColor,
      fontSize,
    });
    installShapeResize(group);
    if (editable) {
      attachShapeInlineEditor(group);
    }

    return group;
  }

  async createPreviewNode(payload = {}) {
    return this.createNode({
      ...payload,
      draggable: false,
      listening: false,
      editable: false,
    });
  }

  renderPalettePreview(container) {
    container.classList.add("shape-component__palette-preview");
    container.innerHTML = `
      <span class="shape-component__preview-rect"></span>
      <span class="shape-component__preview-circle"></span>
      <span class="shape-component__preview-line"></span>
    `;
  }

  serializeNode(node) {
    const data = getShapeData(node);
    return {
      shapeType: data.shapeType,
      width: data.width,
      height: data.height,
      fill: data.fill,
      fillOpacity: data.fillOpacity,
      stroke: data.stroke,
      strokeWidth: data.strokeWidth,
      text: data.text,
      textColor: data.textColor,
      fontSize: data.fontSize,
    };
  }

  async applySerializedData(node, data = {}) {
    syncShapeVisuals(node, data);
    installShapeResize(node);
    attachShapeInlineEditor(node);
  }
}

export {
  DEFAULT_FILL as DEFAULT_SHAPE_FILL,
  DEFAULT_FILL_OPACITY as DEFAULT_SHAPE_FILL_OPACITY,
  DEFAULT_FONT_SIZE as DEFAULT_SHAPE_FONT_SIZE,
  DEFAULT_HEIGHT as DEFAULT_SHAPE_HEIGHT,
  DEFAULT_LINE_HEIGHT as DEFAULT_SHAPE_LINE_HEIGHT,
  DEFAULT_STROKE as DEFAULT_SHAPE_STROKE,
  DEFAULT_TEXT_COLOR as DEFAULT_SHAPE_TEXT_COLOR,
  DEFAULT_WIDTH as DEFAULT_SHAPE_WIDTH,
  MIN_HEIGHT as MIN_SHAPE_HEIGHT,
  MIN_LINE_HEIGHT as MIN_SHAPE_LINE_HEIGHT,
  MIN_WIDTH as MIN_SHAPE_WIDTH,
  getShapeData,
  syncShapeVisuals,
};
