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
  updateCatalogItemTitleInItems,
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

  if (componentType === "image") return "Image";
  return componentType || fallback;
}

function getRenderedItemTitle(item, node) {
  if (item?.titleSource === "manual") {
    return item.title || "Untitled";
  }

  if (node) {
    return getNodeDisplayTitle(node, item?.title || "Untitled");
  }

  return item?.title || "Untitled";
}

function getDepthMarker(depth = 0, hasChildren = false, collapsed = false) {
  const markers = ["+", "=", "-", "•"];
  if (hasChildren && collapsed) {
    return "+";
  }
  return markers[Math.min(depth, markers.length - 1)];
}

export class CatalogPanelPlugin extends BasePlugin {
  static pluginId = "catalog-panel";

  onSetup() {
    const { panelEl = null } = this.options;
    this.panelEl = panelEl;
    this.selectedNodeId = null;
    this.isCollapsed = false;
    this.dragOrigins = new Map();

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

    this.toggleEl = document.createElement("button");
    this.toggleEl.type = "button";
    this.toggleEl.className = "catalog-sidebar__toggle";
    this.toggleEl.setAttribute("aria-label", "Collapse outline");
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
    this.statusEl.textContent = "Drop a canvas node here or add the current selection.";

    this.listEl = document.createElement("div");
    this.listEl.className = "catalog-sidebar__list";
    this.listEl.dataset.testid = "catalog-panel-list";
    this.listenDom(this.listEl, "dragover", (event) => this.handlePanelDragOver(event));
    this.listenDom(this.listEl, "dragleave", () => this.clearDropPreview());
    this.listenDom(this.listEl, "drop", (event) => event.preventDefault());

    shell.append(header, this.addSelectedEl, this.statusEl, this.listEl);
    return shell;
  }

  syncCollapsedState() {
    if (!this.panelEl || !this.toggleEl) return;

    this.panelEl.classList.toggle("is-collapsed", this.isCollapsed);
    this.toggleEl.setAttribute(
      "aria-label",
      this.isCollapsed ? "Expand outline" : "Collapse outline",
    );
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

    this.countEl.textContent =
      catalogData.items.length === 1 ? "1 item" : `${catalogData.items.length} items`;
    this.listEl.innerHTML = "";

    if (!catalogNode) {
      this.statusEl.textContent = "The outline data node is missing.";
      this.listEl.append(this.createEmptyState("No outline data available"));
      return;
    }

    if (!tree.length) {
      this.statusEl.textContent = "Drop a canvas node here or add the current selection.";
      this.listEl.append(this.createEmptyState("The outline is empty"));
      return;
    }

    this.statusEl.textContent =
      "Click to jump. Drag a canvas node here to add it, or drop onto an item to nest it.";
    const fragment = document.createDocumentFragment();
    tree.forEach((item) => fragment.append(this.createItemElement(item, 0, catalogData.items)));
    this.listEl.append(fragment);
    this.syncSelectionState();
  }

  createEmptyState(message) {
    const empty = document.createElement("div");
    empty.className = "catalog-sidebar__empty";
    empty.textContent = message;
    return empty;
  }

