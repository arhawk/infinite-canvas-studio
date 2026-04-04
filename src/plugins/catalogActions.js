import { BaseCommand, BasePlugin } from "../core/baseClasses.js";

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

function getCatalogData(node) {
  const data = node?.getAttr("data");
  if (!data || typeof data !== "object") {
    return {
      version: 1,
      title: "Catalog",
      items: [],
    };
  }

  return {
    version: 1,
    title: typeof data.title === "string" && data.title ? data.title : "Catalog",
    items: Array.isArray(data.items) ? data.items : [],
  };
}

function getNodeDisplayTitle(node) {
  if (!node) return "Untitled";

  const componentType = node.getAttr("componentType");

  if (componentType === "text" && typeof node.text === "function") {
    return node.text() || "Text";
  }

  if (componentType === "sticky") {
    return "Sticky Note";
  }

  if (componentType === "page") return "Page";
  if (componentType === "container") return "Container";
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
    const selectionPlugin = getSelectionPlugin(this.app);
    if (!selectionPlugin) {
      console.warn("Selection plugin not found.");
      return;
    }

    const selectedNodes = selectionPlugin.getSelectedNodes();
    const selectedNode = selectedNodes[0] || null;

    if (!selectedNode) {
      alert("Please select a node first.");
      return;
    }

    if (selectedNode.getAttr("componentType") === "catalog") {
      alert("You cannot add the catalog node into itself.");
      return;
    }

    const catalogNode = getCatalogNode(this.app);
    if (!catalogNode) {
      alert("Catalog node not found.");
      return;
    }

    const catalogData = getCatalogData(catalogNode);
    const existingItem = catalogData.items.find(
      (item) => item.nodeId === selectedNode.id(),
    );

    if (existingItem) {
      alert("This node is already in the catalog.");
      return;
    }

    const newItem = {
      id: crypto.randomUUID(),
      nodeId: selectedNode.id(),
      title: getNodeDisplayTitle(selectedNode),
      parentId: null,
      order: catalogData.items.length,
      collapsed: false,
    };

    const nextData = {
      ...catalogData,
      items: [...catalogData.items, newItem],
    };

    catalogNode.setAttr("data", nextData);

    this.app.events.emit("node:changed", { node: catalogNode });
    this.app.mainLayer.batchDraw();

    console.log("Added to catalog:", newItem);
    alert(`Added "${newItem.title}" to catalog.`);
  }
}