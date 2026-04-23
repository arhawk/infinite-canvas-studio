import "./styles.css";
import { App } from "./core/app.js";
import { renderIcons } from "./lib/icons.js";
import { ToolbarPlugin } from "./plugins/toolbar.js";
import { SidebarPlugin } from "./plugins/sidebar.js";
import { SelectionPlugin } from "./plugins/selection.js";
import { DrawingPlugin } from "./plugins/drawing.js";
import { ContextMenuPlugin } from "./plugins/contextMenu.js";
import { ContainersPlugin } from "./plugins/containers.js";
import { ConnectionsPlugin } from "./plugins/connections.js";
import { CatalogActionsPlugin } from "./plugins/catalogActions.js";
import { CatalogPanelPlugin } from "./plugins/catalogPanel.js";
import { RankingBoxPlugin } from "./plugins/rankingBox.js";
import { PageComparePlugin } from "./plugins/pageCompare.js";
import { FocusNavigationPlugin } from "./plugins/focusNavigation.js";
import { ComponentEditorPlugin } from "./plugins/componentEditor.js";
import { AttachmentsPlugin } from "./plugins/attachments.js";
import { HistoryPlugin } from "./plugins/history.js";
import { DocumentPlugin } from "./plugins/document.js";
import { TimerPlugin } from "./plugins/timer.js";
import { BinaryCalculatorPlugin } from "./plugins/binaryCalculator.js";
import { MinimapPlugin } from "./plugins/minimap.js";
import { CenterMapPlugin } from "./plugins/centerMap.js";
import { AnnotatorPlugin } from "./plugins/annotator.js";
import { MindMapBranchPlugin } from "./plugins/mindMapBranch.js";
import {
  captureRuntimeHtmlTemplate,
  readEmbeddedSnapshot,
} from "./document/runtimeHtmlExport.js";
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
import { VideoComponent } from "./component/video.js";

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
  componentsSidebar: getRequiredElement("[data-testid='sidebar']"),
  sidebarBrand: getRequiredElement("#sidebar-brand"),
  sidebarToggle: getRequiredElement("#sidebar-toggle"),
  modeToggle: getRequiredElement("#mode-toggle"),
  drawingVisibilityToggle: getRequiredElement("#drawing-visibility-toggle"),
  toolButtons: getRequiredElement("#tool-buttons"),
  historyControls: getRequiredElement("#history-controls"),
  documentControls: getOptionalElement("#document-controls"),
  undoAction: getRequiredElement("#undo-action"),
  redoAction: getRequiredElement("#redo-action"),
  saveDocumentAction: getOptionalElement("#save-document-action"),
  loadDocumentAction: getOptionalElement("#load-document-action"),
  loadDocumentInput: getOptionalElement("#load-document-input"),
  calculatorToggle: getRequiredElement("#calculator-toggle"),
  calculatorWidget: getRequiredElement("#calculator-widget"),
  timerToggle: getRequiredElement("#timer-toggle"),
  timerWidget: getRequiredElement("#timer-widget"),
  timerDisplay: getRequiredElement("#timer-display"),
  timerStartPause: getRequiredElement("#timer-start-pause"),
  timerReset: getRequiredElement("#timer-reset"),
  timerMm: getRequiredElement("#timer-mm"),
  timerSs: getRequiredElement("#timer-ss"),
  timerDurationRow: getRequiredElement("#timer-duration-row"),
  timerClose: getRequiredElement("#timer-close"),
  timerHeader: getRequiredElement("#timer-header"),
  arrangeControls: getRequiredElement("#arrange-controls"),
  brushControls: getRequiredElement("#brush-controls"),
  brushTypeControls: getRequiredElement("#brush-type-controls"),
  connectSelection: getRequiredElement("#connect-selection"),
  deleteSelection: getRequiredElement("#delete-selection"),
  saveFocus: getRequiredElement("#save-focus"),
  focusPositionMode: getRequiredElement("#focus-position-mode"),
  strokeColor: getRequiredElement("#stroke-color"),
  recentColors: getRequiredElement("#recent-colors"),
  strokeWidthLabel: getRequiredElement("#stroke-width-label"),
  strokeWidth: getRequiredElement("#stroke-width"),
  strokeWidthValue: getRequiredElement("#stroke-width-value"),
  clearStrokes: getRequiredElement("#clear-strokes"),
  componentPalette: getRequiredElement("#component-palette"),
  catalogPanel: getRequiredElement("#catalog-panel"),
  centerMapBtn: getRequiredElement("#center-map-btn"),
  zoomInBtn: document.getElementById("zoom-in-btn"),
  zoomOutBtn: document.getElementById("zoom-out-btn"),
};

