import { BasePlugin } from "../core/baseClasses.js";
import { getCatalogItems, buildCatalogTree } from "../catalog/api.js";
import { CATALOG_NODE_TYPE } from "../catalog/model.js";

/**
 * Computes the set of canvas nodeIds that should be hidden.
 *
 * A node is hidden when it is a descendant of a collapsed catalog item.
 * Algorithm: DFS top-down through the tree.
 *   - If an item is collapsed, gather ALL its descendants into the hidden set.
 *   - If an item is not collapsed, recurse into its children to check their state.
 *
 * @param {Array} tree - Result of buildCatalogTree(): root items each with a `children` array.
 * @returns {Set<string>} Set of nodeIds that should be hidden on the canvas.
 */
export function computeHiddenNodeIds(tree) {
  const hidden = new Set();

  function gatherAll(items) {
    for (const item of items) {
      hidden.add(item.nodeId);
      if (item.children.length > 0) gatherAll(item.children);
    }
  }

  function visit(items) {
    for (const item of items) {
      if (item.collapsed && item.children.length > 0) {
        // This item is collapsed — hide all descendants regardless of their own collapsed state
        gatherAll(item.children);
      } else {
        // Not collapsed here — recurse to check children's own collapsed state
        visit(item.children);
      }
    }
  }

  visit(tree);
  return hidden;
}

/**
 * Applies canvas node visibility based on the current catalog collapse state.
 *
 * Visibility is derived state — no history events are emitted here.
 * The catalog node's own `collapsed` changes are tracked by HistoryPlugin.
 * This function is called reactively whenever the catalog node changes.
 *
 * @param {App} app
 */
export function applyBranchVisibility(app) {
  // Find the catalog Konva node (visible=false but still in the layer)
  const allSelectable = app.mainLayer.find(".selectable");
  const catalogKonvaNode = allSelectable.find(
    (n) => n.getAttr("componentType") === CATALOG_NODE_TYPE,
  );

  if (!catalogKonvaNode) return;

  const items = getCatalogItems(catalogKonvaNode);
  if (!items.length) {
    // No catalog items — ensure all nodes are visible
    allSelectable.forEach((node) => {
      const type = node.getAttr("componentType");
      if (type === CATALOG_NODE_TYPE || type === "connection") return;
      node.visible(true);
    });
    app.mainLayer.find(".connection-root").forEach((node) => node.visible(true));
    app.mainLayer.batchDraw();
    return;
  }

  const tree = buildCatalogTree(items);
  const hiddenNodeIds = computeHiddenNodeIds(tree);

  // Apply visibility to regular canvas nodes
  allSelectable.forEach((node) => {
    const type = node.getAttr("componentType");
    if (type === CATALOG_NODE_TYPE) return; // never touch the catalog data node
    if (type === "connection") return;      // connections handled separately below
    node.visible(!hiddenNodeIds.has(node.id()));
  });

  // Apply visibility to connections:
  // hide a connection if either its source or target node is hidden
  app.mainLayer.find(".connection-root").forEach((node) => {
    const srcId = node.getAttr("sourceNodeId");
    const tgtId = node.getAttr("targetNodeId");
    node.visible(!hiddenNodeIds.has(srcId) && !hiddenNodeIds.has(tgtId));
  });

  app.mainLayer.batchDraw();
}

export class MindMapBranchPlugin extends BasePlugin {
  static pluginId = "mind-map-branch";

  onSetup() {
    // React when the catalog node's data changes (collapse toggle, add/remove items).
    // This also covers undo/redo: history.js emits node:changed after restoring a snapshot.
    this.listen("node:changed", ({ node }) => {
      if (node.getAttr("componentType") === CATALOG_NODE_TYPE) {
        applyBranchVisibility(this.app);
      }
    });

    // Re-apply after a full document load/restore
    this.listen("document:load:end", () => {
      applyBranchVisibility(this.app);
    });

    // Re-apply when a new connection is added so it inherits the correct visibility
    this.listen("node:added", ({ node }) => {
      if (node.getAttr("componentType") === "connection") {
        applyBranchVisibility(this.app);
      }
    });
  }
}
