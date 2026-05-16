import {
  BaseCommand,
  BaseContextMenuItem,
  BasePlugin,
} from "../core/baseClasses.js";
import {
  createRankingItem,
  DEFAULT_RANKING_BOX_THEME_COLOR,
  DEFAULT_RANKING_BOX_TITLE_COLOR,
  DEFAULT_RANKING_BOX_TITLE_FONT_SIZE,
  getRankingBoxMetrics,
  isRankingBoxNode,
} from "../component/rankingBox.js";
import {
  ColorToolbarController,
  DEFAULT_COLOR_SWATCHES,
} from "../lib/colorToolbar.js";
import { renderIcons } from "../lib/icons.js";

const MOVE_OUT_THRESHOLD = 32;
const RANKING_BOX_STYLE_SWATCHES = DEFAULT_COLOR_SWATCHES.filter((color) => color !== "transparent");
const DEFAULT_RANKING_BOX_PANEL_STATE = {
  titleFontSize: DEFAULT_RANKING_BOX_TITLE_FONT_SIZE,
  titleColor: DEFAULT_RANKING_BOX_TITLE_COLOR,
  themeColor: DEFAULT_RANKING_BOX_THEME_COLOR,
};
const RANKING_BOX_LAYER_ACTIONS = [
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

function resolveSelectable(node) {
  if (!node) return null;
  if (node.hasName?.("selectable")) return node;
  return node.findAncestor?.(".selectable", true) ?? null;
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
    return {
      x: rect.left + pointer.x,
      y: rect.top + pointer.y,
    };
  }

  return null;
}

function isPageNode(node) {
  return node?.getAttr?.("componentType") === "page" || node?.hasName?.("page-root");
}

function isTextNode(node) {
  return node?.getAttr?.("componentType") === "text";
}

function getNodeCenter(node) {
  const box = node.getClientRect();
  return {
    x: box.x + box.width / 2,
    y: box.y + box.height / 2,
  };
}

function pointInRect(point, rect) {
  return (
    point.x >= rect.x &&
    point.x <= rect.x + rect.width &&
    point.y >= rect.y &&
    point.y <= rect.y + rect.height
  );
}

function rectsIntersect(left, right) {
  return (
    left.x < right.x + right.width &&
    left.x + left.width > right.x &&
    left.y < right.y + right.height &&
    left.y + left.height > right.y
  );
}

function expandRect(rect, margin) {
  return {
    x: rect.x - margin,
    y: rect.y - margin,
    width: rect.width + margin * 2,
    height: rect.height + margin * 2,
  };
}

function getPageSize(pageNode) {
  const background = pageNode?.findOne?.(".page-bg") ?? pageNode?.findOne?.(".container-bg");
  return {
    width: background?.width?.() ?? pageNode?.width?.() ?? 960,
    height: background?.height?.() ?? pageNode?.height?.() ?? 540,
  };
}

function clonePlainData(value) {
  if (value == null) return value;
  return JSON.parse(JSON.stringify(value));
}

function resequenceItems(items = []) {
  return items.map((item, order) => ({
    ...item,
    order,
  }));
}

class AddRankingBoxCommand extends BaseCommand {
  static commandId = "ranking:add-box";
  static label = "Add Ranking Box";
  static modes = {
    edit: {
      tools: {
        arrange: {},
      },
    },
  };

  execute(pageRef = null) {
    return this.plugin.createRankingBoxForPage(pageRef);
  }
}

class AddRankingBoxMenuItem extends BaseContextMenuItem {
  static itemId = "ranking:add-box";
  static label = "Add Ranking Box";
  static modes = {
    edit: {
      tools: {
        arrange: {},
      },
    },
  };

  condition(target) {
    return isPageNode(resolveSelectable(target));
  }

  execute(target) {
    return this.plugin.createRankingBoxForPage(resolveSelectable(target));
  }
}

export class RankingBoxPlugin extends BasePlugin {
  static pluginId = "ranking";
  static modes = {
    edit: {
      tools: {
        arrange: {},
      },
    },
  };

  commands() {
    return [AddRankingBoxCommand];
  }

  menuItems() {
    return [AddRankingBoxMenuItem];
  }

