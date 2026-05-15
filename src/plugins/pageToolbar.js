import { BasePlugin } from "../core/baseClasses.js";
import { renderIcons } from "../lib/icons.js";
import {
  AttachmentActions,
  isFileSystemAccessSupported,
  isHttpUrl,
  supportsManualFileAttachments,
} from "../attachments/actions.js";
import {
  ColorToolbarController,
  DEFAULT_COLOR_SWATCHES,
} from "../lib/colorToolbar.js";
import { clamp01, syncOpacityUi } from "../lib/styleControls.js";

const PAGE_LAYER_ACTIONS = [
  {
    id: "bring-forward",
    label: "Bring Forward",
    run: "bringForward",
    canRun: "canBringForward",
  },
  {
    id: "send-backward",
    label: "Send Backward",
    run: "sendBackward",
    canRun: "canSendBackward",
  },
];

function resolveSelectable(target) {
  if (!target) return null;
  if (target.hasName?.("selectable")) return target;
  return target.findAncestor?.(".selectable", true) ?? null;
}

function resolveSelectableFromStageEvent(app, event) {
  const direct = resolveSelectable(event?.target);
  if (direct?.listening?.() !== false) return direct;

  const stage = app.stage;
  if (!stage || typeof stage.getIntersection !== "function") return direct;
  if (event?.evt && typeof stage.setPointersPositions === "function") {
    stage.setPointersPositions(event.evt);
  }

  const pointer = stage.getPointerPosition?.() ?? null;
  const intersection = pointer ? stage.getIntersection(pointer) : null;
  const selectable = resolveSelectable(intersection);
  return selectable?.listening?.() !== false ? selectable : direct;
}

function getClientPoint(app, event) {
  const nativeEvent = event?.evt ?? event;
  const clientX = nativeEvent?.clientX;
  const clientY = nativeEvent?.clientY;
  if (Number.isFinite(clientX) && Number.isFinite(clientY)) {
    return { x: clientX, y: clientY };
  }

  const pointer = app.stage?.getPointerPosition?.() ?? null;
  const rect = app.stage?.container?.()?.getBoundingClientRect?.() ?? null;
  if (pointer && rect) {
    return { x: rect.left + pointer.x, y: rect.top + pointer.y };
  }

  return null;
}

