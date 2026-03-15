import { BaseCommand, BasePlugin, BaseTool } from "../core/baseClasses.js";

const GUIDE_TOLERANCE = 6;

class ArrangeTool extends BaseTool {
  static toolId = "arrange";
  static label = "Move / Zoom / Add";
}

class DeleteSelectionCommand extends BaseCommand {
  static commandId = "selection:delete";
  static label = "Delete Selected";
  static modes = {
    edit: {
      tools: {
        arrange: {},
      },
    },
  };

  execute() {
    this.plugin.deleteSelection();
  }
}

export class SelectionPlugin extends BasePlugin {
  static pluginId = "selection";
  static modes = {
    edit: {
      tools: {
        arrange: {},
      },
    },
  };

  tools() {
    return [ArrangeTool];
  }

  commands() {
    return [DeleteSelectionCommand];
  }

  onSetup() {
    const { stage, mainLayer: layer, overlayLayer } = this.app;
    this.stage = stage;
    this.layer = layer;
    this.overlayLayer = overlayLayer;

    this.transformer = new window.Konva.Transformer({
      rotateEnabled: true,
      ignoreStroke: true,
      borderDash: [6, 4],
      anchorCornerRadius: 8,
      anchorSize: 10,
      keepRatio: true,
      flipEnabled: false,
      enabledAnchors: ["top-left", "top-right", "bottom-left", "bottom-right"],
    });

    this.selectionRect = new window.Konva.Rect({
      fill: "rgba(215, 97, 47, 0.12)",
      stroke: "#d7612f",
      strokeWidth: 1,
      visible: false,
    });

    this.guideLineVertical = new window.Konva.Line({
      stroke: "#d7612f",
      strokeWidth: 1,
      dash: [6, 6],
      visible: false,
      listening: false,
    });

    this.guideLineHorizontal = new window.Konva.Line({
      stroke: "#d7612f",
      strokeWidth: 1,
      dash: [6, 6],
      visible: false,
      listening: false,
    });

    this.selectionStart = null;
    this.didMarqueeSelect = false;

    layer.add(this.transformer);
    overlayLayer.add(
      this.selectionRect,
      this.guideLineVertical,
      this.guideLineHorizontal,
    );

    this.app.keybindings.register("Delete", "selection:delete");
    this.app.keybindings.register("Backspace", "selection:delete");
    this.cleanups.push(() => this.app.keybindings.unregister("Delete"));
    this.cleanups.push(() => this.app.keybindings.unregister("Backspace"));

    this.listen("node:added", ({ node }) => {
      this.syncNodeInteractivity(node);
      // Don't auto-select image placeholders if they were just added via drag/drop
      // but the user might want to select them. Actually, selecting them is fine.
      // However, for images, we might want to wait.
      // Let's keep it simple: auto-select is usually good.
      this.setSelected([node]);
      if (this.app.getMode() !== "edit") {
        this.app.setMode("edit");
      }
      if (this.app.getEditorTool() !== "arrange") {
        this.app.setEditorTool("arrange");
      }
    });

    this.listen("interaction:change", () => this.syncMode());

    stage.on("click.selection tap.selection", (event) => this.handleClick(event));
    stage.on("mousedown.selection touchstart.selection", (event) => this.handlePointerDown(event));
    stage.on("mousemove.selection touchmove.selection", () => this.handlePointerMove());
    stage.on("mouseup.selection touchend.selection", () => this.handlePointerUp());
    stage.on("dragmove.snapGuides transform.snapGuides", (event) => this.handleSnapMove(event));
    stage.on("dragend.snapGuides transformend.snapGuides", () => this.hideGuides());

    this.cleanups.push(() => {
      stage.off(".selection");
      stage.off(".snapGuides");
    });
  }

