import { Konva } from "../lib/konva.js";
import { DISPLAY_FONT_FAMILY } from "../lib/fonts.js";
import { BaseComponent } from "../core/baseClasses.js";
import { EditableTextBehavior } from "./editableText.js";

const PAGE_WIDTH = 960;
const PAGE_HEIGHT = 540;
const PAGE_VIEW_PADDING = 24;
const MIN_PAGE_WIDTH = 320;
const MIN_PAGE_HEIGHT = 220;
const PAGE_HEADER_HEIGHT = 56;
const DEFAULT_PAGE_LABEL = "New Page";
export const DEFAULT_PAGE_FILL_OPACITY = 1;

function clamp01(value, fallback = 1) {
  if (!Number.isFinite(value)) return fallback;
  if (value <= 0) return 0;
  if (value >= 1) return 1;
  return value;
}

function fillWithOpacity(color, opacity) {
  const alpha = clamp01(opacity, DEFAULT_PAGE_FILL_OPACITY);
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

function syncPageHeader(node, {
  width,
  label,
  headerLineStroke,
} = {}) {
  const headerLine = node.findOne(".page-header-line");
  const labelNode = node.findOne(".page-label");
  const resolvedWidth = Number.isFinite(width) ? Math.max(MIN_PAGE_WIDTH, width) : PAGE_WIDTH;

  if (headerLine) {
    headerLine.points([0, PAGE_HEADER_HEIGHT, resolvedWidth, PAGE_HEADER_HEIGHT]);
    if (typeof headerLineStroke === "string" && headerLineStroke) {
      headerLine.stroke(headerLineStroke);
    }
  }

  if (labelNode) {
    labelNode.width(resolvedWidth);
    labelNode.height(PAGE_HEADER_HEIGHT);
    labelNode.wrap("none");
    labelNode.ellipsis(true);
    labelNode.text(typeof label === "string" && label ? label : DEFAULT_PAGE_LABEL);
  }
}

function getDefaultPageScale(app, width, height) {
  const screen = app.stageApi.getScreenSize();
  const scale = Math.min(
    1,
    (screen.width - PAGE_VIEW_PADDING * 2) / width,
    (screen.height - PAGE_VIEW_PADDING * 2) / height,
  );

  return Math.max(0.1, scale);
}

export class PageComponent extends BaseComponent {
  static type = "page";
  static label = "Page";
  static description = "Fixed-size page that can contain other components";
  static attachments = true;
  static palette = true;

  getEditorTitle() {
    return "Page";
  }

  async createNode({
    x,
    y,
    width = PAGE_WIDTH,
    height = PAGE_HEIGHT,
    label = DEFAULT_PAGE_LABEL,
  }) {
    const group = new Konva.Group({
      x,
      y,
      width,
      height,
      draggable: true,
      name: "selectable container-root page-root",
    });

    const rect = new Konva.Rect({
      width,
      height,
      fill: "#fffdf8",
      stroke: "#c9b393",
      strokeWidth: 2,
      cornerRadius: 18,
      shadowColor: "rgba(54, 41, 25, 0.16)",
      shadowBlur: 28,
      shadowOffsetY: 12,
      shadowOpacity: 0.4,
      perfectDrawEnabled: false,
      name: "container-bg page-bg",
    });

    const headerLine = new Konva.Line({
      points: [0, PAGE_HEADER_HEIGHT, width, PAGE_HEADER_HEIGHT],
      stroke: "rgba(171, 79, 40, 0.12)",
      strokeWidth: 1,
      listening: false,
      name: "page-header-line",
    });

    const text = new Konva.Text({
      x: 0,
      y: 0,
      text: label,
      width,
      height: PAGE_HEADER_HEIGHT,
      fontSize: 16,
      fontFamily: DISPLAY_FONT_FAMILY,
      fontStyle: "700",
      fill: "#ab4f28",
      padding: 16,
      wrap: "none",
      ellipsis: true,
      name: "container-label page-label",
      listening: true,
    });
    EditableTextBehavior.attach(text, {
      fallbackText: DEFAULT_PAGE_LABEL,
      getHistoryNode: () => group,
    });

    group.add(rect, headerLine, text);
    syncPageHeader(group, { width, label });
    group.on("transform.pageResize", () => {
      const scaleX = Math.abs(group.scaleX());
      const scaleY = Math.abs(group.scaleY());
      group.scale({ x: 1, y: 1 });

      const nextWidth = Math.max(MIN_PAGE_WIDTH, rect.width() * scaleX);
      const nextHeight = Math.max(MIN_PAGE_HEIGHT, rect.height() * scaleY);

      rect.width(nextWidth);
      rect.height(nextHeight);
      group.width(nextWidth);
      group.height(nextHeight);
      syncPageHeader(group, {
        width: nextWidth,
        label: text.text(),
        headerLineStroke: headerLine.stroke(),
      });
    });
    return group;
  }

  onCreated(node, payload = {}) {
    const width = Number.isFinite(payload.width) ? payload.width : PAGE_WIDTH;
    const height = Number.isFinite(payload.height) ? payload.height : PAGE_HEIGHT;
    const fill = typeof payload.fill === "string" && payload.fill ? payload.fill : "#fffdf8";
    const fillOpacity = clamp01(payload.fillOpacity, DEFAULT_PAGE_FILL_OPACITY);

    node.setAttrs({
      transformLocked: false,
      pageFill: fill,
      pageFillOpacity: fillOpacity,
      focusPositionMode: "relative",
      savedFocus: {
        positionMode: "relative",
        offset: { x: 0, y: 0 },
        scale: getDefaultPageScale(this.app, width, height),
      },
    });
    node.findOne(".container-bg")?.fill(fillWithOpacity(fill, fillOpacity));
    node.opacity(1);
  }

  serializeNode(node) {
    const rect = node.findOne(".container-bg");
    const labelNode = node.findOne(".container-label");
    const base = {
      width: rect?.width() ?? node.width() ?? PAGE_WIDTH,
      height: rect?.height() ?? node.height() ?? PAGE_HEIGHT,
      label: labelNode?.text() ?? DEFAULT_PAGE_LABEL,
      stroke: rect?.stroke() ?? "#c9b393",
      fill: rect?.fill() ?? "#fffdf8",
      labelColor: labelNode?.fill() ?? "#ab4f28",
    };
    const headerLine = node.findOne(".page-header-line");
    const background = node.findOne(".container-bg");

    return {
      ...base,
      fill: node.getAttr("pageFill") ?? base.fill,
      fillOpacity: clamp01(
        node.getAttr("pageFillOpacity"),
        Number.isFinite(node.opacity?.()) ? node.opacity() : DEFAULT_PAGE_FILL_OPACITY,
      ),
      renderedFill: background?.fill() ?? base.fill,
      headerLineStroke: headerLine?.stroke() ?? "rgba(171, 79, 40, 0.12)",
    };
  }

  async applySerializedData(node, data = {}) {
    const rect = node.findOne(".container-bg");
    const labelNode = node.findOne(".container-label");

    if (rect) {
      if (Number.isFinite(data.width)) rect.width(data.width);
      if (Number.isFinite(data.height)) rect.height(data.height);
      if (typeof data.stroke === "string" && data.stroke) rect.stroke(data.stroke);
    }

    node.width(Number.isFinite(data.width) ? data.width : node.width());
    node.height(Number.isFinite(data.height) ? data.height : node.height());

    if (labelNode) {
      labelNode.text(data.label || DEFAULT_PAGE_LABEL);
      if (typeof data.labelColor === "string" && data.labelColor) {
        labelNode.fill(data.labelColor);
      } else if (typeof data.stroke === "string" && data.stroke) {
        labelNode.fill(data.stroke);
      }
    }

    const background = node.findOne(".container-bg");
    const fill = typeof data.fill === "string" && data.fill
      ? data.fill
      : node.getAttr("pageFill") ?? "#fffdf8";
    const fillOpacity = clamp01(data.fillOpacity, DEFAULT_PAGE_FILL_OPACITY);
    node.setAttr("pageFill", fill);
    node.setAttr("pageFillOpacity", fillOpacity);
    background?.fill(fillWithOpacity(fill, fillOpacity));

    const width = Number.isFinite(data.width) ? data.width : PAGE_WIDTH;
    syncPageHeader(node, {
      width,
      label: data.label,
      headerLineStroke: data.headerLineStroke,
    });
  }

  applySerializedState(node, snapshot = {}) {
    super.applySerializedState(node, snapshot);
    const fillOpacity = clamp01(snapshot?.data?.fillOpacity, DEFAULT_PAGE_FILL_OPACITY);
    const fill = node.getAttr("pageFill") ?? node.findOne(".container-bg")?.fill?.() ?? "#fffdf8";
    node.setAttr("pageFill", fill);
    node.setAttr("pageFillOpacity", fillOpacity);
    node.findOne(".container-bg")?.fill(fillWithOpacity(fill, fillOpacity));
    node.opacity(1);
  }
}
