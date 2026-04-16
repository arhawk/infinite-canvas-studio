import { Konva } from "../lib/konva.js";
import { DISPLAY_FONT_FAMILY } from "../lib/fonts.js";
import { ContainerComponent } from "./container.js";

const PAGE_WIDTH = 960;
const PAGE_HEIGHT = 540;
const PAGE_VIEW_PADDING = 24;
const MIN_PAGE_WIDTH = 320;
const MIN_PAGE_HEIGHT = 220;
const PAGE_HEADER_HEIGHT = 56;
const DEFAULT_PAGE_LABEL = "New Page";

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

export class PageComponent extends ContainerComponent {
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

    node.setAttrs({
      transformLocked: false,
      focusPositionMode: "relative",
      savedFocus: {
        positionMode: "relative",
        offset: { x: 0, y: 0 },
        scale: getDefaultPageScale(this.app, width, height),
      },
    });
  }

  serializeNode(node) {
    const base = super.serializeNode(node);
    const headerLine = node.findOne(".page-header-line");

    return {
      ...base,
      headerLineStroke: headerLine?.stroke() ?? "rgba(171, 79, 40, 0.12)",
    };
  }

  async applySerializedData(node, data = {}) {
    await super.applySerializedData(node, data);

    const width = Number.isFinite(data.width) ? data.width : PAGE_WIDTH;
    syncPageHeader(node, {
      width,
      label: data.label,
      headerLineStroke: data.headerLineStroke,
    });
  }
}