  createActionButton(label, handler, disabled = false) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "catalog-item__action";
    button.title = label;
    button.setAttribute("aria-label", label);
    button.disabled = disabled;
    button.textContent = label;
    this.listenDom(button, "click", (event) => {
      event.stopPropagation();
      handler();
    });
    return button;
  }

  createItemElement(item, depth, allItems) {
    const node = this.app.mainLayer.findOne(`#${item.nodeId}`);
    const hasChildren = item.children.length > 0;
    const previousSibling = getPreviousSibling(allItems, item);
    const parentItem = item.parentId ? getCatalogItemById(allItems, item.parentId) : null;
    const siblings = getSiblingItems(allItems, item.parentId);
    const siblingIndex = siblings.findIndex((candidate) => candidate.id === item.id);

    const row = document.createElement("div");
    row.className = "catalog-item";
    row.dataset.itemId = item.id;
    row.dataset.nodeId = item.nodeId;
    row.style.setProperty("--catalog-depth", String(depth));
    row.dataset.testid = `catalog-item-${item.id}`;
    row.setAttribute("role", "button");
    row.tabIndex = node ? 0 : -1;
    row.classList.toggle("is-disabled", !node);

    const topLine = document.createElement("div");
    topLine.className = "catalog-item__top";

    const left = document.createElement("span");
    left.className = "catalog-item__main";

    const branch = document.createElement("button");
    branch.type = "button";
    branch.className = "catalog-item__toggle";
    branch.title = item.collapsed ? "Expand" : "Collapse";
    branch.setAttribute("aria-label", item.collapsed ? "Expand" : "Collapse");
    branch.disabled = !hasChildren;
    branch.textContent = getDepthMarker(depth, hasChildren, item.collapsed);
    this.listenDom(branch, "click", (event) => {
      event.stopPropagation();
      if (!hasChildren) return;
      this.commitItemsMutation((items) => toggleCatalogItemCollapsedInItems(items, item.id));
    });

    const title = document.createElement("span");
    title.className = "catalog-item__title";
    title.dataset.testid = `catalog-item-title-${item.id}`;
    title.textContent = getRenderedItemTitle(item, node);

    left.append(branch, title);
    topLine.append(left);

    if (!node) {
      const badge = document.createElement("span");
      badge.className = "catalog-item__badge";
      badge.textContent = "Missing";
      topLine.append(badge);
    }

    const actions = document.createElement("div");
    actions.className = "catalog-item__actions";
    actions.append(
      this.createActionButton("Up", () => {
        this.commitItemsMutation((items) =>
          moveCatalogItemInItems(items, item.id, {
            parentId: item.parentId,
            index: Math.max(0, item.order - 1),
          }),
        );
      }, siblingIndex <= 0),
      this.createActionButton("Down", () => {
        this.commitItemsMutation((items) =>
          moveCatalogItemInItems(items, item.id, {
            parentId: item.parentId,
            index: item.order + 1,
          }),
        );
      }, siblingIndex < 0 || siblingIndex >= siblings.length - 1),
      this.createActionButton("In", () => {
        if (!previousSibling) return;
        const childSiblings = getSiblingItems(allItems, previousSibling.id);
        this.commitItemsMutation((items) =>
          moveCatalogItemInItems(items, item.id, {
            parentId: previousSibling.id,
            index: childSiblings.length,
          }),
        );
      }, !previousSibling),
      this.createActionButton("Out", () => {
        if (!parentItem) return;
        this.commitItemsMutation((items) =>
          moveCatalogItemInItems(items, item.id, {
            parentId: parentItem.parentId,
            index: parentItem.order + 1,
          }),
        );
      }, !parentItem),
      this.createActionButton("Rename", () => this.renameItem(item)),
      this.createActionButton("Remove", () => {
        this.commitItemsMutation((items) => removeCatalogItemFromItems(items, item.id));
      }),
    );

    row.append(topLine, actions);

    this.listenDom(row, "click", () => this.focusCatalogItem(item));
    this.listenDom(row, "keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        this.focusCatalogItem(item);
      }
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

  renameItem(item) {
    const nextTitle = window.prompt("Rename outline item", item.title);
    if (nextTitle == null) return;

    this.commitItemsMutation((items) => updateCatalogItemTitleInItems(items, item.id, nextTitle));
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
      this.panelEl?.classList.add("is-drag-active");
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
    event.preventDefault();
    this.listEl.classList.add("is-drop-target");
  }

  updateDropPreview() {
    if (!this.panelEl || this.isCollapsed) return;

    const pointer = this.app.stage.getPointerPosition?.();
    const containerRect = this.app.stage.container().getBoundingClientRect();
    if (!pointer) {
      this.clearDropPreview();
      return;
    }

    const pagePoint = {
      x: containerRect.left + pointer.x,
      y: containerRect.top + pointer.y,
    };

    const panelRect = this.panelEl.getBoundingClientRect();
    const insidePanel =
      pagePoint.x >= panelRect.left &&
      pagePoint.x <= panelRect.right &&
      pagePoint.y >= panelRect.top &&
      pagePoint.y <= panelRect.bottom;

    this.listEl.classList.toggle("is-drop-target", insidePanel);
    this.listEl.querySelectorAll(".catalog-item-group").forEach((element) => {
      element.classList.remove("is-drop-preview");
    });

    if (!insidePanel) return;

    const targetElement = document.elementFromPoint(pagePoint.x, pagePoint.y);
    const targetItemEl = targetElement?.closest?.(".catalog-item-group");
    if (targetItemEl) {
      targetItemEl.classList.add("is-drop-preview");
    }
  }

  clearDropPreview() {
    this.panelEl?.classList.remove("is-drag-active");
    this.listEl?.classList.remove("is-drop-target");
    this.listEl?.querySelectorAll(".catalog-item-group").forEach((element) => {
      element.classList.remove("is-drop-preview");
    });
  }

  handleCanvasNodeDrop(node) {
    if (!this.panelEl || this.isCollapsed) return false;

    const pointer = this.app.stage.getPointerPosition?.();
    const containerRect = this.app.stage.container().getBoundingClientRect();
    if (!pointer) return false;

    const pagePoint = {
      x: containerRect.left + pointer.x,
      y: containerRect.top + pointer.y,
    };

    const panelRect = this.panelEl.getBoundingClientRect();
    const droppedInsidePanel =
      pagePoint.x >= panelRect.left &&
      pagePoint.x <= panelRect.right &&
      pagePoint.y >= panelRect.top &&
      pagePoint.y <= panelRect.bottom;

    if (!droppedInsidePanel) return false;

    const targetElement = document.elementFromPoint(pagePoint.x, pagePoint.y);
    const targetItemEl = targetElement?.closest?.("[data-item-id]");
    const targetItemId = targetItemEl?.dataset?.itemId ?? null;

    const catalogNode = getCatalogNode(this.app);
    if (!catalogNode) return false;

    const catalogData = getCatalogData(catalogNode);
    const existingItem = findCatalogItemByNodeId(catalogData.items, node.id());
    let nextItems = catalogData.items;

    if (existingItem) {
      if (targetItemId && targetItemId !== existingItem.id) {
        const childItems = getSiblingItems(catalogData.items, targetItemId);
        nextItems = moveCatalogItemInItems(catalogData.items, existingItem.id, {
          parentId: targetItemId,
          index: childItems.length,
        });
      } else if (!targetItemId) {
        const rootItems = getSiblingItems(catalogData.items, null);
        nextItems = moveCatalogItemInItems(catalogData.items, existingItem.id, {
          parentId: null,
          index: rootItems.length,
        });
      }
    } else {
      nextItems = insertCatalogItemIntoItems(catalogData.items, {
        nodeId: node.id(),
        title: getNodeDisplayTitle(node),
        titleSource: "node",
        parentId: targetItemId,
      });
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
}
