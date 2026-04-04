import { CATALOG_NODE_TYPE, createCatalogNode } from "./catalogModel";

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

export function getCatalogItems(catalogNode) {
  if (!catalogNode || typeof catalogNode !== "object") return [];
  if (!catalogNode.data || typeof catalogNode.data !== "object") return [];
  return Array.isArray(catalogNode.data.items) ? catalogNode.data.items : [];
}

export function updateCatalogNodeItems(nodes = [], updater) {
  const { nodes: nextNodes, catalogNode } = ensureCatalogNode(nodes);
  const oldItems = getCatalogItems(catalogNode);
  const newItems = updater(oldItems);

  return nextNodes.map((node) => {
    if (node.id !== catalogNode.id) return node;

    return {
      ...node,
      data: {
        ...node.data,
        version: 1,
        items: newItems,
      },
    };
  });
}

export function insertCatalogItem(nodes = [], item) {
  return updateCatalogNodeItems(nodes, (items) => [...items, item]);
}

export function removeCatalogItem(nodes = [], itemId) {
  return updateCatalogNodeItems(nodes, (items) => {
    const idsToDelete = new Set([itemId]);

    let changed = true;
    while (changed) {
      changed = false;

      for (const item of items) {
        if (
          item.parentId &&
          idsToDelete.has(item.parentId) &&
          !idsToDelete.has(item.id)
        ) {
          idsToDelete.add(item.id);
          changed = true;
        }
      }
    }

    return items.filter((item) => !idsToDelete.has(item.id));
  });
}

export function updateCatalogItemTitle(nodes = [], itemId, title) {
  return updateCatalogNodeItems(nodes, (items) =>
    items.map((item) =>
      item.id === itemId
        ? {
            ...item,
            title: typeof title === "string" && title.trim() ? title.trim() : item.title,
          }
        : item,
    ),
  );
}

export function getCatalogItemByNodeId(nodes = [], nodeId) {
  const catalogNode = getCatalogNode(nodes);
  const items = getCatalogItems(catalogNode);
  return items.find((item) => item.nodeId === nodeId) || null;
}

export function buildCatalogTree(items = []) {
  const map = new Map();
  const roots = [];

  items.forEach((item) => {
    map.set(item.id, { ...item, children: [] });
  });

  items.forEach((item) => {
    const current = map.get(item.id);
    if (item.parentId && map.has(item.parentId)) {
      map.get(item.parentId).children.push(current);
    } else {
      roots.push(current);
    }
  });

  const sortRecursively = (nodesToSort) => {
    nodesToSort.sort((a, b) => a.order - b.order);
    nodesToSort.forEach((node) => sortRecursively(node.children));
  };

  sortRecursively(roots);
  return roots;
}