# Component Editor To Floating Toolbar Refactor

## 接手 Agent 30 秒版

这次重构的意思不是“删掉编辑能力”，而是“逐步删掉大部分组件的 modal Component Editor，把原本在 modal 里的字段迁移到选中组件旁边的 floating toolbar”。

最重要的判定标准：

- 迁移后的组件，双击不能再打开 modal Component Editor。
- 迁移后的组件，右键菜单不能再出现 `Edit...`。
- 原本 modal 里有用的功能必须搬到悬浮工具栏或保留为已有 inline editor。
- 已有 inline editor 不要误删。比如 shape text 双击已经是 inline edit，这不是要砍掉的 Component Editor。
- `Bring Forward` / `Send Backward` 放在悬浮工具栏最右侧的 `...` icon 下拉菜单里。
- 不要重新造一套 toolbar 定位系统。直接用 `app.floatingToolbar`，实现位置在 `src/core/floatingToolbar.js`。
- 当前 shape toolbar 是参考实现，看 `index.html` 的 `#shape-panel` 和 `src/plugins/toolbar.js` 里的 shape 相关方法。

最常用 API：

```js
const panel = app.floatingToolbar.registerPanel({
  id: "some-component-panel",
  element: panelEl,
  getAnchorNode: () => this.selectedNode,
  getAnchorRect: (node, app) => node.getClientRect({ relativeTo: app.stage }),
  viewportMargin: 12,
  anchorGap: 64,
  popover: { nodeClearance: 10 },
});

panel.registerButton("layer:bring-forward", bringForwardButton);
panel.setButtonState("layer:bring-forward", { disabled, label, title });
panel.setVisible(Boolean(this.selectedNode));
panel.queuePosition();
```

修改节点时必须走历史事件：

```js
app.events.emit("node:change:start", { node });
await component.applySerializedData(node, nextData);
app.events.emit("node:changed", { node });
```

This document is the handoff brief for migrating component editing out of the modal `ComponentEditorPlugin` and into reusable floating toolbars.

## Goal

Gradually remove the modal component editor for most components.

In this project, "remove the component editor" means:

- Double-click should no longer open the modal Component Editor for migrated components.
- Right-click should no longer show an `Edit...` context menu item for migrated components.
- The actual editing capability must not disappear. It should move into a floating toolbar anchored to the selected component.
- Existing inline editing is allowed to stay. For example, shape text already edits on double-click; do not replace that with a toolbar text button.
- Layer actions such as `Bring Forward` and `Send Backward` should live behind a rightmost `...` icon button in the floating toolbar, not as loose buttons or a modal section.

The shape toolbar is the reference implementation. It already demonstrates the intended direction:

- Selection shows a floating toolbar near the selected shape.
- Shape style and text controls live in the toolbar.
- The rightmost `...` button opens layer actions.
- Clicking `...` again closes the layer menu.
- Right-clicking a shape opens the same layer menu at the mouse position.

## Non-Goals

Do not delete `ComponentEditorPlugin` in one sweep. Some components may still need the modal while they are unmigrated.

Do not build a second floating toolbar framework. Use `app.floatingToolbar`, which is already core-level infrastructure.

Do not remove data persistence hooks. A migrated component still needs correct `serializeNode(node)` and `applySerializedData(node, data)` behavior for history and document roundtrips.

Do not confuse "remove modal editor" with "remove all double-click behavior". Text-like components may keep inline text editing on double-click.

## Current Core API

`App` creates one shared manager:

```js
app.floatingToolbar
```

The implementation is in `src/core/floatingToolbar.js`.

### Register A Panel

Use `app.floatingToolbar.registerPanel(...)` once during plugin setup:

```js
const handle = app.floatingToolbar.registerPanel({
  id: "video-panel",
  element: videoPanelEl,
  getAnchorNode: () => this.selectedVideoNode,
  getAnchorRect: (node, app) => {
    const anchorNode = node?.findOne?.(".video-bg") ?? node;
    return anchorNode?.getClientRect?.({ relativeTo: app.stage }) ?? null;
  },
  viewportMargin: 12,
  anchorGap: 64,
  popover: {
    nodeClearance: 10,
  },
});
```

