import {
  BaseCommand,
  BaseContextMenuItem,
  BasePlugin,
} from "../core/baseClasses.js";
import {
  createRankingItem,
  getRankingBoxMetrics,
  isRankingBoxNode,
} from "../component/rankingBox.js";

function resolveSelectable(node) {
  if (!node) return null;
  return node.findAncestor?.(".selectable", true) ?? (node.hasName?.("selectable") ? node : null);
}

function isPageNode(node) {
  return node?.getAttr?.("componentType") === "page" || node?.hasName?.("page-root");
}

function isTextNode(node) {
  return node?.getAttr?.("componentType") === "text";
}

function getNodeCenter(node) {
  const box = node.getClientRect();
  return {
    x: box.x + box.width / 2,
    y: box.y + box.height / 2,
  };
}

function pointInRect(point, rect) {
  return (
    point.x >= rect.x &&
    point.x <= rect.x + rect.width &&
    point.y >= rect.y &&
    point.y <= rect.y + rect.height
  );
}

function getPageSize(pageNode) {
  const background = pageNode?.findOne?.(".page-bg") ?? pageNode?.findOne?.(".container-bg");
  return {
    width: background?.width?.() ?? pageNode?.width?.() ?? 960,
    height: background?.height?.() ?? pageNode?.height?.() ?? 540,
  };
}

function resequenceItems(items = []) {
  return items.map((item, order) => ({
    ...item,
    order,
  }));
}

class AddRankingBoxCommand extends BaseCommand {
  static commandId = "ranking:add-box";
  static label = "Add Ranking Box";
  static modes = {
    edit: {
      tools: {
        arrange: {},
      },
    },
  };

  execute(pageRef = null) {
    return this.plugin.createRankingBoxForPage(pageRef);
  }
}

class AddRankingBoxMenuItem extends BaseContextMenuItem {
  static itemId = "ranking:add-box";
  static label = "Add Ranking Box";
  static modes = {
    edit: {
      tools: {
        arrange: {},
      },
    },
  };

  condition(target) {
    return isPageNode(resolveSelectable(target));
  }

  execute(target) {
    return this.plugin.createRankingBoxForPage(resolveSelectable(target));
  }
}

export class RankingBoxPlugin extends BasePlugin {
  static pluginId = "ranking";
  static modes = {
    edit: {
      tools: {
        arrange: {},
      },
    },
  };

  commands() {
    return [AddRankingBoxCommand];
  }

  menuItems() {
    return [AddRankingBoxMenuItem];
  }

  onSetup() {
    this.layer = this.app.mainLayer;
    this.dragOrigins = new Map();

    this.app.stage.on("dragstart.rankingBox", (event) => this.handleDragStart(event));
    this.app.stage.on("dragend.rankingBox", (event) => this.handleDragEnd(event));

    this.layer.find(".ranking-box-root").forEach((node) => this.bindRankingBox(node));
    this.listen("node:added", ({ node }) => {
      if (isRankingBoxNode(node)) {
        this.bindRankingBox(node);
      }
    });
    this.listen("node:changed", ({ node }) => {
      if (isRankingBoxNode(node)) {
        this.refreshRankingBox(node);
        this.bindRankingBox(node);
      } else if (isTextNode(node)) {
        this.refreshRankingBoxesForText(node);
      }
    });
    this.listen("node:removed", ({ node }) => {
      if (
        isTextNode(node) &&
        !this.app.isReplayingHistory &&
        !this.app.isRestoringDocument
      ) {
        this.removeTextReferences(node, { recordHistory: true });
      }
    });
    this.listen("document:load:end", () => this.refreshAndBindAllRankingBoxes());

    this.cleanups.push(() => {
      this.app.stage.off(".rankingBox");
      this.layer.find(".ranking-box-root").forEach((node) => this.unbindRankingBox(node));
    });
  }

  getRankingComponent() {
    return this.app.components.get("rankingBox");
  }

  getSelectionPlugin() {
    return this.app.plugins.find((plugin) => plugin.id === "selection") ?? null;
  }

