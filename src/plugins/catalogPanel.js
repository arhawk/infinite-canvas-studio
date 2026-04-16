import { BasePlugin } from "../core/baseClasses.js";
import {
  applyCatalogData,
  buildCatalogTree,
  findCatalogItemByNodeId,
  getCatalogData,
  getCatalogItemById,
  insertCatalogItemIntoItems,
  moveCatalogItemInItems,
  toggleCatalogItemCollapsedInItems,
} from "../catalog/api.js";

function getCatalogNode(app) {
  return app.mainLayer.find(".selectable").find((node) => {
    return node.getAttr("componentType") === "catalog";
  }) || null;
}

function getNodeCenter(node) {
  const box = node?.getClientRect?.({ relativeTo: node.getStage() });
  if (!box) return null;

  return {
    x: box.x + box.width / 2,
    y: box.y + box.height / 2,
  };
}

function syncCatalogNodeUi(node, data) {
  const labelNode = node?.findOne?.(".catalog-label");
  if (labelNode) {
    labelNode.text(data.title);
  }

  const subtitleNode = node?.findOne?.(".catalog-subtitle");
  if (subtitleNode) {
    const count = data.items.length;
    subtitleNode.text(count === 1 ? "1 item" : `${count} items`);
  }
}

function getSiblingItems(items = [], parentId = null) {
  return items
    .filter((item) => item.parentId === parentId)
    .slice()
    .sort((left, right) => left.order - right.order);
}

function getPreviousSibling(items = [], item) {
  const siblings = getSiblingItems(items, item.parentId);
  const index = siblings.findIndex((candidate) => candidate.id === item.id);
  return index > 0 ? siblings[index - 1] : null;
}

function removeCatalogItemPromoteChildrenInItems(items = [], itemId) {
  const target = getCatalogItemById(items, itemId);
  if (!target) return items;

  const directChildren = getSiblingItems(items, target.id);
  const targetSiblings = getSiblingItems(items, target.parentId);
  const promotedIds = new Set(directChildren.map((item) => item.id));
  const orderedTargetSiblings = [];

  targetSiblings.forEach((sibling) => {
    if (sibling.id === target.id) {
      directChildren.forEach((child) => {
        orderedTargetSiblings.push({
          ...child,
          parentId: target.parentId,
        });
      });
      return;
    }

    orderedTargetSiblings.push(sibling);
  });

  const orderedIds = new Map(
    orderedTargetSiblings.map((item, index) => [item.id, index]),
  );

  return items
    .filter((item) => item.id !== target.id)
    .map((item) => {
      if (orderedIds.has(item.id)) {
        return {
          ...item,
          parentId: promotedIds.has(item.id) ? target.parentId : item.parentId,
          order: orderedIds.get(item.id),
        };
      }

      return item;
    });
}

function getNumberingLabel(items = [], item) {
  const path = [];
  let current = item;

  while (current) {
    const siblings = getSiblingItems(items, current.parentId);
    const index = siblings.findIndex((candidate) => candidate.id === current.id);
    path.unshift(String(Math.max(0, index) + 1));
    current = current.parentId ? getCatalogItemById(items, current.parentId) : null;
  }

  return path.join(".");
}

function getNodeDisplayTitle(node, fallback = "Untitled") {
  if (!node) return fallback;

  const componentType = node.getAttr("componentType");

  if (componentType === "text" && typeof node.text === "function") {
    return node.text()?.trim() || "Text";
  }

  if (componentType === "sticky") {
    return node.findOne(".sticky-text")?.text()?.trim() || "Sticky Note";
  }

  if (componentType === "page" || componentType === "container") {
    return (
      node.findOne(".container-label")?.text()?.trim()
      || (componentType === "page" ? "Page" : "Container")
    );
  }

  if (componentType === "button") {
    return node.findOne(".button-label")?.text()?.trim() || "Button";
  }

  if (componentType === "image") return "Image";
  return componentType || fallback;
}

