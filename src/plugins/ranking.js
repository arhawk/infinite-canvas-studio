import { BasePlugin } from "../core/baseClasses.js";

const RANKABLE_TYPES = new Set(["page", "container"]);
const HEADER_HEIGHT = 72;
const PADDING = 24;
const GAP = 24;
const MIN_WIDTH = 320;
const MIN_HEIGHT = 220;
const SCROLLBAR_WIDTH = 8;
const SCROLL_STEP = 72;

function resolveSelectable(node) {
  if (!node) return null;
  return node.findAncestor?.(".selectable", true) ?? (node.hasName?.("selectable") ? node : null);
}

function isRankingNode(node) {
  return node?.getAttr?.("componentType") === "ranking" || node?.hasName?.("ranking-root");
}

function isRankableNode(node) {
  return RANKABLE_TYPES.has(node?.getAttr?.("componentType"));
}

function normalizeRankingItems(items = []) {
  const seen = new Set();

  return Array.isArray(items)
    ? items
      .filter((item) => {
        if (typeof item?.nodeId !== "string" || !item.nodeId || seen.has(item.nodeId)) {
          return false;
        }
        seen.add(item.nodeId);
        return true;
      })
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

function getRankingData(rankingNode) {
  const data = rankingNode?.getAttr?.("data") || {};
  const background = rankingNode?.findOne?.(".ranking-bg");
  const height = Number.isFinite(data.height) ? data.height : background?.height?.() ?? 680;
  const contentHeight = Number.isFinite(data.contentHeight) ? data.contentHeight : 0;
  const maxScroll = getMaxScroll(height, contentHeight);

  return {
    label: data.label || rankingNode?.findOne?.(".ranking-label")?.text?.() || "Ranking Module",
    width: Number.isFinite(data.width) ? data.width : background?.width?.() ?? 1040,
    height,
    items: normalizeRankingItems(data.items),
    scrollOffset: Math.min(
      Math.max(0, Number.isFinite(data.scrollOffset) ? data.scrollOffset : 0),
      maxScroll,
    ),
    contentHeight,
  };
}

function syncRankingVisuals(rankingNode, data) {
  const background = rankingNode.findOne(".ranking-bg");
  const header = rankingNode.findOne(".ranking-header-bg");
  const label = rankingNode.findOne(".ranking-label");
  const divider = rankingNode.findOne(".ranking-divider");
  const scrollbarTrack = rankingNode.findOne(".ranking-scrollbar-track");
  const scrollbarThumb = rankingNode.findOne(".ranking-scrollbar-thumb");
  const viewportHeight = getViewportHeight(data.height);
  const maxScroll = getMaxScroll(data.height, data.contentHeight);
  const clampedScrollOffset = Math.min(Math.max(0, data.scrollOffset || 0), maxScroll);

  rankingNode.width(data.width);
  rankingNode.height(data.height);
  rankingNode.clip({
    x: 0,
    y: 0,
    width: data.width,
    height: data.height,
  });

  if (background) {
    background.width(data.width);
    background.height(data.height);
  }

  if (header) {
    header.width(data.width);
    header.height(HEADER_HEIGHT);
  }

  if (label) {
    label.text(data.label || "Ranking Module");
    label.width(Math.max(data.width - 32, 80));
  }

  if (divider) {
    divider.points([16, 56, Math.max(data.width - 16, 16), 56]);
  }

  if (scrollbarTrack && scrollbarThumb) {
    const shouldShowScrollbar = maxScroll > 0;
    const trackHeight = Math.max(32, data.height - HEADER_HEIGHT - 16);
    const trackY = HEADER_HEIGHT + 8;
    const trackX = Math.max(16, data.width - SCROLLBAR_WIDTH - 10);
    const thumbHeight = Math.max(28, trackHeight * (viewportHeight / Math.max(data.contentHeight, viewportHeight)));
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
        x: rankingNode.getAbsolutePosition().x + trackX,
        y: Math.max(
          rankingNode.getAbsolutePosition().y + trackY,
          Math.min(rankingNode.getAbsolutePosition().y + trackY + thumbTravel, pos.y),
        ),
      }),
    });
  }
}

