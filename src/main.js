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
import { FocusNavigationPlugin } from "./plugins/focusNavigation.js";
import { ComponentEditorPlugin } from "./plugins/componentEditor.js";
import { setupAppTestApi } from "./testApi.js";

import { TextComponent } from "./component/text.js";
import { StickyComponent } from "./component/sticky.js";
import { ImageComponent } from "./component/image.js";
import { ContainerComponent } from "./component/container.js";
import { PageComponent } from "./component/page.js";
import { ConnectionComponent } from "./component/connection.js";

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
  arrangeControls: getRequiredElement("#arrange-controls"),
  brushControls: getRequiredElement("#brush-controls"),
  connectSelection: getRequiredElement("#connect-selection"),
  saveFocus: getRequiredElement("#save-focus"),
  focusPositionMode: getRequiredElement("#focus-position-mode"),
  strokeColor: getRequiredElement("#stroke-color"),
  strokeWidth: getRequiredElement("#stroke-width"),
  strokeWidthValue: getRequiredElement("#stroke-width-value"),
  componentPalette: getRequiredElement("#component-palette"),
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
].forEach((ComponentClass) => app.components.register(new ComponentClass(app)));

// Register plugins (order matters: tools before toolbar so buttons render)
app.use(SelectionPlugin);
app.use(DrawingPlugin);
app.use(ComponentEditorPlugin);
app.use(ToolbarPlugin, {
  modeToggleEl: ui.modeToggle,
  toolButtonsEl: ui.toolButtons,
  arrangeControlsEl: ui.arrangeControls,
  brushControlsEl: ui.brushControls,
  connectSelectionEl: ui.connectSelection,
  saveFocusEl: ui.saveFocus,
  focusPositionModeEl: ui.focusPositionMode,
  strokeColorEl: ui.strokeColor,
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

app.start();

// Seed starter nodes
await Promise.all([
  app.addComponent("sticky", { x: 120, y: 120 }),
  app.addComponent("text", { x: 380, y: 170 }),
]);

if (import.meta.env.VITE_E2E === "1") {
  setupAppTestApi(app);
}