  buildFloatingPanel() {
    const panel = document.createElement("div");
    panel.id = "ranking-box-panel";
    panel.className = "toolbar__floating-panel toolbar__cluster toolbar__tool-panel toolbar__shape-panel toolbar__button-panel toolbar__ranking-box-panel";
    panel.dataset.testid = "ranking-box-panel";
    panel.hidden = true;
    panel.innerHTML = `
      <div
        class="toolbar__button-tools"
        role="group"
        aria-label="Ranking box appearance"
      >
        <div class="toolbar__button-style-tool toolbar__button-popover-tool toolbar__button-tool--font-size">
          <button
            id="ranking-box-font-size-style-trigger"
            class="toolbar__button-style-trigger"
            type="button"
            title="Title font size"
            aria-label="Title font size"
            data-testid="ranking-box-style-font-size"
          >
            <span class="toolbar__button-font-size-icon" aria-hidden="true">
              <span class="toolbar__button-font-size-a">A</span>
              <span class="toolbar__button-font-size-mark"></span>
            </span>
          </button>
          <div class="toolbar__button-style-popover" role="group" aria-label="Ranking box title font size settings">
            <label class="toolbar__button-style-row">
              <span id="ranking-box-font-size-label">Title size</span>
              <input
                id="ranking-box-font-size"
                type="range"
                min="12"
                max="72"
                step="1"
                value="${DEFAULT_RANKING_BOX_TITLE_FONT_SIZE}"
                data-testid="ranking-box-font-size"
                aria-labelledby="ranking-box-font-size-label"
                title="Title font size: ${DEFAULT_RANKING_BOX_TITLE_FONT_SIZE}"
              />
              <output
                id="ranking-box-font-size-value"
                data-testid="ranking-box-font-size-value"
                title="Title font size: ${DEFAULT_RANKING_BOX_TITLE_FONT_SIZE}"
              >${DEFAULT_RANKING_BOX_TITLE_FONT_SIZE}</output>
            </label>
          </div>
        </div>

        <div class="toolbar__button-style-tool toolbar__button-popover-tool toolbar__button-tool--text-color" data-popover-role="color">
          <button
            id="ranking-box-title-style-trigger"
            class="toolbar__button-style-trigger"
            type="button"
            title="Title color"
            aria-label="Title color"
            data-testid="ranking-box-style-title-color"
          >
            <span class="toolbar__button-text-icon" aria-hidden="true">A</span>
          </button>
          <div class="toolbar__button-style-popover" role="group" aria-label="Ranking box title color settings">
            <div class="toolbar__button-color-grid" id="ranking-box-title-swatches" aria-label="Ranking box title colors"></div>
            <div class="toolbar__button-custom-color" title="Custom title color">
              <span class="toolbar__sr-only">Custom title color</span>
              <input
                id="ranking-box-title-color"
                type="color"
                value="${DEFAULT_RANKING_BOX_TITLE_COLOR}"
                aria-label="Custom title color"
                title="Title color"
                data-testid="ranking-box-title-color"
              />
            </div>
          </div>
        </div>

        <div class="toolbar__button-style-tool toolbar__button-popover-tool toolbar__button-tool--fill-color" data-popover-role="color">
          <button
            id="ranking-box-theme-style-trigger"
            class="toolbar__button-style-trigger"
            type="button"
            title="Theme color"
            aria-label="Theme color"
            data-testid="ranking-box-style-theme"
          >
            <span class="toolbar__button-fill-icon" aria-hidden="true"></span>
          </button>
          <div class="toolbar__button-style-popover" role="group" aria-label="Ranking box theme color settings">
            <div class="toolbar__button-color-grid" id="ranking-box-theme-swatches" aria-label="Ranking box theme colors"></div>
            <div class="toolbar__button-custom-color" title="Custom theme color">
              <span class="toolbar__sr-only">Custom theme color</span>
              <input
                id="ranking-box-theme-color"
                type="color"
                value="${DEFAULT_RANKING_BOX_THEME_COLOR}"
                aria-label="Custom theme color"
                title="Theme color"
                data-testid="ranking-box-theme-color"
              />
            </div>
          </div>
        </div>
      </div>
      <div class="toolbar__button-tools" role="group" aria-label="Ranking box actions">
        <div
          class="toolbar__button-style-tool toolbar__button-popover-tool toolbar__shape-layer-tool toolbar__ranking-box-layer-tool"
          data-popover-offset="none"
        >
          <button
            id="ranking-box-layer-menu-trigger"
            class="toolbar__button-style-trigger"
            type="button"
            title="Layer order"
            aria-label="Layer order"
            data-testid="ranking-box-layer-menu"
          >
            <i data-lucide="ellipsis" aria-hidden="true"></i>
          </button>
          <div class="toolbar__button-style-popover toolbar__shape-layer-popover toolbar__ranking-box-layer-popover" role="menu" aria-label="Ranking box layer order">
            <button
              type="button"
              class="toolbar__shape-layer-action"
              data-ranking-box-layer-action="bring-forward"
              data-testid="ranking-box-layer-bring-forward"
            >
              Bring Forward
            </button>
            <button
              type="button"
              class="toolbar__shape-layer-action"
              data-ranking-box-layer-action="send-backward"
              data-testid="ranking-box-layer-send-backward"
            >
              Send Backward
            </button>
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

  registerFloatingPanelButtons() {
    for (const button of this.panelEl.querySelectorAll("[data-ranking-box-layer-action]")) {
      this.panel?.registerButton?.(`layer:${button.dataset.rankingBoxLayerAction}`, button);
    }
  }

  onSetup() {
    this.layer = this.app.mainLayer;
    this.dragOrigins = new Map();
    this.isMovingTextIntoRanking = false;
    this.selectedRankingBoxNode = null;
    this.panelState = { ...DEFAULT_RANKING_BOX_PANEL_STATE };
    this.panelEl = this.buildFloatingPanel();
    this.titleFontSizeEl = this.panelEl.querySelector("#ranking-box-font-size");
    this.titleFontSizeValueEl = this.panelEl.querySelector("#ranking-box-font-size-value");
    this.titleColorEl = this.panelEl.querySelector("#ranking-box-title-color");
    this.themeColorEl = this.panelEl.querySelector("#ranking-box-theme-color");
    this.setupColorToolbar();
    this.panel = this.app.floatingToolbar?.registerPanel?.({
      id: "ranking-box-panel",
      element: this.panelEl,
      getAnchorNode: () => this.selectedRankingBoxNode,
      getAnchorRect: (node, app) => node?.getClientRect?.({ relativeTo: app.stage }) ?? null,
      viewportMargin: 12,
      anchorGap: 64,
      popover: {
        nodeClearance: 10,
      },
    });
    this.registerFloatingPanelButtons();

    this.app.stage.on("dragstart.rankingBox", (event) => this.handleDragStart(event));
    this.app.stage.on("dragend.rankingBox", (event) => this.handleDragEnd(event));
    this.app.stage.on(
      "contextmenu.rankingBoxLayerMenu mousedown.rankingBoxLayerMenu",
      (event) => this.handleStageContextMenu(event),
    );

    this.layer.find(".ranking-box-root").forEach((node) => this.bindRankingBox(node));
    this.listen("selection:change", ({ nodes = [] } = {}) => {
      this.selectedRankingBoxNode =
        nodes.length === 1 && nodes[0]?.getAttr?.("componentType") === "rankingBox"
          ? nodes[0]
          : null;
      this.loadStyleUiFromSelection();
      this.syncToolbar();
    });
    this.listen("interaction:change", () => this.syncToolbar());
    this.listen("viewport:change", () => this.panel?.queuePosition?.());
    this.listen("node:changing", ({ node } = {}) => {
      if (this.isSelectedRankingBoxAffectedByNode(node)) {
        this.panel?.queuePosition?.();
      }
    });
    this.listen("node:added", ({ node }) => {
      if (isRankingBoxNode(node)) {
        this.bindRankingBox(node);
      }
    });
    this.listen("node:changed", ({ node }) => {
      if (isRankingBoxNode(node)) {
        this.refreshRankingBox(node);
        this.bindRankingBox(node);
        if (node === this.selectedRankingBoxNode) {
          this.loadStyleUiFromSelection();
          this.syncToolbar();
        }
      } else if (this.isSelectedRankingBoxAffectedByNode(node)) {
        this.syncToolbar();
      } else if (isTextNode(node)) {
        this.refreshRankingBoxesForText(node);
      }
    });
    this.listen("node:removed", ({ node }) => {
      if (
        isTextNode(node) &&
        !this.isMovingTextIntoRanking &&
        !this.app.isReplayingHistory &&
        !this.app.isRestoringDocument
      ) {
        this.removeTextReferences(node, { recordHistory: true });
      }
    });
    this.listen("document:load:end", () => this.refreshAndBindAllRankingBoxes());
    this.listenDom(this.titleFontSizeEl, "input", () => {
      void this.emitStyleChange();
    });
    this.listenDom(this.titleColorEl, "input", () => {
      this.rankingBoxColorToolbar?.recordCustomColor?.("title", this.titleColorEl.value);
      void this.emitStyleChange();
    });
    this.listenDom(this.themeColorEl, "input", () => {
      this.rankingBoxColorToolbar?.recordCustomColor?.("theme", this.themeColorEl.value);
      void this.emitStyleChange();
    });

    const layerTrigger = this.panelEl.querySelector("#ranking-box-layer-menu-trigger");
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
    for (const button of this.panelEl.querySelectorAll("[data-ranking-box-layer-action]")) {
      this.listenDom(button, "click", () => {
        this.runLayerAction(button.dataset.rankingBoxLayerAction);
        button.blur();
      });
    }
    this.listenDom(this.panelEl, "focusin", () => {
      this.syncPopoverOpenState();
      this.panel?.queuePosition?.();
    });
    this.listenDom(this.panelEl, "focusout", () => {
      window.setTimeout(() => {
        this.syncPopoverOpenState();
        if (!this.panelEl.querySelector(".toolbar__ranking-box-layer-tool:focus-within")) {
          this.clearLayerContextPosition();
        }
        this.panel?.queuePosition?.();
      }, 0);
    });
    this.listenDom(this.panelEl, "pointerdown", () => {
      window.requestAnimationFrame(() => {
        this.syncPopoverOpenState();
        this.panel?.queuePosition?.();
      });
    }, true);
    this.syncToolbar();

    this.cleanups.push(() => {
      this.app.stage.off(".rankingBox");
      this.app.stage.off(".rankingBoxLayerMenu");
      this.layer.find(".ranking-box-root").forEach((node) => this.unbindRankingBox(node));
      this.panel?.unregister?.();
      this.panelEl?.remove?.();
    });
  }

  getRankingComponent() {
    return this.app.components.get("rankingBox");
  }

  getSelectionPlugin() {
    return this.app.plugins.find((plugin) => plugin.id === "selection") ?? null;
  }

  isSelectedRankingBoxAffectedByNode(node) {
    const selectedRankingBox = this.selectedRankingBoxNode;
    if (!node || !selectedRankingBox?.getStage?.()) return false;
    if (node === selectedRankingBox) return true;

    let parent = selectedRankingBox.getParent?.() ?? null;
    while (parent) {
      if (parent === node) return true;
      parent = parent.getParent?.() ?? null;
    }

    return false;
  }

  loadStyleUiFromSelection() {
    const state = this.selectedRankingBoxNode
      ? this.getRankingComponent()?.getData?.(this.selectedRankingBoxNode) ?? {}
      : DEFAULT_RANKING_BOX_PANEL_STATE;

    this.panelState = {
      ...this.panelState,
      titleFontSize: Number.isFinite(state.titleFontSize)
        ? state.titleFontSize
        : this.panelState.titleFontSize,
      titleColor: state.titleColor ?? this.panelState.titleColor,
      themeColor: state.themeColor ?? this.panelState.themeColor,
    };

    if (this.titleFontSizeEl) {
      this.titleFontSizeEl.value = String(this.panelState.titleFontSize);
    }
    if (this.titleFontSizeValueEl) {
      this.titleFontSizeValueEl.value = String(this.panelState.titleFontSize);
    }
    if (this.titleColorEl) {
      this.titleColorEl.value = this.panelState.titleColor;
    }
    if (this.themeColorEl) {
      this.themeColorEl.value = this.panelState.themeColor;
    }
    this.syncStyleTooltips();
  }

  saveStyleUiToState() {
    this.panelState = {
      ...this.panelState,
      titleFontSize: Number(this.titleFontSizeEl?.value ?? this.panelState.titleFontSize),
      titleColor: this.titleColorEl?.value ?? this.panelState.titleColor,
      themeColor: this.themeColorEl?.value ?? this.panelState.themeColor,
    };
    return this.panelState;
  }

  setupColorToolbar() {
    const listenDom = (...args) => this.listenDom(...args);
    this.rankingBoxColorToolbar = new ColorToolbarController({
      listenDom,
      renderIcons,
      targets: {
        title: {
          input: this.titleColorEl,
          swatchesEl: this.panelEl.querySelector("#ranking-box-title-swatches"),
          label: "Title color",
          baseColors: RANKING_BOX_STYLE_SWATCHES,
          onChange: () => this.emitStyleChange(),
        },
        theme: {
          input: this.themeColorEl,
          swatchesEl: this.panelEl.querySelector("#ranking-box-theme-swatches"),
          label: "Theme color",
          baseColors: RANKING_BOX_STYLE_SWATCHES,
          onChange: () => this.emitStyleChange(),
        },
      },
    });
    this.rankingBoxColorToolbar.setup();
  }

  syncStyleTooltips() {
    const fontSizeTitle = `Title font size: ${this.titleFontSizeEl?.value ?? DEFAULT_RANKING_BOX_TITLE_FONT_SIZE}`;
    const titleColorTitle = "Title color";
    const themeColorTitle = "Theme color";
    const fontSizeToolEl = this.titleFontSizeEl?.closest?.(".toolbar__button-style-tool") ?? null;
    const titleColorToolEl = this.titleColorEl?.closest?.(".toolbar__button-style-tool") ?? null;
    const themeColorToolEl = this.themeColorEl?.closest?.(".toolbar__button-style-tool") ?? null;

    if (this.titleFontSizeEl) {
      this.titleFontSizeEl.title = fontSizeTitle;
    }
    if (this.titleFontSizeValueEl) {
      this.titleFontSizeValueEl.title = fontSizeTitle;
    }
    fontSizeToolEl?.querySelector?.(".toolbar__button-style-trigger")?.setAttribute("title", "Title font size");

    if (this.titleColorEl) {
      this.titleColorEl.title = titleColorTitle;
    }
    titleColorToolEl?.querySelector?.(".toolbar__button-style-trigger")?.setAttribute("title", titleColorTitle);
    titleColorToolEl?.style.setProperty("--button-tool-color", this.titleColorEl?.value ?? DEFAULT_RANKING_BOX_TITLE_COLOR);

    if (this.themeColorEl) {
      this.themeColorEl.title = themeColorTitle;
    }
    themeColorToolEl?.querySelector?.(".toolbar__button-style-trigger")?.setAttribute("title", themeColorTitle);
    themeColorToolEl?.style.setProperty("--button-tool-fill", this.themeColorEl?.value ?? DEFAULT_RANKING_BOX_THEME_COLOR);
    themeColorToolEl?.style.setProperty("--button-tool-opacity", "1");
    themeColorToolEl?.classList.remove("is-button-fill-transparent");
    this.rankingBoxColorToolbar?.sync?.();
  }

  async emitStyleChange() {
    const node = this.selectedRankingBoxNode;
    const component = this.getRankingComponent();
    const state = this.saveStyleUiToState();

    if (this.titleFontSizeValueEl) {
      this.titleFontSizeValueEl.value = String(state.titleFontSize);
    }
    this.syncStyleTooltips();

    if (this.app.getMode() !== "edit" || this.app.getEditorTool() !== "arrange") return;
    if (node?.getAttr?.("componentType") !== "rankingBox" || !component) return;

    const current = component.serializeNode(node);
    this.app.events.emit("node:change:start", { node });
    await component.applySerializedData(node, {
      ...current,
      titleFontSize: state.titleFontSize,
      titleColor: state.titleColor,
      themeColor: state.themeColor,
    });
    node.getLayer?.()?.batchDraw?.();
    this.app.overlayLayer?.batchDraw?.();
    this.app.uiLayer?.batchDraw?.();
    this.app.events.emit("node:changed", { node });
  }

  syncToolbar() {
    const isVisible =
      this.app.getMode() === "edit" &&
      this.app.getEditorTool() === "arrange" &&
      Boolean(this.selectedRankingBoxNode?.getStage?.());

    for (const control of [
      this.titleFontSizeEl,
      this.titleFontSizeValueEl,
      this.titleColorEl,
      this.themeColorEl,
    ]) {
      if (control) control.disabled = !isVisible;
    }
    this.panel?.setVisible?.(isVisible);
    this.syncLayerActions();
    if (isVisible) {
      this.panel?.queuePosition?.();
    } else {
      this.closeLayerMenu();
    }
  }

  findNodeById(id) {
    return typeof id === "string" && id ? this.layer.findOne(`#${id}`) : null;
  }

