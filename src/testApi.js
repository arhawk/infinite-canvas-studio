function getContainerRect(app) {
  return app.stage.container().getBoundingClientRect();
}

function getNodeById(app, id) {
  return id ? app.mainLayer.findOne(`#${id}`) : null;
}

function getNodeBounds(app, node) {
  const anchorNode = node?.findOne?.(".container-bg") ?? node;
  return anchorNode?.getClientRect({ relativeTo: app.stage }) ?? null;
}

function getConnectionLine(node) {
  return node?.findOne?.(".connection-line") ?? null;
}

function getNodeSummary(node) {
  const componentType = node.getAttr("componentType");

  if (componentType === "sticky") {
    return {
      text: node.findOne(".sticky-text")?.text() ?? "",
      fill: node.findOne(".sticky-bg")?.fill() ?? null,
      textColor: node.findOne(".sticky-text")?.fill() ?? null,
    };
  }

  if (componentType === "text") {
    return {
      text: node.text?.() ?? "",
      fill: node.fill?.() ?? null,
      fontSize: node.fontSize?.() ?? null,
    };
  }

  if (componentType === "container" || componentType === "page") {
    return {
      label: node.findOne(".container-label")?.text() ?? "",
      stroke: node.findOne(".container-bg")?.stroke() ?? null,
    };
  }

  if (componentType === "connection") {
    const line = getConnectionLine(node);
    return {
      sourceNodeId: node.getAttr("sourceNodeId"),
      targetNodeId: node.getAttr("targetNodeId"),
      points: line?.points?.() ?? [],
      stroke: line?.stroke?.() ?? null,
      strokeWidth: line?.strokeWidth?.() ?? null,
    };
  }

  if (componentType === "image") {
    return {
      hasImageNode: Boolean(node.findOne(".image-node")),
      hasPlaceholder: Boolean(node.findOne(".placeholder-rect")),
    };
  }

  return {};
}

function serializeNode(app, node) {
  const bounds = getNodeBounds(app, node);

  return {
    id: node.id(),
    componentType: node.getAttr("componentType"),
    focusPositionMode: node.getAttr("focusPositionMode") ?? null,
    savedFocus: node.getAttr("savedFocus") ?? null,
    bounds: bounds
      ? {
          x: bounds.x,
          y: bounds.y,
          width: bounds.width,
          height: bounds.height,
        }
      : null,
    summary: getNodeSummary(node),
  };
}

function getNodeCanvasCenter(app, node) {
  const bounds = getNodeBounds(app, node);
  if (!bounds) return null;

  return {
    x: bounds.x + bounds.width / 2,
    y: bounds.y + bounds.height / 2,
  };
}

function canvasToPage(app, canvasPoint) {
  const localPoint = app.stageApi.canvasToScreen(canvasPoint);
  const rect = getContainerRect(app);

  return {
    x: rect.left + localPoint.x,
    y: rect.top + localPoint.y,
  };
}

function getViewportState(app) {
  const viewport = app.stageApi.getViewportBounds();

  return {
    scale: app.stageApi.getScale(),
    viewport,
    center: {
      x: viewport.x + viewport.width / 2,
      y: viewport.y + viewport.height / 2,
    },
    position: {
      x: app.stage.x(),
      y: app.stage.y(),
    },
  };
}

function getPlugin(app, pluginId) {
  return app.plugins.find((plugin) => plugin.id === pluginId) ?? null;
}

function getCatalogNode(app) {
  return app.mainLayer.find(".selectable").find((node) => {
    return node.getAttr("componentType") === "catalog";
  }) || null;
}

function serializeCatalogItems(app) {
  const catalogNode = getCatalogNode(app);
  const items = catalogNode?.getAttr?.("data")?.items ?? [];

  return items.map((item) => {
    const node = getNodeById(app, item.nodeId);
    return {
      ...item,
      renderedTitle:
        document.querySelector(`[data-testid="catalog-item-title-${item.id}"]`)?.textContent?.trim()
        || "",
      nodeExists: Boolean(node),
    };
  });
}