`registerPanel` moves the panel element into `document.body`, positions it around the anchor node, and restores the original DOM location on unregister.

The returned handle supports:

```js
handle.registerButton(buttonId, elementOrSelector);
handle.setButtonState(buttonId, state);
handle.setVisible(visible);
handle.queuePosition();
handle.updatePosition();
handle.unregister();
```

The manager also exposes:

```js
app.floatingToolbar.setPanelVisible(panelId, visible);
app.floatingToolbar.queuePanelPosition(panelId);
app.floatingToolbar.updatePanelPosition(panelId);
app.floatingToolbar.syncPopoverOpenState(panelId);
app.floatingToolbar.syncPopoverOffset(panelId, payload);
```

Prefer the panel handle inside a plugin. Use the manager methods only when a panel id is more convenient, as `ToolbarPlugin` does for shared shape/button panels.

### Dynamic Button State

Register buttons once, then update them whenever selection or node state changes:

```js
handle.registerButton("layer:bring-forward", bringForwardButton);

handle.setButtonState("layer:bring-forward", {
  disabled: !selection.canBringForward(node),
  title: "Bring Forward",
  label: "Bring Forward",
});
```

`setButtonState` supports:

- `pressed`: writes `aria-pressed`
- `disabled`: writes `disabled` and `aria-disabled`
- `hidden`
- `title`
- `label`: writes `aria-label`
- `text`
- `icon`: replaces content with a Lucide icon and renders it
- `iconSize`
- `iconStrokeWidth`
- `attributes`
- `dataset`
- `styles` or `style`
- `classes`

This is the intended API for "buttons can be dynamically modified at any time".

### Popovers And The `...` Menu

Use the existing popover convention instead of a custom dropdown system:

```html
<div class="toolbar__button-style-tool toolbar__button-popover-tool">
  <button type="button" class="toolbar__button-style-trigger" aria-label="Layer order">
    <i data-lucide="ellipsis" aria-hidden="true"></i>
  </button>
  <div class="toolbar__button-style-popover" role="menu">
    ...
  </div>
</div>
```

For layer actions, put this tool at the far right of the floating toolbar. The shape implementation uses:

- `#shape-layer-menu-trigger`
- `.toolbar__shape-layer-tool`
- `.toolbar__shape-layer-popover`
- `[data-shape-layer-action="bring-forward"]`
- `[data-shape-layer-action="send-backward"]`

For connectable components, put a `link-2` icon button immediately to the left of the `...` layer menu button. The button should call the existing `connection:connect` command with the selected node id. Do not reimplement connection picking in the toolbar.

Clicking the trigger should toggle the menu:

- If closed, focus opens it through `:focus-within`.
- If already open, blur the active element and clear any context-menu positioning.
- Normal click opens the layer menu to the right of the `...` button, not below the toolbar.
- Keep this menu compact. It should not cover the toolbar-to-node selection handle when there is room to open sideways.

Right-click behavior is separate:

- Prevent the browser context menu.
- Select the target component.
- Show the same `...` popover at the mouse point.
- Do not show the old Konva context menu for that component.

Use the shape code in `src/plugins/toolbar.js` as the reference for this, especially:

- `handleShapeLayerNativeContextMenu`
- `openShapeLayerMenu`
- `closeShapeLayerMenu`
- `positionShapeLayerMenuAtPoint`
- `syncShapeLayerActions`

Regular style popovers such as font size and colors should stay visually near their trigger. The shared floating toolbar positioning may flip a popover above the toolbar when it would cover the selected node, and only falls back to horizontal avoidance when both the default and flipped placements would collide.

### Shared Color Picker

Do not create one-off color palette implementations for migrated components.

Use `src/lib/colorToolbar.js`:

- `ColorToolbarController`
- `DEFAULT_COLOR_SWATCHES`
- `normalizeHexColor`

The shape, button, and sticky toolbars all use this controller. New toolbar color controls should register their target inputs and swatch containers with `ColorToolbarController` instead of hand-writing swatch grids, custom color popovers, eyedropper wiring, or recent color state.

