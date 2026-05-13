import { BaseComponent } from "../core/baseClasses.js";
import { DISPLAY_FONT_FAMILY, UI_FONT_FAMILY } from "../lib/fonts.js";
import { Konva } from "../lib/konva.js";
import { EditableTextBehavior } from "./editableText.js";

const DEFAULT_WIDTH = 360;
const DEFAULT_HEIGHT = 280;
const MIN_WIDTH = 260;
const MIN_HEIGHT = 180;
const HEADER_MIN_HEIGHT = 52;
const TITLE_SIDE_PADDING = 16;
const TITLE_VERTICAL_PADDING = 14;
const TITLE_LINE_HEIGHT = 1.15;
const PADDING = 14;
const CARD_HEIGHT = 44;
const CARD_GAP = 10;
export const DEFAULT_RANKING_BOX_LABEL = "Ranking Box";
export const DEFAULT_RANKING_BOX_TITLE_FONT_SIZE = 15;
export const DEFAULT_RANKING_BOX_TITLE_COLOR = "#5f4828";
export const DEFAULT_RANKING_BOX_THEME_COLOR = "#8a6f47";
const DEFAULT_RANKING_BOX_BACKGROUND_FILL = "rgba(248, 244, 236, 0.88)";
const DEFAULT_RANKING_BOX_HEADER_FILL = "rgb(248, 244, 236)";
const DEFAULT_RANKING_BOX_DIVIDER_STROKE = "rgba(95, 72, 40, 0.18)";
const DEFAULT_RANKING_BOX_EMPTY_TEXT_COLOR = "rgba(95, 72, 40, 0.58)";
const DEFAULT_RANKING_BOX_CARD_FILL = "rgba(255, 253, 248, 0.94)";
const DEFAULT_RANKING_BOX_CARD_STROKE = "rgba(95, 72, 40, 0.18)";
const DEFAULT_RANKING_BOX_CARD_RANK_COLOR = "#ab4f28";
const DEFAULT_RANKING_BOX_MISSING_CARD_FILL = "rgba(255, 245, 242, 0.94)";
const DEFAULT_RANKING_BOX_MISSING_CARD_STROKE = "rgba(165, 61, 47, 0.28)";

let rankingItemCount = 0;

function nextRankingItemId() {
  rankingItemCount += 1;
  return `ranking-item-${rankingItemCount}`;
}

function syncRankingItemCount(id) {
  if (typeof id !== "string") return;
  const match = id.match(/-(\d+)$/);
  if (!match) return;
  rankingItemCount = Math.max(rankingItemCount, Number(match[1]));
}

function clonePlainData(value) {
  if (value == null) return value;
  return JSON.parse(JSON.stringify(value));
}

function normalizeDimension(value, fallback, minimum) {
  return Number.isFinite(value) ? Math.max(minimum, value) : fallback;
}