  findNodeById(id) {
    return typeof id === "string" && id ? this.layer.findOne(`#${id}`) : null;
  }

  resolvePage(pageRef = null) {
    if (isPageNode(pageRef)) return pageRef;
    if (typeof pageRef === "string") {
      const node = this.findNodeById(pageRef);
      return isPageNode(node) ? node : null;
    }

    const selectedPage = this.getSelectionPlugin()
      ?.getSelectedNodes?.()
      ?.find((node) => isPageNode(node));
    return selectedPage ?? null;
  }

  getOwningPage(node) {
    let current = node?.getParent?.() ?? null;
    while (current && current !== this.layer && current !== this.app.stage) {
      if (isPageNode(current)) return current;
      current = current.getParent?.() ?? null;
    }
    return null;
  }

  findRankingBoxForPage(pageNode) {
    if (!isPageNode(pageNode)) return null;
    return pageNode.getChildren?.((child) => isRankingBoxNode(child))[0] ?? null;
  }

  getRankingBoxes() {
    return this.layer.find(".ranking-box-root").filter((node) => isRankingBoxNode(node));
  }

  async createRankingBoxForPage(pageRef = null) {
    const pageNode = this.resolvePage(pageRef);
    if (!pageNode) return null;

    const existing = this.findRankingBoxForPage(pageNode);
    if (existing) {
      this.selectNode(existing);
      return existing;
    }

    const component = this.getRankingComponent();
    if (!component) return null;

    const pageSize = getPageSize(pageNode);
    const width = Math.min(380, Math.max(280, pageSize.width - 80));
    const height = Math.min(300, Math.max(200, pageSize.height - 120));
    const node = await component.create({
      x: Math.max(32, pageSize.width - width - 36),
      y: 76,
      width,
      height,
    });
    if (!node) return null;

    pageNode.add(node);
    node.moveToTop();
    this.layer.batchDraw();
    this.app.events.emit("node:added", { node });
    this.selectNode(node);
    return node;
  }

  selectNode(node) {
    this.getSelectionPlugin()?.setSelected?.([node]);
  }

  bindRankingBox(rankingNode) {
    if (!isRankingBoxNode(rankingNode)) return;

    rankingNode.off(".rankingBox");
    rankingNode.on("wheel.rankingBox", (event) => {
      event.cancelBubble = true;
      event.evt?.preventDefault?.();
      const delta = event.evt?.deltaY ?? 0;
      if (delta === 0) return;
      this.scrollRankingBoxBy(rankingNode, delta > 0 ? 72 : -72);
    });

    this.bindRankingCards(rankingNode);
  }

  unbindRankingBox(rankingNode) {
    rankingNode?.off?.(".rankingBox");
    rankingNode?.find?.(".ranking-item-card")?.forEach((card) => card.off(".rankingItem"));
  }

