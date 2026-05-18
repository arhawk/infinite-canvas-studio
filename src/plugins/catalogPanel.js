import { BasePlugin } from "../core/baseClasses.js";
import {
  applyCatalogData,
  buildCatalogTree,
  findCatalogItemByNodeId,
  getCatalogData,
  getCatalogItemById,
  insertCatalogItemIntoItems,
  moveCatalogItemInItems,
  removeCatalogItemFromItems,
  toggleCatalogItemCollapsedInItems,
} from "../catalog/api.js";

const SHAPE_TYPE_LABELS = {
  rectangle: "Rectangle",
  oval: "Circle",
  rhombus: "Rhombus",
  triangle: "Triangle",
};

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

export function removeCatalogItemPromoteChildrenInItems(items = [], itemId) {
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

function getDefaultShapeTitle(node) {
  const shapeType = node?.getAttr?.("shapeType") ?? "rectangle";
  return SHAPE_TYPE_LABELS[shapeType] ?? "Shape";
}

function resolveCatalogTargetNode(node) {
  if (!node?.getStage?.()) return null;
  if (node.getAttr?.("componentType") === "page") return node;
  return node.findAncestor?.(".page-root", true) ?? node;
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
  if (componentType === "iframe") return "Iframe";
  if (componentType === "video") {
    return node.getAttr("videoTitle")?.trim() || "Local Video";
  }
  if (componentType === "shape") {
    const text = node.findOne(".shape-text")?.text()?.trim();
    if (text) return text;
    return fallback && fallback !== "Untitled" ? fallback : getDefaultShapeTitle(node);
  }
  if (componentType === "javascriptEditor") {
    return node.getAttr("javascriptEditorTitle")?.trim() || "JS Code Runner";
  }
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

  if (componentType === "video") {
    const currentTitle = node.getAttr("videoTitle")?.trim() || "Local Video";
    if (currentTitle === nextTitle) return false;
    node.setAttr("videoTitle", nextTitle);
    const titleEl = node._videoOverlayEl?.querySelector?.(".video-component__title");
    if (titleEl) {
      titleEl.textContent = nextTitle;
    }
    return true;
  }

  if (componentType === "shape") {
    const textNode = node.findOne(".shape-text");
    const currentTitle = textNode?.text()?.trim() || getDefaultShapeTitle(node);
    if (!textNode || currentTitle === nextTitle) return false;
    textNode.text(nextTitle);
    node.setAttr("shapeText", nextTitle);
    return true;
  }

  return false;
}

function getUniqueCatalogTitle(node, items = []) {
  const baseTitle = getNodeDisplayTitle(node);
  if (node?.getAttr?.("componentType") !== "shape") return baseTitle;
  if (node.findOne(".shape-text")?.text()?.trim()) return baseTitle;

  const matchingTitles = new Set(
    items
      .map((item) => item?.title?.trim?.() ?? "")
      .filter((title) => title === baseTitle || title.startsWith(`${baseTitle} `)),
  );

  if (!matchingTitles.has(baseTitle)) return baseTitle;

  let suffix = 2;
  while (matchingTitles.has(`${baseTitle} ${suffix}`)) {
    suffix += 1;
  }
  return `${baseTitle} ${suffix}`;
}

export class CatalogPanelPlugin extends BasePlugin {
  static pluginId = "catalog-panel";

  onSetup() {
    const { panelEl = null } = this.options;
    this.panelEl = panelEl;
    this.toggleEl = null;
    this.selectedNodeId = null;
    this.selectedItemId = null;
    this.isCollapsed = false;
    this.dragOrigins = new Map();
    this.draggedCatalogItemId = null;
    this.pendingRemoval = null;
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
      queueMicrotask(() => {
        if (!this.scrubOrphanCatalogItems()) {
          this.render();
        }
      });
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
      if (!this.scrubOrphanCatalogItems()) {
        this.render();
      }
    });
    this.listenDom(document, "pointerdown", (event) => {
      this.handleGlobalPointerDown(event);
    }, { capture: true });
    this.listenDom(document, "keydown", (event) => {
      this.handleGlobalKeydown(event);
    });

    this.app.mainLayer.find(".selectable").forEach((node) => this.bindCatalogDropForNode(node));
    if (!this.scrubOrphanCatalogItems()) {
      this.render();
    }

    this.cleanups.push(() => {
      this.hideRemovePopover();
      this.removePopoverEl?.remove?.();
    });
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

    this.toggleEl = document.createElement("button");
    this.toggleEl.type = "button";
    this.toggleEl.className = "catalog-sidebar__toggle";
    this.toggleEl.dataset.testid = "catalog-toggle";
    this.toggleEl.setAttribute("aria-label", "Collapse outline");
    this.toggleEl.innerHTML =
      '<svg width="10" height="10" viewBox="0 0 10 10" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M2 3.5L5 6.5L8 3.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    this.listenDom(this.toggleEl, "click", () => {
      this.isCollapsed = !this.isCollapsed;
      this.syncCollapsedState();
    });

    const headerMeta = document.createElement("div");
    headerMeta.className = "catalog-sidebar__header-meta";
    headerMeta.append(this.countEl, this.toggleEl);

    header.append(brand, headerMeta);

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

    this.removePopoverEl = document.createElement("section");
    this.removePopoverEl.className = "pen-dropdown catalog-remove-popover";
    this.removePopoverEl.hidden = true;
    this.removePopoverEl.dataset.testid = "catalog-remove-popover";
    this.removePopoverEl.setAttribute("role", "dialog");
    this.removePopoverEl.setAttribute("aria-modal", "false");
    this.removePopoverEl.innerHTML = `
        <div class="catalog-remove-popover__body">
          <h3 class="catalog-remove-popover__title">Remove from outline?</h3>
          <div class="catalog-remove-popover__actions">
            <button
              type="button"
            class="catalog-remove-popover__secondary"
            data-testid="catalog-remove-outline"
          >
            Outline only
          </button>
            <button
              type="button"
              class="catalog-remove-popover__danger"
              data-testid="catalog-remove-canvas"
            >
              Delete all
            </button>
            <button
              type="button"
              class="catalog-remove-popover__ghost"
              data-testid="catalog-remove-cancel"
          >
            Cancel
          </button>
        </div>
      </div>
    `;
    document.body.append(this.removePopoverEl);
    this.listenDom(this.removePopoverEl.querySelector("[data-testid='catalog-remove-outline']"), "click", () => {
      this.confirmRemoveOutlineOnly();
    });
    this.listenDom(this.removePopoverEl.querySelector("[data-testid='catalog-remove-canvas']"), "click", () => {
      this.confirmRemoveOutlineAndCanvas();
    });
    this.listenDom(this.removePopoverEl.querySelector("[data-testid='catalog-remove-cancel']"), "click", () => {
      this.hideRemovePopover();
    });

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
  }

  renderLoadingState() {
    if (!this.listEl) return;
    this.hideRemovePopover();
    this.listEl.innerHTML = "";
    this.statusEl.textContent = "Loading outline...";
  }

  render() {
    if (!this.panelEl || !this.listEl) return;

    const catalogNode = getCatalogNode(this.app);
    const catalogData = getCatalogData(catalogNode);
    const tree = buildCatalogTree(catalogData.items);
    const isEditable = this.isEditable;

    if (this.pendingRemoval && !getCatalogItemById(catalogData.items, this.pendingRemoval.itemId)) {
      this.hideRemovePopover();
    }

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
    title.contentEditable = "false";
    title.spellcheck = false;

    const beginTitleEdit = () => {
      if (!isEditable) return;
      title.contentEditable = "true";
      title.focus();
      const selection = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(title);
      range.collapse(false);
      selection?.removeAllRanges();
      selection?.addRange(range);
    };

    this.listenDom(title, "dblclick", (event) => {
      if (!isEditable) return;
      event.preventDefault();
      event.stopPropagation();
      beginTitleEdit();
    });
    this.listenDom(title, "keydown", (event) => {
      if (!isEditable || title.contentEditable !== "true") return;
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
      if (!isEditable || title.contentEditable !== "true") return;
      title.contentEditable = "false";
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

    this.listenDom(row, "click", () => {
      this.focusCatalogItem(item);
    });
    this.listenDom(row, "dblclick", (event) => {
      if (!isEditable || event.target?.closest?.(".catalog-item__toggle")) return;
      event.preventDefault();
      event.stopPropagation();
      beginTitleEdit();
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
      event.stopPropagation();
      this.focusCatalogItem(item);
      return;
    }

    if (!this.isEditable) return;

    const handled = this.moveItemByKey(item, allItems, event.key);
    if (handled) {
      this.selectedItemId = item.id;
      event.preventDefault();
      event.stopPropagation();
      return;
    }

    if (event.key === "Backspace" || event.key === "Delete") {
      event.preventDefault();
      event.stopPropagation();
      this.selectedItemId = null;
      this.requestRemoveCatalogItem(item, event.currentTarget);
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

  scrubOrphanCatalogItems() {
    const catalogNode = getCatalogNode(this.app);
    if (!catalogNode) return false;

    const catalogData = getCatalogData(catalogNode);
    const liveNodeIds = new Set(
      this.app.mainLayer.find(".selectable")
        .filter((node) => node?.getAttr?.("componentType") !== "catalog")
        .map((node) => node.id()),
    );
    const orphanIds = catalogData.items
      .filter((item) => !liveNodeIds.has(item.nodeId))
      .map((item) => item.id);

    if (!orphanIds.length) return false;

    let nextItems = catalogData.items;
    orphanIds.forEach((itemId) => {
      nextItems = removeCatalogItemFromItems(nextItems, itemId);
    });

    this.commitItemsMutation(() => nextItems);
    return true;
  }

  destroyCanvasNodeTree(rootNode) {
    if (!rootNode?.getStage?.()) return false;

    const descendants = rootNode.find?.(".selectable")?.toArray?.() ?? [];
    descendants
      .filter((node) => node?.getStage?.())
      .reverse()
      .forEach((node) => {
        this.app.events.emit("node:removed", { node });
      });

    this.app.events.emit("node:removed", { node: rootNode });
    rootNode.destroy();
    this.app.mainLayer.batchDraw();
    return true;
  }

  requestRemoveCatalogItem(item, anchorEl = null) {
    const node = this.app.mainLayer.findOne(`#${item.nodeId}`);
    const isMissing = !node?.getStage?.();
    if (isMissing) {
      return this.commitItemsMutation((items) => removeCatalogItemPromoteChildrenInItems(items, item.id));
    }

    this.showRemovePopover(item, anchorEl);
    return true;
  }

  confirmRemoveOutlineOnly() {
    const pending = this.pendingRemoval;
    if (!pending) return false;
    this.hideRemovePopover();
    return this.commitItemsMutation((items) => removeCatalogItemPromoteChildrenInItems(items, pending.itemId));
  }

  confirmRemoveOutlineAndCanvas() {
    const pending = this.pendingRemoval;
    if (!pending) return false;
    const node = this.app.mainLayer.findOne(`#${pending.nodeId}`);
    this.hideRemovePopover();
    const removed = this.commitItemsMutation((items) => removeCatalogItemFromItems(items, pending.itemId));
    if (!removed || !node?.getStage?.()) return removed;
    this.destroyCanvasNodeTree(node);
    return true;
  }

  showRemovePopover(item, anchorEl = null) {
    if (!this.removePopoverEl) return;
    this.pendingRemoval = {
      itemId: item.id,
      nodeId: item.nodeId,
      anchorEl,
    };
    this.removePopoverEl.hidden = false;
    this.positionRemovePopover(anchorEl);
  }

  hideRemovePopover() {
    this.pendingRemoval = null;
    if (!this.removePopoverEl) return;
    this.removePopoverEl.hidden = true;
  }

  positionRemovePopover(anchorEl = null) {
    if (!this.removePopoverEl || this.removePopoverEl.hidden) return;
    const rect = anchorEl?.getBoundingClientRect?.() ?? this.panelEl?.getBoundingClientRect?.();
    if (!rect) return;

    const gutter = 12;
    const popoverRect = this.removePopoverEl.getBoundingClientRect();
    const width = popoverRect.width || 288;
    const height = popoverRect.height || 180;
    const left = Math.min(
      window.innerWidth - width - gutter,
      Math.max(gutter, rect.right - width),
    );
    const top = Math.min(
      window.innerHeight - height - gutter,
      Math.max(gutter, rect.top + Math.min(rect.height + 8, 20)),
    );

    this.removePopoverEl.style.left = `${Math.round(left)}px`;
    this.removePopoverEl.style.top = `${Math.round(top)}px`;
  }

  handleGlobalPointerDown(event) {
    if (!this.pendingRemoval || this.removePopoverEl?.hidden) return;
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;
    if (this.removePopoverEl.contains(target)) return;
    if (this.pendingRemoval.anchorEl?.contains?.(target)) return;
    this.hideRemovePopover();
  }

  handleGlobalKeydown(event) {
    if (!this.pendingRemoval || this.removePopoverEl?.hidden) return;
    if (event.key !== "Escape") return;
    event.preventDefault();
    this.hideRemovePopover();
  }

  bindCatalogDropForNode(node) {
    if (!node?.hasName?.("selectable")) return;
    if (node.getAttr("componentType") === "catalog") return;

    node.off(".catalogPanelDrop");
    node.on("dragstart.catalogPanelDrop", () => {
      const targetNode = resolveCatalogTargetNode(node);
      this.dragOrigins.set(node.id(), {
        x: node.x(),
        y: node.y(),
        targetNodeId: targetNode?.id?.() ?? node.id(),
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

    const origin = this.dragOrigins.get(node.id());
    const targetNode = origin?.targetNodeId
      ? this.app.mainLayer.findOne(`#${origin.targetNodeId}`) ?? resolveCatalogTargetNode(node)
      : resolveCatalogTargetNode(node);
    if (!targetNode) return false;

    const catalogData = getCatalogData(catalogNode);
    const existingItem = findCatalogItemByNodeId(catalogData.items, targetNode.id());
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
        nodeId: targetNode.id(),
        title: getUniqueCatalogTitle(targetNode, catalogData.items),
        titleSource: "node",
        parentId: move?.parentId ?? null,
      });

      if (move?.index != null) {
        const insertedItem = findCatalogItemByNodeId(nextItems, targetNode.id());
        if (insertedItem) {
          nextItems = moveCatalogItemInItems(nextItems, insertedItem.id, move);
        }
      }
    }

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
    if (!this.app.isReadOnly()) {
      if (this.app.getEditorTool?.() !== "arrange") {
        this.app.setEditorTool?.("arrange");
      }
      this.app.getPlugin?.("selection")?.setSelected?.([node]);
    }
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
