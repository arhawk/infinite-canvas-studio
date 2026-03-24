import { BaseCommand, BasePlugin } from "../core/baseClasses.js";
import { Konva } from "../lib/konva.js";

const HISTORY_LIMIT = 100;

let drawingNodeCount = 0;

function nextDrawingNodeId() {
  drawingNodeCount += 1;
  return `drawing-${drawingNodeCount}`;
}

function syncDrawingNodeCount(id) {
  if (typeof id !== "string") return;
  const match = id.match(/-(\d+)$/);
  if (!match) return;
  drawingNodeCount = Math.max(drawingNodeCount, Number(match[1]));
}

function clonePlainData(value) {
  if (value == null) return value;
  return JSON.parse(JSON.stringify(value));
}

function normalizePoint(value = {}, fallback = { x: 0, y: 0 }) {
  return {
    x: Number.isFinite(value.x) ? value.x : fallback.x,
    y: Number.isFinite(value.y) ? value.y : fallback.y,
  };
}

function isSelectableNode(node) {
  return !!node?.hasName?.("selectable");
}

function isConnectionSnapshot(snapshot) {
  return snapshot?.type === "connection";
}

function snapshotsEqual(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

class UndoCommand extends BaseCommand {
  static commandId = "history:undo";
  static label = "Undo";
  static modes = {
    edit: {
      tools: {
        arrange: {},
        brush: {},
      },
    },
  };

  execute() {
    return this.plugin.undo();
  }
}

class RedoCommand extends BaseCommand {
  static commandId = "history:redo";
  static label = "Redo";
  static modes = {
    edit: {
      tools: {
        arrange: {},
        brush: {},
      },
    },
  };

  execute() {
    return this.plugin.redo();
  }
}

export class HistoryPlugin extends BasePlugin {
  static pluginId = "history";

  commands() {
    return [UndoCommand, RedoCommand];
  }

  onSetup() {
    const {
      undoEl = null,
      redoEl = null,
      historyLimit = HISTORY_LIMIT,
    } = this.options;

    this.app.history = this;
    this.historyLimit = Number.isFinite(historyLimit)
      ? Math.max(1, historyLimit)
      : HISTORY_LIMIT;
    this.ui = {
      undoEl,
      redoEl,
    };
    this.past = [];
    this.future = [];
    this.pendingOperations = [];
    this.pendingCommitId = null;
    this.pendingNodeSnapshots = new Map();
    this.nodeSnapshotCache = new Map();
    this.drawSnapshotCache = new Map();
    this.isApplyingHistory = false;

    this.listen("node:added", ({ node }) => this.handleNodeAdded(node));
    this.listen("node:removed", ({ node }) => this.handleNodeRemoved(node));
    this.listen("node:change:start", ({ node }) => this.captureNodeBeforeChange(node));
    this.listen("node:changed", ({ node }) => this.handleNodeChanged(node));
    this.listen("draw:added", ({ node }) => this.handleDrawingAdded(node));
    this.listen("interaction:change", () => this.syncUi());

    if (undoEl) {
      this.listenDom(undoEl, "click", () => {
        void this.app.commands.execute("history:undo");
      });
    }

    if (redoEl) {
      this.listenDom(redoEl, "click", () => {
        void this.app.commands.execute("history:redo");
      });
    }

    this.app.keybindings.register("Mod+Z", "history:undo");
    this.app.keybindings.register("Mod+Shift+Z", "history:redo");
    this.app.keybindings.register("Mod+Y", "history:redo");
    this.cleanups.push(() => this.app.keybindings.unregister("Mod+Z"));
    this.cleanups.push(() => this.app.keybindings.unregister("Mod+Shift+Z"));
    this.cleanups.push(() => this.app.keybindings.unregister("Mod+Y"));
    this.cleanups.push(() => {
      this.cancelPendingCommit();
      if (this.app.history === this) {
        this.app.history = null;
      }
    });

    this.resetHistory();
  }

  resetHistory() {
    this.cancelPendingCommit();
    this.past = [];
    this.future = [];
    this.pendingOperations = [];
    this.pendingNodeSnapshots.clear();
    this.nodeSnapshotCache = this.collectCurrentNodeCache();
    this.drawSnapshotCache = this.collectCurrentDrawingCache();
    this.syncUi();
  }

  canUndo() {
    return this.past.length > 0;
  }

  canRedo() {
    return this.future.length > 0;
  }

  cancelPendingCommit() {
    if (this.pendingCommitId == null) return;
    window.clearTimeout(this.pendingCommitId);
    this.pendingCommitId = null;
  }

  flushPendingCommit() {
    if (this.pendingCommitId == null) return;
    this.cancelPendingCommit();
    this.commitPendingOperations();
  }

  scheduleCommit() {
    if (this.pendingCommitId != null) return;
    this.pendingCommitId = window.setTimeout(() => {
      this.pendingCommitId = null;
      this.commitPendingOperations();
    }, 0);
  }

  enqueueOperation(operation) {
    if (!operation || this.isApplyingHistory) return;

    this.mergePendingOperation(operation);
    this.scheduleCommit();
  }

  mergePendingOperation(operation) {
    if (operation.type === "update-node") {
      for (let index = this.pendingOperations.length - 1; index >= 0; index -= 1) {
        const current = this.pendingOperations[index];
        if (
          current?.type === "update-node" &&
          current.before?.id === operation.before?.id
        ) {
          this.pendingOperations[index] = {
            type: "update-node",
            before: clonePlainData(current.before),
            after: clonePlainData(operation.after),
          };
          return;
        }
      }
    }

    this.pendingOperations.push(clonePlainData(operation));
  }

  commitPendingOperations() {
    if (!this.pendingOperations.length) {
      this.syncUi();
      return;
    }

    const entry =
      this.pendingOperations.length === 1
        ? this.pendingOperations[0]
        : {
            type: "batch",
            operations: this.pendingOperations.map((operation) => clonePlainData(operation)),
          };

    this.pendingOperations = [];
    this.past.push(entry);
    while (this.past.length > this.historyLimit) {
      this.past.shift();
    }
    this.future = [];
    this.syncUi();
  }

  getSelectableParentId(node) {
    const parent = node?.getParent?.();
    return isSelectableNode(parent) ? parent.id() : null;
  }

  snapshotNode(node, parentId = this.getSelectableParentId(node)) {
    if (!isSelectableNode(node)) return null;
    const component = this.app.components.getByNode(node);
    return component?.serialize?.(node, { parentId }) ?? null;
  }

  snapshotNodeTree(node) {
    const snapshots = [];

    const visit = (currentNode, parentId = this.getSelectableParentId(currentNode)) => {
      if (!isSelectableNode(currentNode)) return;
      const snapshot = this.snapshotNode(currentNode, parentId);
      if (snapshot) {
        snapshots.push(snapshot);
      }

      if (typeof currentNode.getChildren !== "function") return;
      currentNode.getChildren().forEach((child) => {
        if (isSelectableNode(child)) {
          visit(child, currentNode.id());
        }
      });
    };

    visit(node);
    return snapshots;
  }

  collectCurrentNodeSnapshots() {
    const snapshots = [];

    const visit = (container, parentId = null) => {
      container.getChildren().forEach((child) => {
        if (!isSelectableNode(child)) return;

        const snapshot = this.snapshotNode(child, parentId);
        if (snapshot) {
          snapshots.push(snapshot);
        }

        if (typeof child.getChildren === "function") {
          visit(child, child.id());
        }
      });
    };

    visit(this.app.mainLayer);
    return snapshots;
  }

  collectCurrentNodeCache() {
    return new Map(
      this.collectCurrentNodeSnapshots().map((snapshot) => [snapshot.id, clonePlainData(snapshot)]),
    );
  }

  ensureDrawingId(node) {
    if (!node) return null;

    const currentId = typeof node.id === "function" ? node.id() : node.getAttr?.("id");
    if (typeof currentId === "string" && currentId) {
      syncDrawingNodeCount(currentId);
      return currentId;
    }

    const nextId = nextDrawingNodeId();
    syncDrawingNodeCount(nextId);
    node.setAttr("id", nextId);
    return nextId;
  }

  serializeDrawing(node) {
    if (!(node instanceof Konva.Line)) return null;

    const id = this.ensureDrawingId(node);
    if (!id) return null;

    return {
      id,
      points: [...node.points()],
      stroke: node.stroke(),
      strokeWidth: node.strokeWidth(),
      opacity: node.opacity(),
      lineCap: node.lineCap(),
      lineJoin: node.lineJoin(),
      globalCompositeOperation: node.globalCompositeOperation(),
    };
  }

  collectCurrentDrawingCache() {
    const snapshots = this.app.drawLayer.find(".drawable")
      .map((node) => this.serializeDrawing(node))
      .filter(Boolean);

    return new Map(
      snapshots.map((snapshot) => [snapshot.id, clonePlainData(snapshot)]),
    );
  }

  handleNodeAdded(node) {
    if (!isSelectableNode(node) || this.isApplyingHistory) return;

    const snapshots = this.snapshotNodeTree(node);
    if (!snapshots.length) return;

    snapshots.forEach((snapshot) => {
      this.nodeSnapshotCache.set(snapshot.id, clonePlainData(snapshot));
    });

    this.enqueueOperation({
      type: "add-node-tree",
      snapshots,
    });
  }

  handleNodeRemoved(node) {
    if (!isSelectableNode(node) || this.isApplyingHistory) return;

    const snapshots = this.snapshotNodeTree(node);
    if (!snapshots.length) return;

    snapshots.forEach((snapshot) => {
      this.nodeSnapshotCache.delete(snapshot.id);
      this.pendingNodeSnapshots.delete(snapshot.id);
    });

    this.enqueueOperation({
      type: "remove-node-tree",
      snapshots,
    });
  }

  captureNodeBeforeChange(node) {
    if (!isSelectableNode(node) || this.isApplyingHistory) return;

    const snapshot =
      this.nodeSnapshotCache.get(node.id()) ??
      this.snapshotNode(node, this.getSelectableParentId(node));

    if (!snapshot) return;
    this.pendingNodeSnapshots.set(node.id(), clonePlainData(snapshot));
  }

  handleNodeChanged(node) {
    if (!isSelectableNode(node) || this.isApplyingHistory) return;

    const after = this.snapshotNode(node, this.getSelectableParentId(node));
    if (!after) return;

    const before =
      this.pendingNodeSnapshots.get(after.id) ??
      this.nodeSnapshotCache.get(after.id) ??
      null;

    this.pendingNodeSnapshots.delete(after.id);
    this.nodeSnapshotCache.set(after.id, clonePlainData(after));

    if (!before || snapshotsEqual(before, after)) {
      return;
    }

    this.enqueueOperation({
      type: "update-node",
      before,
      after,
    });
  }

  handleDrawingAdded(node) {
    if (!(node instanceof Konva.Line) || this.isApplyingHistory) return;

    const snapshot = this.serializeDrawing(node);
    if (!snapshot) return;

    this.drawSnapshotCache.set(snapshot.id, clonePlainData(snapshot));
    this.enqueueOperation({
      type: "add-drawing",
      snapshot,
    });
  }

  findSelectableNodeById(id) {
    return id ? this.app.mainLayer.findOne(`#${id}`) : null;
  }

  findDrawingById(id) {
    return id ? this.app.drawLayer.findOne(`#${id}`) : null;
  }

  async undo() {
    this.flushPendingCommit();
    if (!this.canUndo()) return false;

    const entry = this.past.pop();
    await this.applyEntry(entry, "undo");
    this.future.push(entry);
    this.syncUi();
    return true;
  }

  async redo() {
    this.flushPendingCommit();
    if (!this.canRedo()) return false;

    const entry = this.future.pop();
    await this.applyEntry(entry, "redo");
    this.past.push(entry);
    this.syncUi();
    return true;
  }

  async applyEntry(entry, direction) {
    this.cancelPendingCommit();
    this.pendingOperations = [];
    this.pendingNodeSnapshots.clear();
    this.isApplyingHistory = true;
    this.app.isReplayingHistory = true;

    try {
      await this.applyOperation(entry, direction);
      this.redrawAllLayers();
    } finally {
      this.app.isReplayingHistory = false;
      this.isApplyingHistory = false;
    }
  }

  async applyOperation(operation, direction) {
    if (!operation) return;

    if (operation.type === "batch") {
      const operations =
        direction === "undo"
          ? [...operation.operations].reverse()
          : operation.operations;

      for (const item of operations) {
        await this.applyOperation(item, direction);
      }
      return;
    }

    switch (operation.type) {
      case "add-node-tree":
        if (direction === "undo") {
          this.removeNodeTree(operation.snapshots);
          this.deleteNodeSnapshotsFromCache(operation.snapshots);
        } else {
          await this.restoreNodeSnapshots(operation.snapshots);
          this.storeNodeSnapshotsInCache(operation.snapshots);
        }
        break;
      case "remove-node-tree":
        if (direction === "undo") {
          await this.restoreNodeSnapshots(operation.snapshots);
          this.storeNodeSnapshotsInCache(operation.snapshots);
        } else {
          this.removeNodeTree(operation.snapshots);
          this.deleteNodeSnapshotsFromCache(operation.snapshots);
        }
        break;
      case "update-node":
        if (direction === "undo") {
          await this.applyNodeSnapshot(operation.before);
          this.nodeSnapshotCache.set(operation.before.id, clonePlainData(operation.before));
        } else {
          await this.applyNodeSnapshot(operation.after);
          this.nodeSnapshotCache.set(operation.after.id, clonePlainData(operation.after));
        }
        break;
      case "add-drawing":
        if (direction === "undo") {
          this.removeDrawing(operation.snapshot);
          this.drawSnapshotCache.delete(operation.snapshot.id);
        } else {
          this.restoreDrawing(operation.snapshot);
          this.drawSnapshotCache.set(operation.snapshot.id, clonePlainData(operation.snapshot));
        }
        break;
      case "remove-drawing":
        if (direction === "undo") {
          this.restoreDrawing(operation.snapshot);
          this.drawSnapshotCache.set(operation.snapshot.id, clonePlainData(operation.snapshot));
        } else {
          this.removeDrawing(operation.snapshot);
          this.drawSnapshotCache.delete(operation.snapshot.id);
        }
        break;
      default:
        break;
    }
  }

  deleteNodeSnapshotsFromCache(snapshots = []) {
    snapshots.forEach((snapshot) => {
      this.nodeSnapshotCache.delete(snapshot.id);
      this.pendingNodeSnapshots.delete(snapshot.id);
    });
  }

  storeNodeSnapshotsInCache(snapshots = []) {
    snapshots.forEach((snapshot) => {
      this.nodeSnapshotCache.set(snapshot.id, clonePlainData(snapshot));
    });
  }

  removeNodeTree(snapshots = []) {
    const rootId = snapshots[0]?.id;
    const rootNode = this.findSelectableNodeById(rootId);
    if (!rootNode?.getStage?.()) return;

    this.app.events.emit("node:removed", { node: rootNode });
    rootNode.destroy();
  }

  async restoreNodeSnapshots(snapshots = []) {
    if (!snapshots.length) return;

    const regularSnapshots = snapshots.filter((snapshot) => !isConnectionSnapshot(snapshot));
    const connectionSnapshots = snapshots.filter((snapshot) => isConnectionSnapshot(snapshot));
    const restoredNodes = new Map();

    for (const snapshot of regularSnapshots) {
      const node = await this.restoreNodeSnapshot(snapshot);
      if (node) {
        restoredNodes.set(snapshot.id, node);
      }
    }

    regularSnapshots.forEach((snapshot) => {
      if (!snapshot.parentId) return;

      const node = restoredNodes.get(snapshot.id);
      const parentNode =
        restoredNodes.get(snapshot.parentId) ?? this.findSelectableNodeById(snapshot.parentId);

      if (!node || !parentNode) return;

      node.moveTo(parentNode);
      node.position(normalizePoint(snapshot));
    });

    for (const snapshot of connectionSnapshots) {
      await this.restoreNodeSnapshot(snapshot);
    }
  }

  async restoreNodeSnapshot(snapshot = {}) {
    const component = this.app.components.get(snapshot.type);
    if (!component?.restore) return null;

    const node = await component.restore(clonePlainData(snapshot));
    if (!node) return null;

    this.app.mainLayer.add(node);
    this.app.events.emit("node:added", { node });
    return node;
  }

  async applyNodeSnapshot(snapshot = {}) {
    const node = this.findSelectableNodeById(snapshot.id);
    if (!node?.getStage?.()) return null;

    const component =
      this.app.components.get(snapshot.type) ??
      this.app.components.getByNode(node);
    if (!component) return node;

    const parentNode = snapshot.parentId
      ? this.findSelectableNodeById(snapshot.parentId)
      : this.app.mainLayer;

    if (parentNode && node.getParent() !== parentNode) {
      node.moveTo(parentNode);
    }

    await component.applySerializedData(node, clonePlainData(snapshot.data) ?? {});
    component.applySerializedState(node, snapshot);
    this.app.events.emit("node:changed", { node });
    return node;
  }

  restoreDrawing(snapshot = {}) {
    if (!snapshot?.id) return null;

    syncDrawingNodeCount(snapshot.id);
    const existing = this.findDrawingById(snapshot.id);
    if (existing) {
      existing.destroy();
    }

    const line = new Konva.Line({
      id: snapshot.id,
      points: Array.isArray(snapshot.points) ? snapshot.points.filter(Number.isFinite) : [],
      stroke: typeof snapshot.stroke === "string" ? snapshot.stroke : "#1f6feb",
      strokeWidth: Number.isFinite(snapshot.strokeWidth) ? snapshot.strokeWidth : 4,
      opacity: Number.isFinite(snapshot.opacity) ? snapshot.opacity : 1,
      lineCap: typeof snapshot.lineCap === "string" ? snapshot.lineCap : "round",
      lineJoin: typeof snapshot.lineJoin === "string" ? snapshot.lineJoin : "round",
      draggable: false,
      name: "drawable",
      globalCompositeOperation:
        typeof snapshot.globalCompositeOperation === "string"
          ? snapshot.globalCompositeOperation
          : "source-over",
    });

    this.app.drawLayer.add(line);
    return line;
  }

  removeDrawing(snapshot = {}) {
    const node = this.findDrawingById(snapshot.id);
    if (!node?.getStage?.()) return;
    node.destroy();
  }

  redrawAllLayers() {
    this.app.mainLayer.batchDraw();
    this.app.drawLayer.batchDraw();
    this.app.overlayLayer.batchDraw();
    this.app.uiLayer.batchDraw();
  }

  syncUi() {
    const undoCommand = this.app.commands.get("history:undo");
    const redoCommand = this.app.commands.get("history:redo");
    const undoDisabled =
      this.isApplyingHistory ||
      !this.canUndo() ||
      !undoCommand?.isEnabled?.();
    const redoDisabled =
      this.isApplyingHistory ||
      !this.canRedo() ||
      !redoCommand?.isEnabled?.();

    if (this.ui.undoEl) {
      this.ui.undoEl.disabled = undoDisabled;
    }

    if (this.ui.redoEl) {
      this.ui.redoEl.disabled = redoDisabled;
    }
  }
}