## Migration Recipe

For each component type, do the migration in small PRs/commits.

### 1. Inventory The Modal Fields

Find the component's `editorFields()` in `src/component/<component>.js`.

Classify each field:

- Inline content: keep or create inline editing if that is the natural UX.
- Simple scalar style: move to toolbar controls.
- File or URL picker: move to a compact toolbar control or explicit icon button.
- Large structured data: consider leaving this component unmigrated for now.
- Attachments: do not migrate blindly. `ComponentEditorPlugin` currently hosts `AttachmentsInlineController`, so toolbar attachment editing needs its own design.

### 2. Add Or Reuse A Floating Panel Element

Panel DOM can live in `index.html` if it is part of the main app shell, or be created by a plugin if it is component-specific.

Use existing toolbar classes where possible:

- `.toolbar__floating-panel`
- `.toolbar__button-style-tool`
- `.toolbar__button-style-trigger`
- `.toolbar__button-style-popover`
- `.toolbar__shape-layer-action` as a compact menu style reference

Use Lucide icons through `<i data-lucide="...">` and `renderIcons(...)`.

### 3. Register The Panel With Core

In the owning plugin's `onSetup()`:

```js
this.videoPanel = this.app.floatingToolbar.registerPanel({
  id: "video-panel",
  element: videoPanelEl,
  getAnchorNode: () => this.selectedVideoNode,
  getAnchorRect: (node, app) => (
    node?.getClientRect?.({ relativeTo: app.stage }) ?? null
  ),
  viewportMargin: 12,
  anchorGap: 64,
  popover: {
    nodeClearance: 10,
  },
});

this.cleanups.push(() => this.videoPanel.unregister());
```

If the plugin already has a fallback manual positioning path, prefer deleting it once the core panel works.

### 4. Track Selection

Listen to `selection:change`, store the selected node for the component type, load UI state, and show/hide the panel:

```js
this.listen("selection:change", ({ nodes = [] } = {}) => {
  this.selectedVideoNode =
    nodes.length === 1 && nodes[0]?.getAttr?.("componentType") === "video"
      ? nodes[0]
      : null;

  this.loadVideoUiFromSelection();
  this.syncVideoToolbar();
});
```

`syncVideoToolbar()` should:

- call `handle.setVisible(Boolean(this.selectedVideoNode))`
- call `handle.queuePosition()` after state changes
- call `handle.setButtonState(...)` for dynamic states

Also listen to:

```js
this.listen("viewport:change", () => this.videoPanel.queuePosition());
this.listen("node:changing", ({ node }) => {
  if (node === this.selectedVideoNode) this.videoPanel.queuePosition();
});
this.listen("node:changed", ({ node }) => {
  if (node === this.selectedVideoNode) {
    this.loadVideoUiFromSelection();
    this.syncVideoToolbar();
  }
});
```

### 5. Apply Changes With History Events

Toolbar edits must be reversible.

Use the same history event contract as the modal:

```js
this.app.events.emit("node:change:start", { node });
await component.applySerializedData(node, nextData);
this.app.events.emit("node:changed", { node });
node.getLayer?.()?.batchDraw?.();
this.app.overlayLayer?.batchDraw?.();
```

For simple components, read and write through the component's own helpers:

```js
const component = this.app.components.get("video");
const current = component.serializeNode(node);
await component.applySerializedData(node, {
  ...current,
  src: nextSrc,
});
```

Do not directly mutate random child nodes if a component already exposes `serializeNode` and `applySerializedData`. Direct mutation is a common way to break undo/redo and save/load.

If a component has useful `editorFields()` logic, extract shared read/write helpers into the component module instead of calling modal code from the toolbar.

### 6. Add The Rightmost Layer Menu

Every migrated toolbar that supports layer ordering should have a rightmost `...` button.

The dropdown should contain:

- `Bring Forward`
- `Send Backward`

Optional future additions can include `Bring To Front`, `Send To Back`, duplicate, delete, or component-specific advanced actions, but do not add them unless requested.