function applyRankingData(rankingNode, data) {
  const width = Number.isFinite(data.width) ? Math.max(MIN_WIDTH, data.width) : 1040;
  const height = Number.isFinite(data.height) ? Math.max(MIN_HEIGHT, data.height) : 680;
  const contentHeight = Number.isFinite(data.contentHeight) ? Math.max(0, data.contentHeight) : 0;
  const maxScroll = getMaxScroll(height, contentHeight);
  const nextData = {
    label: data.label || "Ranking Module",
    width,
    height,
    items: normalizeRankingItems(data.items),
    scrollOffset: Math.min(
      Math.max(0, Number.isFinite(data.scrollOffset) ? data.scrollOffset : 0),
      maxScroll,
    ),
    contentHeight,
  };

  rankingNode.setAttr("data", nextData);
  syncRankingVisuals(rankingNode, nextData);
  return nextData;
}

function getNodeVisualSize(node) {
  return {
    width: Math.max(80, (Number.isFinite(node.width?.()) ? node.width() : 0) * Math.abs(node.scaleX?.() ?? 1)),
    height: Math.max(60, (Number.isFinite(node.height?.()) ? node.height() : 0) * Math.abs(node.scaleY?.() ?? 1)),
  };
}

function getViewportHeight(height) {
  return Math.max(1, height - HEADER_HEIGHT);
}

function getMaxScroll(height, contentHeight) {
  return Math.max(0, contentHeight - getViewportHeight(height));
}

function pointInRect(point, rect) {
  return (
    point.x >= rect.x &&
    point.x <= rect.x + rect.width &&
    point.y >= rect.y &&
    point.y <= rect.y + rect.height
  );
}

function getNodeCenter(node) {
  const box = node.getClientRect();
  return {
    x: box.x + box.width / 2,
    y: box.y + box.height / 2,
  };
}

export class RankingPlugin extends BasePlugin {
  static pluginId = "ranking";
  static modes = {
    edit: {
      tools: {
        arrange: {},
      },
    },
  };

  onSetup() {
    this.layer = this.app.mainLayer;

    this.app.stage.on("dragend.ranking", (event) => this.handleDragEnd(event));

    this.layer.find(".ranking-root").forEach((node) => this.bindRankingInteractions(node));
    this.listen("node:added", ({ node }) => {
      if (isRankingNode(node)) {
        this.bindRankingInteractions(node);
      }
    });
    this.listen("node:changed", ({ node }) => {
      if (isRankingNode(node)) {
        this.layoutRankingItems(node);
      }
    });
    this.listen("node:removed", ({ node }) => this.handleNodeRemoved(node));
    this.listen("document:load:end", () => {
      this.layer.find(".ranking-root").forEach((node) => this.bindRankingInteractions(node));
      this.layoutAllRankings();
    });

    this.cleanups.push(() => {
      this.app.stage.off(".ranking");
    });
  }

  bindRankingInteractions(rankingNode) {
    if (!isRankingNode(rankingNode)) return;

    rankingNode.off(".rankingScroll");
    rankingNode.on("wheel.rankingScroll", (event) => {
      event.cancelBubble = true;
      event.evt?.preventDefault?.();
      const delta = event.evt?.deltaY ?? 0;
      if (delta === 0) return;
      this.scrollRankingBy(rankingNode, delta > 0 ? SCROLL_STEP : -SCROLL_STEP);
    });

    const scrollbarThumb = rankingNode.findOne(".ranking-scrollbar-thumb");
    scrollbarThumb?.off(".rankingScroll");
    scrollbarThumb?.on("dragmove.rankingScroll", (event) => {
      event.cancelBubble = true;
      this.handleScrollbarThumbDrag(rankingNode);
    });
    scrollbarThumb?.on("dragend.rankingScroll", (event) => {
      event.cancelBubble = true;
      this.handleScrollbarThumbDrag(rankingNode);
    });

    this.cleanups.push(() => {
      rankingNode.off(".rankingScroll");
      scrollbarThumb?.off(".rankingScroll");
    });
  }

  handleDragEnd(event) {
    if (
      !this.isEnabled() ||
      this.app.isReplayingHistory ||
      this.app.isRestoringDocument
    ) {
      return;
    }

    const node = resolveSelectable(event.target);
    if (!isRankableNode(node)) return;

    const currentParent = node.getParent();
    const currentRanking = isRankingNode(currentParent) ? currentParent : null;
    const dropPoint = getNodeCenter(node);
    const targetRanking = this.findRankingAtPoint(dropPoint, node);

    if (!targetRanking) {
      if (currentRanking) {
        this.removeNodeFromRanking(node, currentRanking);
      }
      return;
    }

    this.placeNodeInRanking(node, targetRanking, dropPoint);
  }