function normalizeColor(value, fallback) {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function parseHexColor(value) {
  const text = typeof value === "string" ? value.trim() : "";
  const shortMatch = text.match(/^#([0-9a-f]{3})$/i);
  if (shortMatch) {
    return shortMatch[1].split("").map((char) => Number.parseInt(`${char}${char}`, 16));
  }

  const longMatch = text.match(/^#([0-9a-f]{6})$/i);
  if (!longMatch) return null;

  return [
    Number.parseInt(longMatch[1].slice(0, 2), 16),
    Number.parseInt(longMatch[1].slice(2, 4), 16),
    Number.parseInt(longMatch[1].slice(4, 6), 16),
  ];
}

function toHexColor(channels, fallback) {
  if (!Array.isArray(channels) || channels.length !== 3) return fallback;
  return `#${channels
    .map((channel) => {
      const safe = Math.max(0, Math.min(255, Math.round(Number(channel) || 0)));
      return safe.toString(16).padStart(2, "0");
    })
    .join("")}`;
}

function mixHexColors(source, target, ratio = 0.5) {
  const sourceChannels = parseHexColor(source);
  const targetChannels = parseHexColor(target);
  if (!sourceChannels || !targetChannels) {
    return normalizeColor(source, normalizeColor(target, DEFAULT_RANKING_BOX_THEME_COLOR));
  }

  const weight = Math.max(0, Math.min(1, Number(ratio) || 0));
  return toHexColor(
    sourceChannels.map((channel, index) => (
      channel + (targetChannels[index] - channel) * weight
    )),
    DEFAULT_RANKING_BOX_THEME_COLOR,
  );
}

function rgbaFromHex(color, alpha) {
  const channels = parseHexColor(color);
  if (!channels) return color;
  const safeAlpha = Math.max(0, Math.min(1, Number(alpha) || 0));
  return `rgba(${channels[0]}, ${channels[1]}, ${channels[2]}, ${safeAlpha})`;
}

function isDefaultRankingBoxTheme(themeColor) {
  return normalizeColor(themeColor, DEFAULT_RANKING_BOX_THEME_COLOR).toLowerCase()
    === DEFAULT_RANKING_BOX_THEME_COLOR;
}

function getRankingBoxThemeStyles(themeColor) {
  if (isDefaultRankingBoxTheme(themeColor)) {
    return {
      backgroundFill: DEFAULT_RANKING_BOX_BACKGROUND_FILL,
      headerFill: DEFAULT_RANKING_BOX_HEADER_FILL,
      dividerStroke: DEFAULT_RANKING_BOX_DIVIDER_STROKE,
      emptyTextColor: DEFAULT_RANKING_BOX_EMPTY_TEXT_COLOR,
      cardFill: DEFAULT_RANKING_BOX_CARD_FILL,
      cardStroke: DEFAULT_RANKING_BOX_CARD_STROKE,
      rankColor: DEFAULT_RANKING_BOX_CARD_RANK_COLOR,
      missingCardFill: DEFAULT_RANKING_BOX_MISSING_CARD_FILL,
      missingCardStroke: DEFAULT_RANKING_BOX_MISSING_CARD_STROKE,
    };
  }

  return {
    backgroundFill: mixHexColors(themeColor, "#ffffff", 0.86),
    headerFill: mixHexColors(themeColor, "#ffffff", 0.8),
    dividerStroke: rgbaFromHex(themeColor, 0.24),
    emptyTextColor: rgbaFromHex(themeColor, 0.68),
    cardFill: mixHexColors(themeColor, "#ffffff", 0.92),
    cardStroke: rgbaFromHex(themeColor, 0.22),
    rankColor: themeColor,
    missingCardFill: mixHexColors("#d27a64", "#fff4ef", 0.82),
    missingCardStroke: DEFAULT_RANKING_BOX_MISSING_CARD_STROKE,
  };
}

function isTextNode(node) {
  return node?.getAttr?.("componentType") === "text";
}

function findSourceTextNode(app, sourceNodeId) {
  const node = typeof sourceNodeId === "string" && sourceNodeId
    ? app?.mainLayer?.findOne?.(`#${sourceNodeId}`)
    : null;
  return isTextNode(node) ? node : null;
}

function normalizeRankingItem(item = {}, index = 0) {
  const sourceNodeId =
    typeof item.sourceNodeId === "string" && item.sourceNodeId
      ? item.sourceNodeId
      : typeof item.nodeId === "string" && item.nodeId
        ? item.nodeId
        : null;
  if (!sourceNodeId) return null;

  const id = typeof item.id === "string" && item.id
    ? item.id
    : nextRankingItemId();
  syncRankingItemCount(id);

  return {
    id,
    sourceNodeId,
    textData: item.textData && typeof item.textData === "object"
      ? clonePlainData(item.textData)
      : null,
    order: Number.isFinite(item.order) ? item.order : index,
  };
}

export function createRankingItem(sourceNodeId, textData = null) {
  if (typeof sourceNodeId !== "string" || !sourceNodeId) return null;
  return {
    id: nextRankingItemId(),
    sourceNodeId,
    textData: textData && typeof textData === "object" ? clonePlainData(textData) : null,
  };
}

export function normalizeRankingItems(items = []) {
  return Array.isArray(items)
    ? items
      .map((item, index) => normalizeRankingItem(item, index))
      .filter(Boolean)
      .map((item, index) => ({
        id: item.id,
        sourceNodeId: item.sourceNodeId,
        textData: item.textData && typeof item.textData === "object"
          ? clonePlainData(item.textData)
          : null,
        order: index,
      }))
    : [];
}

export function calculateRankingContentHeight(itemCount = 0) {
  return itemCount > 0
    ? PADDING * 2 + itemCount * CARD_HEIGHT + (itemCount - 1) * CARD_GAP
    : PADDING * 2;
}

function getRankingBoxTitleHeight(titleFontSize = DEFAULT_RANKING_BOX_TITLE_FONT_SIZE) {
  return Math.ceil(Math.max(12, Number(titleFontSize) || DEFAULT_RANKING_BOX_TITLE_FONT_SIZE) * TITLE_LINE_HEIGHT);
}

function getRankingBoxHeaderHeight(titleFontSize = DEFAULT_RANKING_BOX_TITLE_FONT_SIZE) {
  return Math.max(
    HEADER_MIN_HEIGHT,
    getRankingBoxTitleHeight(titleFontSize) + TITLE_VERTICAL_PADDING * 2,
  );
}

function getRankingBoxTitleY(headerHeight, titleHeight) {
  return Math.max(0, Math.round((headerHeight - titleHeight) / 2));
}

function getMaxScroll(height, contentHeight, headerHeight) {
  return Math.max(0, contentHeight - Math.max(1, height - headerHeight));
}

export function normalizeRankingBoxData(data = {}) {
  const width = normalizeDimension(data.width, DEFAULT_WIDTH, MIN_WIDTH);
  const height = normalizeDimension(data.height, DEFAULT_HEIGHT, MIN_HEIGHT);
  const items = normalizeRankingItems(data.items);
  const titleFontSize = normalizeDimension(
    data.titleFontSize,
    DEFAULT_RANKING_BOX_TITLE_FONT_SIZE,
    12,
  );
  const headerHeight = getRankingBoxHeaderHeight(titleFontSize);
  const contentHeight = Number.isFinite(data.contentHeight)
    ? Math.max(0, data.contentHeight)
    : calculateRankingContentHeight(items.length);
  const maxScroll = getMaxScroll(height, contentHeight, headerHeight);

  return {
    label: typeof data.label === "string" && data.label.trim()
      ? data.label.trim()
      : DEFAULT_RANKING_BOX_LABEL,
    width,
    height,
    items,
    scrollOffset: Math.min(
      Math.max(0, Number.isFinite(data.scrollOffset) ? data.scrollOffset : 0),
      maxScroll,
    ),
    contentHeight,
    titleFontSize,
    titleColor: normalizeColor(data.titleColor, DEFAULT_RANKING_BOX_TITLE_COLOR),
    themeColor: normalizeColor(data.themeColor, DEFAULT_RANKING_BOX_THEME_COLOR),
  };
}

export function getRankingBoxMetrics(data = {}) {
  const normalized = normalizeRankingBoxData(data);
  const headerHeight = getRankingBoxHeaderHeight(normalized.titleFontSize);
  return {
    ...normalized,
    headerHeight,
    titleHeight: getRankingBoxTitleHeight(normalized.titleFontSize),
    padding: PADDING,
    cardHeight: CARD_HEIGHT,
    cardGap: CARD_GAP,
    viewportHeight: Math.max(1, normalized.height - headerHeight),
    maxScroll: getMaxScroll(normalized.height, normalized.contentHeight, headerHeight),
  };
}

export function isRankingBoxNode(node) {
  return node?.getAttr?.("componentType") === "rankingBox" || node?.hasName?.("ranking-box-root");
}

function renderCard({
  app,
  item,
  index,
  themeColor,
  width,
  y,
}) {
  const sourceNode = findSourceTextNode(app, item.sourceNodeId);
  const itemTextData = item.textData && typeof item.textData === "object" ? item.textData : {};
  const snapshotData = itemTextData.data && typeof itemTextData.data === "object"
    ? itemTextData.data
    : itemTextData;
  const hasSnapshotText = typeof snapshotData.text === "string" && snapshotData.text.length > 0;
  const hasRenderableText = Boolean(sourceNode || hasSnapshotText);
  const sourceText = sourceNode?.text?.() || snapshotData.text || "Missing text";
  const sourceFill = sourceNode?.fill?.() || snapshotData.fill || "#1d1b16";
  const cardWidth = Math.max(80, width - PADDING * 2);
  const themeStyles = getRankingBoxThemeStyles(themeColor);
  const cardFill = hasRenderableText ? themeStyles.cardFill : themeStyles.missingCardFill;
  const cardStroke = hasRenderableText ? themeStyles.cardStroke : themeStyles.missingCardStroke;

  const card = new Konva.Group({
    x: PADDING,
    y,
    width: cardWidth,
    height: CARD_HEIGHT,
    draggable: true,
    name: "ranking-item-card",
    rankingItemId: item.id,
    sourceNodeId: item.sourceNodeId,
  });

  card.dragBoundFunc((pos) => ({
    x: card.getAbsolutePosition().x,
    y: pos.y,
  }));

  const background = new Konva.Rect({
    width: cardWidth,
    height: CARD_HEIGHT,
    fill: cardFill,
    stroke: cardStroke,
    strokeWidth: 1,
    cornerRadius: 8,
    shadowColor: "rgba(54, 41, 25, 0.1)",
    shadowBlur: 8,
    shadowOffsetY: 3,
    shadowOpacity: 0.24,
    name: "ranking-item-bg",
  });

  const rank = new Konva.Text({
    x: 10,
    y: 14,
    width: 24,
    text: `${index + 1}`,
    fontSize: 12,
    fontFamily: UI_FONT_FAMILY,
    fontStyle: "700",
    fill: themeStyles.rankColor,
    align: "center",
    listening: false,
    name: "ranking-item-rank",
  });

  const label = new Konva.Text({
    x: 42,
    y: 9,
    width: Math.max(40, cardWidth - 56),
    height: CARD_HEIGHT - 16,
    text: sourceText,
    fontSize: 13,
    fontFamily: UI_FONT_FAMILY,
    fill: sourceFill,
    ellipsis: true,
    wrap: "none",
    listening: false,
    name: "ranking-item-text",
  });

  card.add(background, rank, label);
  return card;
}

function syncRankingBoxVisuals(node, data = {}, app = null) {
  const contentHeight = calculateRankingContentHeight(Array.isArray(data.items) ? data.items.length : 0);
  const nextData = normalizeRankingBoxData({
    ...data,
    contentHeight,
  });
  const {
    label,
    width,
    height,
    items,
    scrollOffset,
    titleFontSize,
    titleColor,
    themeColor,
  } = nextData;
  const headerHeight = getRankingBoxHeaderHeight(titleFontSize);
  const titleHeight = getRankingBoxTitleHeight(titleFontSize);
  const themeStyles = getRankingBoxThemeStyles(themeColor);

  node.setAttr("data", nextData);
  node.width(width);
  node.height(height);
  node.clip({
    x: 0,
    y: 0,
    width,
    height,
  });

  const background = node.findOne(".ranking-box-bg");
  const header = node.findOne(".ranking-box-header-bg");
  const title = node.findOne(".ranking-box-label");
  const divider = node.findOne(".ranking-box-divider");
  const itemLayer = node.findOne(".ranking-items-layer");
  const emptyText = node.findOne(".ranking-empty-text");

  if (background) {
    background.width(width);
    background.height(height);
    background.fill(themeStyles.backgroundFill);
    background.stroke(themeColor);
  }

  if (header) {
    header.width(width);
    header.height(headerHeight);
    header.fill(themeStyles.headerFill);
  }

  if (title) {
    title.text(label);
    title.width(Math.max(width - TITLE_SIDE_PADDING * 2, 80));
    title.height(titleHeight);
    title.y(getRankingBoxTitleY(headerHeight, titleHeight));
    title.fontSize(titleFontSize);
    title.lineHeight(TITLE_LINE_HEIGHT);
    title.wrap("none");
    title.ellipsis(true);
    title.fill(titleColor);
  }

  if (divider) {
    divider.points([14, headerHeight - 1, Math.max(width - 14, 14), headerHeight - 1]);
    divider.stroke(themeStyles.dividerStroke);
  }

  if (itemLayer) {
    itemLayer.setAttrs({
      x: 0,
      y: headerHeight,
      clip: {
        x: 0,
        y: 0,
        width,
        height: Math.max(1, height - headerHeight),
      },
    });
    itemLayer.destroyChildren();

    items.forEach((item, index) => {
      itemLayer.add(renderCard({
        app,
        item,
        index,
        themeColor,
        width,
        y: PADDING + index * (CARD_HEIGHT + CARD_GAP) - scrollOffset,
      }));
    });
  }

  if (emptyText) {
    emptyText.setAttrs({
      x: PADDING,
      y: headerHeight + 26,
      width: Math.max(width - PADDING * 2, 80),
      visible: items.length === 0,
      fill: themeStyles.emptyTextColor,
    });
  }

  background?.moveToBottom();
  itemLayer?.moveToTop();
  emptyText?.moveToTop();
  header?.moveToTop();
  title?.moveToTop();
  divider?.moveToTop();
  return nextData;
}

function installRankingBoxClientRect(node) {
  const fallbackGetClientRect = node.getClientRect.bind(node);

  node.getClientRect = (config = {}) => {
    const background = node.findOne(".ranking-box-bg");
    return background?.getClientRect?.(config) ?? fallbackGetClientRect(config);
  };
}

function measureRankingBoxTitleHeight(titleNode, text) {
  const measureNode = new Konva.Text({
    width: titleNode.width(),
    text,
    fontSize: titleNode.fontSize(),
    fontFamily: titleNode.fontFamily(),
    fontStyle: titleNode.fontStyle(),
    lineHeight: titleNode.lineHeight(),
    wrap: "word",
    ellipsis: false,
    padding: titleNode.padding(),
  });

  return Math.max(
    titleNode.height(),
    measureNode.getClientRect({
      skipShadow: true,
      skipStroke: true,
    }).height,
  );
}

export class RankingBoxComponent extends BaseComponent {
  static type = "rankingBox";
  static label = "Ranking Box";
  static description = "Sortable box for collecting references to text blocks";

  async createNode({
    x,
    y,
    width = DEFAULT_WIDTH,
    height = DEFAULT_HEIGHT,
    label = DEFAULT_RANKING_BOX_LABEL,
    items = [],
    titleFontSize = DEFAULT_RANKING_BOX_TITLE_FONT_SIZE,
    titleColor = DEFAULT_RANKING_BOX_TITLE_COLOR,
    themeColor = DEFAULT_RANKING_BOX_THEME_COLOR,
  }) {
    const themeStyles = getRankingBoxThemeStyles(themeColor);
    const headerHeight = getRankingBoxHeaderHeight(titleFontSize);
    const titleHeight = getRankingBoxTitleHeight(titleFontSize);
    const group = new Konva.Group({
      x,
      y,
      width,
      height,
      draggable: true,
      name: "selectable ranking-box-root",
    });

    const background = new Konva.Rect({
      width,
      height,
      fill: themeStyles.backgroundFill,
      stroke: themeColor,
      strokeWidth: 2,
      dash: [8, 5],
      cornerRadius: 12,
      shadowColor: "rgba(54, 41, 25, 0.12)",
      shadowBlur: 16,
      shadowOffsetY: 8,
      shadowOpacity: 0.3,
      name: "ranking-box-bg",
    });

    const header = new Konva.Rect({
      width,
      height: headerHeight,
      fill: themeStyles.headerFill,
      cornerRadius: 12,
      listening: false,
      name: "ranking-box-header-bg",
    });

    const title = new Konva.Text({
      x: TITLE_SIDE_PADDING,
      y: getRankingBoxTitleY(headerHeight, titleHeight),
      width: Math.max(width - TITLE_SIDE_PADDING * 2, 80),
      height: titleHeight,
      text: label,
      fontSize: titleFontSize,
      fontFamily: DISPLAY_FONT_FAMILY,
      fontStyle: "700",
      lineHeight: TITLE_LINE_HEIGHT,
      wrap: "none",
      ellipsis: true,
      fill: titleColor,
      listening: true,
      name: "ranking-box-label",
    });
    EditableTextBehavior.attach(title, {
      fallbackText: DEFAULT_RANKING_BOX_LABEL,
      getHistoryNode: () => group,
      fitEditorToContent: true,
      getEditorBox: (titleNode, { stage, textBox }) => {
        const resolvedStage = stage ?? titleNode.getStage();
        const stageBox = textBox ?? titleNode.getClientRect({
          relativeTo: resolvedStage,
          skipShadow: true,
          skipStroke: true,
        });
        return {
          ...stageBox,
          height: measureRankingBoxTitleHeight(
            titleNode,
            titleNode.text() || DEFAULT_RANKING_BOX_LABEL,
          ),
        };
      },
      applyValue: (_titleNode, nextText) => {
        this.setData(group, {
          ...this.getData(group),
          label: nextText,
        });
      },
    });

    const divider = new Konva.Line({
      points: [14, headerHeight - 1, Math.max(width - 14, 14), headerHeight - 1],
      stroke: themeStyles.dividerStroke,
      strokeWidth: 1,
      listening: false,
      name: "ranking-box-divider",
    });

    const itemLayer = new Konva.Group({
      x: 0,
      y: headerHeight,
      name: "ranking-items-layer",
      clip: {
        x: 0,
        y: 0,
        width,
        height: Math.max(1, height - headerHeight),
      },
    });

    const emptyText = new Konva.Text({
      x: PADDING,
      y: headerHeight + 26,
      width: Math.max(width - PADDING * 2, 80),
      text: "Drag Text here to add a sortable card",
      fontSize: 13,
      fontFamily: UI_FONT_FAMILY,
      fill: themeStyles.emptyTextColor,
      align: "center",
      listening: false,
      name: "ranking-empty-text",
    });

    group.add(background, header, title, divider, itemLayer, emptyText);
    installRankingBoxClientRect(group);

    group.on("transform", () => {
      const scaleX = group.scaleX();
      const scaleY = group.scaleY();
      const currentData = this.getData(group);

      group.scale({ x: 1, y: 1 });
      this.setData(group, {
        ...currentData,
        width: Math.max(MIN_WIDTH, currentData.width * scaleX),
        height: Math.max(MIN_HEIGHT, currentData.height * scaleY),
      });
    });

    this.setData(group, {
      label,
      width,
      height,
      items,
      scrollOffset: 0,
      titleFontSize,
      titleColor,
      themeColor,
    });

    return group;
  }

  getData(node) {
    return normalizeRankingBoxData(node?.getAttr?.("data") || {});
  }

  setData(node, data = {}) {
    return syncRankingBoxVisuals(node, clonePlainData(data) ?? {}, this.app);
  }

  syncNode(node) {
    return this.setData(node, this.getData(node));
  }

  serializeNode(node) {
    const data = this.getData(node);
    return {
      label: data.label,
      width: data.width,
      height: data.height,
      items: normalizeRankingItems(data.items),
      scrollOffset: data.scrollOffset,
      contentHeight: data.contentHeight,
      titleFontSize: data.titleFontSize,
      titleColor: data.titleColor,
      themeColor: data.themeColor,
    };
  }

  async applySerializedData(node, data = {}) {
    this.setData(node, data);
  }
}
