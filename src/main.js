import "./styles.css";
import { App } from "./core/app.js";
import { LeftToolbarPlugin } from "./component/LeftToolbar/index.js";
import { ComponentsDropdownPlugin } from "./component/ComponentsDropdown/index.js";
import { ToolbarPlugin } from "./plugins/toolbar.js";
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
import { AttachmentsBookmarksPlugin } from "./plugins/attachmentsBookmarks.js";
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
import { JavaScriptEditorComponent } from "./component/javascriptEditor.js";
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
  drawingVisibilityToggle: getRequiredElement("#drawing-visibility-toggle"),
  loadDocumentInput: getOptionalElement("#load-document-input"),
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
  arrangeControls: getRequiredElement("#arrange-controls"),
  brushControls: getRequiredElement("#brush-controls"),
  brushTypeControls: getRequiredElement("#brush-type-controls"),
  saveFocus: getRequiredElement("#save-focus"),
  focusPositionMode: getRequiredElement("#focus-position-mode"),
  strokeColor: getRequiredElement("#stroke-color"),
  recentColors: getRequiredElement("#recent-colors"),
  strokeWidthLabel: getRequiredElement("#stroke-width-label"),
  strokeWidth: getRequiredElement("#stroke-width"),
  strokeWidthValue: getRequiredElement("#stroke-width-value"),
  clearStrokes: getRequiredElement("#clear-strokes"),
  catalogPanel: getRequiredElement("#catalog-panel"),
  modeCapsuleEdit: getRequiredElement("#mode-capsule-edit"),
  modeCapsulePresent: getRequiredElement("#mode-capsule-present"),
};

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
  JavaScriptEditorComponent,
  VideoComponent,
].forEach((ComponentClass) => app.components.register(new ComponentClass(app)));

// Register LeftToolbarPlugin first so its button elements can be passed to other plugins
const leftToolbar = app.use(LeftToolbarPlugin);

// Register plugins (order matters: tools before toolbar so buttons render)
app.use(SelectionPlugin);
app.use(CatalogActionsPlugin);
app.use(DrawingPlugin);
app.use(AnnotatorPlugin);
app.use(ComponentEditorPlugin);
app.use(PageComparePlugin);
app.use(ToolbarPlugin, {
  modeCapsuleEditEl: ui.modeCapsuleEdit,
  modeCapsulePresentEl: ui.modeCapsulePresent,
  drawingVisibilityToggleEl: ui.drawingVisibilityToggle,
  arrangeControlsEl: ui.arrangeControls,
  brushControlsEl: ui.brushControls,
  brushTypeControlsEl: ui.brushTypeControls,
  saveFocusEl: ui.saveFocus,
  focusPositionModeEl: ui.focusPositionMode,
  strokeColorEl: ui.strokeColor,
  recentColorsEl: ui.recentColors,
  strokeWidthLabelEl: ui.strokeWidthLabel,
  strokeWidthEl: ui.strokeWidth,
  strokeWidthValueEl: ui.strokeWidthValue,
  clearStrokesEl: ui.clearStrokes,
});

// Components dropdown — replaces the old sidebar palette
const componentsDropdown = app.use(ComponentsDropdownPlugin);
componentsDropdown.wireTrigger(leftToolbar.componentsBtn);

app.use(CatalogPanelPlugin, {
  panelEl: ui.catalogPanel,
});
app.use(RankingBoxPlugin);
app.use(MindMapBranchPlugin);
app.use(ConnectionsPlugin);
app.use(FocusNavigationPlugin);
app.use(AttachmentsBookmarksPlugin);
app.use(ContextMenuPlugin);
app.use(ContainersPlugin);
const historyPlugin = app.use(HistoryPlugin, {
  undoEl: leftToolbar.undoBtn,
  redoEl: leftToolbar.redoBtn,
});
app.use(DocumentPlugin, {
  exportEl: leftToolbar.saveBtn,
  importEl: leftToolbar.loadBtn,
  importInputEl: ui.loadDocumentInput,
});
app.use(BinaryCalculatorPlugin, {
  toggleEl: leftToolbar.calculatorBtn,
  widgetEl: ui.calculatorWidget,
});
const minimapPlugin = app.use(MinimapPlugin);
minimapPlugin.attachHeaderAction(leftToolbar.centerMapBtn);
app.use(TimerPlugin, {
  toggleEl: leftToolbar.timerBtn,
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
  centerMapEl: leftToolbar.centerMapBtn,
  zoomInEl: leftToolbar.zoomInBtn,
  zoomOutEl: leftToolbar.zoomOutBtn,
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