  findRankingAtPoint(point, draggedNode = null) {
    const rankings = this.layer.find(".ranking-root").filter((node) => {
      return isRankingNode(node) && node !== draggedNode && node.getStage?.();
    });

    for (const rankingNode of rankings.reverse()) {
      const background = rankingNode.findOne(".ranking-bg");
      const box = background?.getClientRect?.() ?? rankingNode.getClientRect();
      if (pointInRect(point, box)) {
        return rankingNode;
      }
    }

    return null;
  }

  placeNodeInRanking(node, rankingNode, dropPoint) {
    const previousParent = node.getParent();
    const previousRanking = isRankingNode(previousParent) ? previousParent : null;
    const targetItems = this.getOrderedMemberNodes(rankingNode, node);
    const insertIndex = this.getInsertIndex(targetItems, dropPoint);
    const affectedRankings = new Set([rankingNode]);

    if (previousRanking && previousRanking !== rankingNode) {
      affectedRankings.add(previousRanking);
    }

    affectedRankings.forEach((affectedRanking) => {
      this.app.events.emit("node:change:start", { node: affectedRanking });
    });

    if (!previousRanking) {
      this.app.events.emit("node:change:start", { node });
    }

    if (previousRanking && previousRanking !== rankingNode) {
      this.setRankingOrder(
        previousRanking,
        this.getOrderedMemberNodes(previousRanking, node).map((member) => member.id()),
      );
    }

    if (node.getParent() !== rankingNode) {
      node.moveTo(rankingNode);
    }

    const orderedIds = targetItems.map((member) => member.id());
    orderedIds.splice(insertIndex, 0, node.id());
    this.setRankingOrder(rankingNode, orderedIds);
    this.layoutRankingItems(rankingNode);

    if (previousRanking && previousRanking !== rankingNode) {
      this.layoutRankingItems(previousRanking);
    }

    affectedRankings.forEach((affectedRanking) => {
      this.app.events.emit("node:changed", { node: affectedRanking });
    });
    this.app.events.emit("node:changed", { node });
    this.layer.batchDraw();
  }

  removeNodeFromRanking(node, rankingNode) {
    const absolutePosition = node.getAbsolutePosition();

    this.app.events.emit("node:change:start", { node: rankingNode });
    this.app.events.emit("node:change:start", { node });

    node.moveTo(this.layer);
    node.setAbsolutePosition(absolutePosition);
    this.setRankingOrder(
      rankingNode,
      this.getOrderedMemberNodes(rankingNode, node).map((member) => member.id()),
    );
    this.layoutRankingItems(rankingNode);

    this.app.events.emit("node:changed", { node: rankingNode });
    this.app.events.emit("node:changed", { node });
    this.layer.batchDraw();
  }

  getOrderedMemberNodes(rankingNode, excludeNode = null) {
    const data = getRankingData(rankingNode);
    const directMembers = rankingNode.getChildren((child) => {
      return child?.hasName?.("selectable") && isRankableNode(child) && child !== excludeNode;
    });
    const memberById = new Map(directMembers.map((member) => [member.id(), member]));
    const ordered = data.items
      .map((item) => memberById.get(item.nodeId))
      .filter(Boolean);
    const orderedIds = new Set(ordered.map((member) => member.id()));

    directMembers.forEach((member) => {
      if (!orderedIds.has(member.id())) {
        ordered.push(member);
      }
    });

    return ordered;
  }

  getInsertIndex(orderedNodes, dropPoint) {
    if (!orderedNodes.length) return 0;

    for (let index = 0; index < orderedNodes.length; index += 1) {
      const box = orderedNodes[index].getClientRect();
      const centerY = box.y + box.height / 2;
      if (dropPoint.y < centerY) {
        return index;
      }
    }

    return orderedNodes.length;
  }

  setRankingOrder(rankingNode, orderedIds = []) {
    const data = getRankingData(rankingNode);
    const nextItems = orderedIds
      .filter((nodeId, index, ids) => typeof nodeId === "string" && nodeId && ids.indexOf(nodeId) === index)
      .map((nodeId, order) => ({ nodeId, order }));

    applyRankingData(rankingNode, {
      ...data,
      items: nextItems,
    });
  }