export function setupAppTestApi(app) {
  const testApi = {
    getMode: () => app.getMode(),
    setMode: (mode) => app.setMode(mode),
    getEditorTool: () => app.getEditorTool(),
    setEditorTool: (toolId) => app.setEditorTool(toolId),
    getDocumentState: () => app.documentManager?.getDocumentState?.() ?? null,
    exportDocument: () => app.documentManager?.exportDocument?.({ download: false }) ?? null,
    loadDocument: (snapshot) => app.documentManager?.loadDocument?.(snapshot, {
      source: "test-api",
    }) ?? null,
    canUndo: () => app.history?.canUndo?.() ?? false,
    canRedo: () => app.history?.canRedo?.() ?? false,
    undo: () => app.history?.undo?.() ?? false,
    redo: () => app.history?.redo?.() ?? false,
    resetHistory: () => {
      app.history?.resetHistory?.();
      return {
        canUndo: app.history?.canUndo?.() ?? false,
        canRedo: app.history?.canRedo?.() ?? false,
      };
    },
    listNodes: () => app.mainLayer.find(".selectable").map((node) => serializeNode(app, node)),
    getNode: (id) => {
      const node = getNodeById(app, id);
      return node ? serializeNode(app, node) : null;
    },
    selectNode: (id) => {
      const selectionPlugin = getPlugin(app, "selection");
      const node = getNodeById(app, id);
      if (!selectionPlugin || !node) return false;

      selectionPlugin.setSelected([node]);
      return true;
    },
    getNodePageCenter: (id) => {
      const node = getNodeById(app, id);
      if (!node) return null;

      const canvasCenter = getNodeCanvasCenter(app, node);
      return canvasCenter ? canvasToPage(app, canvasCenter) : null;
    },
    getViewportState: () => getViewportState(app),
    centerOnNode: (id, options = {}) => {
      const node = getNodeById(app, id);
      const center = node ? getNodeCanvasCenter(app, node) : null;
      if (!center) return false;

      app.stageApi.centerOn(center, {
        duration: options.duration ?? 0,
        scale: options.scale ?? app.stageApi.getScale(),
      });
      return true;
    },
    setViewport: (viewport) => {
      app.stageApi.setViewport(viewport);
      return getViewportState(app);
    },
    getCanvasContainerRect: () => {
      const rect = getContainerRect(app);
      return {
        left: rect.left,
        top: rect.top,
        width: rect.width,
        height: rect.height,
      };
    },
    addComponent: async (type, payload) => {
      const node = await app.addComponent(type, payload);
      return node ? serializeNode(app, node) : null;
    },
    ensureCatalogNode: async () => {
      const existing = getCatalogNode(app);
      if (existing) return true;

      const node = await app.addComponent("catalog", { x: 0, y: 0 });
      return Boolean(node);
    },
    listCatalogItems: () => serializeCatalogItems(app),
    addSelectedNodeToCatalog: async () => {
      await app.commands.execute("catalog:add-selected");
      return serializeCatalogItems(app);
    },
    moveNode: (id, position) => {
      const node = getNodeById(app, id);
      if (!node || !Number.isFinite(position?.x) || !Number.isFinite(position?.y)) {
        return null;
      }

      app.events.emit("node:change:start", { node });
      node.position({
        x: position.x,
        y: position.y,
      });
      node.getLayer()?.batchDraw();
      app.events.emit("node:changed", { node });
      return serializeNode(app, node);
    },
    createConnection: async (sourceId, targetId) => {
      const connectionsPlugin = getPlugin(app, "connections");
      const connection = await connectionsPlugin?.createConnection?.(sourceId, targetId);
      return connection ? serializeNode(app, connection) : null;
    },
    openComponentEditor: (id) => {
      const componentEditorPlugin = getPlugin(app, "component-editor");
      const node = getNodeById(app, id);
      componentEditorPlugin?.open?.(node);
      return Boolean(componentEditorPlugin?.currentNode);
    },
    saveFocus: (id) => {
      const focusPlugin = getPlugin(app, "focus-navigation");
      const node = getNodeById(app, id);
      return focusPlugin?.saveFocus?.(node) ?? false;
    },
    getNavigationButtons: () => {
      const focusPlugin = getPlugin(app, "focus-navigation");
      const navButtons = focusPlugin?.navButtonGroup?.getChildren?.() ?? [];

      return navButtons.map((button, index) => canvasToPage(app, button.position())).map((point, index) => ({
        index,
        x: point.x,
        y: point.y,
      }));
    },
    clickNavigationButton: (index = 0) => {
      const focusPlugin = getPlugin(app, "focus-navigation");
      const navButtons = focusPlugin?.navButtonGroup?.getChildren?.() ?? [];
      const button = navButtons[index];
      if (!button) return false;

      button.fire("click", {
        cancelBubble: false,
        evt: { button: 0 },
      });
      return true;
    },
    clearBoard: () => {
      const nodes = app.mainLayer.find(".selectable");

      nodes.forEach((node) => {
        if (!node?.getStage?.()) return;
        app.events.emit("node:removed", { node });
        node.destroy();
      });

      app.drawLayer.destroyChildren();
      app.mainLayer.batchDraw();
      app.drawLayer.batchDraw();
      app.history?.resetHistory?.();
    },
    countDrawables: () => app.drawLayer.find(".drawable").length,
  };

  window.__APP_TEST_API__ = testApi;
  return testApi;
}
