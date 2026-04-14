import {
  BaseComponent,
  TextEditorField,
} from "../core/baseClasses.js";
import { DISPLAY_FONT_FAMILY } from "../lib/fonts.js";
import { Konva } from "../lib/konva.js";

const DEFAULT_WIDTH = 1040;
const DEFAULT_HEIGHT = 680;
const HEADER_HEIGHT = 72;
const SCROLLBAR_WIDTH = 8;

function normalizeRankingItems(items = []) {
  return Array.isArray(items)
    ? items
      .filter((item) => typeof item?.nodeId === "string" && item.nodeId)
      .map((item, index) => ({
        nodeId: item.nodeId,
        order: Number.isFinite(item.order) ? item.order : index,
      }))
      .sort((left, right) => left.order - right.order)
      .map((item, index) => ({
        ...item,
        order: index,
      }))
    : [];
}

function syncRankingVisuals(node, data = {}) {
  const width = Number.isFinite(data.width) ? data.width : DEFAULT_WIDTH;
  const height = Number.isFinite(data.height) ? data.height : DEFAULT_HEIGHT;
  const contentHeight = Number.isFinite(data.contentHeight) ? data.contentHeight : 0;
  const scrollOffset = Number.isFinite(data.scrollOffset) ? Math.max(0, data.scrollOffset) : 0;
  const viewportHeight = Math.max(1, height - HEADER_HEIGHT);
  const maxScroll = Math.max(0, contentHeight - viewportHeight);
  const clampedScrollOffset = Math.min(scrollOffset, maxScroll);
  const label = typeof data.label === "string" && data.label.trim()
    ? data.label.trim()
    : "Ranking Module";

  const background = node.findOne(".ranking-bg");
  const header = node.findOne(".ranking-header-bg");
  const title = node.findOne(".ranking-label");
  const divider = node.findOne(".ranking-divider");
  const scrollbarTrack = node.findOne(".ranking-scrollbar-track");
  const scrollbarThumb = node.findOne(".ranking-scrollbar-thumb");

  node.width(width);
  node.height(height);
  node.clip({
    x: 0,
    y: 0,
    width,
    height,
  });

  if (background) {
    background.width(width);
    background.height(height);
  }

  if (header) {
    header.width(width);
    header.height(HEADER_HEIGHT);
  }

  if (title) {
    title.text(label);
    title.width(Math.max(width - 32, 80));
  }

  if (divider) {
    divider.points([16, 56, Math.max(width - 16, 16), 56]);
  }

  if (scrollbarTrack && scrollbarThumb) {
    const shouldShowScrollbar = maxScroll > 0;
    const trackHeight = Math.max(32, height - HEADER_HEIGHT - 16);
    const trackY = HEADER_HEIGHT + 8;
    const trackX = Math.max(16, width - SCROLLBAR_WIDTH - 10);
    const thumbHeight = Math.max(28, trackHeight * (viewportHeight / Math.max(contentHeight, viewportHeight)));
    const thumbTravel = Math.max(0, trackHeight - thumbHeight);
    const thumbY = trackY + (maxScroll > 0 ? (clampedScrollOffset / maxScroll) * thumbTravel : 0);

    scrollbarTrack.setAttrs({
      x: trackX,
      y: trackY,
      width: SCROLLBAR_WIDTH,
      height: trackHeight,
      visible: shouldShowScrollbar,
    });

    scrollbarThumb.setAttrs({
      x: trackX,
      y: thumbY,
      width: SCROLLBAR_WIDTH,
      height: thumbHeight,
      visible: shouldShowScrollbar,
      dragBoundFunc: (pos) => ({
        x: node.getAbsolutePosition().x + trackX,
        y: Math.max(
          node.getAbsolutePosition().y + trackY,
          Math.min(node.getAbsolutePosition().y + trackY + thumbTravel, pos.y),
        ),
      }),
    });
  }
}

function installRankingClientRect(node) {
  const fallbackGetClientRect = node.getClientRect.bind(node);

  node.getClientRect = (config = {}) => {
    const background = node.findOne(".ranking-bg");
    return background?.getClientRect?.(config) ?? fallbackGetClientRect(config);
  };
}

export class RankingComponent extends BaseComponent {
  static type = "ranking";
  static label = "Ranking Module";
  static description = "A module for sorting pages and containers by relative position";

  getEditorTitle() {
    return "Ranking Module";
  }

  editorFields() {
    return [
      new TextEditorField({
        id: "label",
        label: "Label",
        getValue: (node) => node.findOne(".ranking-label")?.text() ?? "Ranking Module",
        setValue: (node, value) => {
          const data = node.getAttr("data") || {};
          const nextData = {
            ...data,
            label: value || "Ranking Module",
          };
          node.setAttr("data", nextData);
          syncRankingVisuals(node, nextData);
        },
      }),
    ];
  }