  syncMode() {
    const enabled = this.isEnabled();
    if (!enabled && this.transformer.nodes().length) {
      this.clearSelection();
    }
    if (!enabled) {
      this.selectionStart = null;
      this.selectionRect.visible(false);
      this.hideGuides();
      this.overlayLayer.batchDraw();
    }
    this.layer.find(".selectable").forEach((node) => this.syncNodeInteractivity(node));
    this.layer.batchDraw();
  }

  getSelectable(target) {
    if (!target || target === this.stage) return null;
    const shape = target.findAncestor(".selectable", true);
    return shape ?? (target.hasName?.("selectable") ? target : null);
  }

  getSelectedNodes() {
    return this.transformer.nodes();
  }

  setSelected(nodes) {
    const uniqueNodes = [...new Set(nodes.filter(Boolean))];
    
    // Filter out nodes whose ancestors are also in the selection to avoid double-transformation
    const topLevelNodes = uniqueNodes.filter(node => {
      let p = node.getParent();
      while (p && p !== this.stage && p !== this.layer) {
        if (uniqueNodes.includes(p)) return false;
        p = p.getParent();
      }
      return true;
    });

    this.transformer.nodes(topLevelNodes);
    this.layer.batchDraw();
    this.app.events.emit("selection:change", { nodes: topLevelNodes });
  }

  clearSelection() {
    this.setSelected([]);
  }

  deleteSelection() {
    if (!this.isEnabled()) return;
    const nodes = this.getSelectedNodes();
    if (!nodes.length) return;
    nodes.forEach((node) => {
      this.app.events.emit("node:removed", { node });
      node.destroy();
    });
    this.clearSelection();
    this.layer.batchDraw();
  }

  syncNodeInteractivity(node) {
    if (!node?.hasName?.("selectable")) return;
    node.draggable(Boolean(node.getAttr("baseDraggable")) && this.isEnabled());
  }

  hideGuides() {
    this.guideLineVertical.visible(false);
    this.guideLineHorizontal.visible(false);
    this.overlayLayer.batchDraw();
  }

  getGuideStops(skipNode) {
    const vertical = [0, this.stage.width() / 2, this.stage.width()].map(
      (value) => this.app.stageApi.screenToCanvas({ x: value, y: 0 }).x,
    );
    const horizontal = [0, this.stage.height() / 2, this.stage.height()].map(
      (value) => this.app.stageApi.screenToCanvas({ x: 0, y: value }).y,
    );

    this.layer.find(".selectable")
      .filter((node) => node !== skipNode && node.isVisible())
      .forEach((node) => {
        const box = node.getClientRect({ skipTransform: false });
        vertical.push(box.x, box.x + box.width / 2, box.x + box.width);
        horizontal.push(box.y, box.y + box.height / 2, box.y + box.height);
      });

    return { vertical, horizontal };
  }

  getSnappingEdges(node) {
    const box = node.getClientRect({ skipTransform: false });
    const absPos = node.absolutePosition();
    return {
      vertical: [
        { guide: box.x, offset: absPos.x - box.x },
        { guide: box.x + box.width / 2, offset: absPos.x - box.x - box.width / 2 },
        { guide: box.x + box.width, offset: absPos.x - box.x - box.width },
      ],
      horizontal: [
        { guide: box.y, offset: absPos.y - box.y },
        { guide: box.y + box.height / 2, offset: absPos.y - box.y - box.height / 2 },
        { guide: box.y + box.height, offset: absPos.y - box.y - box.height },
      ],
    };
  }

  findGuide(stops, bounds) {
    const matches = [];
    stops.forEach((stop) => {
      bounds.forEach((bound) => {
        const diff = Math.abs(stop - bound.guide);
        if (diff < GUIDE_TOLERANCE) {
          matches.push({ lineGuide: stop, diff, offset: bound.offset });
        }
      });
    });
    matches.sort((a, b) => a.diff - b.diff);
    return matches[0];
  }