  bindRankingCards(rankingNode) {
    rankingNode.find(".ranking-item-card").forEach((card) => {
      card.off(".rankingItem");
      card.find(".ranking-item-delete").forEach((deleteButton) => {
        deleteButton.off(".rankingItemDelete");
        const deleteTargets = [
          deleteButton,
          ...deleteButton.getChildren(),
        ];

        deleteTargets.forEach((target) => {
          target.off(".rankingItemDelete");
          target.on("mousedown.rankingItemDelete touchstart.rankingItemDelete", (event) => {
            event.cancelBubble = true;
          });
          target.on("click.rankingItemDelete tap.rankingItemDelete", (event) => {
            event.cancelBubble = true;
            this.removeRankingItem(rankingNode, deleteButton.getAttr("rankingItemId"));
          });
        });

        deleteButton.on("mousedown.rankingItemDelete touchstart.rankingItemDelete", (event) => {
          event.cancelBubble = true;
        });
        deleteButton.on("mouseenter.rankingItemDelete", () => {
          this.app.setCursorOverride("pointer");
          deleteButton.findOne(".ranking-item-delete-bg")?.fill("rgba(165, 61, 47, 0.14)");
          rankingNode.getLayer()?.batchDraw();
        });
        deleteButton.on("mouseleave.rankingItemDelete", () => {
          this.app.clearCursorOverride();
          deleteButton.findOne(".ranking-item-delete-bg")?.fill("rgba(95, 72, 40, 0.08)");
          rankingNode.getLayer()?.batchDraw();
        });
      });

      card.on("mousedown.rankingItem touchstart.rankingItem", (event) => {
        event.cancelBubble = true;
      });

      card.on("dragstart.rankingItem", (event) => {
        event.cancelBubble = true;
        card.moveToTop();
        card.setAttr("isRankingItemDragging", true);
        this.app.events.emit("node:change:start", { node: rankingNode });
      });

      card.on("dragmove.rankingItem", (event) => {
        event.cancelBubble = true;
        const metrics = this.getRankingData(rankingNode);
        card.x(metrics.padding);
        rankingNode.getLayer()?.batchDraw();
      });

      card.on("dragend.rankingItem", (event) => {
        event.cancelBubble = true;
        card.setAttr("isRankingItemDragging", false);
        this.reorderRankingItemFromCard(rankingNode, card);
        this.app.events.emit("node:changed", { node: rankingNode });
      });
    });
  }

