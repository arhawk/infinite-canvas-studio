import "./styles.css";
import { App } from "./core/app.js";
import { ToolbarPlugin } from "./plugins/toolbar.js";
import { SidebarPlugin } from "./plugins/sidebar.js";
import { SelectionPlugin } from "./plugins/selection.js";
import { DrawingPlugin } from "./plugins/drawing.js";
import { ContextMenuPlugin } from "./plugins/contextMenu.js";
import { ContainersPlugin } from "./plugins/containers.js";
import { ConnectionsPlugin } from "./plugins/connections.js";
import { FocusNavigationPlugin } from "./plugins/focusNavigation.js";
import { ComponentEditorPlugin } from "./plugins/componentEditor.js";

import { TextComponent } from "./component/text.js";
import { StickyComponent } from "./component/sticky.js";
import { ImageComponent } from "./component/image.js";
import { ContainerComponent } from "./component/container.js";

function getRequiredElement(selector) {
  const element = document.querySelector(selector);
  if (!element) {
    throw new Error(`Missing required element: ${selector}`);
  }
  return element;
}

const ui = {
  canvasContainer: getRequiredElement("#canvas-container"),
  modeToggle: getRequiredElement("#mode-toggle"),
  toolButtons: getRequiredElement("#tool-buttons"),
  strokeColor: getRequiredElement("#stroke-color"),
  strokeWidth: getRequiredElement("#stroke-width"),
  strokeWidthValue: getRequiredElement("#stroke-width-value"),
  zoomReset: getRequiredElement("#zoom-reset"),
  fitAll: getRequiredElement("#fit-all"),
  componentPalette: getRequiredElement("#component-palette"),
};

const app = new App({
  container: ui.canvasContainer,
});

// Register built-in components
[
  ContainerComponent,
  TextComponent,
  StickyComponent,
  ImageComponent,
].forEach((ComponentClass) => app.components.register(new ComponentClass(app)));

// Register plugins (order matters: tools before toolbar so buttons render)
app.use(SelectionPlugin);
app.use(DrawingPlugin);
app.use(ComponentEditorPlugin);
app.use(ToolbarPlugin, {
  modeToggleEl: ui.modeToggle,
  toolButtonsEl: ui.toolButtons,
  strokeColorEl: ui.strokeColor,
  strokeWidthEl: ui.strokeWidth,
  strokeWidthValueEl: ui.strokeWidthValue,
  zoomResetEl: ui.zoomReset,
  fitAllEl: ui.fitAll,
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
app.addComponent("sticky", { x: 120, y: 120 });
app.addComponent("text", { x: 380, y: 170 });

// Expose app globally for secondary development
window.__mindMapApp = app;
