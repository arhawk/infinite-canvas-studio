import { BaseCommand, BasePlugin } from "../core/baseClasses.js";
import {
  applyCatalogData,
  findCatalogItemByNodeId,
  getCatalogData,
  insertCatalogItemIntoItems,
} from "../catalog/api.js";

const SHAPE_TYPE_LABELS = {
  rectangle: "Rectangle",
  oval: "Circle",
  rhombus: "Rhombus",
  triangle: "Triangle",
};

function getSelectionPlugin(app) {
  return app.plugins.find(
    (plugin) => plugin?.constructor?.pluginId === "selection",
  ) || null;
}

function getCatalogNode(app) {
  return app.mainLayer.find(".selectable").find((node) => {
    return node.getAttr("componentType") === "catalog";
  }) || null;
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

function notifyCatalogAction(message) {
  if (!message) return;

  if (import.meta.env.VITE_E2E === "1") {
    console.info(`[catalog] ${message}`);
    return;
  }

  window.alert(message);
}

function getDefaultShapeTitle(node) {
  const shapeType = node?.getAttr?.("shapeType") ?? "rectangle";
  return SHAPE_TYPE_LABELS[shapeType] ?? "Shape";
}

export function resolveCatalogTargetNode(node) {
  if (!node?.getStage?.()) return null;
  if (node.getAttr?.("componentType") === "page") return node;
  return node.findAncestor?.(".page-root", true) ?? node;
}

export function getNodeDisplayTitle(node) {
  if (!node) return "Untitled";

  const componentType = node.getAttr("componentType");

  if (componentType === "text" && typeof node.text === "function") {
    return node.text()?.trim() || "Text";
  }

  if (componentType === "sticky") {
    return node.findOne(".sticky-text")?.text()?.trim() || "Sticky Note";
  }

  if (componentType === "page") {
    return node.findOne(".container-label")?.text()?.trim() || "Page";
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
    return node.findOne(".shape-text")?.text()?.trim() || getDefaultShapeTitle(node);
  }
  if (componentType === "javascriptEditor") {
    return node.getAttr("javascriptEditorTitle")?.trim() || "JS Code Runner";
  }
  if (componentType === "catalog") return "Catalog";

  return componentType || "Untitled";
}

export function getUniqueCatalogTitle(node, items = []) {
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

class AddSelectedNodeToCatalogCommand extends BaseCommand {
  static commandId = "catalog:add-selected";
  static label = "Add Selected Node To Catalog";

  execute() {
    this.plugin.addSelectedNodeToCatalog();
  }
}

export class CatalogActionsPlugin extends BasePlugin {
  static pluginId = "catalog-actions";

  commands() {
    return [AddSelectedNodeToCatalogCommand];
  }

  onSetup() {
    this.app.keybindings.register("ctrl+alt+a", "catalog:add-selected");
    this.app.keybindings.register("meta+alt+a", "catalog:add-selected");

    this.cleanups.push(() => this.app.keybindings.unregister("ctrl+alt+a"));
    this.cleanups.push(() => this.app.keybindings.unregister("meta+alt+a"));
  }

  addSelectedNodeToCatalog() {
    if (this.app.isReadOnly()) {
      notifyCatalogAction("Switch to Edit before changing the catalog.");
      return;
    }

    const selectionPlugin = getSelectionPlugin(this.app);
    if (!selectionPlugin) {
      console.warn("Selection plugin not found.");
      return;
    }

    const selectedNodes = selectionPlugin.getSelectedNodes();
    const selectedNode = selectedNodes.length === 1 ? selectedNodes[0] : null;

    if (!selectedNode) {
      notifyCatalogAction(
        selectedNodes.length > 1
          ? "Please select one node before adding it to the catalog."
          : "Please select a node first.",
      );
      return;
    }

    if (selectedNode.getAttr("componentType") === "catalog") {
      notifyCatalogAction("You cannot add the catalog node into itself.");
      return;
    }

    const catalogNode = getCatalogNode(this.app);
    if (!catalogNode) {
      notifyCatalogAction("Catalog node not found.");
      return;
    }

    const catalogData = getCatalogData(catalogNode);
    const targetNode = resolveCatalogTargetNode(selectedNode);
    if (!targetNode) return;

    const existingItem = findCatalogItemByNodeId(
      catalogData.items,
      targetNode.id(),
    );

    if (existingItem) {
      notifyCatalogAction("This node is already in the catalog.");
      return;
    }

    const nextItems = insertCatalogItemIntoItems(catalogData.items, {
      nodeId: targetNode.id(),
      title: getUniqueCatalogTitle(targetNode, catalogData.items),
      titleSource: "node",
      parentId: null,
    });

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

    notifyCatalogAction(`Added "${getNodeDisplayTitle(targetNode)}" to catalog.`);
  }
}
