import {
  buildAnnotatableTextLayout,
  getAnnotatableTextTargets,
} from "./lib/textAnnotations.js";

function getContainerRect(app) {
  return app.stage.container().getBoundingClientRect();
}

function getNodeById(app, id) {
  return id ? app.mainLayer.findOne(`#${id}`) : null;
}

function getNodeBounds(app, node) {
  const anchorNode = node?.findOne?.(".container-bg") ?? node?.findOne?.(".button-bg") ?? node;
  return anchorNode?.getClientRect({ relativeTo: app.stage }) ?? null;
}

function getConnectionLine(node) {
  return node?.findOne?.(".connection-line") ?? null;
}

function clonePlainData(value) {
  if (value == null) return value;
  return JSON.parse(JSON.stringify(value));
}

function getTextAnnotationRects(app, ownerNodeOrId) {
  const ownerId = typeof ownerNodeOrId === "string"
    ? ownerNodeOrId
    : ownerNodeOrId?.id?.() ?? null;
  if (!ownerId) return [];

  return app.mainLayer.find(".text-annotation-highlight")
    .filter((shape) => shape.getAttr("textAnnotationOwnerId") === ownerId)
    .map((shape) => serializeRect(shape.getClientRect({ relativeTo: app.stage })))
    .filter(Boolean);
}

function getTextAnnotationPagePoint(app, ownerNode, offset, {
  targetKey = null,
  bias = "center",
} = {}) {
  const target = getAnnotatableTextTargets(ownerNode).find((entry) => (
    targetKey ? entry.targetKey === targetKey : true
  ));
  const textNode = target?.textNode ?? null;
  if (!textNode) return null;

  const layout = buildAnnotatableTextLayout(textNode);
  const textLength = layout.text.length;
  const targetOffset = Math.max(0, Math.min(Math.floor(offset), textLength));
  const line = layout.lines.find((entry) => (
    targetOffset >= entry.rawStart && targetOffset <= entry.rawEnd
  )) ?? layout.lines.at(-1) ?? null;

  if (!line) return null;

  const lineOffset = Math.max(0, Math.min(targetOffset - line.rawStart, line.text.length));
  const prefix = line.text.slice(0, lineOffset);
  const prefixWidth = textNode.measureSize(prefix)?.width ?? 0;
  const localPoint = {
    x: line.x + prefixWidth,
    y: line.y + line.lineHeight / 2,
  };

  if (bias === "inside-end") {
    const char = line.text[lineOffset] ?? "";
    const charWidth = textNode.measureSize(char)?.width ?? 0;
    localPoint.x += Math.max(3, Math.min(charWidth - 1, 10));
  } else if (bias === "inside-start" && lineOffset > 0) {
    const char = line.text[lineOffset - 1] ?? "";
    const charWidth = textNode.measureSize(char)?.width ?? 0;
    localPoint.x -= Math.max(3, Math.min(charWidth - 1, 10));
  }

  const absolutePoint = textNode.getAbsoluteTransform(app.stage).point(localPoint);
  return canvasToPage(app, absolutePoint);
}

function serializeRect(rect) {
  return rect
    ? {
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
      }
    : null;
}

function getNodeResizeBox(node) {
  return node?.findOne?.(".button-bg")
    ?? node?.findOne?.(".sticky-bg")
    ?? node?.findOne?.(".container-bg")
    ?? node
    ?? null;
}

