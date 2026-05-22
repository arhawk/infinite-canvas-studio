
function getContainerRect(app) {
  return app.stage.container().getBoundingClientRect();
}

function getElementRect(element) {
  const rect = element?.getBoundingClientRect?.();
  return rect
    ? {
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
      }
    : null;
}

function getNodeById(app, id) {
  return id ? app.mainLayer.findOne(`#${id}`) : null;
}

function getNodeBounds(app, node) {
  const anchorNode =
    node?.findOne?.(".container-bg") ??
    node?.findOne?.(".button-bg") ??
    getActiveShapeVisual(node) ??
    node;
  return anchorNode?.getClientRect({ relativeTo: app.stage }) ?? null;
}

function getConnectionLine(node) {
  return node?.findOne?.(".connection-line") ?? null;
}

function getActiveShapeVisual(node) {
  if (node?.getAttr?.("componentType") !== "shape") return null;
  const shapeType = node.getAttr("shapeType");
  return collectionToArray(node.getChildren?.()).find((child) => (
    child?.getAttr?.("shapeVisualType") === shapeType
  )) ?? null;
}

function clonePlainData(value) {
  if (value == null) return value;
  return JSON.parse(JSON.stringify(value));
}

function collectionToArray(collection) {
  if (!collection) return [];
  if (Array.isArray(collection)) return collection;
  if (typeof collection.toArray === "function") return collection.toArray();
  try {
    return Array.from(collection);
  } catch {
    return [];
  }
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
    ?? node?.findOne?.(".javascript-editor-bg")
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
      fill: node.getAttr("stickyFill") ?? background?.fill() ?? null,
      fillOpacity: node.getAttr("stickyFillOpacity") ?? 1,
      renderedFill: background?.fill() ?? null,
      textColor: textNode?.fill() ?? null,
      fontSize: textNode?.fontSize() ?? null,
      width: background?.width() ?? node.width?.() ?? null,
      height: background?.height() ?? node.height?.() ?? null,
      scaleX: node.scaleX?.() ?? null,
      scaleY: node.scaleY?.() ?? null,
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
    };
  }

  if (componentType === "page") {
    const background = node.findOne(".container-bg");
    const labelNode = node.findOne(".container-label");
    return {
      label: labelNode?.text() ?? "",
      renderedLabel: labelNode?.textArr?.[0]?.text ?? labelNode?.text?.() ?? "",
      stroke: background?.stroke() ?? null,
      fill: node.getAttr("pageFill") ?? background?.fill() ?? null,
      fillOpacity: node.getAttr("pageFillOpacity") ?? 1,
      renderedFill: background?.fill() ?? null,
      opacity: node.opacity?.() ?? null,
      width: background?.width() ?? node.width?.() ?? null,
      height: background?.height() ?? node.height?.() ?? null,
      scaleX: node.scaleX?.() ?? null,
      scaleY: node.scaleY?.() ?? null,
    };
  }

  if (componentType === "button") {
    return {
      shapeType: node.getAttr("buttonShapeType") ?? "rounded",
      label: node.findOne(".button-label")?.text() ?? "",
      fill: node.getAttr("buttonFill") ?? node.findOne(".button-bg")?.fill() ?? null,
      fillOpacity: node.getAttr("buttonFillOpacity") ?? 1,
      stroke: node.getAttr("buttonStroke") ?? node.findOne(".button-bg")?.stroke() ?? null,
      strokeWidth: node.getAttr("buttonStrokeWidth") ?? 2,
      textColor: node.getAttr("buttonTextColor") ?? node.findOne(".button-label")?.fill() ?? null,
      fontSize: node.getAttr("buttonFontSize") ?? node.findOne(".button-label")?.fontSize?.() ?? null,
      width: node.findOne(".button-bg")?.width() ?? node.width?.() ?? null,
      height: node.findOne(".button-bg")?.height() ?? node.height?.() ?? null,
    };
  }

  if (componentType === "shape") {
    const visual = getActiveShapeVisual(node);
    const label = node.findOne(".shape-text");
    return {
      shapeType: node.getAttr("shapeType") ?? null,
      fill: node.getAttr("shapeFill") ?? null,
      renderedFill: visual?.fill?.() ?? null,
      fillOpacity: node.getAttr("shapeFillOpacity") ?? null,
      stroke: node.getAttr("shapeStroke") ?? visual?.stroke?.() ?? null,
      strokeWidth: node.getAttr("shapeStrokeWidth") ?? visual?.strokeWidth?.() ?? null,
      opacity: node.opacity?.() ?? null,
      text: label?.text?.() ?? "",
      textColor: node.getAttr("shapeTextColor") ?? label?.fill?.() ?? null,
      fontSize: node.getAttr("shapeFontSize") ?? label?.fontSize?.() ?? null,
      width: node.width?.() ?? null,
      height: node.height?.() ?? null,
      rotation: node.rotation?.() ?? null,
      scaleX: node.scaleX?.() ?? null,
      scaleY: node.scaleY?.() ?? null,
    };
  }

  if (componentType === "rankingBox") {
    const data = node.getAttr("data") ?? {};
    const cards = node.find(".ranking-item-card");
    const titleNode = node.findOne(".ranking-box-label");
    const background = node.findOne(".ranking-box-bg");
    const header = node.findOne(".ranking-box-header-bg");
    return {
      label: data.label ?? "",
      titleBounds: serializeRect(titleNode?.getClientRect?.({ relativeTo: node.getStage?.() })),
      headerBounds: serializeRect(header?.getClientRect?.({ relativeTo: node.getStage?.() })),
      titleFontSize: data.titleFontSize ?? null,
      titleColor: data.titleColor ?? null,
      themeColor: data.themeColor ?? null,
      renderedTitleFontSize: titleNode?.fontSize?.() ?? null,
      renderedTitleWrap: titleNode?.wrap?.() ?? null,
      renderedTitleEllipsis: titleNode?.ellipsis?.() ?? null,
      renderedTitleColor: titleNode?.fill?.() ?? null,
      renderedBackgroundFill: background?.fill?.() ?? null,
      renderedThemeStroke: background?.stroke?.() ?? null,
      renderedHeaderFill: header?.fill?.() ?? null,
      renderedHeaderHeight: header?.height?.() ?? null,
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
    const src = node.getAttr("imageSrc") ?? null;
    const imageNode = node.findOne(".image-node");
    return {
      hasImageNode: Boolean(imageNode),
      hasPlaceholder: Boolean(node.findOne(".placeholder-rect")),
      imageCornerRadius: imageNode?.cornerRadius?.() ?? null,
      srcLength: typeof src === "string" ? src.length : 0,
    };
  }

  if (componentType === "video") {
    const src = node.getAttr("videoSrc") ?? null;
    const overlay = node._videoOverlayEl ?? null;
    return {
      hasOverlay: Boolean(overlay),
      overlayZIndex: overlay?.style?.zIndex ?? "",
      hasVideoElement: Boolean(overlay?.querySelector?.("video")),
      hasPlaceholder: Boolean(overlay?.querySelector?.(".video-component__placeholder")),
      hasTopbarActions: Boolean(overlay?.querySelector?.(".video-component__actions")),
      placeholderText: overlay?.querySelector?.(".video-component__placeholder")?.textContent ?? "",
      srcLength: typeof src === "string" ? src.length : 0,
    };
  }

  if (componentType === "iframe") {
    const overlay = node._iframeOverlayEl ?? null;
    const frame = overlay?.querySelector?.(".iframe-component__frame") ?? null;
    const shield = overlay?.querySelector?.(".iframe-component__shield") ?? null;

    return {
      url: node.getAttr("iframeUrl") ?? "",
      zoom: Number(node.getAttr("iframeZoom")) || 1,
      panX: Number(node.getAttr("iframePanX")) || 0,
      panY: Number(node.getAttr("iframePanY")) || 0,
      interactive: node.getAttr("iframeInteractive") === true,
      hasOverlay: Boolean(overlay),
      overlayZIndex: overlay?.style?.zIndex ?? "",
      hasShield: Boolean(shield),
      shieldHidden: shield?.hidden ?? null,
      framePointerEvents: frame?.style?.pointerEvents ?? "",
      frameSrc: frame?.getAttribute?.("src") ?? "",
    };
  }

  if (componentType === "javascriptEditor") {
    const overlay = node._javascriptEditorOverlayEl ?? null;
    const overlayState = node._javascriptEditorOverlayState ?? null;

    return {
      title: node.getAttr("javascriptEditorTitle") ?? "",
      code: node.getAttr("javascriptEditorCode") ?? "",
      width: node.width?.() ?? null,
      height: node.height?.() ?? null,
      outputRatio: node.getAttr("javascriptEditorOutputRatio") ?? null,
      hasOverlay: Boolean(overlay),
      editorMode: overlayState?.editorMode ?? "textarea",
      status: overlayState?.statusEl?.textContent?.trim?.() ?? "",
      statusTone: overlayState?.statusEl?.dataset?.tone ?? "idle",
      consoleLines: overlayState?.consoleEl?.childElementCount ?? 0,
      activeTab: overlayState?.activeTab ?? "preview",
      previewVisible: overlayState?.previewPanel?.hidden !== true,
      consoleVisible: overlayState?.consolePanel?.hidden !== true,
      unreadConsoleTone: overlayState?.consoleTab?.dataset?.unreadTone ?? null,
      hasCloseButton: Boolean(overlayState?.closeButton),
    };
  }

  if (componentType === "video") {
    const overlay = node._videoOverlayEl ?? null;
    const titleEl = overlay?.querySelector?.(".video-component__title") ?? null;

    return {
      title: node.getAttr("videoTitle") ?? "",
      src: node.getAttr("videoSrc") ?? null,
      hasOverlay: Boolean(overlay),
      displayedTitle: titleEl?.textContent?.trim?.() ?? "",
    };
  }

  return {};
}