  resolvePage(pageRef = null) {
    if (isPageNode(pageRef)) return pageRef;
    if (typeof pageRef === "string") {
      const node = this.findNodeById(pageRef);
      return isPageNode(node) ? node : null;
    }

    const selectedPage = this.getSelectionPlugin()
      ?.getSelectedNodes?.()
      ?.find((node) => isPageNode(node));
    return selectedPage ?? null;
  }

  getOwningPage(node) {
    let current = node?.getParent?.() ?? null;
    while (current && current !== this.layer && current !== this.app.stage) {
      if (isPageNode(current)) return current;
      current = current.getParent?.() ?? null;
    }
    return null;
  }

  findRankingBoxForPage(pageNode) {
    if (!isPageNode(pageNode)) return null;
    return pageNode.getChildren?.((child) => isRankingBoxNode(child))[0] ?? null;
  }

  findPageAtPoint(point) {
    const pages = this.layer.find(".page-root").filter((node) => isPageNode(node));
    for (const pageNode of pages.reverse()) {
      const background = pageNode.findOne(".page-bg") ?? pageNode.findOne(".container-bg");
      const box = background?.getClientRect?.() ?? pageNode.getClientRect();
      if (pointInRect(point, box)) {
        return pageNode;
      }
    }
    return null;
  }