function getNodeSummary(node) {
  const componentType = node.getAttr("componentType");

  if (componentType === "sticky") {
    const background = node.findOne(".sticky-bg");
    const textNode = node.findOne(".sticky-text");
    return {
      text: textNode?.text() ?? "",
      fill: background?.fill() ?? null,
      textColor: textNode?.fill() ?? null,
      fontSize: textNode?.fontSize() ?? null,
      width: background?.width() ?? node.width?.() ?? null,
      height: background?.height() ?? node.height?.() ?? null,
      scaleX: node.scaleX?.() ?? null,
      scaleY: node.scaleY?.() ?? null,
      annotations: clonePlainData(node.getAttr?.("textAnnotations") ?? []),
    };
  }

  if (componentType === "text") {
    return {
      text: node.text?.() ?? "",
      fill: node.fill?.() ?? null,
      fontSize: node.fontSize?.() ?? null,
      width: node.width?.() ?? null,
      height: node.height?.() ?? null,
      scaleX: node.scaleX?.() ?? null,
      scaleY: node.scaleY?.() ?? null,
      annotations: clonePlainData(node.getAttr?.("textAnnotations") ?? []),
    };
  }

  if (componentType === "container" || componentType === "page") {
    const background = node.findOne(".container-bg");
    const labelNode = node.findOne(".container-label");
    return {
      label: labelNode?.text() ?? "",
      renderedLabel: labelNode?.textArr?.[0]?.text ?? labelNode?.text?.() ?? "",
      stroke: background?.stroke() ?? null,
      width: background?.width() ?? node.width?.() ?? null,
      height: background?.height() ?? node.height?.() ?? null,
      scaleX: node.scaleX?.() ?? null,
      scaleY: node.scaleY?.() ?? null,
    };
  }

  if (componentType === "button") {
    return {
      label: node.findOne(".button-label")?.text() ?? "",
      fill: node.findOne(".button-bg")?.fill() ?? null,
      stroke: node.findOne(".button-bg")?.stroke() ?? null,
      width: node.findOne(".button-bg")?.width() ?? node.width?.() ?? null,
      height: node.findOne(".button-bg")?.height() ?? node.height?.() ?? null,
    };
  }

  if (componentType === "rankingBox") {
    const data = node.getAttr("data") ?? {};
    const cards = node.find(".ranking-item-card");
    return {
      label: data.label ?? "",
      items: Array.isArray(data.items)
        ? data.items.map((item) => ({
            ...item,
            renderedText: cards
              .find((card) => card.getAttr("rankingItemId") === item.id)
              ?.findOne?.(".ranking-item-text")
              ?.text?.() ?? "",
            renderedFill: cards
              .find((card) => card.getAttr("rankingItemId") === item.id)
              ?.findOne?.(".ranking-item-bg")
              ?.fill?.() ?? "",
            renderedStroke: cards
              .find((card) => card.getAttr("rankingItemId") === item.id)
              ?.findOne?.(".ranking-item-bg")
              ?.stroke?.() ?? "",
            renderedBounds: serializeRect(
              cards
                .find((card) => card.getAttr("rankingItemId") === item.id)
                ?.getClientRect?.({ relativeTo: node.getStage?.() }),
            ),
          }))
        : [],
    };
  }

  if (componentType === "connection") {
    const line = getConnectionLine(node);
    return {
      sourceNodeId: node.getAttr("sourceNodeId"),
      targetNodeId: node.getAttr("targetNodeId"),
      connectionKind: node.getAttr("connectionKind") ?? "directed",
      points: line?.points?.() ?? [],
      stroke: line?.stroke?.() ?? null,
      strokeWidth: line?.strokeWidth?.() ?? null,
      opacity: line?.opacity?.() ?? null,
      dash: line?.dash?.() ?? [],
      pointerLength: line?.pointerLength?.() ?? null,
      pointerWidth: line?.pointerWidth?.() ?? null,
      hiddenUntilEndpointSelected:
        node.getAttr("connectionHiddenUntilEndpointSelected") === true,
      transparentPulseActive: node.getAttr("transparentPulseActive") === true,
    };
  }

  if (componentType === "image") {
    return {
      hasImageNode: Boolean(node.findOne(".image-node")),
      hasPlaceholder: Boolean(node.findOne(".placeholder-rect")),
    };
  }

  if (componentType === "iframe") {
    const overlay = node._iframeOverlayEl ?? null;
    const urlLabel = overlay?.querySelector?.(".iframe-component__url") ?? null;
    const modeButton = overlay?.querySelector?.(".iframe-component__mode") ?? null;
    const closeButton = overlay?.querySelector?.(".iframe-component__close") ?? null;
    const frame = overlay?.querySelector?.(".iframe-component__frame") ?? null;

    return {
      url: node.getAttr("iframeUrl") ?? "",
      zoom: Number(node.getAttr("iframeZoom")) || 1,
      panX: Number(node.getAttr("iframePanX")) || 0,
      panY: Number(node.getAttr("iframePanY")) || 0,
      interactive: node.getAttr("iframeInteractive") === true,
      hasOverlay: Boolean(overlay),
      hasTopbar: Boolean(overlay?.querySelector?.(".iframe-component__topbar")),
      hasCloseButton: Boolean(closeButton),
      displayedUrl: urlLabel?.textContent?.trim() ?? "",
      modeLabel: modeButton?.textContent?.trim() ?? "",
      frameSrc: frame?.getAttribute?.("src") ?? "",
    };
  }

  return {};
}

