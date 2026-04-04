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
import { FocusNavigationPlugin } from "./plugins/focusNavigation.js";
import { ComponentEditorPlugin } from "./plugins/componentEditor.js";
import { HistoryPlugin } from "./plugins/history.js";
import { DocumentPlugin } from "./plugins/document.js";
import { TimerPlugin } from "./plugins/timer.js";
import { BinaryCalculatorPlugin } from "./plugins/binaryCalculator.js";
import { MinimapPlugin } from "./plugins/minimap.js";
import { CenterMapPlugin } from "./plugins/centerMap.js";
import { AnnotatorPlugin } from "./plugins/annotator.js";
import { setupAppTestApi } from "./testApi.js";

import { TextComponent } from "./component/text.js";
import { StickyComponent } from "./component/sticky.js";
import { ImageComponent } from "./component/image.js";
import { ContainerComponent } from "./component/container.js";
import { PageComponent } from "./component/page.js";
import { ConnectionComponent } from "./component/connection.js";
import { CatalogComponent } from "./component/catalog.js";

function getRequiredElement(selector) {
  const element = document.querySelector(selector);
  if (!element) {
    throw new Error(`Missing required element: ${selector}`);
  }
  return element;
}

const ui = {
  canvasContainer: getRequiredElement("#canvas-container"),
  sidebarBrand: getRequiredElement("#sidebar-brand"),
  modeToggle: getRequiredElement("#mode-toggle"),
  toolButtons: getRequiredElement("#tool-buttons"),
  historyControls: getRequiredElement("#history-controls"),
  documentControls: getRequiredElement("#document-controls"),
  undoAction: getRequiredElement("#undo-action"),
  redoAction: getRequiredElement("#redo-action"),
  saveDocumentAction: getRequiredElement("#save-document-action"),
  loadDocumentAction: getRequiredElement("#load-document-action"),
  loadDocumentInput: getRequiredElement("#load-document-input"),
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
  arrangeControls: getRequiredElement("#arrange-controls"),
  brushControls: getRequiredElement("#brush-controls"),
  connectSelection: getRequiredElement("#connect-selection"),
  saveFocus: getRequiredElement("#save-focus"),
  focusPositionMode: getRequiredElement("#focus-position-mode"),
  strokeColor: getRequiredElement("#stroke-color"),
  recentColors: getRequiredElement("#recent-colors"),
  strokeWidth: getRequiredElement("#stroke-width"),
  strokeWidthValue: getRequiredElement("#stroke-width-value"),
  componentPalette: getRequiredElement("#component-palette"),
  centerMapBtn: getRequiredElement("#center-map-btn"),
  annotatorToggle: getRequiredElement("#annotator-toggle"),
  annotatorControls: getRequiredElement("#annotator-controls"),
  annotatorColor: getRequiredElement("#annotator-color"),
  annotatorShape: getRequiredElement("#annotator-shape"),
  annotatorWidth: getRequiredElement("#annotator-width"),
  annotatorWidthValue: getRequiredElement("#annotator-width-value"),
  annotatorClear: getRequiredElement("#annotator-clear"),
};

renderIcons(ui.sidebarBrand, {
  width: 20,
  height: 20,
  "stroke-width": 2.2,
});

const app = new App({
  container: ui.canvasContainer,
});

// Register built-in components
[
  PageComponent,
  ContainerComponent,
  TextComponent,
  StickyComponent,
  ImageComponent,
  ConnectionComponent,
  CatalogComponent,
].forEach((ComponentClass) => app.components.register(new ComponentClass(app)));

// Register plugins (order matters: tools before toolbar so buttons render)
app.use(SelectionPlugin);
app.use(SelectionPlugin);
app.use(CatalogActionsPlugin);
app.use(DrawingPlugin);
app.use(ComponentEditorPlugin);
app.use(ToolbarPlugin, {
  modeToggleEl: ui.modeToggle,
  toolButtonsEl: ui.toolButtons,
  historyControlsEl: ui.historyControls,
  arrangeControlsEl: ui.arrangeControls,
  brushControlsEl: ui.brushControls,
  connectSelectionEl: ui.connectSelection,
  saveFocusEl: ui.saveFocus,
  focusPositionModeEl: ui.focusPositionMode,
  strokeColorEl: ui.strokeColor,
  recentColorsEl: ui.recentColors,
  strokeWidthEl: ui.strokeWidth,
  strokeWidthValueEl: ui.strokeWidthValue,
});
app.use(SidebarPlugin, {
  paletteEl: ui.componentPalette,
  canvasEl: ui.canvasContainer,
});
app.use(ConnectionsPlugin);
app.use(FocusNavigationPlugin);
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
  displayEl: ui.timerDisplay,
  startPauseEl: ui.timerStartPause,
  resetEl: ui.timerReset,
  mmInputEl: ui.timerMm,
  ssInputEl: ui.timerSs,
  durationRowEl: ui.timerDurationRow,
});
app.use(CenterMapPlugin, {
  centerMapEl: ui.centerMapBtn,
});
app.use(AnnotatorPlugin, {
  toggleEl: ui.annotatorToggle,
  controlsEl: ui.annotatorControls,
  colorEl: ui.annotatorColor,
  shapeEl: ui.annotatorShape,
  widthEl: ui.annotatorWidth,
  widthValueEl: ui.annotatorWidthValue,
  clearEl: ui.annotatorClear,
});

app.start();

// Seed starter nodes
await Promise.all([
  app.addComponent("sticky", { x: 120, y: 120 }),
  app.addComponent("text", { x: 380, y: 170 }),
  app.addComponent("catalog", { x: 620, y: 140 }),
]);
historyPlugin.resetHistory();

if (import.meta.env.VITE_E2E === "1") {
  setupAppTestApi(app);
}