  handleDragStart(event) {
    const node = resolveSelectable(event.target);
    if (!isTextNode(node)) return;

    this.dragOrigins.set(node.id(), {
      parent: node.getParent(),
      absolutePosition: { ...node.getAbsolutePosition() },
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
    if (!isTextNode(node)) return;

    const dropPoint = getNodeCenter(node);
    const rankingBox = this.findRankingBoxAtPoint(dropPoint);
    if (!rankingBox || !this.canAddTextToRankingBox(node, rankingBox)) {
      this.dragOrigins.delete(node.id());
      return;
    }

    const added = this.addTextToRankingBox(rankingBox, node, {
      dropPoint,
    });
    if (added) {
      this.restoreDraggedText(node);
    }
    this.dragOrigins.delete(node.id());
  }

  findRankingBoxAtPoint(point) {
    const rankingBoxes = this.getRankingBoxes();
    for (const rankingBox of rankingBoxes.reverse()) {
      const background = rankingBox.findOne(".ranking-box-bg");
      const box = background?.getClientRect?.() ?? rankingBox.getClientRect();
      if (pointInRect(point, box)) {
        return rankingBox;
      }
    }
    return null;
  }

  canAddTextToRankingBox(textNode, rankingBox) {
    if (!isTextNode(textNode) || !isRankingBoxNode(rankingBox)) return false;
    const textPage = this.getOwningPage(textNode);
    const rankingPage = this.getOwningPage(rankingBox);
    return Boolean(textPage && rankingPage && textPage === rankingPage);
  }

  addTextToRankingBox(rankingBoxRef, textRef, { dropPoint = null, insertIndex = null } = {}) {
    const rankingBox = typeof rankingBoxRef === "string"
      ? this.findNodeById(rankingBoxRef)
      : rankingBoxRef;
    const textNode = typeof textRef === "string"
      ? this.findNodeById(textRef)
      : textRef;
    if (!isRankingBoxNode(rankingBox) || !isTextNode(textNode)) return null;
    if (!this.canAddTextToRankingBox(textNode, rankingBox)) return null;

    const item = createRankingItem(textNode.id());
    if (!item) return null;

    const component = this.getRankingComponent();
    const data = component.getData(rankingBox);
    const nextItems = [...data.items];
    const targetIndex = Number.isFinite(insertIndex)
      ? Math.max(0, Math.min(nextItems.length, insertIndex))
      : this.getInsertIndexForDropPoint(rankingBox, data, dropPoint);

    this.app.events.emit("node:change:start", { node: rankingBox });
    nextItems.splice(targetIndex, 0, item);
    component.setData(rankingBox, {
      ...data,
      items: resequenceItems(nextItems),
    });
    this.bindRankingBox(rankingBox);
    rankingBox.getLayer()?.batchDraw();
    this.app.events.emit("node:changed", { node: rankingBox });
    return item;
  }

  reorderRankingItem(rankingBoxRef, itemId, insertIndex) {
    const rankingBox = typeof rankingBoxRef === "string"
      ? this.findNodeById(rankingBoxRef)
      : rankingBoxRef;
    if (!isRankingBoxNode(rankingBox) || typeof itemId !== "string") return false;

    const component = this.getRankingComponent();
    const data = component.getData(rankingBox);
    const currentIndex = data.items.findIndex((item) => item.id === itemId);
    if (currentIndex < 0) return false;

    const nextItems = [...data.items];
    const [item] = nextItems.splice(currentIndex, 1);
    const targetIndex = Math.max(0, Math.min(nextItems.length, insertIndex));

    this.app.events.emit("node:change:start", { node: rankingBox });
    nextItems.splice(targetIndex, 0, item);
    component.setData(rankingBox, {
      ...data,
      items: resequenceItems(nextItems),
    });
    this.bindRankingBox(rankingBox);
    rankingBox.getLayer()?.batchDraw();
    this.app.events.emit("node:changed", { node: rankingBox });
    return true;
  }

  removeRankingItem(rankingBoxRef, itemId) {
    const rankingBox = typeof rankingBoxRef === "string"
      ? this.findNodeById(rankingBoxRef)
      : rankingBoxRef;
    if (!isRankingBoxNode(rankingBox) || typeof itemId !== "string") return false;

    const component = this.getRankingComponent();
    const data = component.getData(rankingBox);
    const nextItems = data.items.filter((item) => item.id !== itemId);
    if (nextItems.length === data.items.length) return false;

    this.app.events.emit("node:change:start", { node: rankingBox });
    component.setData(rankingBox, {
      ...data,
      items: resequenceItems(nextItems),
    });
    this.bindRankingBox(rankingBox);
    rankingBox.getLayer()?.batchDraw();
    this.app.events.emit("node:changed", { node: rankingBox });
    return true;
  }

  restoreDraggedText(textNode) {
    const origin = this.dragOrigins.get(textNode.id());
    if (!origin) return;

    this.app.events.emit("node:change:start", { node: textNode });
    if (origin.parent && textNode.getParent() !== origin.parent) {
      textNode.moveTo(origin.parent);
    }
    textNode.setAbsolutePosition(origin.absolutePosition);
    textNode.getLayer()?.batchDraw();
    this.app.events.emit("node:changed", { node: textNode });
  }

  getRankingData(rankingNode) {
    return getRankingBoxMetrics(this.getRankingComponent().getData(rankingNode));
  }

  getInsertIndexForDropPoint(rankingNode, data, dropPoint) {
    if (!dropPoint) return data.items.length;

    const transform = rankingNode.getAbsoluteTransform().copy().invert();
    const localPoint = transform.point(dropPoint);
    return this.getInsertIndexForContentY(
      data.items,
      localPoint.y - data.headerHeight + data.scrollOffset,
    );
  }

  getInsertIndexForContentY(items, contentY) {
    if (!items.length) return 0;
    const metrics = getRankingBoxMetrics();

    for (let index = 0; index < items.length; index += 1) {
      const centerY =
        metrics.padding +
        index * (metrics.cardHeight + metrics.cardGap) +
        metrics.cardHeight / 2;
      if (contentY < centerY) {
        return index;
      }
    }
    return items.length;
  }

  reorderRankingItemFromCard(rankingNode, card) {
    const component = this.getRankingComponent();
    const data = this.getRankingData(rankingNode);
    const itemById = new Map(data.items.map((item) => [item.id, item]));
    const draggedItemId = card.getAttr("rankingItemId");
    const draggedItem = itemById.get(draggedItemId);
    if (!draggedItem) {
      this.refreshRankingBox(rankingNode);
      this.bindRankingBox(rankingNode);
      return;
    }

    const getCardCenterY = (itemCard) => {
      const box = itemCard.getClientRect({ relativeTo: this.app.stage });
      return box.y + box.height / 2;
    };

    const draggedCenterY = getCardCenterY(card);
    const otherCards = rankingNode
      .find(".ranking-item-card")
      .filter((itemCard) => itemCard !== card)
      .map((itemCard) => ({
        id: itemCard.getAttr("rankingItemId"),
        centerY: getCardCenterY(itemCard),
      }))
      .filter((item) => itemById.has(item.id))
      .sort((left, right) => left.centerY - right.centerY);

    if (otherCards.length !== data.items.length - 1) {
      this.refreshRankingBox(rankingNode);
      this.bindRankingBox(rankingNode);
      return;
    }

    const insertIndex = otherCards.findIndex((item) => draggedCenterY < item.centerY);
    const nextItems = otherCards.map((item) => itemById.get(item.id));
    nextItems.splice(insertIndex < 0 ? nextItems.length : insertIndex, 0, draggedItem);

    component.setData(rankingNode, {
      ...data,
      items: resequenceItems(nextItems),
    });
    this.bindRankingBox(rankingNode);
    rankingNode.getLayer()?.batchDraw();
  }

  scrollRankingBoxBy(rankingNode, delta) {
    const component = this.getRankingComponent();
    const data = this.getRankingData(rankingNode);
    component.setData(rankingNode, {
      ...data,
      scrollOffset: data.scrollOffset + delta,
    });
    this.bindRankingBox(rankingNode);
    rankingNode.getLayer()?.batchDraw();
  }

  refreshRankingBox(rankingNode) {
    this.getRankingComponent()?.syncNode?.(rankingNode);
  }

  refreshRankingBoxesForText(textNode) {
    const textId = textNode?.id?.();
    if (!textId) return;

    this.getRankingBoxes().forEach((rankingBox) => {
      const data = this.getRankingComponent().getData(rankingBox);
      if (!data.items.some((item) => item.sourceNodeId === textId)) return;
      this.refreshRankingBox(rankingBox);
      this.bindRankingBox(rankingBox);
      rankingBox.getLayer()?.batchDraw();
    });
  }

  removeTextReferences(textNode, { recordHistory = false } = {}) {
    const textId = textNode?.id?.();
    if (!textId) return;

    this.getRankingBoxes().forEach((rankingBox) => {
      const component = this.getRankingComponent();
      const data = component.getData(rankingBox);
      const nextItems = data.items.filter((item) => item.sourceNodeId !== textId);
      if (nextItems.length === data.items.length) return;

      if (recordHistory) {
        this.app.events.emit("node:change:start", { node: rankingBox });
      }
      component.setData(rankingBox, {
        ...data,
        items: resequenceItems(nextItems),
      });
      this.bindRankingBox(rankingBox);
      rankingBox.getLayer()?.batchDraw();
      if (recordHistory) {
        this.app.events.emit("node:changed", { node: rankingBox });
      }
    });
  }

  pruneMissingTextReferences({ recordHistory = false } = {}) {
    this.getRankingBoxes().forEach((rankingBox) => {
      const component = this.getRankingComponent();
      const data = component.getData(rankingBox);
      const nextItems = data.items.filter((item) => isTextNode(this.findNodeById(item.sourceNodeId)));
      if (nextItems.length === data.items.length) return;

      if (recordHistory) {
        this.app.events.emit("node:change:start", { node: rankingBox });
      }
      component.setData(rankingBox, {
        ...data,
        items: resequenceItems(nextItems),
      });
      this.bindRankingBox(rankingBox);
      rankingBox.getLayer()?.batchDraw();
      if (recordHistory) {
        this.app.events.emit("node:changed", { node: rankingBox });
      }
    });
  }

  refreshAndBindAllRankingBoxes() {
    this.pruneMissingTextReferences();
    this.getRankingBoxes().forEach((rankingBox) => {
      this.refreshRankingBox(rankingBox);
      this.bindRankingBox(rankingBox);
    });
    this.layer.batchDraw();
  }
}
