import { BaseCommand, BasePlugin, BaseTool } from "../core/baseClasses.js";
import { Konva } from "../lib/konva.js";

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

    this.transformer = new Konva.Transformer({
      rotateEnabled: true,
      ignoreStroke: true,
      borderDash: [6, 4],
      anchorCornerRadius: 8,
      anchorSize: 10,
      keepRatio: true,
      flipEnabled: false,
      enabledAnchors: ["top-left", "top-right", "bottom-left", "bottom-right"],
    });

    this.guideLineVertical = new Konva.Line({
      stroke: "#d7612f",
      strokeWidth: 1,
      dash: [6, 6],
      visible: false,
      listening: false,
    });

    this.guideLineHorizontal = new Konva.Line({
      stroke: "#d7612f",
      strokeWidth: 1,
      dash: [6, 6],
      visible: false,
      listening: false,
    });

    this.selectedNodes = [];

    this.layer.find(".selectable").forEach((node) => {
      this.syncNodeInteractivity(node);
      this.bindNodeChangeSync(node);
    });

    layer.add(this.transformer);
    overlayLayer.add(
      this.guideLineVertical,
      this.guideLineHorizontal,
    );

    this.app.keybindings.register("Delete", "selection:delete");
    this.app.keybindings.register("Backspace", "selection:delete");
    this.cleanups.push(() => this.app.keybindings.unregister("Delete"));
    this.cleanups.push(() => this.app.keybindings.unregister("Backspace"));

    this.listen("node:added", ({ node }) => {
      this.syncNodeInteractivity(node);
      this.bindNodeChangeSync(node);
      this.setSelected([node]);
      if (this.app.getMode() !== "edit") {
        this.app.setMode("edit");
      }
      if (this.app.getEditorTool() !== "arrange") {
        this.app.setEditorTool("arrange");
      }
    });

    this.listen("node:removed", ({ node }) => {
      if (!this.selectedNodes.includes(node)) return;
      this.setSelected(this.selectedNodes.filter((selectedNode) => selectedNode !== node));
    });

    this.listen("interaction:change", () => this.syncMode());

    stage.on("click.selection tap.selection", (event) => this.handleClick(event));
    stage.on("dragmove.snapGuides transform.snapGuides", (event) => this.handleSnapMove(event));
    stage.on("dragend.snapGuides transformend.snapGuides", () => this.hideGuides());

    this.cleanups.push(() => {
      stage.off(".selection");
      stage.off(".snapGuides");
    });
  }

  syncMode() {
    const enabled = this.isEnabled();
    if (!enabled && this.selectedNodes.length) {
      this.clearSelection();
    }
    if (!enabled) {
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
    return this.selectedNodes;
  }

  getTransformableNodes(nodes) {
    return nodes.filter((node) => node.getAttr("componentType") !== "connection");
  }

  syncTransformer() {
    const transformableNodes = this.getTransformableNodes(this.selectedNodes);
    const primaryNode = transformableNodes[0] ?? null;
    const transformLocked = Boolean(primaryNode?.getAttr("transformLocked"));

    this.transformer.rotateEnabled(!transformLocked);
    this.transformer.enabledAnchors(
      transformLocked
        ? []
        : ["top-left", "top-right", "bottom-left", "bottom-right"],
    );
    this.transformer.nodes(transformableNodes);
  }

  setSelected(nodes) {
    const nextNode = nodes.find(Boolean) ?? null;
    this.selectedNodes = nextNode ? [nextNode] : [];
    this.syncTransformer();
    this.layer.batchDraw();
    this.app.events.emit("selection:change", { nodes: this.selectedNodes });
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

  bindNodeChangeSync(node) {
    if (!node?.hasName?.("selectable")) return;
    node.off(".selectionSync");
    node.on("dragmove.selectionSync transform.selectionSync transformend.selectionSync", () => {
      if (!node.getStage?.()) return;
      this.app.events.emit("node:changed", { node });
    });
    this.cleanups.push(() => node.off(".selectionSync"));
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
      .filter((node) => (
        node !== skipNode &&
        node.isVisible() &&
        node.getAttr("componentType") !== "connection"
      ))
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
    if (this.app.tools.getActive() !== "arrange") return;
    if (this.app.stageApi.consumePanClickSuppression()) {
      return;
    }

    const target = this.getSelectable(event.target);
    if (!target) {
      this.clearSelection();
      return;
    }
    this.setSelected([target]);
  }

  handleSnapMove(event) {
    if (!this.isEnabled()) return;
    const target = this.getSelectable(event.target);
    if (!target) return;
    this.updateGuides(target);
  }
}