function formatFileSize(size) {
  if (!Number.isFinite(size) || size <= 0) return "";
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  if (size < 1024 * 1024 * 1024) return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  return `${(size / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

function escapeHtml(text) {
  return String(text ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#39;");
}

export class PageToolbarPlugin extends BasePlugin {
  static pluginId = "page-toolbar";
  static modes = {
    edit: {
      tools: {
        arrange: {},
      },
    },
  };

  onSetup() {
    this.selectedPageNode = null;
    this.actions = new AttachmentActions(this.app);
    this.statusTimeout = null;

    this.panelEl = this.buildPanel();
    this.fileInputEl = this.panelEl.querySelector("#page-attachment-file-input");
    this.pageColorToolbar = null;

    this.panel = this.app.floatingToolbar?.registerPanel?.({
      id: "page-panel",
      element: this.panelEl,
      getAnchorNode: () => this.selectedPageNode,
      getAnchorRect: (node, app) => (
        node?.getClientRect?.({ relativeTo: app.stage }) ?? null
      ),
      viewportMargin: 12,
      anchorGap: 64,
      popover: {
        nodeClearance: 10,
      },
    });

    this.cleanups.push(() => {
      this.panel?.unregister?.();
      this.panelEl?.remove?.();
      window.clearTimeout(this.statusTimeout);
    });

    this.registerPanelButtons();
    this.setupColorToolbar();
    this.bindEvents();
    this.syncToolbar();
  }

  buildPanel() {
    const panel = document.createElement("div");
    panel.id = "page-panel";
    panel.className = "toolbar__floating-panel toolbar__cluster toolbar__tool-panel toolbar__shape-panel toolbar__button-panel toolbar__page-panel";
    panel.dataset.testid = "page-panel";
    panel.hidden = true;
    panel.innerHTML = `
      <div class="toolbar__button-tools" role="group" aria-label="Page actions">
        <div class="toolbar__button-style-tool toolbar__button-popover-tool toolbar__button-tool--font-size">
          <button
            id="page-font-size-style-trigger"
            class="toolbar__button-style-trigger"
            type="button"
            title="Font size"
            aria-label="Font size"
            data-testid="page-style-font-size"
          >
            <span class="toolbar__button-font-size-icon" aria-hidden="true">
              <span class="toolbar__button-font-size-a">A</span>
              <span class="toolbar__button-font-size-mark"></span>
            </span>
          </button>
          <div class="toolbar__button-style-popover" role="group" aria-label="Page title font size settings">
            <label class="toolbar__button-style-row">
              <span id="page-font-size-label">Font size</span>
              <input
                id="page-font-size"
                type="range"
                min="12"
                max="72"
                step="1"
                value="16"
                data-testid="page-font-size"
                aria-labelledby="page-font-size-label"
                title="Font size: 16"
              />
              <output id="page-font-size-value" data-testid="page-font-size-value" title="Font size: 16">16</output>
            </label>
          </div>
        </div>
        <div class="toolbar__button-style-tool toolbar__button-popover-tool toolbar__button-tool--text-color" data-popover-role="color">
          <button
            id="page-text-style-trigger"
            class="toolbar__button-style-trigger"
            type="button"
            title="Text color"
            aria-label="Text color"
            data-testid="page-style-text-color"
          >
            <span class="toolbar__button-text-icon" aria-hidden="true">A</span>
          </button>
          <div class="toolbar__button-style-popover" role="group" aria-label="Page title text color settings">
            <div id="page-text-swatches" class="toolbar__button-color-grid" role="group" aria-label="Page text color swatches"></div>
            <div class="toolbar__button-custom-color" title="Custom text color">
              <span class="toolbar__sr-only">Custom text color</span>
              <input
                id="page-text-color"
                type="color"
                value="#ab4f28"
                aria-label="Custom text color"
                title="Text color"
                data-testid="page-text-color"
              />
            </div>
          </div>
        </div>
        <div class="toolbar__button-style-tool toolbar__button-popover-tool toolbar__button-tool--fill-color" data-popover-role="color">
          <button
            id="page-fill-style-trigger"
            class="toolbar__button-style-trigger"
            type="button"
            title="Fill color"
            aria-label="Fill color"
            data-testid="page-style-fill"
          >
            <span class="toolbar__button-fill-icon" aria-hidden="true"></span>
          </button>
          <div class="toolbar__button-style-popover" role="group" aria-label="Page fill settings">
            <div id="page-fill-swatches" class="toolbar__button-color-grid" role="group" aria-label="Page fill color swatches"></div>
            <div class="toolbar__button-custom-color" title="Custom fill color">
              <span class="toolbar__sr-only">Custom fill color</span>
              <input
                id="page-fill-color"
                type="color"
                value="#fffdf8"
                aria-label="Custom fill color"
                title="Fill color"
                data-testid="page-fill-color"
              />
            </div>
            <label class="toolbar__button-style-row">
              <span id="page-fill-opacity-label">Opacity</span>
              <input
                id="page-fill-opacity"
                type="range"
                min="0"
                max="1"
                step="0.05"
                value="1"
                data-testid="page-fill-opacity"
                aria-labelledby="page-fill-opacity-label"
                title="Opacity: 100%"
              />
              <output
                id="page-fill-opacity-value"
                data-testid="page-fill-opacity-value"
                title="Opacity: 100%"
              >
                100%
              </output>
            </label>
          </div>
        </div>
        <div class="toolbar__button-style-tool toolbar__button-popover-tool toolbar__page-attachment-tool" data-popover-offset="none">
          <button
            id="page-attachment-menu-trigger"
            class="toolbar__button-style-trigger"
            type="button"
            title="Attachments"
            aria-label="Attachments"
            data-testid="page-attachment-menu"
          >
            <i data-lucide="folder-open" aria-hidden="true"></i>
          </button>
          <div class="toolbar__button-style-popover toolbar__page-attachment-popover" role="menu" aria-label="Page attachments">
            <button type="button" class="toolbar__shape-layer-action" data-page-attachment-action="toggle-directory" data-testid="page-attachment-directory-action">Choose Folder</button>
            <button type="button" class="toolbar__shape-layer-action" data-page-attachment-action="add-file" data-testid="page-attachment-add-file">Add File</button>
            <button type="button" class="toolbar__shape-layer-action" data-page-attachment-action="add-url" data-testid="page-attachment-add-url">Add URL</button>
            <div class="toolbar__page-attachment-list" data-testid="page-attachment-list"></div>
            <p class="toolbar__page-attachment-status" data-testid="page-attachment-status" hidden></p>
          </div>
          <input id="page-attachment-file-input" data-testid="page-attachment-file-input" type="file" multiple hidden />
        </div>
        <div class="toolbar__button-style-tool toolbar__button-connect-tool">
          <button
            id="page-create-next-trigger"
            class="toolbar__button-style-trigger"
            type="button"
            title="Create Next Page"
            aria-label="Create Next Page"
            data-testid="page-create-next"
          >
            <i data-lucide="plus" aria-hidden="true"></i>
          </button>
        </div>
        <div class="toolbar__button-style-tool toolbar__button-connect-tool">
          <button
            id="page-connect-trigger"
            class="toolbar__button-style-trigger"
            type="button"
            title="Connect to"
            aria-label="Connect to"
            data-testid="page-connect"
          >
            <i data-lucide="link-2" aria-hidden="true"></i>
          </button>
        </div>
        <div class="toolbar__button-style-tool toolbar__button-popover-tool toolbar__shape-layer-tool toolbar__page-layer-tool" data-popover-offset="none">
          <button
            id="page-layer-menu-trigger"
            class="toolbar__button-style-trigger"
            type="button"
            title="Layer order"
            aria-label="Layer order"
            data-testid="page-layer-menu"
          >
            <i data-lucide="ellipsis" aria-hidden="true"></i>
          </button>
          <div class="toolbar__button-style-popover toolbar__shape-layer-popover toolbar__page-layer-popover" role="menu" aria-label="Page layer order">
            <button type="button" class="toolbar__shape-layer-action" data-page-layer-action="bring-forward" data-testid="page-layer-bring-forward">Bring Forward</button>
            <button type="button" class="toolbar__shape-layer-action" data-page-layer-action="send-backward" data-testid="page-layer-send-backward">Send Backward</button>
          </div>
        </div>
      </div>
    `;
    document.body.append(panel);
    renderIcons(panel, {
      width: 16,
      height: 16,
      "stroke-width": 2,
    });
    return panel;
  }

  registerPanelButtons() {
    this.panel?.registerButton?.("attachments", "#page-attachment-menu-trigger");
    this.panel?.registerButton?.("create-next", "#page-create-next-trigger");
    this.panel?.registerButton?.("connect", "#page-connect-trigger");
    for (const button of this.panelEl.querySelectorAll("[data-page-layer-action]")) {
      this.panel?.registerButton?.(`layer:${button.dataset.pageLayerAction}`, button);
    }
  }

  bindEvents() {
    this.listen("selection:change", ({ nodes = [] } = {}) => {
      this.selectedPageNode =
        nodes.length === 1 && nodes[0]?.getAttr?.("componentType") === "page"
          ? nodes[0]
          : null;
      this.syncToolbar();
    });
    this.listen("interaction:change", () => this.syncToolbar());
    this.listen("document:load:end", () => this.syncToolbar());
    this.listen("viewport:change", () => this.panel?.queuePosition?.());
    this.listen("node:changing", ({ node } = {}) => {
      if (node === this.selectedPageNode) this.panel?.queuePosition?.();
    });
    this.listen("node:changed", ({ node } = {}) => {
      if (node === this.selectedPageNode) this.syncToolbar();
    });

    this.listenDom(this.panelEl.querySelector("#page-font-size"), "input", () => {
      this.applyStyleFromPanel();
    });
    this.listenDom(this.panelEl.querySelector("#page-text-color"), "input", () => {
      this.pageColorToolbar?.recordCustomColor("text", this.panelEl.querySelector("#page-text-color")?.value);
      this.applyStyleFromPanel();
    });
    this.listenDom(this.panelEl.querySelector("#page-fill-color"), "input", () => {
      this.pageColorToolbar?.recordCustomColor("fill", this.panelEl.querySelector("#page-fill-color")?.value);
      this.applyStyleFromPanel();
    });
    this.listenDom(this.panelEl.querySelector("#page-fill-opacity"), "input", () => {
      this.applyStyleFromPanel();
    });
    this.listenDom(this.panelEl.querySelector("#page-create-next-trigger"), "click", () => {
      this.createNextPage();
    });
    this.listenDom(this.panelEl.querySelector("#page-connect-trigger"), "click", () => {
      this.startConnection();
    });
    this.listenDom(this.panelEl.querySelector("#page-attachment-menu-trigger"), "click", () => {
      this.syncToolbar();
    });
    this.listenDom(this.fileInputEl, "change", () => {
      void this.handleFileInputChange();
    });

    for (const button of this.panelEl.querySelectorAll("[data-page-layer-action]")) {
      this.listenDom(button, "click", () => {
        this.runLayerAction(button.dataset.pageLayerAction);
        button.blur();
      });
    }

    for (const button of this.panelEl.querySelectorAll("[data-page-attachment-action]")) {
      this.listenDom(button, "click", () => {
        void this.runAttachmentAction(button.dataset.pageAttachmentAction);
      });
    }
    this.listenDom(this.panelEl, "click", (event) => {
      const target = event.target instanceof Element ? event.target : null;
      const deleteButton = target?.closest?.("[data-page-attachment-delete]");
      if (!deleteButton) return;
      event.preventDefault();
      void this.handleAttachmentDelete(deleteButton.getAttribute("data-attachment-id"));
    });

    const layerTrigger = this.panelEl.querySelector("#page-layer-menu-trigger");
    let closeLayerMenuOnClick = false;
    this.listenDom(layerTrigger, "pointerdown", (event) => {
      closeLayerMenuOnClick = this.isLayerMenuOpen();
      if (closeLayerMenuOnClick) {
        event.preventDefault();
      } else {
        this.clearLayerContextPosition();
      }
    });
    this.listenDom(layerTrigger, "click", (event) => {
      if (!closeLayerMenuOnClick) return;
      event.preventDefault();
      closeLayerMenuOnClick = false;
      this.closeLayerMenu();
    });

    this.app.stage?.on?.("contextmenu.pageToolbar mousedown.pageToolbar", (event) => {
      this.handleStageContextMenu(event);
    });
    this.cleanups.push(() => this.app.stage?.off?.(".pageToolbar"));

    this.listenDom(this.panelEl, "contextmenu", (event) => {
      const layerPopover = this.panelEl.querySelector(".toolbar__page-layer-popover");
      const target = event.target instanceof Element ? event.target : null;
      if (layerPopover?.contains(target)) {
        event.preventDefault();
        event.stopPropagation();
      }
    });

    this.listenDom(this.panelEl, "focusout", () => {
      window.setTimeout(() => {
        if (!this.panelEl.querySelector(".toolbar__page-layer-tool:focus-within")) {
          this.clearLayerContextPosition();
        }
        this.panel?.queuePosition?.();
      }, 0);
    });

    this.listenDom(document, "pointerdown", (event) => {
      if (!this.pageColorToolbar?.activeTarget) return;
      if (this.pageColorToolbar.containsActiveTarget(event.target)) return;
      this.pageColorToolbar.closeActive();
    });
  }

  setupColorToolbar() {
    const withoutTransparent = DEFAULT_COLOR_SWATCHES.filter((color) => color !== "transparent");
    this.pageColorToolbar = new ColorToolbarController({
      listenDom: this.listenDom.bind(this),
      renderIcons,
      targets: {
        text: {
          input: this.panelEl.querySelector("#page-text-color"),
          swatchesEl: this.panelEl.querySelector("#page-text-swatches"),
          label: "Text color",
          baseColors: withoutTransparent,
          onChange: () => this.applyStyleFromPanel(),
        },
        fill: {
          input: this.panelEl.querySelector("#page-fill-color"),
          swatchesEl: this.panelEl.querySelector("#page-fill-swatches"),
          label: "Fill color",
          baseColors: DEFAULT_COLOR_SWATCHES,
          onChange: () => this.applyStyleFromPanel(),
          onSwatch: (color, { input }) => {
            const opacityEl = this.panelEl.querySelector("#page-fill-opacity");
            if (!input || !opacityEl) return;
            if (color === "transparent") {
              opacityEl.value = "0";
            } else {
              input.value = color;
              if (Number(opacityEl.value) === 0) {
                opacityEl.value = "1";
              }
            }
            this.applyStyleFromPanel();
          },
        },
      },
    });
    this.pageColorToolbar.setup();
  }

  getSelectionPlugin() {
    return this.app.getPlugin?.("selection")
      ?? this.app.plugins.find((plugin) => plugin.id === "selection")
      ?? null;
  }

  getConnectionsPlugin() {
    return this.app.getPlugin?.("connections")
      ?? this.app.plugins.find((plugin) => plugin.id === "connections")
      ?? null;
  }

  resolvePagePanelState(node) {
    const labelNode = node?.findOne?.(".page-label");
    const background = node?.findOne?.(".container-bg");
    return {
      fontSize: labelNode?.fontSize?.() ?? 16,
      textColor: labelNode?.fill?.() ?? "#ab4f28",
      fill: node?.getAttr?.("pageFill") ?? background?.fill?.() ?? "#fffdf8",
      opacity: clamp01(node?.getAttr?.("pageFillOpacity") ?? 1),
    };
  }

  deriveLineAndBorderColor(color) {
    if (typeof color !== "string" || !color) {
      return {
        border: "#c9b393",
        headerLine: "rgba(171, 79, 40, 0.12)",
      };
    }
    const normalized = color.trim();
    const shortHex = /^#([a-fA-F0-9]{3})$/;
    const longHex = /^#([a-fA-F0-9]{6})$/;
    if (shortHex.test(normalized) || longHex.test(normalized)) {
      const hex = normalized.slice(1);
      const raw = hex.length === 3
        ? hex.split("").map((part) => `${part}${part}`).join("")
        : hex;
      const red = parseInt(raw.slice(0, 2), 16);
      const green = parseInt(raw.slice(2, 4), 16);
      const blue = parseInt(raw.slice(4, 6), 16);
      return {
        border: `rgba(${red}, ${green}, ${blue}, 0.45)`,
        headerLine: `rgba(${red}, ${green}, ${blue}, 0.2)`,
      };
    }
    return {
      border: normalized,
      headerLine: normalized,
    };
  }

  applyStyleFromPanel() {
    const node = this.selectedPageNode;
    if (!node) return;
    const fontSizeEl = this.panelEl.querySelector("#page-font-size");
    const textColorEl = this.panelEl.querySelector("#page-text-color");
    const fillEl = this.panelEl.querySelector("#page-fill-color");
    const opacityEl = this.panelEl.querySelector("#page-fill-opacity");
    if (!fontSizeEl || !textColorEl || !fillEl || !opacityEl) return;

    const fontSize = Number(fontSizeEl.value);
    const textColor = textColorEl.value;
    const fill = fillEl.value;
    const opacity = clamp01(opacityEl.value);
    if (!Number.isFinite(fontSize) || !textColor || !fill) return;

    const background = node.findOne(".container-bg");
    const labelNode = node.findOne(".page-label");
    const headerLine = node.findOne(".page-header-line");
    const lineColors = this.deriveLineAndBorderColor(textColor);

    this.app.events.emit("node:change:start", { node });
    background?.fill?.(fill);
    background?.stroke?.(lineColors.border);
    labelNode?.fontSize?.(fontSize);
    labelNode?.fill?.(textColor);
    headerLine?.stroke?.(lineColors.headerLine);
    node.setAttr("pageFill", fill);
    node.setAttr("pageFillOpacity", opacity);
    background?.fill?.(opacity <= 0 ? "rgba(0, 0, 0, 0)" : fill);
    background?.opacity?.(opacity);
    node.opacity(1);
    this.app.events.emit("node:changed", { node });
    node.getLayer()?.batchDraw?.();

    const fontSizeValue = this.panelEl.querySelector("#page-font-size-value");
    if (fontSizeValue) {
      fontSizeValue.textContent = String(fontSize);
      fontSizeValue.title = `Font size: ${fontSize}`;
    }
    fontSizeEl.title = `Font size: ${fontSize}`;
    syncOpacityUi({
      sliderEl: opacityEl,
      outputEl: this.panelEl.querySelector("#page-fill-opacity-value"),
      triggerEl: this.panelEl.querySelector("#page-fill-style-trigger"),
      value: opacity,
      triggerLabel: "Fill color",
    });
    const fillToolEl = this.panelEl.querySelector(".toolbar__button-tool--fill-color");
    fillToolEl?.classList.toggle("is-button-fill-transparent", opacity <= 0);
    fillToolEl?.style.setProperty("--button-tool-opacity", String(opacity));
  }

  syncToolbar() {
    const isVisible =
      this.app.getMode() === "edit" &&
      this.app.getEditorTool() === "arrange" &&
      Boolean(this.selectedPageNode?.getStage?.());

    this.panel?.setVisible?.(isVisible);

    const fontSizeEl = this.panelEl.querySelector("#page-font-size");
    const fontSizeValueEl = this.panelEl.querySelector("#page-font-size-value");
    const textColorEl = this.panelEl.querySelector("#page-text-color");
    const fillEl = this.panelEl.querySelector("#page-fill-color");
    const fillOpacityEl = this.panelEl.querySelector("#page-fill-opacity");
    const fillOpacityValueEl = this.panelEl.querySelector("#page-fill-opacity-value");
    const state = this.resolvePagePanelState(this.selectedPageNode);

    if (fontSizeEl) {
      fontSizeEl.disabled = !isVisible;
      fontSizeEl.value = String(state.fontSize);
      fontSizeEl.title = `Font size: ${state.fontSize}`;
    }
    if (fontSizeValueEl) {
      fontSizeValueEl.textContent = String(state.fontSize);
      fontSizeValueEl.title = `Font size: ${state.fontSize}`;
    }
    if (textColorEl) {
      textColorEl.disabled = !isVisible;
      textColorEl.value = state.textColor;
    }
    if (fillEl) {
      fillEl.disabled = !isVisible;
      fillEl.value = state.fill;
    }
    if (fillOpacityEl) {
      fillOpacityEl.disabled = !isVisible;
    }
    syncOpacityUi({
      sliderEl: fillOpacityEl,
      outputEl: fillOpacityValueEl,
      triggerEl: this.panelEl.querySelector("#page-fill-style-trigger"),
      value: state.opacity,
      triggerLabel: "Fill color",
    });
    const fillToolEl = this.panelEl.querySelector(".toolbar__button-tool--fill-color");
    fillToolEl?.classList.toggle("is-button-fill-transparent", state.opacity <= 0);
    fillToolEl?.style.setProperty("--button-tool-opacity", String(state.opacity));

    this.syncAttachmentUi();
    this.syncAttachmentList();
    this.syncCreateNextAction();
    this.syncConnectAction();
    this.syncLayerActions();
    this.pageColorToolbar?.sync();
    if (isVisible) this.panel?.queuePosition?.();
  }

  syncAttachmentUi() {
    const node = this.selectedPageNode;
    const state = node ? this.actions.getAttachmentState(node) : null;
    const hasDirectory = Boolean(state?.directory);
    const supportsUploads = supportsManualFileAttachments();
    const isEditable = this.app.getMode() === "edit";

    const directoryAction = this.panelEl.querySelector(
      "[data-page-attachment-action='toggle-directory']",
    );
    const addFile = this.panelEl.querySelector("[data-page-attachment-action='add-file']");
    const addUrl = this.panelEl.querySelector("[data-page-attachment-action='add-url']");

    if (directoryAction) {
      directoryAction.hidden = !isEditable;
      directoryAction.textContent = hasDirectory ? "Disconnect" : "Choose Folder";
    }
    if (addFile) addFile.hidden = !isEditable || !supportsUploads;
    if (addUrl) addUrl.hidden = !isEditable;
  }

  syncAttachmentList() {
    const listEl = this.panelEl.querySelector("[data-testid='page-attachment-list']");
    if (!listEl) return;
    const state = this.selectedPageNode ? this.actions.getAttachmentState(this.selectedPageNode) : null;
    const entries = state?.entries ?? [];
    if (!entries.length) {
      listEl.innerHTML = "<p class='toolbar__page-attachment-empty'>No attachments yet.</p>";
      return;
    }

    listEl.innerHTML = entries.map((entry) => {
      const fileSize = entry.kind === "local-file" ? formatFileSize(entry.size) : "";
      const text = fileSize ? `${entry.label} · ${fileSize}` : entry.label;
      const escapedText = escapeHtml(text);
      const escapedTitle = escapeHtml(entry.label);
      return `
        <div class="toolbar__page-attachment-item" title="${escapedTitle}">
          <span class="toolbar__page-attachment-label">${escapedText}</span>
          <button
            type="button"
            class="toolbar__page-attachment-delete"
            data-page-attachment-delete="true"
            data-attachment-id="${escapeHtml(entry.id)}"
            data-testid="page-attachment-delete"
            aria-label="Remove attachment ${escapedTitle}"
            title="Remove attachment"
          >
            x
          </button>
        </div>
      `;
    }).join("");
  }

  showAttachmentStatus(message, tone = "info") {
    const statusEl = this.panelEl.querySelector("[data-testid='page-attachment-status']");
    if (!statusEl) return;
    window.clearTimeout(this.statusTimeout);
    statusEl.textContent = message;
    statusEl.dataset.tone = tone;
    statusEl.hidden = false;
    this.statusTimeout = window.setTimeout(() => {
      statusEl.textContent = "";
      statusEl.hidden = true;
      statusEl.dataset.tone = "info";
    }, 2200);
  }

  async runAttachmentAction(actionId) {
    const node = this.selectedPageNode;
    if (!node) return;

    try {
      if (actionId === "toggle-directory") {
        const state = this.actions.getAttachmentState(node);
        if (state?.directory) {
          this.actions.disconnectDirectory(node);
          this.showAttachmentStatus("Folder disconnected.");
        } else {
          if (!isFileSystemAccessSupported()) {
            this.showAttachmentStatus("Directory access is unavailable in this browser.", "error");
            return;
          }
          const directoryHandle = await window.showDirectoryPicker({ mode: "read" });
          await this.actions.attachDirectoryToNode(node, directoryHandle);
          this.showAttachmentStatus("Folder indexed.");
        }
      } else if (actionId === "add-file") {
        this.fileInputEl.value = "";
        this.fileInputEl.click();
        return;
      } else if (actionId === "add-url") {
        const input = window.prompt("Enter a URL to attach", "https://");
        if (input == null) return;
        const trimmed = input.trim();
        if (!isHttpUrl(trimmed)) {
          this.showAttachmentStatus("Please enter a valid http(s) URL.", "error");
          return;
        }
        this.actions.attachUrlToNode(node, trimmed);
        this.showAttachmentStatus("Attachment added.");
      }
    } catch (error) {
      if (error?.name === "AbortError") return;
      console.error(error);
      this.showAttachmentStatus("Failed to update attachments.", "error");
    }

    this.syncToolbar();
  }

  async handleAttachmentDelete(attachmentId) {
    const node = this.selectedPageNode;
    if (!node || !attachmentId) return;
    const canEdit = this.app.getMode() === "edit" && this.app.getEditorTool() === "arrange";
    if (!canEdit) return;

    try {
      const deleted = this.actions.deleteAttachment(node, attachmentId);
      if (!deleted) {
        this.showAttachmentStatus("Failed to update attachments.", "error");
        return;
      }
      this.showAttachmentStatus("Attachment removed.");
      this.syncToolbar();
      window.requestAnimationFrame(() => {
        this.panelEl.querySelector("#page-attachment-menu-trigger")?.focus?.({ preventScroll: true });
      });
    } catch (error) {
      console.error(error);
      this.showAttachmentStatus("Failed to update attachments.", "error");
    }
  }

  async handleFileInputChange() {
    const node = this.selectedPageNode;
    if (!node || !this.fileInputEl?.files?.length) return;
    try {
      await this.actions.attachUploadedFilesToNode(node, [...this.fileInputEl.files]);
      this.showAttachmentStatus("Attachment added.");
    } catch (error) {
      console.error(error);
      this.showAttachmentStatus("Failed to add file attachment.", "error");
    } finally {
      this.fileInputEl.value = "";
      this.syncToolbar();
    }
  }

  startConnection() {
    const node = this.selectedPageNode;
    if (node?.getAttr?.("componentType") !== "page") return;

    this.closeLayerMenu();
    this.app.commands.execute("connection:connect", node.id());
    this.syncConnectAction();
  }

  createNextPage() {
    const node = this.selectedPageNode;
    if (node?.getAttr?.("componentType") !== "page") return;

    this.closeLayerMenu();
    this.app.commands.execute("page:create-next", node.id());
    this.syncCreateNextAction();
  }

  syncCreateNextAction() {
    const connections = this.getConnectionsPlugin();
    const node = this.selectedPageNode;
    const canCreateNext = Boolean(
      connections &&
      node?.getStage?.() &&
      node.getAttr?.("componentType") === "page",
    );

    this.panel?.setButtonState?.("create-next", {
      disabled: !canCreateNext,
      title: "Create Next Page",
      label: "Create Next Page",
    });
  }

  syncConnectAction() {
    const connections = this.getConnectionsPlugin();
    const node = this.selectedPageNode;
    const canConnect = Boolean(
      connections &&
      node?.getStage?.() &&
      node.getAttr?.("componentType") === "page" &&
      connections.isConnectable?.(node),
    );

    this.panel?.setButtonState?.("connect", {
      disabled: !canConnect,
      title: "Connect to",
      label: "Connect to",
    });
  }

  syncLayerActions() {
    const selection = this.getSelectionPlugin();
    const node = this.selectedPageNode;
    const canTargetPage = Boolean(
      selection &&
      node?.getStage?.() &&
      node.getAttr?.("componentType") === "page",
    );

    for (const action of PAGE_LAYER_ACTIONS) {
      this.panel?.setButtonState?.(`layer:${action.id}`, {
        disabled: !canTargetPage || !selection[action.canRun]?.(node),
        title: action.label,
        label: action.label,
      });
    }
  }

  runLayerAction(actionId) {
    const action = PAGE_LAYER_ACTIONS.find((entry) => entry.id === actionId);
    const selection = this.getSelectionPlugin();
    const node = this.selectedPageNode;
    if (!action || !selection || node?.getAttr?.("componentType") !== "page") return;

    selection[action.run]?.(node);
    this.syncLayerActions();
    this.panel?.queuePosition?.();
  }

  handleStageContextMenu(event) {
    const isContextMenuEvent = event.type === "contextmenu";
    const isRightMouseDown = event.type === "mousedown" && event.evt?.button === 2;
    if (!isContextMenuEvent && !isRightMouseDown) return;
    if (this.app.getMode() !== "edit" || this.app.getEditorTool() !== "arrange") return;

    const node = resolveSelectableFromStageEvent(this.app, event);
    if (node?.getAttr?.("componentType") !== "page") return;

    event.evt?.preventDefault?.();
    event.cancelBubble = true;
    this.openLayerMenu(node, getClientPoint(this.app, event));
  }

  openLayerMenu(node, clientPoint = null) {
    if (node?.getAttr?.("componentType") !== "page") return;

    this.app.getPlugin?.("context-menu")?.hideMenu?.();
    this.getSelectionPlugin()?.setSelected?.([node]);
    this.selectedPageNode = node;
    this.syncToolbar();

    window.requestAnimationFrame(() => {
      const trigger = this.panelEl.querySelector("#page-layer-menu-trigger");
      trigger?.focus?.({ preventScroll: true });
      if (clientPoint) {
        this.positionLayerMenuAtPoint(clientPoint);
      }
      this.panel?.queuePosition?.();
    });
  }

  getLayerToolEl() {
    return this.panelEl.querySelector(".toolbar__page-layer-tool");
  }

  getLayerPopoverEl() {
    return this.panelEl.querySelector(".toolbar__page-layer-popover");
  }

  isLayerMenuOpen() {
    return Boolean(this.getLayerToolEl()?.matches?.(":focus-within"));
  }

  closeLayerMenu() {
    const tool = this.getLayerToolEl();
    const activeElement = document.activeElement;
    if (tool?.contains?.(activeElement)) {
      activeElement.blur?.();
    }
    this.clearLayerContextPosition();
    this.panel?.queuePosition?.();
  }

  clearLayerContextPosition() {
    const tool = this.getLayerToolEl();
    const popover = this.getLayerPopoverEl();
    if (!tool) return;

    tool.classList.remove("is-context-open");
    popover?.style.removeProperty("position");
    popover?.style.removeProperty("top");
    popover?.style.removeProperty("right");
    popover?.style.removeProperty("left");
    popover?.style.removeProperty("transform");
    popover?.style.removeProperty("z-index");
  }

  positionLayerMenuAtPoint(point) {
    const tool = this.getLayerToolEl();
    const popover = this.getLayerPopoverEl();
    const x = Number(point?.x);
    const y = Number(point?.y);
    if (!tool || !popover || !Number.isFinite(x) || !Number.isFinite(y)) return;

    tool.classList.add("is-context-open");
    const margin = 8;
    const width = popover.offsetWidth || popover.getBoundingClientRect().width || 140;
    const height = popover.offsetHeight || popover.getBoundingClientRect().height || 60;
    const left = Math.max(margin, Math.min(x, window.innerWidth - width - margin));
    const top = Math.max(margin, Math.min(y, window.innerHeight - height - margin));
    const toolRect = tool.getBoundingClientRect();
    popover.style.setProperty("position", "absolute", "important");
    popover.style.setProperty("top", `${Math.round(top - toolRect.top)}px`, "important");
    popover.style.setProperty("right", "auto", "important");
    popover.style.setProperty("left", `${Math.round(left - toolRect.left)}px`, "important");
    popover.style.setProperty("transform", "none", "important");
    popover.style.setProperty("z-index", "100", "important");
  }
}