function serializeNode(app, node) {
  const bounds = getNodeBounds(app, node);
  const parent = node.getParent?.();

  return {
    id: node.id(),
    componentType: node.getAttr("componentType"),
    parentId: parent?.hasName?.("selectable") ? parent.id() : null,
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
    getSelectedNodeIds: () => {
      const selectionPlugin = getPlugin(app, "selection");
      return (selectionPlugin?.getSelectedNodes?.() ?? []).map((node) => node.id());
    },
    getNodePageCenter: (id) => {
      const node = getNodeById(app, id);
      if (!node) return null;

      const canvasCenter = getNodeCanvasCenter(app, node);
      return canvasCenter ? canvasToPage(app, canvasCenter) : null;
    },
    canvasToPagePoint: (canvasPoint) => {
      if (!Number.isFinite(canvasPoint?.x) || !Number.isFinite(canvasPoint?.y)) {
        return null;
      }
      return canvasToPage(app, canvasPoint);
    },
    getViewportState: () => getViewportState(app),
    getTextAnnotationRects: (id) => {
      const node = getNodeById(app, id);
      return getTextAnnotationRects(app, node ?? id);
    },
    getTextAnnotationPagePoint: (id, offset, options = {}) => {
      const node = getNodeById(app, id);
      return node ? getTextAnnotationPagePoint(app, node, offset, options) : null;
    },
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
    canvasToPage: (point) => canvasToPage(app, point),
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
    createRankingBox: async (pageId) => {
      const rankingPlugin = getPlugin(app, "ranking");
      const node = await rankingPlugin?.createRankingBoxForPage?.(pageId);
      return node ? serializeNode(app, node) : null;
    },
    addTextToRankingBox: (rankingBoxId, textId, options = {}) => {
      const rankingPlugin = getPlugin(app, "ranking");
      const item = rankingPlugin?.moveTextToRankingBox?.(rankingBoxId, textId, options);
      const node = getNodeById(app, rankingBoxId);
      return {
        item,
        rankingBox: node ? serializeNode(app, node) : null,
      };
    },
    reorderRankingBoxItem: (rankingBoxId, itemId, insertIndex) => {
      const rankingPlugin = getPlugin(app, "ranking");
      const ok = rankingPlugin?.reorderRankingItem?.(rankingBoxId, itemId, insertIndex) ?? false;
      const node = getNodeById(app, rankingBoxId);
      return {
        ok,
        rankingBox: node ? serializeNode(app, node) : null,
      };
    },
    removeRankingBoxItem: (rankingBoxId, itemId) => {
      const rankingPlugin = getPlugin(app, "ranking");
      const ok = rankingPlugin?.removeRankingItem?.(rankingBoxId, itemId) ?? false;
      const node = getNodeById(app, rankingBoxId);
      return {
        ok,
        rankingBox: node ? serializeNode(app, node) : null,
      };
    },
    moveRankingBoxItemOut: async (rankingBoxId, itemId, dropPoint) => {
      const rankingPlugin = getPlugin(app, "ranking");
      const node = await rankingPlugin?.moveRankingItemOut?.(rankingBoxId, itemId, dropPoint);
      const rankingBox = getNodeById(app, rankingBoxId);
      return {
        textNode: node ? serializeNode(app, node) : null,
        rankingBox: rankingBox ? serializeNode(app, rankingBox) : null,
      };
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
    resizeTextBox: (id, size) => {
      const node = getNodeById(app, id);
      if (
        node?.getAttr?.("componentType") !== "text" ||
        !Number.isFinite(size?.width) ||
        !Number.isFinite(size?.height) ||
        !Number.isFinite(node.width?.()) ||
        !Number.isFinite(node.height?.())
      ) {
        return null;
      }

      app.events.emit("node:change:start", { node });
      node.scale({
        x: size.width / node.width(),
        y: size.height / node.height(),
      });
      node.fire("transform", { type: "transform" });
      node.getLayer()?.batchDraw();
      app.events.emit("node:changed", { node });
      return serializeNode(app, node);
    },
    resizeNodeBox: (id, size) => {
      const node = getNodeById(app, id);
      const resizeBox = getNodeResizeBox(node);
      if (
        !node ||
        !Number.isFinite(size?.width) ||
        !Number.isFinite(size?.height) ||
        !Number.isFinite(resizeBox?.width?.()) ||
        !Number.isFinite(resizeBox?.height?.())
      ) {
        return null;
      }

      app.events.emit("node:change:start", { node });
      node.scale({
        x: size.width / resizeBox.width(),
        y: size.height / resizeBox.height(),
      });
      node.fire("transform", { type: "transform" });
      node.getLayer()?.batchDraw();
      app.events.emit("node:changed", { node });
      return serializeNode(app, node);
    },
    resizeButton: (id, size) => {
      if (getNodeById(app, id)?.getAttr?.("componentType") !== "button") {
        return null;
      }
      return testApi.resizeNodeBox(id, size);
    },
    deleteNode: (id) => {
      const node = getNodeById(app, id);
      if (!node?.getStage?.()) return false;

      app.events.emit("node:removed", { node });
      node.destroy();
      app.mainLayer.batchDraw();
      return true;
    },
    createConnection: async (sourceId, targetId) => {
      const connectionsPlugin = getPlugin(app, "connections");
      const connection = await connectionsPlugin?.createConnection?.(sourceId, targetId);
      return connection ? serializeNode(app, connection) : null;
    },
    doubleClickConnectionLine: (id) => {
      const node = getNodeById(app, id);
      if (node?.getAttr?.("componentType") !== "connection") return false;
      const line = getConnectionLine(node);
      if (!line) return false;

      line.fire("dblclick", {
        cancelBubble: false,
        evt: { button: 0, detail: 2 },
      }, true);
      return true;
    },
    openPageCompare: (pageIds = []) => {
      const pageComparePlugin = getPlugin(app, "page-compare");
      const pages = pageIds
        .map((id) => getNodeById(app, id))
        .filter((node) => node?.getAttr?.("componentType") === "page");
      if (!pageComparePlugin || pages.length !== 2) return false;

      pageComparePlugin.setPageSelection(pages);
      return pageComparePlugin.openForSelection();
    },
    closePageCompare: () => {
      const pageComparePlugin = getPlugin(app, "page-compare");
      pageComparePlugin?.close?.({ restore: false });
      return pageComparePlugin?.getDebugState?.() ?? null;
    },
    getPageCompareState: () => {
      const pageComparePlugin = getPlugin(app, "page-compare");
      return pageComparePlugin?.getDebugState?.() ?? null;
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
    getComputedFocus: (id) => {
      const focusPlugin = getPlugin(app, "focus-navigation");
      const node = getNodeById(app, id);
      const focus = focusPlugin?.getSavedFocus?.(node) ?? null;
      return focus ? JSON.parse(JSON.stringify(focus)) : null;
    },
    activateButton: (id) => {
      const focusPlugin = getPlugin(app, "focus-navigation");
      const node = getNodeById(app, id);
      return focusPlugin?.navigateButtonTarget?.(node) ?? false;
    },
    doubleClickNode: (id) => {
      const focusPlugin = getPlugin(app, "focus-navigation");
      const node = getNodeById(app, id);
      if (!focusPlugin || !node) return false;

      focusPlugin.handleStageDoubleClick({
        target: node,
        evt: { button: 0 },
        cancelBubble: false,
      });
      return true;
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
    isDrawLayerVisible: () => app.drawLayer.visible(),
  };

  window.__APP_TEST_API__ = testApi;
  return testApi;
}
