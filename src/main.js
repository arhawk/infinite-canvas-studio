import "./styles.css";
import { App } from "./core/app.js";
import { LeftToolbarPlugin } from "./component/LeftToolbar/index.js";
import { ComponentsDropdownPlugin } from "./component/ComponentsDropdown/index.js";
import { PenDropdownPlugin } from "./component/PenDropdown/index.js";
import { ShapeDropdownPlugin } from "./component/ShapeDropdown/index.js";
import { ToolbarPlugin } from "./plugins/toolbar.js";
import { ImageToolbarPlugin } from "./plugins/imageToolbar.js";
import { VideoToolbarPlugin } from "./plugins/videoToolbar.js";
import { PageToolbarPlugin } from "./plugins/pageToolbar.js";
import { TextToolbarPlugin } from "./plugins/textToolbar.js";
import { JavaScriptEditorToolbarPlugin } from "./plugins/javascriptEditorToolbar.js";
import { BackgroundPlugin } from "./plugins/background.js";
import { SelectionPlugin } from "./plugins/selection.js";
import { DrawingPlugin } from "./plugins/drawing.js";
import { ShapesPlugin } from "./plugins/shapes.js";
import { ContextMenuPlugin } from "./plugins/contextMenu.js";
import { ContainersPlugin } from "./plugins/containers.js";
import { ConnectionsPlugin } from "./plugins/connections.js";
import { ConnectionToolbarPlugin } from "./plugins/connectionToolbar.js";
import { CatalogActionsPlugin } from "./plugins/catalogActions.js";
import { CatalogPanelPlugin } from "./plugins/catalogPanel.js";
import { RankingBoxPlugin } from "./plugins/rankingBox.js";
import { PageComparePlugin } from "./plugins/pageCompare.js";
import { InlineEditBridgePlugin } from "./plugins/inlineEditBridge.js";
import { FocusNavigationPlugin } from "./plugins/focusNavigation.js";
import { AttachmentsBookmarksPlugin } from "./plugins/attachmentsBookmarks.js";
import { HistoryPlugin } from "./plugins/history.js";
import { DocumentPlugin } from "./plugins/document.js";
import { RoomSharePlugin } from "./plugins/roomShare.js";
import { TimerPlugin } from "./plugins/timer.js";
import { BinaryCalculatorPlugin } from "./plugins/binaryCalculator.js";
import { EmojiReactionsPlugin } from "./plugins/emojiReactions.js";
import { MinimapPlugin } from "./plugins/minimap.js";
import { CenterMapPlugin } from "./plugins/centerMap.js";
import { AnnotatorPlugin } from "./plugins/annotator.js";
import { MindMapBranchPlugin } from "./plugins/mindMapBranch.js";
import { InstantTooltipPlugin } from "./plugins/instantTooltip.js";
import {
  captureRuntimeHtmlTemplate,
  readEmbeddedSnapshot,
} from "./document/runtimeHtmlExport.js";
import { disablePageZoom } from "./lib/disablePageZoom.js";
import { setupAppTestApi } from "./testApi.js";

import { TextComponent } from "./component/text.js";
import { StickyComponent } from "./component/sticky.js";
import { ButtonComponent } from "./component/button.js";
import { ImageComponent } from "./component/image.js";
import { IframeComponent } from "./component/iframe.js";
import { ContainerComponent } from "./component/container.js";
import { PageComponent } from "./component/page.js";
import { ConnectionComponent } from "./component/connection.js";
import { CatalogComponent } from "./component/catalog.js";
import { RankingBoxComponent } from "./component/rankingBox.js";
import { JavaScriptEditorComponent } from "./component/javascriptEditor.js";
import { VideoComponent } from "./component/video.js";
import { ShapeComponent } from "./component/shape.js";

disablePageZoom();

function getRequiredElement(selector) {
  const element = document.querySelector(selector);
  if (!element) {
    throw new Error(`Missing required element: ${selector}`);
  }
  return element;
}

function getOptionalElement(selector) {
  return document.querySelector(selector);
}