function getRenderedItemTitle(item, node) {
  if (node) {
    return getNodeDisplayTitle(node, item?.title || "Untitled");
  }

  return item?.title || "Untitled";
}

function applyTitleToNode(node, title) {
  if (!node || typeof title !== "string") return false;

  const nextTitle = title.trim();
  if (!nextTitle) return false;

  const componentType = node.getAttr("componentType");

  if (componentType === "text" && typeof node.text === "function") {
    if (node.text() === nextTitle) return false;
    node.text(nextTitle);
    return true;
  }

  if (componentType === "sticky") {
    const textNode = node.findOne(".sticky-text");
    if (!textNode || textNode.text() === nextTitle) return false;
    textNode.text(nextTitle);
    return true;
  }

  if (componentType === "page" || componentType === "container") {
    const labelNode = node.findOne(".container-label");
    if (!labelNode || labelNode.text() === nextTitle) return false;
    labelNode.text(nextTitle);
    return true;
  }

  if (componentType === "button") {
    const labelNode = node.findOne(".button-label");
    if (!labelNode || labelNode.text() === nextTitle) return false;
    labelNode.text(nextTitle);
    return true;
  }

  return false;
}

export class CatalogPanelPlugin extends BasePlugin {
  static pluginId = "catalog-panel";

  onSetup() {
    const { panelEl = null, toggleEl = null } = this.options;
    this.panelEl = panelEl;
    this.toggleEl = toggleEl;
    this.selectedNodeId = null;
    this.selectedItemId = null;
    this.isCollapsed = false;
    this.dragOrigins = new Map();
    this.draggedCatalogItemId = null;
    this.titleArrowTap = {
      itemId: null,
      key: null,
      time: 0,
    };

    if (!this.panelEl) return;

    this.panelEl.innerHTML = "";
    this.panelEl.append(this.buildShell());
    this.syncCollapsedState();

    this.listen("node:added", ({ node }) => {
      this.bindCatalogDropForNode(node);
      this.render();
    });
    this.listen("node:removed", ({ node }) => {
      if (node?.id?.() === this.selectedNodeId) {
        this.selectedNodeId = null;
      }
      this.dragOrigins.delete(node?.id?.());
      this.render();
    });
    this.listen("node:changed", () => this.render());
    this.listen("interaction:change", () => this.render());
    this.listen("selection:change", ({ nodes }) => {
      this.selectedNodeId = nodes?.[0]?.id?.() ?? null;
      this.syncSelectionState();
    });
    this.listen("document:load:start", () => this.renderLoadingState());
    this.listen("document:load:end", () => {
      this.app.mainLayer.find(".selectable").forEach((node) => this.bindCatalogDropForNode(node));
      this.render();
    });

    this.app.mainLayer.find(".selectable").forEach((node) => this.bindCatalogDropForNode(node));
    this.render();
  }

