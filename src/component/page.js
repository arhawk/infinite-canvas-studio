import { Konva } from "../lib/konva.js";
import { DISPLAY_FONT_FAMILY } from "../lib/fonts.js";
import { ContainerComponent } from "./container.js";

const PAGE_WIDTH = 960;
const PAGE_HEIGHT = 540;
const PAGE_VIEW_PADDING = 24;

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
    label = "New Page",
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
      points: [0, 56, width, 56],
      stroke: "rgba(171, 79, 40, 0.12)",
      strokeWidth: 1,
      listening: false,
      name: "page-header-line",
    });

    const text = new Konva.Text({
      x: 0,
      y: 0,
      text: label,
      fontSize: 16,
      fontFamily: DISPLAY_FONT_FAMILY,
      fontStyle: "700",
      fill: "#ab4f28",
      padding: 16,
      name: "container-label page-label",
      listening: true,
    });

    group.add(rect, headerLine, text);
    return group;
  }

  onCreated(node, payload = {}) {
    const width = Number.isFinite(payload.width) ? payload.width : PAGE_WIDTH;
    const height = Number.isFinite(payload.height) ? payload.height : PAGE_HEIGHT;

    node.setAttrs({
      transformLocked: true,
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

    const headerLine = node.findOne(".page-header-line");
    const width = Number.isFinite(data.width) ? data.width : PAGE_WIDTH;
    if (headerLine) {
      headerLine.points([0, 56, width, 56]);
      if (typeof data.headerLineStroke === "string" && data.headerLineStroke) {
        headerLine.stroke(data.headerLineStroke);
      }
    }
  }
}