Use the selection plugin APIs:

```js
const selection = this.app.getPlugin("selection");
selection.canBringForward(node);
selection.bringForward(node);
selection.canSendBackward(node);
selection.sendBackward(node);
```

Update button disabled state after every layer action and after selection changes.

### 7. Disable The Modal Entry Points For Migrated Components

Do this only after the toolbar covers the old editor functionality.

The current modal entry points are in `src/plugins/componentEditor.js`:

- command: `component:edit`
- context menu item: `OpenComponentEditorMenuItem`
- double-click handler in `ComponentEditorPlugin.onSetup()`

Recommended migration guard:

```js
const MIGRATED_FLOATING_TOOLBAR_COMPONENTS = new Set([
  "shape",
  "button",
]);

function isFloatingToolbarMigrated(node) {
  return MIGRATED_FLOATING_TOOLBAR_COMPONENTS.has(node?.getAttr?.("componentType"));
}
```

Then:

- `OpenComponentEditorMenuItem.condition(node)` should return false for migrated types.
- `ComponentEditorPlugin.open(node)` should no-op for migrated types.
- The double-click handler should not open the modal for migrated types.
- Keep special inline editors. Shape and text are examples where double-click should still edit inline text.

Avoid deleting `editorFields()` immediately unless no tests or compatibility paths need it. A safer first step is to hide modal entry points while leaving component definitions intact.

### 8. Tests To Add Or Update

For each migrated component, add Playwright coverage for:

- selecting the component shows the floating toolbar
- toolbar controls reflect selected node state
- changing a toolbar control mutates the node
- undo/redo restores the change
- save/load roundtrip preserves the change if the field is persisted
- double-click does not open the modal, unless it intentionally opens an inline editor
- right-click does not show browser context menu
- right-click opens the `...` layer menu at the mouse position when applicable
- clicking `...` opens the menu
- clicking `...` again closes the menu
- `Bring Forward` and `Send Backward` disabled states update correctly

For pure state helpers, add Vitest coverage near `tests/unit/core/` or `tests/unit/component/`.

## Current Reference: Shape

Shape is the canonical example for this refactor.

Relevant files:

- `index.html`: `#shape-panel` markup and the rightmost `#shape-layer-menu-trigger`
- `src/plugins/toolbar.js`: shape toolbar state, event wiring, layer menu, context-menu bridge
- `src/core/floatingToolbar.js`: reusable panel positioning and dynamic button state API
- `tests/e2e/features.spec.js`: shape floating toolbar layer menu coverage

Behavior that should be copied:

- Floating toolbar follows selected node.
- Connectable components expose a connect icon immediately before `...`.
- Popovers avoid covering the selected node where possible.
- Layer actions are in `...`, not visible as top-level buttons.
- Disabled states are computed from the current selection.
- Right-click opens the same menu as `...`.
- Normal click `...` opens to the right of the button.
- Right-click menu is anchored to the mouse.
- The menu is toggleable.

## Migration Checklist

Use this list as the source of truth for migration scope. Do not invent additional component priorities in this document.

- [ ] OIP-132 video (`video`)
- [x] OIP-133 js code runner (`javascriptEditor`)
- [x] OIP-134 ranking box (`rankingBox`)
- [ ] OIP-135 iframe (`iframe`)
- [x] OIP-136 image (`image`)
- [ ] OIP-137 page (`page`)
- [x] OIP-138 text (`text`)
- [x] OIP-139 note (`sticky`)

## Definition Of Done For One Component

A component is migrated only when all of these are true:

- No modal Component Editor appears from double-click for that component.
- No `Edit...` item appears from right-click for that component.
- All previously useful modal fields are reachable from the floating toolbar or an intentional inline editor.
- Toolbar edits emit `node:change:start` and `node:changed`.
- Undo/redo works.
- Save/load works.
- The floating toolbar uses `app.floatingToolbar`; it does not implement a duplicate positioning manager.
- Layer order actions, if present, are inside a rightmost `...` menu.
- Dynamic button states are updated through `setButtonState`.
- E2E coverage proves the main interaction path.