  buildShell() {
    const shell = document.createElement("div");
    shell.className = "catalog-sidebar__surface";

    const header = document.createElement("div");
    header.className = "catalog-sidebar__header";

    const brand = document.createElement("div");
    brand.className = "catalog-sidebar__brand";

    const mark = document.createElement("span");
    mark.className = "catalog-sidebar__mark";
    mark.setAttribute("aria-hidden", "true");

    const titleWrap = document.createElement("div");
    const eyebrow = document.createElement("p");
    eyebrow.className = "eyebrow";
    eyebrow.textContent = "Outline";
    titleWrap.append(eyebrow);
    brand.append(mark, titleWrap);

    this.countEl = document.createElement("span");
    this.countEl.className = "catalog-sidebar__count";
    this.countEl.textContent = "0 items";

    const headerMeta = document.createElement("div");
    headerMeta.className = "catalog-sidebar__header-meta";
    headerMeta.append(this.countEl);

    header.append(brand, headerMeta);

    if (this.toggleEl) {
      this.listenDom(this.toggleEl, "click", () => {
        this.isCollapsed = !this.isCollapsed;
        this.syncCollapsedState();
      });
    }

    this.addSelectedEl = document.createElement("button");
    this.addSelectedEl.type = "button";
    this.addSelectedEl.className = "catalog-sidebar__add";
    this.addSelectedEl.textContent = "Add Selected";
    this.addSelectedEl.dataset.testid = "catalog-add-selected";
    this.listenDom(this.addSelectedEl, "click", () => {
      void this.app.commands.execute("catalog:add-selected");
    });

    this.statusEl = document.createElement("p");
    this.statusEl.className = "catalog-sidebar__status";

    this.listEl = document.createElement("div");
    this.listEl.className = "catalog-sidebar__list";
    this.listEl.dataset.testid = "catalog-panel-list";
    this.listenDom(this.listEl, "dragover", (event) => this.handlePanelDragOver(event));
    this.listenDom(this.listEl, "dragleave", () => this.clearDropPreview());
    this.listenDom(this.listEl, "drop", (event) => this.handleCatalogItemDrop(event));

    shell.append(header, this.addSelectedEl, this.statusEl, this.listEl);
    return shell;
  }

  get isEditable() {
    return !this.app.isReadOnly();
  }

  syncCollapsedState() {
    if (!this.panelEl || !this.toggleEl) return;

    this.panelEl.classList.toggle("is-collapsed", this.isCollapsed);
    this.toggleEl.setAttribute(
      "aria-label",
      this.isCollapsed ? "Expand outline" : "Collapse outline",
    );
    this.toggleEl.title = this.isCollapsed ? "Expand outline" : "Collapse outline";
    this.toggleEl.textContent = this.isCollapsed ? "<<" : ">>";
  }

  renderLoadingState() {
    if (!this.listEl) return;
    this.listEl.innerHTML = "";
    this.statusEl.textContent = "Loading outline...";
  }

  render() {
    if (!this.panelEl || !this.listEl) return;

    const catalogNode = getCatalogNode(this.app);
    const catalogData = getCatalogData(catalogNode);
    const tree = buildCatalogTree(catalogData.items);
    const isEditable = this.isEditable;

    this.panelEl.classList.toggle("is-editable", isEditable);
    this.panelEl.classList.toggle("is-readonly", !isEditable);
    this.addSelectedEl.hidden = !isEditable;
    this.countEl.textContent =
      catalogData.items.length === 1 ? "1 item" : `${catalogData.items.length} items`;
    this.listEl.innerHTML = "";

    if (!catalogNode) {
      this.statusEl.textContent = "The outline data node is missing.";
      this.listEl.append(this.createEmptyState("No outline data available"));
      return;
    }

    if (!tree.length) {
      this.statusEl.textContent = isEditable
        ? "Drop a canvas node here or add the current selection."
        : "The outline is ready for reading.";
      this.listEl.append(this.createEmptyState("The outline is empty"));
      return;
    }

    this.statusEl.textContent = isEditable
      ? "Click text to rename. Use arrow keys or drag items to arrange the outline."
      : "Click an item to jump around the canvas.";
    const fragment = document.createDocumentFragment();
    tree.forEach((item) => fragment.append(this.createItemElement(item, 0, catalogData.items)));
    this.listEl.append(fragment);
    this.syncSelectionState();
    this.restoreKeyboardFocus();
  }

  createEmptyState(message) {
    const empty = document.createElement("div");
    empty.className = "catalog-sidebar__empty";
    empty.textContent = message;
    return empty;
  }

