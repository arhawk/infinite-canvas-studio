import { App } from "./core/app.js";
import { ToolbarPlugin } from "./plugins/toolbar.js";
import { SidebarPlugin } from "./plugins/sidebar.js";
import { SelectionPlugin } from "./plugins/selection.js";
import { DrawingPlugin } from "./plugins/drawing.js";
import { ContextMenuPlugin } from "./plugins/contextMenu.js";
import { ContainersPlugin } from "./plugins/containers.js";
import { ComponentEditorPlugin } from "./plugins/componentEditor.js";

import { TextComponent } from "./component/text.js";
import { StickyComponent } from "./component/sticky.js";
import { ImageComponent } from "./component/image.js";
import { ArrowComponent } from "./component/arrow.js";
import { ContainerComponent } from "./component/container.js";

const app = new App({
  container: document.querySelector("#canvas-container"),
});

// Register built-in components
[
  ContainerComponent,
  TextComponent,
  StickyComponent,
  ImageComponent,
  ArrowComponent,
].forEach((ComponentClass) => app.components.register(new ComponentClass(app)));

// Register plugins (order matters: tools before toolbar so buttons render)
app.use(SelectionPlugin);
app.use(DrawingPlugin);
app.use(ComponentEditorPlugin);
app.use(ToolbarPlugin, {
  modeToggleEl: document.querySelector("#mode-toggle"),
  toolButtonsEl: document.querySelector("#tool-buttons"),
  strokeColorEl: document.querySelector("#stroke-color"),
  strokeWidthEl: document.querySelector("#stroke-width"),
  strokeWidthValueEl: document.querySelector("#stroke-width-value"),
  zoomResetEl: document.querySelector("#zoom-reset"),
  fitAllEl: document.querySelector("#fit-all"),
});
app.use(SidebarPlugin, {
  paletteEl: document.querySelector("#component-palette"),
  canvasEl: document.querySelector("#canvas-container"),
  imageInputEl: document.querySelector("#image-file-input"),
});
app.use(ContextMenuPlugin);
app.use(ContainersPlugin);

app.start();

// Seed starter nodes
app.addComponent("sticky", { x: 120, y: 120 });
app.addComponent("text", { x: 380, y: 170 });

// Expose app globally for secondary development
window.__mindMapApp = app;