  async createNode({
    x,
    y,
    width = DEFAULT_WIDTH,
    height = DEFAULT_HEIGHT,
    label = "Ranking Module",
    items = [],
  }) {
    const group = new Konva.Group({
      x,
      y,
      width,
      height,
      draggable: true,
      name: "selectable ranking-root",
    });

    const data = {
      label,
      width,
      height,
      items: normalizeRankingItems(items),
      scrollOffset: 0,
      contentHeight: 0,
    };
    group.setAttr("data", data);

    const background = new Konva.Rect({
      width,
      height,
      fill: "rgba(248, 244, 236, 0.82)",
      stroke: "#8a6f47",
      strokeWidth: 2,
      dash: [10, 5],
      cornerRadius: 18,
      shadowColor: "rgba(54, 41, 25, 0.12)",
      shadowBlur: 22,
      shadowOffsetY: 10,
      shadowOpacity: 0.35,
      name: "ranking-bg",
    });

    const header = new Konva.Rect({
      width,
      height: HEADER_HEIGHT,
      fill: "rgb(248, 244, 236)",
      cornerRadius: 18,
      listening: false,
      name: "ranking-header-bg",
    });

    const title = new Konva.Text({
      x: 16,
      y: 16,
      width: Math.max(width - 32, 80),
      text: label,
      fontSize: 16,
      fontFamily: DISPLAY_FONT_FAMILY,
      fontStyle: "700",
      fill: "#5f4828",
      name: "ranking-label",
      listening: true,
    });

    const divider = new Konva.Line({
      points: [16, 56, Math.max(width - 16, 16), 56],
      stroke: "rgba(95, 72, 40, 0.2)",
      strokeWidth: 1,
      listening: false,
      name: "ranking-divider",
    });

    const scrollbarTrack = new Konva.Rect({
      x: width - SCROLLBAR_WIDTH - 10,
      y: HEADER_HEIGHT + 8,
      width: SCROLLBAR_WIDTH,
      height: Math.max(32, height - HEADER_HEIGHT - 16),
      fill: "rgba(95, 72, 40, 0.12)",
      cornerRadius: SCROLLBAR_WIDTH / 2,
      visible: false,
      listening: true,
      name: "ranking-scrollbar-track",
    });

    const scrollbarThumb = new Konva.Rect({
      x: width - SCROLLBAR_WIDTH - 10,
      y: HEADER_HEIGHT + 8,
      width: SCROLLBAR_WIDTH,
      height: 32,
      fill: "rgba(95, 72, 40, 0.48)",
      cornerRadius: SCROLLBAR_WIDTH / 2,
      draggable: true,
      visible: false,
      listening: true,
      name: "ranking-scrollbar-thumb",
    });

    group.add(background, header, title, divider, scrollbarTrack, scrollbarThumb);
    group.clip({ x: 0, y: 0, width, height });
    installRankingClientRect(group);

    group.on("transform", () => {
      const scaleX = group.scaleX();
      const scaleY = group.scaleY();
      const currentData = group.getAttr("data") || {};
      const currentWidth = Number.isFinite(currentData.width) ? currentData.width : group.width();
      const currentHeight = Number.isFinite(currentData.height) ? currentData.height : group.height();
      group.scale({ x: 1, y: 1 });

      const nextData = {
        ...currentData,
        width: Math.max(320, currentWidth * scaleX),
        height: Math.max(220, currentHeight * scaleY),
      };

      group.setAttr("data", nextData);
      syncRankingVisuals(group, nextData);
    });

    return group;
  }

  serializeNode(node) {
    const data = node.getAttr("data") || {};
    const background = node.findOne(".ranking-bg");
    const title = node.findOne(".ranking-label");

    return {
      label: title?.text() || data.label || "Ranking Module",
      width: background?.width() ?? node.width() ?? DEFAULT_WIDTH,
      height: background?.height() ?? node.height() ?? DEFAULT_HEIGHT,
      items: normalizeRankingItems(data.items),
      scrollOffset: Number.isFinite(data.scrollOffset) ? data.scrollOffset : 0,
      contentHeight: Number.isFinite(data.contentHeight) ? data.contentHeight : 0,
    };
  }

  async applySerializedData(node, data = {}) {
    const nextData = {
      label: data.label || "Ranking Module",
      width: Number.isFinite(data.width) ? data.width : DEFAULT_WIDTH,
      height: Number.isFinite(data.height) ? data.height : DEFAULT_HEIGHT,
      items: normalizeRankingItems(data.items),
      scrollOffset: Number.isFinite(data.scrollOffset) ? data.scrollOffset : 0,
      contentHeight: Number.isFinite(data.contentHeight) ? data.contentHeight : 0,
    };

    node.setAttr("data", nextData);
    syncRankingVisuals(node, nextData);
  }
}