  getRankingBoxes() {
    return this.layer.find(".ranking-box-root").filter((node) => isRankingBoxNode(node));
  }

  async createRankingBoxForPage(pageRef = null) {
    const pageNode = this.resolvePage(pageRef);
    if (!pageNode) return null;

    const existing = this.findRankingBoxForPage(pageNode);
    if (existing) {
      this.selectNode(existing);
      return existing;
    }

    const component = this.getRankingComponent();
    if (!component) return null;

    const pageSize = getPageSize(pageNode);
    const width = Math.min(380, Math.max(280, pageSize.width - 80));
    const height = Math.min(300, Math.max(200, pageSize.height - 120));
    const node = await component.create({
      x: Math.max(32, pageSize.width - width - 36),
      y: 76,
      width,
      height,
    });
    if (!node) return null;

    pageNode.add(node);
    node.moveToTop();
    this.layer.batchDraw();
    this.app.events.emit("node:added", { node });
    this.selectNode(node);
    return node;
  }

  selectNode(node) {
    this.getSelectionPlugin()?.setSelected?.([node]);
  }

  syncLayerActions() {
    const selection = this.getSelectionPlugin();
    const node = this.selectedRankingBoxNode;
    const canTargetRankingBox = Boolean(
      selection &&
      node?.getStage?.() &&
      node.getAttr?.("componentType") === "rankingBox",
    );

    for (const action of RANKING_BOX_LAYER_ACTIONS) {
      this.panel?.setButtonState?.(`layer:${action.id}`, {
        disabled: !canTargetRankingBox || !selection[action.canRun]?.(node),
        title: action.label,
        label: action.label,
      });
    }
  }

