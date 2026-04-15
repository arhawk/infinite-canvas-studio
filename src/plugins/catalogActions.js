import { BaseCommand, BasePlugin } from "../core/baseClasses.js";
import {
  applyCatalogData,
  findCatalogItemByNodeId,
  getCatalogData,
  insertCatalogItemIntoItems,
} from "../catalog/api.js";

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

function getNodeDisplayTitle(node) {
  if (!node) return "Untitled";

  const componentType = node.getAttr("componentType");

  if (componentType === "text" && typeof node.text === "function") {
    return node.text()?.trim() || "Text";
  }

  if (componentType === "sticky") {
    return node.findOne(".sticky-text")?.text()?.trim() || "Sticky Note";
  }

  if (componentType === "page" || componentType === "container") {
    return node.findOne(".container-label")?.text()?.trim() || (componentType === "page" ? "Page" : "Container");
  }
  if (componentType === "image") return "Image";
  if (componentType === "catalog") return "Catalog";

  return componentType || "Untitled";
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
    const existingItem = findCatalogItemByNodeId(
      catalogData.items,
      selectedNode.id(),
    );

    if (existingItem) {
      notifyCatalogAction("This node is already in the catalog.");
      return;
    }

    const nextItems = insertCatalogItemIntoItems(catalogData.items, {
      nodeId: selectedNode.id(),
      title: getNodeDisplayTitle(selectedNode),
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

    notifyCatalogAction(`Added "${getNodeDisplayTitle(selectedNode)}" to catalog.`);
  }
}