renderIcons(ui.sidebarBrand, {
  width: 20,
  height: 20,
  "stroke-width": 2.2,
});

captureRuntimeHtmlTemplate();

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
  VideoComponent,
].forEach((ComponentClass) => app.components.register(new ComponentClass(app)));

// Register plugins (order matters: tools before toolbar so buttons render)
app.use(SelectionPlugin);
app.use(CatalogActionsPlugin);
app.use(DrawingPlugin);
app.use(AnnotatorPlugin);
app.use(ComponentEditorPlugin);
app.use(PageComparePlugin);
app.use(ToolbarPlugin, {
  modeToggleEl: ui.modeToggle,
  drawingVisibilityToggleEl: ui.drawingVisibilityToggle,
  toolButtonsEl: ui.toolButtons,
  historyControlsEl: ui.historyControls,
  arrangeControlsEl: ui.arrangeControls,
  brushControlsEl: ui.brushControls,
  brushTypeControlsEl: ui.brushTypeControls,
  connectSelectionEl: ui.connectSelection,
  deleteSelectionEl: ui.deleteSelection,
  saveFocusEl: ui.saveFocus,
  focusPositionModeEl: ui.focusPositionMode,
  strokeColorEl: ui.strokeColor,
  recentColorsEl: ui.recentColors,
  strokeWidthLabelEl: ui.strokeWidthLabel,
  strokeWidthEl: ui.strokeWidth,
  strokeWidthValueEl: ui.strokeWidthValue,
  clearStrokesEl: ui.clearStrokes,
});
app.use(SidebarPlugin, {
  sidebarEl: ui.componentsSidebar,
  paletteEl: ui.componentPalette,
  canvasEl: ui.canvasContainer,
  toggleEl: ui.sidebarToggle,
});
app.use(CatalogPanelPlugin, {
  panelEl: ui.catalogPanel,
});
app.use(RankingBoxPlugin);
app.use(MindMapBranchPlugin);
app.use(ConnectionsPlugin);
app.use(FocusNavigationPlugin);
app.use(AttachmentsPlugin);
app.use(ContextMenuPlugin);
app.use(ContainersPlugin);
const historyPlugin = app.use(HistoryPlugin, {
  undoEl: ui.undoAction,
  redoEl: ui.redoAction,
});
app.use(DocumentPlugin, {
  documentControlsEl: ui.documentControls,
  exportEl: ui.saveDocumentAction,
  importEl: ui.loadDocumentAction,
  importInputEl: ui.loadDocumentInput,
});
app.use(BinaryCalculatorPlugin, {
  toggleEl: ui.calculatorToggle,
  widgetEl: ui.calculatorWidget,
});
app.use(MinimapPlugin);
app.use(TimerPlugin, {
  toggleEl: ui.timerToggle,
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
app.use(CenterMapPlugin, {
  centerMapEl: ui.centerMapBtn,
  zoomInEl: ui.zoomInBtn,
  zoomOutEl: ui.zoomOutBtn,
});

app.start();

const embeddedSnapshot = readEmbeddedSnapshot();

if (embeddedSnapshot) {
  await app.documentManager?.loadDocument?.(embeddedSnapshot, {
    source: "embedded-html",
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
