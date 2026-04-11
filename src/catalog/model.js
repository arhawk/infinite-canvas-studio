export const CATALOG_NODE_TYPE = "catalog";

export function createCatalogNode() {
  return {
    id: crypto.randomUUID(),
    type: CATALOG_NODE_TYPE,
    parentId: null,
    x: 40,
    y: 40,
    rotation: 0,
    scaleX: 1,
    scaleY: 1,
    visible: true,
    opacity: 1,
    focusPositionMode: null,
    savedFocus: null,
    data: {
      version: 1,
      items: [],
    },
  };
}

export function createCatalogItem({
  nodeId,
  title = "Untitled",
  titleSource = "node",
  parentId = null,
  order = 0,
  collapsed = false,
} = {}) {
  if (typeof nodeId !== "string" || !nodeId) {
    throw new Error("Catalog item requires a valid nodeId.");
  }

  return {
    id: crypto.randomUUID(),
    nodeId,
    title: typeof title === "string" && title.trim() ? title.trim() : "Untitled",
    titleSource: titleSource === "manual" ? "manual" : "node",
    parentId: typeof parentId === "string" && parentId ? parentId : null,
    order: Number.isFinite(order) ? order : 0,
    collapsed: collapsed === true,
  };
}
