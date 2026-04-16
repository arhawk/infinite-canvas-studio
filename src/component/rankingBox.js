import {
  BaseComponent,
  TextEditorField,
} from "../core/baseClasses.js";
import { DISPLAY_FONT_FAMILY, UI_FONT_FAMILY } from "../lib/fonts.js";
import { Konva } from "../lib/konva.js";

const DEFAULT_WIDTH = 360;
const DEFAULT_HEIGHT = 280;
const MIN_WIDTH = 260;
const MIN_HEIGHT = 180;
const HEADER_HEIGHT = 52;
const PADDING = 14;
const CARD_HEIGHT = 44;
const CARD_GAP = 10;

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

function getMaxScroll(height, contentHeight) {
  return Math.max(0, contentHeight - Math.max(1, height - HEADER_HEIGHT));
}

export function normalizeRankingBoxData(data = {}) {
  const width = Number.isFinite(data.width) ? Math.max(MIN_WIDTH, data.width) : DEFAULT_WIDTH;
  const height = Number.isFinite(data.height) ? Math.max(MIN_HEIGHT, data.height) : DEFAULT_HEIGHT;
  const items = normalizeRankingItems(data.items);
  const contentHeight = Number.isFinite(data.contentHeight)
    ? Math.max(0, data.contentHeight)
    : calculateRankingContentHeight(items.length);
  const maxScroll = getMaxScroll(height, contentHeight);

  return {
    label: typeof data.label === "string" && data.label.trim()
      ? data.label.trim()
      : "Ranking Box",
    width,
    height,
    items,
    scrollOffset: Math.min(
      Math.max(0, Number.isFinite(data.scrollOffset) ? data.scrollOffset : 0),
      maxScroll,
    ),
    contentHeight,
  };
}

export function getRankingBoxMetrics(data = {}) {
  const normalized = normalizeRankingBoxData(data);
  return {
    ...normalized,
    headerHeight: HEADER_HEIGHT,
    padding: PADDING,
    cardHeight: CARD_HEIGHT,
    cardGap: CARD_GAP,
    viewportHeight: Math.max(1, normalized.height - HEADER_HEIGHT),
    maxScroll: getMaxScroll(normalized.height, normalized.contentHeight),
  };
}

export function isRankingBoxNode(node) {
  return node?.getAttr?.("componentType") === "rankingBox" || node?.hasName?.("ranking-box-root");
}

function renderCard({
  app,
  item,
  index,
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
    fill: hasRenderableText ? "rgba(255, 253, 248, 0.94)" : "rgba(255, 245, 242, 0.94)",
    stroke: hasRenderableText ? "rgba(95, 72, 40, 0.18)" : "rgba(165, 61, 47, 0.28)",
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
    fill: "#ab4f28",
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
  } = nextData;

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
    divider.points([14, HEADER_HEIGHT - 1, Math.max(width - 14, 14), HEADER_HEIGHT - 1]);
  }

  if (itemLayer) {
    itemLayer.setAttrs({
      x: 0,
      y: HEADER_HEIGHT,
      clip: {
        x: 0,
        y: 0,
        width,
        height: Math.max(1, height - HEADER_HEIGHT),
      },
    });
    itemLayer.destroyChildren();

    items.forEach((item, index) => {
      itemLayer.add(renderCard({
        app,
        item,
        index,
        width,
        y: PADDING + index * (CARD_HEIGHT + CARD_GAP) - scrollOffset,
      }));
    });
  }

  if (emptyText) {
    emptyText.setAttrs({
      x: PADDING,
      y: HEADER_HEIGHT + 26,
      width: Math.max(width - PADDING * 2, 80),
      visible: items.length === 0,
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

export class RankingBoxComponent extends BaseComponent {
  static type = "rankingBox";
  static label = "Ranking Box";
  static description = "Page-only box for sorting references to text blocks";
  static palette = false;

  getEditorTitle() {
    return "Ranking Box";
  }

  editorFields() {
    return [
      new TextEditorField({
        id: "label",
        label: "Label",
        getValue: (node) => this.getData(node).label,
        setValue: (node, value) => {
          this.setData(node, {
            ...this.getData(node),
            label: value || "Ranking Box",
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
    label = "Ranking Box",
    items = [],
  }) {
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
      fill: "rgba(248, 244, 236, 0.88)",
      stroke: "#8a6f47",
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
      height: HEADER_HEIGHT,
      fill: "rgb(248, 244, 236)",
      cornerRadius: 12,
      listening: false,
      name: "ranking-box-header-bg",
    });

    const title = new Konva.Text({
      x: 16,
      y: 15,
      width: Math.max(width - 32, 80),
      text: label,
      fontSize: 15,
      fontFamily: DISPLAY_FONT_FAMILY,
      fontStyle: "700",
      fill: "#5f4828",
      listening: true,
      name: "ranking-box-label",
    });

    const divider = new Konva.Line({
      points: [14, HEADER_HEIGHT - 1, Math.max(width - 14, 14), HEADER_HEIGHT - 1],
      stroke: "rgba(95, 72, 40, 0.18)",
      strokeWidth: 1,
      listening: false,
      name: "ranking-box-divider",
    });

    const itemLayer = new Konva.Group({
      x: 0,
      y: HEADER_HEIGHT,
      name: "ranking-items-layer",
      clip: {
        x: 0,
        y: 0,
        width,
        height: Math.max(1, height - HEADER_HEIGHT),
      },
    });

    const emptyText = new Konva.Text({
      x: PADDING,
      y: HEADER_HEIGHT + 26,
      width: Math.max(width - PADDING * 2, 80),
      text: "Drag Text here to add a sortable card",
      fontSize: 13,
      fontFamily: UI_FONT_FAMILY,
      fill: "rgba(95, 72, 40, 0.58)",
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
    };
  }

  async applySerializedData(node, data = {}) {
    this.setData(node, data);
  }
}