  getScrollMetrics(rankingNode) {
    const data = getRankingData(rankingNode);
    const track = rankingNode.findOne(".ranking-scrollbar-track");
    const thumb = rankingNode.findOne(".ranking-scrollbar-thumb");

    return {
      data,
      maxScroll: getMaxScroll(data.height, data.contentHeight),
      trackY: track?.y?.() ?? HEADER_HEIGHT + 8,
      trackHeight: track?.height?.() ?? Math.max(32, data.height - HEADER_HEIGHT - 16),
      thumbHeight: thumb?.height?.() ?? 28,
    };
  }

  setScrollOffset(rankingNode, scrollOffset) {
    const data = getRankingData(rankingNode);
    applyRankingData(rankingNode, {
      ...data,
      scrollOffset,
    });
    this.layoutRankingItems(rankingNode);
    this.layer.batchDraw();
  }

  scrollRankingBy(rankingNode, delta) {
    const data = getRankingData(rankingNode);
    this.setScrollOffset(rankingNode, data.scrollOffset + delta);
  }

  handleScrollbarThumbDrag(rankingNode) {
    const thumb = rankingNode.findOne(".ranking-scrollbar-thumb");
    if (!thumb) return;

    const {
      data,
      maxScroll,
      trackY,
      trackHeight,
      thumbHeight,
    } = this.getScrollMetrics(rankingNode);
    const thumbTravel = Math.max(1, trackHeight - thumbHeight);
    const ratio = Math.max(0, Math.min(1, (thumb.y() - trackY) / thumbTravel));

    applyRankingData(rankingNode, {
      ...data,
      scrollOffset: ratio * maxScroll,
    });
    this.layoutRankingItems(rankingNode);
    this.layer.batchDraw();
  }

  layoutRankingItems(rankingNode, excludeNode = null) {
    if (!isRankingNode(rankingNode)) return;

    const orderedNodes = this.getOrderedMemberNodes(rankingNode, excludeNode);
    const data = getRankingData(rankingNode);
    let y = PADDING;
    let contentHeight = PADDING;
    const scrollOffset = Math.min(
      data.scrollOffset,
      getMaxScroll(data.height, this.calculateContentHeight(orderedNodes)),
    );

    orderedNodes.forEach((node) => {
      const size = getNodeVisualSize(node);
      node.position({
        x: PADDING,
        y: HEADER_HEIGHT + y - scrollOffset,
      });
      y += size.height + GAP;
    });

    contentHeight = orderedNodes.length
      ? y - GAP + PADDING
      : PADDING * 2;
    const nextData = applyRankingData(rankingNode, {
      ...data,
      scrollOffset,
      contentHeight,
      items: orderedNodes.map((node, order) => ({ nodeId: node.id(), order })),
    });

    syncRankingVisuals(rankingNode, nextData);
    this.moveRankingChromeToTop(rankingNode);
  }

  calculateContentHeight(nodes = []) {
    if (!nodes.length) return PADDING * 2;

    return nodes.reduce((height, node, index) => {
      const size = getNodeVisualSize(node);
      return height + size.height + (index === nodes.length - 1 ? 0 : GAP);
    }, PADDING * 2);
  }

  moveRankingChromeToTop(rankingNode) {
    rankingNode.findOne(".ranking-bg")?.moveToBottom();
    [
      ".ranking-header-bg",
      ".ranking-label",
      ".ranking-divider",
      ".ranking-scrollbar-track",
      ".ranking-scrollbar-thumb",
    ].forEach((selector) => {
      rankingNode.findOne(selector)?.moveToTop();
    });
  }

  layoutAllRankings() {
    this.layer.find(".ranking-root").forEach((rankingNode) => {
      this.layoutRankingItems(rankingNode);
    });
    this.layer.batchDraw();
  }

  handleNodeRemoved(node) {
    if (
      this.app.isReplayingHistory ||
      this.app.isRestoringDocument ||
      !isRankableNode(node)
    ) {
      return;
    }

    this.layer.find(".ranking-root").forEach((rankingNode) => {
      const data = getRankingData(rankingNode);
      if (!data.items.some((item) => item.nodeId === node.id())) return;

      this.app.events.emit("node:change:start", { node: rankingNode });
      applyRankingData(rankingNode, {
        ...data,
        items: data.items.filter((item) => item.nodeId !== node.id()),
      });
      this.layoutRankingItems(rankingNode, node);
      this.app.events.emit("node:changed", { node: rankingNode });
    });
  }
}