const ui = {
  canvasContainer: getRequiredElement("#canvas-container"),
  presentationToolbarHoverZone: getRequiredElement("#presentation-toolbar-hover-zone"),
  drawingVisibilityToggle: getRequiredElement("#drawing-visibility-toggle"),
  saveDocumentAction: getOptionalElement("#save-document-action"),
  loadDocumentAction: getOptionalElement("#load-document-action"),
  loadDocumentInput: getOptionalElement("#load-document-input"),
  shareAction: getOptionalElement("#share-btn"),
  calculatorWidget: getRequiredElement("#calculator-widget"),
  timerWidget: getRequiredElement("#timer-widget"),
  timerDisplay: getRequiredElement("#timer-display"),
  timerStartPause: getRequiredElement("#timer-start-pause"),
  timerReset: getRequiredElement("#timer-reset"),
  timerMm: getRequiredElement("#timer-mm"),
  timerSs: getRequiredElement("#timer-ss"),
  timerDurationRow: getRequiredElement("#timer-duration-row"),
  timerClose: getRequiredElement("#timer-close"),
  timerHeader: getRequiredElement("#timer-header"),
  shapePanel: getRequiredElement("#shape-panel"),
  shapePanelTypeControls: getRequiredElement("#shape-panel-type-controls"),
  shapeFontSize: getRequiredElement("#shape-font-size"),
  shapeFontSizeValue: getRequiredElement("#shape-font-size-value"),
  shapeTextColor: getRequiredElement("#shape-text-color"),
  shapeFillColor: getRequiredElement("#shape-fill-color"),
  shapeOpacity: getRequiredElement("#shape-opacity"),
  shapeOpacityValue: getRequiredElement("#shape-opacity-value"),
  shapeStrokeColor: getRequiredElement("#shape-stroke-color"),
  shapeStrokeWidth: getRequiredElement("#shape-stroke-width"),
  shapeStrokeWidthValue: getRequiredElement("#shape-stroke-width-value"),
  buttonControls: getRequiredElement("#button-controls"),
  buttonTypeControls: getRequiredElement("#button-type-controls"),
  buttonFontSize: getRequiredElement("#button-font-size"),
  buttonFontSizeValue: getRequiredElement("#button-font-size-value"),
  buttonTextColor: getRequiredElement("#button-text-color"),
  buttonFillColor: getRequiredElement("#button-fill-color"),
  buttonStrokeColor: getRequiredElement("#button-stroke-color"),
  buttonStrokeWidth: getRequiredElement("#button-stroke-width"),
  buttonStrokeWidthValue: getRequiredElement("#button-stroke-width-value"),
  buttonOpacity: getRequiredElement("#button-opacity"),
  buttonOpacityValue: getRequiredElement("#button-opacity-value"),
  stickyPanel: getRequiredElement("#sticky-panel"),
  stickyFontSize: getRequiredElement("#sticky-font-size"),
  stickyFontSizeValue: getRequiredElement("#sticky-font-size-value"),
  stickyTextColor: getRequiredElement("#sticky-text-color"),
  stickyFillColor: getRequiredElement("#sticky-fill-color"),
  stickyOpacity: getRequiredElement("#sticky-opacity"),
  stickyOpacityValue: getRequiredElement("#sticky-opacity-value"),
  catalogPanel: getRequiredElement("#catalog-panel"),
  modeCapsuleEdit: getRequiredElement("#mode-capsule-edit"),
  modeCapsulePresent: getRequiredElement("#mode-capsule-present"),
};