  runLayerAction(actionId) {
    const action = RANKING_BOX_LAYER_ACTIONS.find((entry) => entry.id === actionId);
    const selection = this.getSelectionPlugin();
    const node = this.selectedRankingBoxNode;
    if (!action || !selection || node?.getAttr?.("componentType") !== "rankingBox") return;

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
    if (node?.getAttr?.("componentType") !== "rankingBox") return;

    event.evt?.preventDefault?.();
    event.cancelBubble = true;
    this.openLayerMenu(node, getClientPoint(this.app, event));
  }

  openLayerMenu(node, clientPoint = null) {
    if (node?.getAttr?.("componentType") !== "rankingBox") return;

    this.app.getPlugin?.("context-menu")?.hideMenu?.();
    this.getSelectionPlugin()?.setSelected?.([node]);
    this.selectedRankingBoxNode = node;
    this.syncToolbar();

    window.requestAnimationFrame(() => {
      const trigger = this.panelEl.querySelector("#ranking-box-layer-menu-trigger");
      trigger?.focus?.({ preventScroll: true });
      if (clientPoint) {
        this.positionLayerMenuAtPoint(clientPoint);
      }
      this.syncPopoverOpenState();
      this.panel?.queuePosition?.();
    });
  }

  getLayerToolEl() {
    return this.panelEl.querySelector(".toolbar__ranking-box-layer-tool");
  }