  createItemElement(item, depth, allItems) {
    const node = this.app.mainLayer.findOne(`#${item.nodeId}`);
    const hasChildren = item.children.length > 0;
    const isEditable = this.isEditable;

    const row = document.createElement("div");
    row.className = "catalog-item";
    row.dataset.itemId = item.id;
    row.dataset.nodeId = item.nodeId;
    row.style.setProperty("--catalog-depth", String(depth));
    row.dataset.testid = `catalog-item-${item.id}`;
    row.setAttribute("role", "button");
    row.tabIndex = node ? 0 : -1;
    row.draggable = isEditable;
    row.classList.toggle("is-disabled", !node);

    const topLine = document.createElement("div");
    topLine.className = "catalog-item__top";

    const left = document.createElement("span");
    left.className = "catalog-item__main";

    const branch = document.createElement("button");
    branch.type = "button";
    branch.className = "catalog-item__toggle";
    branch.title = hasChildren ? (item.collapsed ? "Expand" : "Collapse") : "Outline level";
    branch.setAttribute("aria-label", branch.title);
    branch.disabled = !hasChildren;
    branch.textContent = getNumberingLabel(allItems, item);
    this.listenDom(branch, "click", (event) => {
      event.stopPropagation();
      if (!hasChildren) return;
      this.commitItemsMutation((items) => toggleCatalogItemCollapsedInItems(items, item.id));
    });

    const title = document.createElement("span");
    title.className = "catalog-item__title";
    title.dataset.testid = `catalog-item-title-${item.id}`;
    title.textContent = getRenderedItemTitle(item, node);
    title.contentEditable = isEditable ? "true" : "false";
    title.spellcheck = false;
    this.listenDom(title, "click", (event) => {
      if (!isEditable) return;
      event.stopPropagation();
      title.focus();
    });
    this.listenDom(title, "dblclick", (event) => {
      if (!isEditable) return;
      event.preventDefault();
      event.stopPropagation();
      title.blur();
      this.selectedItemId = item.id;
      row.focus({ preventScroll: true });
    });
    this.listenDom(title, "keydown", (event) => {
      if (!isEditable) return;
      event.stopPropagation();

      if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
        const now = performance.now();
        const isSecondTap =
          this.titleArrowTap.itemId === item.id &&
          this.titleArrowTap.key === event.key &&
          now - this.titleArrowTap.time < 450;

        this.titleArrowTap = {
          itemId: item.id,
          key: event.key,
          time: now,
        };

        if (!isSecondTap) return;

        event.preventDefault();
        title.blur();
        this.selectedItemId = item.id;
        this.moveItemByKey(item, allItems, event.key);
        return;
      }

      if (event.key === "ArrowUp" || event.key === "ArrowDown") {
        event.preventDefault();
        title.blur();
        this.selectedItemId = item.id;
        this.moveItemByKey(item, allItems, event.key);
        return;
      }

      if (event.key === "Enter") {
        event.preventDefault();
        title.blur();
      }
      if (event.key === "Escape") {
        event.preventDefault();
        title.textContent = getRenderedItemTitle(item, node);
        title.blur();
      }
    });
    this.listenDom(title, "blur", () => {
      if (!isEditable) return;
      const nextTitle = title.textContent?.trim() || item.title;
      this.renameItemAndCanvasNode(item, node, nextTitle);
    });

    left.append(branch, title);
    topLine.append(left);

    if (!node) {
      const badge = document.createElement("span");
      badge.className = "catalog-item__badge";
      badge.textContent = "Missing";
      topLine.append(badge);
    }

    row.append(topLine);

    this.listenDom(row, "click", (event) => {
      if (event.target === title && isEditable) return;
      this.focusCatalogItem(item);
    });
    this.listenDom(row, "keydown", (event) => this.handleItemKeydown(event, item, allItems));
    this.listenDom(row, "dragstart", (event) => {
      if (!isEditable) return;
      this.draggedCatalogItemId = item.id;
      event.dataTransfer?.setData("text/plain", item.id);
      if (event.dataTransfer) {
        event.dataTransfer.effectAllowed = "move";
      }
      row.classList.add("is-dragging");
    });
    this.listenDom(row, "dragend", () => {
      this.draggedCatalogItemId = null;
      this.clearDropPreview();
      row.classList.remove("is-dragging");
    });