async function preloadRuntimeExportTemplate() {
  if (typeof window === "undefined") return;
  window.__APP_EXPORT_TEMPLATE_READY__ = false;

  if (__EXPORT_TEMPLATE_BUILD__) {
    const template = captureRuntimeHtmlTemplate();
    window.__APP_EXPORT_TEMPLATE__ = template;
    window.__APP_EXPORT_TEMPLATE_READY__ = Boolean(template.trim());
    return;
  }

  try {
    const response = await fetch("/__export-template", { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} ${response.statusText}`.trim());
    }

    const template = await response.text();
    if (template.trim()) {
      window.__APP_EXPORT_TEMPLATE__ = template;
      window.__APP_EXPORT_TEMPLATE_READY__ = true;
    } else {
      window.__APP_EXPORT_TEMPLATE_READY__ = false;
      console.error(
        "Failed to load /__export-template for HTML export: received empty template body.",
      );
    }
  } catch (error) {
    window.__APP_EXPORT_TEMPLATE_READY__ = false;
    console.error("Failed to load /__export-template for HTML export.", error);
  }
}

await preloadRuntimeExportTemplate();

const app = new App({
  container: ui.canvasContainer,
});

// Register built-in components
[
  PageComponent,
  ContainerComponent,
  ButtonComponent,
  TextComponent,
  StickyComponent,
  ImageComponent,
  IframeComponent,
  ConnectionComponent,
  CatalogComponent,
  RankingBoxComponent,
  JavaScriptEditorComponent,
  VideoComponent,
  ShapeComponent,
].forEach((ComponentClass) => app.components.register(new ComponentClass(app)));

// Register LeftToolbarPlugin first so its button elements can be passed to other plugins
const leftToolbar = app.use(LeftToolbarPlugin);
app.use(InstantTooltipPlugin);

// Register plugins (order matters: tools before toolbar so buttons render)
app.use(SelectionPlugin);
app.use(CatalogActionsPlugin);
app.use(DrawingPlugin);
app.use(ShapesPlugin);
app.use(AnnotatorPlugin);
app.use(InlineEditBridgePlugin);
app.use(PageComparePlugin);
const penDropdown = app.use(PenDropdownPlugin);
penDropdown.wireTrigger(leftToolbar.penBtn);
const shapeDropdown = app.use(ShapeDropdownPlugin);
shapeDropdown.wireTrigger(leftToolbar.shapeBtn);
const toolbarPlugin = app.use(ToolbarPlugin, {
  presentationToolbarHoverZoneEl: ui.presentationToolbarHoverZone,
  modeCapsuleEditEl: ui.modeCapsuleEdit,
  modeCapsulePresentEl: ui.modeCapsulePresent,
  drawingVisibilityToggleEl: ui.drawingVisibilityToggle,
  shapePanelEl: ui.shapePanel,
  shapePanelTypeControlsEl: ui.shapePanelTypeControls,
  shapeFontSizeEl: ui.shapeFontSize,
  shapeFontSizeValueEl: ui.shapeFontSizeValue,
  shapeTextColorEl: ui.shapeTextColor,
  shapeFillColorEl: ui.shapeFillColor,
  shapeOpacityEl: ui.shapeOpacity,
  shapeOpacityValueEl: ui.shapeOpacityValue,
  shapeStrokeColorEl: ui.shapeStrokeColor,
  shapeStrokeWidthEl: ui.shapeStrokeWidth,
  shapeStrokeWidthValueEl: ui.shapeStrokeWidthValue,
  penDropdownPlugin: penDropdown,
  penTriggerEl: leftToolbar.penBtn,
  eraserTriggerEl: leftToolbar.eraserBtn,
  buttonControlsEl: ui.buttonControls,
  buttonTypeControlsEl: ui.buttonTypeControls,
  buttonFontSizeEl: ui.buttonFontSize,
  buttonFontSizeValueEl: ui.buttonFontSizeValue,
  buttonTextColorEl: ui.buttonTextColor,
  buttonFillColorEl: ui.buttonFillColor,
  buttonStrokeColorEl: ui.buttonStrokeColor,
  buttonStrokeWidthEl: ui.buttonStrokeWidth,
  buttonStrokeWidthValueEl: ui.buttonStrokeWidthValue,
  buttonOpacityEl: ui.buttonOpacity,
  buttonOpacityValueEl: ui.buttonOpacityValue,
  stickyPanelEl: ui.stickyPanel,
  stickyFontSizeEl: ui.stickyFontSize,
  stickyFontSizeValueEl: ui.stickyFontSizeValue,
  stickyTextColorEl: ui.stickyTextColor,
  stickyFillColorEl: ui.stickyFillColor,
  stickyOpacityEl: ui.stickyOpacity,
  stickyOpacityValueEl: ui.stickyOpacityValue,
});
app.use(ImageToolbarPlugin);
app.use(VideoToolbarPlugin);
app.use(PageToolbarPlugin);
app.use(TextToolbarPlugin);
app.use(JavaScriptEditorToolbarPlugin);

// Components dropdown — replaces the old sidebar palette
app.use(BackgroundPlugin, {
  toggleEl: leftToolbar.backgroundBtn,
});

const componentsDropdown = app.use(ComponentsDropdownPlugin);
componentsDropdown.wireTrigger(leftToolbar.componentsBtn);

app.use(CatalogPanelPlugin, {
  panelEl: ui.catalogPanel,
});
app.use(RankingBoxPlugin);
app.use(MindMapBranchPlugin);
app.use(ConnectionsPlugin);
app.use(ConnectionToolbarPlugin);
app.use(FocusNavigationPlugin);
app.use(AttachmentsBookmarksPlugin);
app.use(ContextMenuPlugin);
app.use(ContainersPlugin);
const historyPlugin = app.use(HistoryPlugin, {
  undoEl: leftToolbar.undoBtn,
  redoEl: leftToolbar.redoBtn,
});
const documentPlugin = app.use(DocumentPlugin, {
  exportEl: ui.saveDocumentAction,
  importEl: ui.loadDocumentAction,
  importInputEl: ui.loadDocumentInput,
  titleEl: getOptionalElement("#project-title"),
});
const roomSharePlugin = app.use(RoomSharePlugin, {
  shareEl: ui.shareAction,
  loadEl: ui.loadDocumentAction,
  modeCapsuleEditEl: ui.modeCapsuleEdit,
  modeCapsulePresentEl: ui.modeCapsulePresent,
});
app.use(BinaryCalculatorPlugin, {
  toggleEl: toolbarPlugin.presentationCalculatorBtnEl,
  widgetEl: ui.calculatorWidget,
});
const minimapPlugin = app.use(MinimapPlugin);
minimapPlugin.attachHeaderAction(leftToolbar.centerMapBtn);
app.use(TimerPlugin, {
  toggleEl: toolbarPlugin.presentationTimerBtnEl,
  widgetEl: ui.timerWidget,
  headerEl: ui.timerHeader,
  closeEl: ui.timerClose,
  displayEl: ui.timerDisplay,
  startPauseEl: ui.timerStartPause,
  resetEl: ui.timerReset,
  mmInputEl: ui.timerMm,
  ssInputEl: ui.timerSs,
  durationRowEl: ui.timerDurationRow,
});
app.use(EmojiReactionsPlugin, {
  toggleEl: toolbarPlugin.presentationReactionsBtnEl,
});
app.use(CenterMapPlugin, {
  centerMapEl: leftToolbar.centerMapBtn,
});

const embeddedSnapshot = readEmbeddedSnapshot();
const routeRoomId = roomSharePlugin.getRouteRoomId();
const bootLoadingLayer = routeRoomId
  ? documentPlugin.showDocumentLoadingLayer({
    label: "Waiting for host...",
    total: 0,
  })
  : embeddedSnapshot
    ? documentPlugin.showDocumentLoadingLayer({
      label: "Loading document...",
      total: Array.isArray(embeddedSnapshot.nodes) ? embeddedSnapshot.nodes.length : 0,
    })
    : null;

app.start();

if (routeRoomId) {
  roomSharePlugin.adoptViewerWaitingLayer(bootLoadingLayer);
  await roomSharePlugin.startViewer(routeRoomId);
} else if (embeddedSnapshot) {
  await app.documentManager?.loadDocument?.(embeddedSnapshot, {
    source: "embedded-html",
    loadingLayer: bootLoadingLayer,
  });
} else {
  // Seed starter nodes
  await Promise.all([
    app.addComponent("sticky", { x: 120, y: 120 }),
    app.addComponent("text", { x: 380, y: 170 }),
    app.addComponent("catalog", { x: 0, y: 0 }),
  ]);
  historyPlugin.resetHistory();
}

if (import.meta.env.VITE_E2E === "1") {
  setupAppTestApi(app);
}