  getLayerPopoverEl() {
    return this.panelEl.querySelector(".toolbar__ranking-box-layer-popover");
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
    this.syncPopoverOpenState();
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

  syncPopoverOpenState() {
    return this.app.floatingToolbar?.syncPopoverOpenState?.("ranking-box-panel");
  }

  bindRankingBox(rankingNode) {
    if (!isRankingBoxNode(rankingNode)) return;

    rankingNode.off(".rankingBox");
    rankingNode.on("wheel.rankingBox", (event) => {
      event.cancelBubble = true;
      event.evt?.preventDefault?.();
      const delta = event.evt?.deltaY ?? 0;
      if (delta === 0) return;
      this.scrollRankingBoxBy(rankingNode, delta > 0 ? 72 : -72);
    });

    this.bindRankingCards(rankingNode);
  }

  unbindRankingBox(rankingNode) {
    rankingNode?.off?.(".rankingBox");
    rankingNode?.find?.(".ranking-item-card")?.forEach((card) => card.off(".rankingItem"));
  }

  bindRankingCards(rankingNode) {
    rankingNode.find(".ranking-item-card").forEach((card) => {
      card.off(".rankingItem");
      card.on("mousedown.rankingItem touchstart.rankingItem", (event) => {
        event.cancelBubble = true;
      });

      card.on("dragstart.rankingItem", (event) => {
        event.cancelBubble = true;
        card.moveToTop();
        card.setAttr("isRankingItemDragging", true);
        this.app.events.emit("node:change:start", { node: rankingNode });
      });

      card.on("dragmove.rankingItem", (event) => {
        event.cancelBubble = true;
        if (!this.app.isReadOnly() && this.isRankingCardOutsideRankingBox(rankingNode, card, {
          margin: MOVE_OUT_THRESHOLD,
        })) {
          rankingNode.getLayer()?.batchDraw();
          return;
        }

        const metrics = this.getRankingData(rankingNode);
        card.x(metrics.padding);
        rankingNode.getLayer()?.batchDraw();
      });

      card.on("dragend.rankingItem", (event) => {
        event.cancelBubble = true;
        card.setAttr("isRankingItemDragging", false);
        if (!this.app.isReadOnly() && this.isRankingCardOutsideRankingBox(rankingNode, card, {
          margin: MOVE_OUT_THRESHOLD,
        })) {
          void this.moveRankingItemOutToText(rankingNode, card);
          return;
        }

        this.reorderRankingItemFromCard(rankingNode, card);
        this.app.events.emit("node:changed", { node: rankingNode });
      });
    });
  }

  handleDragStart(event) {
    const node = resolveSelectable(event.target);
    if (!isTextNode(node)) return;

    this.dragOrigins.set(node.id(), {
      parent: node.getParent(),
      absolutePosition: { ...node.getAbsolutePosition() },
    });
  }

  handleDragEnd(event) {
    if (
      !this.isEnabled() ||
      this.app.isReplayingHistory ||
      this.app.isRestoringDocument
    ) {
      return;
    }

    const node = resolveSelectable(event.target);
    if (!isTextNode(node)) return;

    const dropPoint = getNodeCenter(node);
    const rankingBox = this.findRankingBoxAtPoint(dropPoint);
    if (!rankingBox || !this.canAddTextToRankingBox(node, rankingBox)) {
      this.dragOrigins.delete(node.id());
      return;
    }

    this.moveTextToRankingBox(rankingBox, node, {
      dropPoint,
    });
    event.cancelBubble = true;
    this.dragOrigins.delete(node.id());
  }

  findRankingBoxAtPoint(point) {
    const rankingBoxes = this.getRankingBoxes();
    for (const rankingBox of rankingBoxes.reverse()) {
      const background = rankingBox.findOne(".ranking-box-bg");
      const box = background?.getClientRect?.() ?? rankingBox.getClientRect();
      if (pointInRect(point, box)) {
        return rankingBox;
      }
    }
    return null;
  }

  canAddTextToRankingBox(textNode, rankingBox) {
    return isTextNode(textNode) && isRankingBoxNode(rankingBox);
  }

  addTextToRankingBox(rankingBoxRef, textRef, { dropPoint = null, insertIndex = null } = {}) {
    const rankingBox = typeof rankingBoxRef === "string"
      ? this.findNodeById(rankingBoxRef)
      : rankingBoxRef;
    const textNode = typeof textRef === "string"
      ? this.findNodeById(textRef)
      : textRef;
    if (!isRankingBoxNode(rankingBox) || !isTextNode(textNode)) return null;
    if (!this.canAddTextToRankingBox(textNode, rankingBox)) return null;

    const item = createRankingItem(textNode.id(), this.createTextSnapshot(textNode));
    if (!item) return null;

    const component = this.getRankingComponent();
    const data = component.getData(rankingBox);
    const nextItems = [...data.items];
    const targetIndex = Number.isFinite(insertIndex)
      ? Math.max(0, Math.min(nextItems.length, insertIndex))
      : this.getInsertIndexForDropPoint(rankingBox, data, dropPoint);

    this.app.events.emit("node:change:start", { node: rankingBox });
    nextItems.splice(targetIndex, 0, item);
    component.setData(rankingBox, {
      ...data,
      items: resequenceItems(nextItems),
    });
    this.bindRankingBox(rankingBox);
    rankingBox.getLayer()?.batchDraw();
    this.app.events.emit("node:changed", { node: rankingBox });
    return item;
  }

  moveTextToRankingBox(rankingBoxRef, textRef, options = {}) {
    const textNode = typeof textRef === "string"
      ? this.findNodeById(textRef)
      : textRef;
    if (!isTextNode(textNode)) return null;

    if (!this.dragOrigins.has(textNode.id())) {
      this.dragOrigins.set(textNode.id(), {
        parent: textNode.getParent(),
        absolutePosition: { ...textNode.getAbsolutePosition() },
      });
    }

    const item = this.addTextToRankingBox(rankingBoxRef, textNode, options);
    if (item) {
      this.removeDraggedText(textNode);
    }
    this.dragOrigins.delete(textNode.id());
    return item;
  }

  reorderRankingItem(rankingBoxRef, itemId, insertIndex) {
    const rankingBox = typeof rankingBoxRef === "string"
      ? this.findNodeById(rankingBoxRef)
      : rankingBoxRef;
    if (!isRankingBoxNode(rankingBox) || typeof itemId !== "string") return false;

    const component = this.getRankingComponent();
    const data = component.getData(rankingBox);
    const currentIndex = data.items.findIndex((item) => item.id === itemId);
    if (currentIndex < 0) return false;

    const nextItems = [...data.items];
    const [item] = nextItems.splice(currentIndex, 1);
    const targetIndex = Math.max(0, Math.min(nextItems.length, insertIndex));

    this.app.events.emit("node:change:start", { node: rankingBox });
    nextItems.splice(targetIndex, 0, item);
    component.setData(rankingBox, {
      ...data,
      items: resequenceItems(nextItems),
    });
    this.bindRankingBox(rankingBox);
    rankingBox.getLayer()?.batchDraw();
    this.app.events.emit("node:changed", { node: rankingBox });
    return true;
  }

  removeRankingItem(rankingBoxRef, itemId) {
    const rankingBox = typeof rankingBoxRef === "string"
      ? this.findNodeById(rankingBoxRef)
      : rankingBoxRef;
    if (!isRankingBoxNode(rankingBox) || typeof itemId !== "string") return false;

    const component = this.getRankingComponent();
    const data = component.getData(rankingBox);
    const nextItems = data.items.filter((item) => item.id !== itemId);
    if (nextItems.length === data.items.length) return false;

    this.app.events.emit("node:change:start", { node: rankingBox });
    component.setData(rankingBox, {
      ...data,
      items: resequenceItems(nextItems),
    });
    this.bindRankingBox(rankingBox);
    rankingBox.getLayer()?.batchDraw();
    this.app.events.emit("node:changed", { node: rankingBox });
    return true;
  }

  removeDraggedText(textNode) {
    const origin = this.dragOrigins.get(textNode.id());
    if (!origin) return;

    this.isMovingTextIntoRanking = true;
    try {
      textNode.setAttr("rankingBoxConsumedDrop", true);
      if (origin.parent && textNode.getParent() !== origin.parent) {
        textNode.moveTo(origin.parent);
      }
      textNode.setAbsolutePosition(origin.absolutePosition);
      this.app.events.emit("node:removed", { node: textNode });
      textNode.destroy();
      this.layer.batchDraw();
    } finally {
      this.isMovingTextIntoRanking = false;
    }
  }

  createTextSnapshot(textNode) {
    const component = this.app.components.getByNode(textNode);
    const data = component?.serializeNode?.(textNode) ?? {};
    const box = textNode.getClientRect();

    return {
      data: clonePlainData(data),
      width: Number.isFinite(data.width) ? data.width : textNode.width?.(),
      height: Number.isFinite(data.height) ? data.height : textNode.height?.(),
      absolutePosition: {
        x: box.x,
        y: box.y,
      },
    };
  }

  getCanvasPointerPosition() {
    const pointer = this.app.stage.getPointerPosition();
    return pointer ? this.app.stageApi.screenToCanvas(pointer) : null;
  }

  getRankingBoxStageRect(rankingNode) {
    const background = rankingNode.findOne(".ranking-box-bg");
    return background?.getClientRect?.({ relativeTo: this.app.stage }) ??
      rankingNode.getClientRect({ relativeTo: this.app.stage });
  }

  getRankingCardStageRect(card) {
    return card?.getClientRect?.({ relativeTo: this.app.stage }) ?? null;
  }

  isRankingCardOutsideRankingBox(rankingNode, card, { margin = 0 } = {}) {
    const cardRect = this.getRankingCardStageRect(card);
    if (!cardRect) return false;

    const boxRect = this.getRankingBoxStageRect(rankingNode);
    const expanded = margin > 0 ? expandRect(boxRect, margin) : boxRect;
    return !rectsIntersect(cardRect, expanded);
  }

  async moveRankingItemOutToText(rankingNode, card) {
    const itemId = card.getAttr("rankingItemId");
    const dropPoint = this.getCanvasPointerPosition();
    return this.moveRankingItemOut(rankingNode, itemId, dropPoint);
  }

  async moveRankingItemOut(rankingBoxRef, itemId, dropPoint) {
    const rankingNode = typeof rankingBoxRef === "string"
      ? this.findNodeById(rankingBoxRef)
      : rankingBoxRef;
    if (!isRankingBoxNode(rankingNode) || typeof itemId !== "string") return null;
    if (!dropPoint) {
      this.refreshRankingBox(rankingNode);
      this.bindRankingBox(rankingNode);
      rankingNode.getLayer()?.batchDraw();
      this.app.events.emit("node:changed", { node: rankingNode });
      return null;
    }

    const component = this.getRankingComponent();
    const data = component.getData(rankingNode);
    const item = data.items.find((entry) => entry.id === itemId);
    if (!item) {
      this.refreshRankingBox(rankingNode);
      this.bindRankingBox(rankingNode);
      rankingNode.getLayer()?.batchDraw();
      this.app.events.emit("node:changed", { node: rankingNode });
      return null;
    }

    const nextItems = data.items.filter((entry) => entry.id !== itemId);
    component.setData(rankingNode, {
      ...data,
      items: resequenceItems(nextItems),
    });
    this.bindRankingBox(rankingNode);
    rankingNode.getLayer()?.batchDraw();
    this.app.events.emit("node:changed", { node: rankingNode });

    const node = await this.createTextNodeFromRankingItem(item, dropPoint);
    if (node) {
      this.selectNode(node);
    }
    return node;
  }

  async createTextNodeFromRankingItem(item, dropPoint) {
    const textComponent = this.app.components.get("text");
    if (!textComponent) return null;

    const textData = item.textData?.data && typeof item.textData.data === "object"
      ? clonePlainData(item.textData.data)
      : {};
    const width = Number.isFinite(textData.width)
      ? textData.width
      : Number.isFinite(item.textData?.width)
        ? item.textData.width
        : 240;
    const height = Number.isFinite(textData.height)
      ? textData.height
      : Number.isFinite(item.textData?.height)
        ? item.textData.height
        : 96;
    const absolutePosition = {
      x: dropPoint.x - width / 2,
      y: dropPoint.y - height / 2,
    };
    const targetPage = this.findPageAtPoint(dropPoint);
    const parentTransform = targetPage?.getAbsoluteTransform?.().copy().invert();
    const localPosition = parentTransform
      ? parentTransform.point(absolutePosition)
      : absolutePosition;
    const requestedId =
      typeof item.sourceNodeId === "string" &&
      item.sourceNodeId &&
      !this.findNodeById(item.sourceNodeId)
        ? item.sourceNodeId
        : undefined;

    const node = await textComponent.restore({
      id: requestedId,
      x: localPosition.x,
      y: localPosition.y,
      data: {
        ...textData,
        width,
        height,
      },
    });
    if (!node) return null;

    if (targetPage) {
      targetPage.add(node);
    } else {
      this.layer.add(node);
    }
    node.moveToTop();
    node.getLayer()?.batchDraw();
    this.app.events.emit("node:added", { node });
    return node;
  }

  getRankingData(rankingNode) {
    return getRankingBoxMetrics(this.getRankingComponent().getData(rankingNode));
  }

  getInsertIndexForDropPoint(rankingNode, data, dropPoint) {
    if (!dropPoint) return data.items.length;

    const transform = rankingNode.getAbsoluteTransform().copy().invert();
    const localPoint = transform.point(dropPoint);
    return this.getInsertIndexForContentY(
      data.items,
      localPoint.y - data.headerHeight + data.scrollOffset,
    );
  }

  getInsertIndexForContentY(items, contentY) {
    if (!items.length) return 0;
    const metrics = getRankingBoxMetrics();

    for (let index = 0; index < items.length; index += 1) {
      const centerY =
        metrics.padding +
        index * (metrics.cardHeight + metrics.cardGap) +
        metrics.cardHeight / 2;
      if (contentY < centerY) {
        return index;
      }
    }
    return items.length;
  }

  reorderRankingItemFromCard(rankingNode, card) {
    const component = this.getRankingComponent();
    const data = this.getRankingData(rankingNode);
    const itemById = new Map(data.items.map((item) => [item.id, item]));
    const draggedItemId = card.getAttr("rankingItemId");
    const draggedItem = itemById.get(draggedItemId);
    if (!draggedItem) {
      this.refreshRankingBox(rankingNode);
      this.bindRankingBox(rankingNode);
      return;
    }

    const getCardCenterY = (itemCard) => {
      const box = itemCard.getClientRect({ relativeTo: this.app.stage });
      return box.y + box.height / 2;
    };

    const draggedCenterY = getCardCenterY(card);
    const otherCards = rankingNode
      .find(".ranking-item-card")
      .filter((itemCard) => itemCard !== card)
      .map((itemCard) => ({
        id: itemCard.getAttr("rankingItemId"),
        centerY: getCardCenterY(itemCard),
      }))
      .filter((item) => itemById.has(item.id))
      .sort((left, right) => left.centerY - right.centerY);

    if (otherCards.length !== data.items.length - 1) {
      this.refreshRankingBox(rankingNode);
      this.bindRankingBox(rankingNode);
      return;
    }

    const insertIndex = otherCards.findIndex((item) => draggedCenterY < item.centerY);
    const nextItems = otherCards.map((item) => itemById.get(item.id));
    nextItems.splice(insertIndex < 0 ? nextItems.length : insertIndex, 0, draggedItem);

    component.setData(rankingNode, {
      ...data,
      items: resequenceItems(nextItems),
    });
    this.bindRankingBox(rankingNode);
    rankingNode.getLayer()?.batchDraw();
  }

  scrollRankingBoxBy(rankingNode, delta) {
    const component = this.getRankingComponent();
    const data = this.getRankingData(rankingNode);
    component.setData(rankingNode, {
      ...data,
      scrollOffset: data.scrollOffset + delta,
    });
    this.bindRankingBox(rankingNode);
    rankingNode.getLayer()?.batchDraw();
  }

  refreshRankingBox(rankingNode) {
    this.getRankingComponent()?.syncNode?.(rankingNode);
  }

  refreshRankingBoxesForText(textNode) {
    const textId = textNode?.id?.();
    if (!textId) return;

    this.getRankingBoxes().forEach((rankingBox) => {
      const data = this.getRankingComponent().getData(rankingBox);
      if (!data.items.some((item) => item.sourceNodeId === textId)) return;
      this.refreshRankingBox(rankingBox);
      this.bindRankingBox(rankingBox);
      rankingBox.getLayer()?.batchDraw();
    });
  }

  removeTextReferences(textNode, { recordHistory = false } = {}) {
    const textId = textNode?.id?.();
    if (!textId) return;

    this.getRankingBoxes().forEach((rankingBox) => {
      const component = this.getRankingComponent();
      const data = component.getData(rankingBox);
      const nextItems = data.items.filter((item) => item.sourceNodeId !== textId);
      if (nextItems.length === data.items.length) return;

      if (recordHistory) {
        this.app.events.emit("node:change:start", { node: rankingBox });
      }
      component.setData(rankingBox, {
        ...data,
        items: resequenceItems(nextItems),
      });
      this.bindRankingBox(rankingBox);
      rankingBox.getLayer()?.batchDraw();
      if (recordHistory) {
        this.app.events.emit("node:changed", { node: rankingBox });
      }
    });
  }

  pruneMissingTextReferences({ recordHistory = false } = {}) {
    this.getRankingBoxes().forEach((rankingBox) => {
      const component = this.getRankingComponent();
      const data = component.getData(rankingBox);
      const nextItems = data.items.filter((item) => (
        isTextNode(this.findNodeById(item.sourceNodeId)) ||
        Boolean(item.textData?.data?.text)
      ));
      if (nextItems.length === data.items.length) return;

      if (recordHistory) {
        this.app.events.emit("node:change:start", { node: rankingBox });
      }
      component.setData(rankingBox, {
        ...data,
        items: resequenceItems(nextItems),
      });
      this.bindRankingBox(rankingBox);
      rankingBox.getLayer()?.batchDraw();
      if (recordHistory) {
        this.app.events.emit("node:changed", { node: rankingBox });
      }
    });
  }

  refreshAndBindAllRankingBoxes() {
    this.pruneMissingTextReferences();
    this.getRankingBoxes().forEach((rankingBox) => {
      this.refreshRankingBox(rankingBox);
      this.bindRankingBox(rankingBox);
    });
    this.layer.batchDraw();
  }
}
