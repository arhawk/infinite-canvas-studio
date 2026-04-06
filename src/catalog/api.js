import { CATALOG_NODE_TYPE, createCatalogItem, createCatalogNode } from "./model.js";

const CATALOG_DATA_VERSION = 1;

function normalizeCatalogTitle(title, fallback = "Catalog") {
  return typeof title === "string" && title.trim() ? title.trim() : fallback;
}

function normalizeCatalogItem(item = {}, fallbackOrder = 0) {
  if (typeof item?.id !== "string" || !item.id) {
    throw new Error("Catalog item requires a valid id.");
  }

  if (typeof item?.nodeId !== "string" || !item.nodeId) {
    throw new Error(`Catalog item "${item.id}" requires a valid nodeId.`);
  }

  return {
    id: item.id,
    nodeId: item.nodeId,
    title: normalizeCatalogTitle(item.title, "Untitled"),
    titleSource: item.titleSource === "manual" ? "manual" : "node",
    parentId: typeof item.parentId === "string" && item.parentId ? item.parentId : null,
    order: Number.isFinite(item.order) ? item.order : fallbackOrder,
    collapsed: item.collapsed === true,
  };
}

function normalizeSiblingOrder(items = []) {
  const siblingBuckets = new Map();

  items.forEach((item) => {
    const parentKey = item.parentId ?? "__root__";
    const bucket = siblingBuckets.get(parentKey) ?? [];
    bucket.push(item);
    siblingBuckets.set(parentKey, bucket);
  });

  const normalized = [];

  siblingBuckets.forEach((bucket) => {
    bucket
      .slice()
      .sort((a, b) => a.order - b.order)
      .forEach((item, index) => {
        normalized.push({
          ...item,
          order: index,
        });
      });
  });

  return items.map((item) => normalized.find((entry) => entry.id === item.id) ?? item);
}

function normalizeCatalogItems(items = []) {
  const normalized = Array.isArray(items)
    ? items.map((item, index) => normalizeCatalogItem(item, index))
    : [];

  return normalizeSiblingOrder(normalized);
}

function collectDescendantIds(items = [], itemId) {
  const descendants = new Set();
  const queue = [itemId];

  while (queue.length) {
    const currentId = queue.shift();
    items.forEach((item) => {
      if (item.parentId === currentId && !descendants.has(item.id)) {
        descendants.add(item.id);
        queue.push(item.id);
      }
    });
  }

  return descendants;
}

function sortItemsForTraversal(items = []) {
  return normalizeCatalogItems(items);
}

export function getCatalogNode(nodes = []) {
  return nodes.find((node) => node.type === CATALOG_NODE_TYPE) || null;
}

export function ensureCatalogNode(nodes = []) {
  const existing = getCatalogNode(nodes);

  if (existing) {
    return {
      nodes,
      catalogNode: existing,
    };
  }

  const catalogNode = createCatalogNode();

  return {
    nodes: [...nodes, catalogNode],
    catalogNode,
  };
}

export function getCatalogData(catalogNode) {
  const data = catalogNode?.data ?? catalogNode?.getAttr?.("data");

  return {
    version: CATALOG_DATA_VERSION,
    title: normalizeCatalogTitle(data?.title),
    items: normalizeCatalogItems(data?.items),
  };
}

export function getCatalogItems(catalogNode) {
  return getCatalogData(catalogNode).items;
}

export function applyCatalogData(catalogNode, catalogData = {}) {
  const nextData = {
    version: CATALOG_DATA_VERSION,
    title: normalizeCatalogTitle(catalogData.title),
    items: normalizeCatalogItems(catalogData.items),
  };

  if (typeof catalogNode?.setAttr === "function") {
    catalogNode.setAttr("data", nextData);
    return nextData;
  }

  return {
    ...catalogNode,
    data: nextData,
  };
}

export function updateCatalogNodeItems(nodes = [], updater) {
  const { nodes: nextNodes, catalogNode } = ensureCatalogNode(nodes);
  const oldData = getCatalogData(catalogNode);
  const newItems = updater(oldData.items);

  return nextNodes.map((node) => {
    if (node.id !== catalogNode.id) return node;

    return {
      ...node,
      data: {
        ...oldData,
        version: CATALOG_DATA_VERSION,
        items: normalizeCatalogItems(newItems),
      },
    };
  });
}

export function getCatalogItemById(items = [], itemId) {
  return sortItemsForTraversal(items).find((item) => item.id === itemId) || null;
}

export function findCatalogItemByNodeId(items = [], nodeId) {
  return sortItemsForTraversal(items).find((item) => item.nodeId === nodeId) || null;
}

export function getCatalogItemByNodeId(nodes = [], nodeId) {
  const catalogNode = getCatalogNode(nodes);
  return findCatalogItemByNodeId(getCatalogItems(catalogNode), nodeId);
}

export function insertCatalogItemIntoItems(items = [], itemLike = {}) {
  const normalizedItems = sortItemsForTraversal(items);
  const parentId = typeof itemLike.parentId === "string" && itemLike.parentId ? itemLike.parentId : null;
  const siblingCount = normalizedItems.filter((item) => item.parentId === parentId).length;
  const item = itemLike.id ? normalizeCatalogItem(itemLike, siblingCount) : createCatalogItem(itemLike);

  return normalizeCatalogItems([
    ...normalizedItems,
    {
      ...item,
      parentId,
      order: siblingCount,
    },
  ]);
}

export function insertCatalogItem(nodes = [], item) {
  return updateCatalogNodeItems(nodes, (items) => insertCatalogItemIntoItems(items, item));
}