  updateGuides(node) {
    const stops = this.getGuideStops(node);
    const bounds = this.getSnappingEdges(node);
    const verticalGuide = this.findGuide(stops.vertical, bounds.vertical);
    const horizontalGuide = this.findGuide(stops.horizontal, bounds.horizontal);

    if (!verticalGuide && !horizontalGuide) {
      this.hideGuides();
      return;
    }

    const nextPosition = { ...node.absolutePosition() };

    if (verticalGuide) {
      nextPosition.x = verticalGuide.lineGuide + verticalGuide.offset;
      this.guideLineVertical.points([
        verticalGuide.lineGuide,
        this.app.stageApi.screenToCanvas({ x: 0, y: 0 }).y,
        verticalGuide.lineGuide,
        this.app.stageApi.screenToCanvas({ x: 0, y: this.stage.height() }).y,
      ]);
      this.guideLineVertical.visible(true);
    } else {
      this.guideLineVertical.visible(false);
    }

    if (horizontalGuide) {
      nextPosition.y = horizontalGuide.lineGuide + horizontalGuide.offset;
      this.guideLineHorizontal.points([
        this.app.stageApi.screenToCanvas({ x: 0, y: 0 }).x,
        horizontalGuide.lineGuide,
        this.app.stageApi.screenToCanvas({ x: this.stage.width(), y: 0 }).x,
        horizontalGuide.lineGuide,
      ]);
      this.guideLineHorizontal.visible(true);
    } else {
      this.guideLineHorizontal.visible(false);
    }

    node.absolutePosition(nextPosition);
    this.overlayLayer.batchDraw();
  }

  handleClick(event) {
    if (this.app.tools.getActive() !== "arrange" || this.selectionRect.visible()) return;
    if (this.didMarqueeSelect) {
      this.didMarqueeSelect = false;
      return;
    }

    const target = this.getSelectable(event.target);
    if (!target) {
      this.clearSelection();
      return;
    }

    const current = this.getSelectedNodes();
    const alreadySelected = current.includes(target);
    if (event.evt.shiftKey) {
      this.setSelected(alreadySelected ? current.filter((node) => node !== target) : [...current, target]);
      return;
    }
    this.setSelected([target]);
  }

  handlePointerDown(event) {
    if (this.app.tools.getActive() !== "arrange") return;
    const clickedOnEmpty = event.target === this.stage;
    if (!clickedOnEmpty || event.evt.button === 1 || event.evt.buttons === 4) return;
    const pointer = this.stage.getPointerPosition();
    if (!pointer) return;

    this.selectionStart = this.app.stageApi.screenToCanvas(pointer);
    this.selectionRect.visible(true);
    this.selectionRect.width(0);
    this.selectionRect.height(0);
    this.selectionRect.position(this.selectionStart);
    this.overlayLayer.batchDraw();
  }

  handlePointerMove() {
    if (!this.selectionStart || !this.selectionRect.visible()) return;
    const rawPointer = this.stage.getPointerPosition();
    if (!rawPointer) return;
    const pointer = this.app.stageApi.screenToCanvas(rawPointer);
    this.selectionRect.setAttrs({
      x: Math.min(pointer.x, this.selectionStart.x),
      y: Math.min(pointer.y, this.selectionStart.y),
      width: Math.abs(pointer.x - this.selectionStart.x),
      height: Math.abs(pointer.y - this.selectionStart.y),
    });
    this.overlayLayer.batchDraw();
  }

  handlePointerUp() {
    if (!this.selectionStart) return;
    const selectionBox = this.selectionRect.getClientRect();
    const selected = this.layer.find(".selectable").filter((node) => (
      window.Konva.Util.haveIntersection(selectionBox, node.getClientRect())
    ));

    this.selectionRect.visible(false);
    this.overlayLayer.batchDraw();
    this.selectionStart = null;

    if (selected.length) {
      this.didMarqueeSelect = true;
      this.setSelected(selected);
    }
  }

  handleSnapMove(event) {
    if (!this.isEnabled()) return;
    const target = this.getSelectable(event.target);
    if (!target) return;
    this.updateGuides(target);
  }
}