function serializeNode(app, node) {
  const bounds = getNodeBounds(app, node);
  const parent = node.getParent?.();
  const component = app.components.getByNode(node);
  const attachments = component?.supportsAttachments?.(node)
    ? component.getAttachmentState?.(node) ?? null
    : null;

  return {
    id: node.id(),
    componentType: node.getAttr("componentType"),
    parentId: parent?.hasName?.("selectable") ? parent.id() : null,
    zIndex: app.getSelectableIndex(node),
    stackIndex: app.getSelectableStackIndex?.(node) ?? -1,
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
    attachments,
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

function getContextMenuState(app) {
  const contextMenuPlugin = getPlugin(app, "context-menu");
  const labels = collectionToArray(contextMenuPlugin?.menuGroup?.getChildren?.())
    .filter((child) => child?.name?.() === "context-menu-item-label")
    .map((child) => child.text())
    .filter(Boolean);
  const pagePoint = contextMenuPlugin?.menuCanvasPoint
    ? canvasToPage(app, contextMenuPlugin.menuCanvasPoint)
    : null;

  return {
    visible: contextMenuPlugin?.menuGroup?.visible?.() ?? false,
    labels,
    items: clonePlainData(contextMenuPlugin?.menuState ?? []),
    tooltip: contextMenuPlugin?.activeTooltipLabel ?? null,
    pagePoint,
  };
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
    bringNodeForward: (id) => app.commands.execute("selection:bring-forward", id),
    bringNodeToFront: (id) => app.commands.execute("selection:bring-to-front", id),
    sendNodeBackward: (id) => app.commands.execute("selection:send-backward", id),
    sendNodeToBack: (id) => app.commands.execute("selection:send-to-back", id),
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
    selectNodes: (ids = []) => {
      const selectionPlugin = getPlugin(app, "selection");
      if (!selectionPlugin || !Array.isArray(ids)) return false;

      const nodes = ids
        .map((id) => getNodeById(app, id))
        .filter(Boolean);
      selectionPlugin.setSelected(nodes);
      return true;
    },
    getSelectedNodeIds: () => {
      const selectionPlugin = getPlugin(app, "selection");
      return (selectionPlugin?.getSelectedNodes?.() ?? []).map((node) => node.id());
    },
    getContextMenuState: () => getContextMenuState(app),
    createClipboardPayload: () => {
      const selectionPlugin = getPlugin(app, "selection");
      return selectionPlugin?.createClipboardPayload?.() ?? null;
    },
    pasteClipboardPayload: async (payload) => {
      const selectionPlugin = getPlugin(app, "selection");
      const snapshots = selectionPlugin?.normalizeClipboardPayload?.(payload) ?? [];
      const pastedNodes = await selectionPlugin?.pasteSnapshots?.(snapshots);
      return (pastedNodes ?? []).map((node) => serializeNode(app, node));
    },
    getNodePageCenter: (id) => {
      const node = getNodeById(app, id);
      if (!node) return null;

      const canvasCenter = getNodeCanvasCenter(app, node);
      return canvasCenter ? canvasToPage(app, canvasCenter) : null;
    },
    getRankingBoxTitlePageCenter: (id) => {
      const node = getNodeById(app, id);
      if (node?.getAttr?.("componentType") !== "rankingBox") return null;

      const titleNode = node.findOne(".ranking-box-label");
      const box = titleNode?.getClientRect?.({
        relativeTo: app.stage,
        skipShadow: true,
        skipStroke: true,
      }) ?? null;
      if (!box) return null;

      return canvasToPage(app, {
        x: box.x + box.width / 2,
        y: box.y + box.height / 2,
      });
    },
    canvasToPagePoint: (canvasPoint) => {
      if (!Number.isFinite(canvasPoint?.x) || !Number.isFinite(canvasPoint?.y)) {
        return null;
      }
      return canvasToPage(app, canvasPoint);
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
    setJavaScriptEditorCode: async (id, code) => {
      const node = getNodeById(app, id);
      const component = app.components.get("javascriptEditor");
      if (node?.getAttr?.("componentType") !== "javascriptEditor" || !component) return null;

      const current = component.serializeNode(node);
      app.events.emit("node:change:start", { node });
      await component.applySerializedData(node, {
        ...current,
        code,
      });
      node.getLayer?.()?.batchDraw?.();
      app.overlayLayer?.batchDraw?.();
      app.uiLayer?.batchDraw?.();
      app.events.emit("node:changed", { node });
      return serializeNode(app, node);
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
    openRankingBoxLayerMenu: (rankingBoxId) => {
      const rankingPlugin = getPlugin(app, "ranking");
      const node = getNodeById(app, rankingBoxId);
      if (node?.getAttr?.("componentType") !== "rankingBox") return false;
      rankingPlugin?.openLayerMenu?.(node);
      return true;
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
    createNextPage: async (sourceId) => {
      const connectionsPlugin = getPlugin(app, "connections");
      const result = await connectionsPlugin?.createNextPage?.(sourceId);
      return result
        ? {
            page: result.page ? serializeNode(app, result.page) : null,
            connection: result.connection ? serializeNode(app, result.connection) : null,
          }
        : null;
    },
    startConnection: (sourceId) => {
      const connectionsPlugin = getPlugin(app, "connections");
      if (!connectionsPlugin?.startConnecting) return false;
      connectionsPlugin.startConnecting(sourceId);
      return connectionsPlugin.connectingFromId === sourceId;
    },
    getActiveConnectionSourceId: () => {
      const connectionsPlugin = getPlugin(app, "connections");
      return connectionsPlugin?.connectingFromId ?? null;
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
    },    saveFocus: (id) => {
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
    getCurrentPresentationPageId: () => {
      const focusPlugin = getPlugin(app, "focus-navigation");
      return focusPlugin?.getCurrentPresentationPage?.()?.id?.() ?? null;
    },
    getDirectionalPageNavigationTargetId: (direction) => {
      const focusPlugin = getPlugin(app, "focus-navigation");
      return focusPlugin?.getDirectionalPageNavigationTarget?.(direction)?.id?.() ?? null;
    },
    navigatePageDirection: (direction) => {
      const focusPlugin = getPlugin(app, "focus-navigation");
      return focusPlugin?.navigatePageDirection?.(direction) ?? false;
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
    getAttachmentsBookmarksState: () => {
      const bookmarkPlugin = getPlugin(app, "attachments-bookmarks");
      const group = bookmarkPlugin?.bookmarkGroup;
      if (!group) {
        return { visible: false, count: 0, scale: app.stageApi.getScale() };
      }
      return {
        visible: group.visible(),
        count: group.getChildren().length,
        scale: app.stageApi.getScale(),
      };
    },
    clickAttachmentBookmark: (index = 0) => {
      const bookmarkPlugin = getPlugin(app, "attachments-bookmarks");
      const item = bookmarkPlugin?.bookmarkGroup?.getChildren?.()?.[index] ?? null;
      if (!item) return false;
      item.fire("click", { cancelBubble: false, evt: { button: 0 } });
      return true;
    },
    setNodeAttachments: (id, attachmentsState) => {
      const node = getNodeById(app, id);
      if (!node) return false;
      const component = app.components.getByNode(node);
      if (!component?.supportsAttachments?.(node)) return false;
      app.events.emit("node:change:start", { node });
      component.setAttachmentState(node, attachmentsState);
      app.events.emit("node:changed", { node });
      node.getLayer?.()?.batchDraw?.();
      return true;
    },
    finalizeContainerCapture: (id) => {
      const node = getNodeById(app, id);
      if (!node) return false;
      const containersPlugin = getPlugin(app, "containers");
      if (!containersPlugin?.finalizeCaptureForNode) return false;
      containersPlugin.finalizeCaptureForNode(node);
      node.getLayer?.()?.batchDraw?.();
      return true;
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