    const wrapper = document.createElement("div");
    wrapper.className = "catalog-item-group";
    wrapper.dataset.itemId = item.id;
    wrapper.append(row);

    if (hasChildren && !item.collapsed) {
      const children = document.createElement("div");
      children.className = "catalog-item-group__children";
      item.children.forEach((child) => {
        children.append(this.createItemElement(child, depth + 1, allItems));
      });
      wrapper.append(children);
    }

    return wrapper;
  }

  handleItemKeydown(event, item, allItems) {
    if (event.target?.isContentEditable) return;

    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      this.focusCatalogItem(item);
      return;
    }

    if (!this.isEditable) return;

    const handled = this.moveItemByKey(item, allItems, event.key);
    if (handled) {
      this.selectedItemId = item.id;
      event.preventDefault();
      return;
    }

    if (event.key === "Backspace" || event.key === "Delete") {
      event.preventDefault();
      this.selectedItemId = null;
      this.commitItemsMutation((items) => removeCatalogItemPromoteChildrenInItems(items, item.id));
    }
  }

  moveItemByKey(item, allItems, key) {
    const siblings = getSiblingItems(allItems, item.parentId);
    const siblingIndex = siblings.findIndex((candidate) => candidate.id === item.id);

    if (key === "ArrowUp" && siblingIndex > 0) {
      return this.commitItemsMutation((items) =>
        moveCatalogItemInItems(items, item.id, {
          parentId: item.parentId,
          index: siblingIndex - 1,
        }),
      );
    }

    if (key === "ArrowDown" && siblingIndex >= 0 && siblingIndex < siblings.length - 1) {
      return this.commitItemsMutation((items) =>
        moveCatalogItemInItems(items, item.id, {
          parentId: item.parentId,
          index: siblingIndex + 1,
        }),
      );
    }

    if (key === "ArrowRight") {
      const previousSibling = getPreviousSibling(allItems, item);
      if (!previousSibling) return false;
      const childSiblings = getSiblingItems(allItems, previousSibling.id);
      return this.commitItemsMutation((items) =>
        moveCatalogItemInItems(items, item.id, {
          parentId: previousSibling.id,
          index: childSiblings.length,
        }),
      );
    }

    if (key === "ArrowLeft") {
      const parentItem = item.parentId ? getCatalogItemById(allItems, item.parentId) : null;
      if (!parentItem) return false;
      return this.commitItemsMutation((items) =>
        moveCatalogItemInItems(items, item.id, {
          parentId: parentItem.parentId,
          index: parentItem.order + 1,
        }),
      );
    }

    return false;
  }

  renameItemAndCanvasNode(item, node, nextTitle) {
    const currentTitle = getRenderedItemTitle(item, node);
    if (nextTitle === currentTitle && item.titleSource === "node") return false;

    const currentCanvasTitle = node ? getNodeDisplayTitle(node, currentTitle) : currentTitle;
    if (node && currentCanvasTitle !== nextTitle) {
      this.app.events.emit("node:change:start", { node });
      if (applyTitleToNode(node, nextTitle)) {
        this.app.events.emit("node:changed", { node });
        node.getLayer()?.batchDraw?.();
      }
    }

    return this.commitItemsMutation((items) =>
      items.map((candidate) =>
        candidate.id === item.id
          ? {
              ...candidate,
              title: nextTitle,
              titleSource: "node",
            }
          : candidate,
      ),
    );
  }

  commitItemsMutation(updater) {
    const catalogNode = getCatalogNode(this.app);
    if (!catalogNode) return false;

    const catalogData = getCatalogData(catalogNode);
    const nextItems = updater(catalogData.items);
    const nextData = {
      ...catalogData,
      items: nextItems,
    };

    this.app.events.emit("node:change:start", { node: catalogNode });
    applyCatalogData(catalogNode, nextData);
    syncCatalogNodeUi(catalogNode, nextData);
    this.app.events.emit("node:changed", { node: catalogNode });
    catalogNode.getLayer()?.batchDraw?.();
    this.app.mainLayer.batchDraw();
    return true;
  }

  bindCatalogDropForNode(node) {
    if (!node?.hasName?.("selectable")) return;
    if (node.getAttr("componentType") === "catalog") return;

    node.off(".catalogPanelDrop");
    node.on("dragstart.catalogPanelDrop", () => {
      this.dragOrigins.set(node.id(), {
        x: node.x(),
        y: node.y(),
      });
      if (this.isEditable) {
        this.panelEl?.classList.add("is-drag-active");
      }
    });
    node.on("dragmove.catalogPanelDrop", () => {
      this.updateDropPreview();
    });
    node.on("dragend.catalogPanelDrop", () => {
      this.handleCanvasNodeDrop(node);
      this.clearDropPreview();
    });
    this.cleanups.push(() => node.off(".catalogPanelDrop"));
  }

  handlePanelDragOver(event) {
    if (!this.isEditable) return;
    event.preventDefault();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = "move";
    }
    this.listEl.classList.add("is-drop-target");
    this.updateDomDropPreview(event.clientX, event.clientY);
  }

  handleCatalogItemDrop(event) {
    event.preventDefault();
    if (!this.isEditable || !this.draggedCatalogItemId) return;

    const catalogNode = getCatalogNode(this.app);
    const catalogData = getCatalogData(catalogNode);
    const move = this.getDropMoveFromPoint(event.clientX, event.clientY, catalogData.items);
    this.clearDropPreview();

    if (!move) return;
    try {
      this.commitItemsMutation((items) =>
        moveCatalogItemInItems(items, this.draggedCatalogItemId, move),
      );
    } catch (error) {
      console.warn("Could not move catalog item.", error);
    }
  }

  updateDomDropPreview(pageX, pageY) {
    if (!this.listEl) return;
    this.listEl.querySelectorAll(".catalog-item-group").forEach((element) => {
      element.classList.remove("is-drop-preview");
    });

    const targetElement = document.elementFromPoint(pageX, pageY);
    const targetItemEl = targetElement?.closest?.(".catalog-item-group");
    if (targetItemEl) {
      targetItemEl.classList.add("is-drop-preview");
    }
  }

  updateDropPreview() {
    if (!this.panelEl || this.isCollapsed || !this.isEditable) return;

    const point = this.getPointerPagePoint();
    if (!point) {
      this.clearDropPreview();
      return;
    }

    const insidePanel = this.isPointInsidePanel(point);
    this.listEl.classList.toggle("is-drop-target", insidePanel);
    this.updateDomDropPreview(point.x, point.y);
  }

  clearDropPreview() {
    this.panelEl?.classList.remove("is-drag-active");
    this.listEl?.classList.remove("is-drop-target");
    this.listEl?.querySelectorAll(".catalog-item-group").forEach((element) => {
      element.classList.remove("is-drop-preview");
    });
  }

  getPointerPagePoint() {
    const pointer = this.app.stage.getPointerPosition?.();
    if (!pointer) return null;

    const containerRect = this.app.stage.container().getBoundingClientRect();
    return {
      x: containerRect.left + pointer.x,
      y: containerRect.top + pointer.y,
    };
  }

  isPointInsidePanel(point) {
    const panelRect = this.panelEl.getBoundingClientRect();
    return (
      point.x >= panelRect.left &&
      point.x <= panelRect.right &&
      point.y >= panelRect.top &&
      point.y <= panelRect.bottom
    );
  }

  getDropMoveFromPoint(pageX, pageY, items) {
    const targetElement = document.elementFromPoint(pageX, pageY);
    const targetRow = targetElement?.closest?.(".catalog-item");
    const targetItemId = targetRow?.dataset?.itemId ?? null;

    if (!targetItemId) {
      return {
        parentId: null,
        index: getSiblingItems(items, null).length,
      };
    }

    const targetItem = getCatalogItemById(items, targetItemId);
    if (!targetItem) return null;

    const rowRect = targetRow.getBoundingClientRect();
    const verticalRatio = rowRect.height ? (pageY - rowRect.top) / rowRect.height : 0.5;
    const leftZone = rowRect.left + 16;
    const nestZone = rowRect.left + 48;

    if (pageX > nestZone) {
      return {
        parentId: targetItem.id,
        index: getSiblingItems(items, targetItem.id).length,
      };
    }

    if (pageX < leftZone && targetItem.parentId) {
      const parentItem = getCatalogItemById(items, targetItem.parentId);
      return {
        parentId: parentItem?.parentId ?? null,
        index: (parentItem?.order ?? 0) + 1,
      };
    }

    return {
      parentId: targetItem.parentId,
      index: targetItem.order + (verticalRatio > 0.5 ? 1 : 0),
    };
  }

  handleCanvasNodeDrop(node) {
    if (!this.panelEl || this.isCollapsed || !this.isEditable) return false;

    const point = this.getPointerPagePoint();
    if (!point || !this.isPointInsidePanel(point)) return false;

    const catalogNode = getCatalogNode(this.app);
    if (!catalogNode) return false;

    const catalogData = getCatalogData(catalogNode);
    const existingItem = findCatalogItemByNodeId(catalogData.items, node.id());
    const move = this.getDropMoveFromPoint(point.x, point.y, catalogData.items);
    let nextItems = catalogData.items;

    if (existingItem) {
      if (move) {
        try {
          nextItems = moveCatalogItemInItems(catalogData.items, existingItem.id, move);
        } catch (error) {
          console.warn("Could not move catalog item.", error);
          nextItems = catalogData.items;
        }
      }
    } else {
      nextItems = insertCatalogItemIntoItems(catalogData.items, {
        nodeId: node.id(),
        title: getNodeDisplayTitle(node),
        titleSource: "node",
        parentId: move?.parentId ?? null,
      });

      if (move?.index != null) {
        const insertedItem = findCatalogItemByNodeId(nextItems, node.id());
        if (insertedItem) {
          nextItems = moveCatalogItemInItems(nextItems, insertedItem.id, move);
        }
      }
    }

    const origin = this.dragOrigins.get(node.id());
    if (origin) {
      node.position(origin);
      node.getLayer()?.batchDraw?.();
      this.dragOrigins.delete(node.id());
    }

    this.clearDropPreview();
    return this.commitItemsMutation(() => nextItems);
  }

  focusCatalogItem(item) {
    const node = this.app.mainLayer.findOne(`#${item.nodeId}`);
    if (!node) return false;

    const center = getNodeCenter(node);
    if (!center) return false;

    this.app.stageApi.centerOn(center, { duration: 0.35 });
    this.selectedNodeId = item.nodeId;
    this.selectedItemId = item.id;
    this.syncSelectionState();
    return true;
  }

  syncSelectionState() {
    if (!this.listEl) return;

    const catalogNode = getCatalogNode(this.app);
    const items = getCatalogData(catalogNode).items;
    const selectedItem = this.selectedNodeId
      ? findCatalogItemByNodeId(items, this.selectedNodeId)
      : null;

    this.listEl.querySelectorAll(".catalog-item").forEach((element) => {
      element.classList.toggle("is-selected", element.dataset.itemId === selectedItem?.id);
    });
  }

  restoreKeyboardFocus() {
    if (!this.selectedItemId || document.activeElement?.isContentEditable) return;

    queueMicrotask(() => {
      const row = this.listEl?.querySelector(`[data-testid="catalog-item-${this.selectedItemId}"]`);
      if (row && this.isEditable) {
        row.focus({ preventScroll: true });
      }
    });
  }
}