export function removeCatalogItemFromItems(items = [], itemId) {
  const normalizedItems = sortItemsForTraversal(items);
  const idsToDelete = new Set([itemId, ...collectDescendantIds(normalizedItems, itemId)]);
  return normalizeCatalogItems(normalizedItems.filter((item) => !idsToDelete.has(item.id)));
}

export function removeCatalogItem(nodes = [], itemId) {
  return updateCatalogNodeItems(nodes, (items) => removeCatalogItemFromItems(items, itemId));
}

export function updateCatalogItemTitleInItems(items = [], itemId, title) {
  const normalizedItems = sortItemsForTraversal(items);
  return normalizeCatalogItems(
    normalizedItems.map((item) =>
      item.id === itemId
        ? {
            ...item,
            title: normalizeCatalogTitle(title, item.title),
            titleSource: "manual",
          }
        : item,
    ),
  );
}

export function updateCatalogItemTitle(nodes = [], itemId, title) {
  return updateCatalogNodeItems(nodes, (items) => updateCatalogItemTitleInItems(items, itemId, title));
}

export function toggleCatalogItemCollapsedInItems(items = [], itemId) {
  const normalizedItems = sortItemsForTraversal(items);
  return normalizeCatalogItems(
    normalizedItems.map((item) =>
      item.id === itemId
        ? {
            ...item,
            collapsed: !item.collapsed,
          }
        : item,
    ),
  );
}

export function toggleCatalogItemCollapsed(nodes = [], itemId) {
  return updateCatalogNodeItems(nodes, (items) => toggleCatalogItemCollapsedInItems(items, itemId));
}

export function moveCatalogItemInItems(items = [], itemId, { parentId = null, index = null } = {}) {
  const normalizedItems = sortItemsForTraversal(items);
  const currentItem = getCatalogItemById(normalizedItems, itemId);

  if (!currentItem) {
    return normalizedItems;
  }

  if (parentId === itemId) {
    throw new Error("Catalog item cannot become its own parent.");
  }

  const descendantIds = collectDescendantIds(normalizedItems, itemId);
  if (parentId && descendantIds.has(parentId)) {
    throw new Error("Catalog item cannot be moved inside its own descendant.");
  }

  const targetParentId = typeof parentId === "string" && parentId ? parentId : null;
  const siblingItems = normalizedItems.filter(
    (item) => item.parentId === targetParentId && item.id !== itemId,
  );
  const targetIndex = Number.isFinite(index)
    ? Math.max(0, Math.min(index, siblingItems.length))
    : siblingItems.length;

  const movedItem = {
    ...currentItem,
    parentId: targetParentId,
  };

  siblingItems.splice(targetIndex, 0, movedItem);

  const siblingIds = new Set(siblingItems.map((item) => item.id));
  const untouchedItems = normalizedItems.filter((item) => !siblingIds.has(item.id) && item.id !== itemId);

  return normalizeCatalogItems([
    ...untouchedItems,
    ...siblingItems.map((item, siblingIndex) => ({
      ...item,
      order: siblingIndex,
    })),
  ]);
}

export function moveCatalogItem(nodes = [], itemId, options = {}) {
  return updateCatalogNodeItems(nodes, (items) => moveCatalogItemInItems(items, itemId, options));
}

export function reparentCatalogItemInItems(items = [], itemId, parentId = null, index = null) {
  return moveCatalogItemInItems(items, itemId, { parentId, index });
}

export function reparentCatalogItem(nodes = [], itemId, parentId = null, index = null) {
  return updateCatalogNodeItems(nodes, (items) =>
    reparentCatalogItemInItems(items, itemId, parentId, index),
  );
}

export function reorderCatalogItemsInItems(items = [], parentId = null, orderedItemIds = []) {
  const normalizedItems = sortItemsForTraversal(items);
  const siblingItems = normalizedItems.filter((item) => item.parentId === parentId);
  const requestedIds = new Set(orderedItemIds);

  const reorderedSiblings = [
    ...orderedItemIds
      .map((id) => siblingItems.find((item) => item.id === id))
      .filter(Boolean),
    ...siblingItems.filter((item) => !requestedIds.has(item.id)),
  ].map((item, index) => ({
    ...item,
    order: index,
  }));

  const siblingIds = new Set(reorderedSiblings.map((item) => item.id));
  const untouchedItems = normalizedItems.filter((item) => !siblingIds.has(item.id));

  return normalizeCatalogItems([...untouchedItems, ...reorderedSiblings]);
}

export function reorderCatalogItems(nodes = [], parentId = null, orderedItemIds = []) {
  return updateCatalogNodeItems(nodes, (items) =>
    reorderCatalogItemsInItems(items, parentId, orderedItemIds),
  );
}

export function buildCatalogTree(items = []) {
  const normalizedItems = sortItemsForTraversal(items);
  const map = new Map();
  const roots = [];

  normalizedItems.forEach((item) => {
    map.set(item.id, { ...item, children: [] });
  });

  normalizedItems.forEach((item) => {
    const current = map.get(item.id);
    if (item.parentId && map.has(item.parentId)) {
      map.get(item.parentId).children.push(current);
    } else {
      roots.push(current);
    }
  });

  return roots;
}

export function traverseCatalogItems(items = []) {
  const ordered = [];

  const visit = (nodes) => {
    nodes.forEach((node) => {
      ordered.push(node);
      visit(node.children);
    });
  };

  visit(buildCatalogTree(items));
  return ordered;
}
