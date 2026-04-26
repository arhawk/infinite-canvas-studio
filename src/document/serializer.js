import { Konva } from "../lib/konva.js";
import { createDocumentSnapshot, normalizeDocumentSnapshot } from "./schema.js";

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

function getSelectableParentId(node) {
  const parent = node?.getParent?.();
  return isSelectableNode(parent) ? parent.id() : null;
}

function snapshotNode(app, node, parentId = getSelectableParentId(node)) {
  if (!isSelectableNode(node)) return null;
  const component = app.components.getByNode(node);
  return component?.serialize?.(node, { parentId }) ?? null;
}

function serializeDrawing(node) {
  if (!(node instanceof Konva.Line)) return null;

  const id = typeof node.id === "function" ? node.id() : node.getAttr?.("id");
  if (typeof id !== "string" || !id) return null;

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

function collectNodeSnapshots(app) {
  const snapshots = [];

  const visit = (container, parentId = null) => {
    container.getChildren().forEach((child) => {
      if (!isSelectableNode(child)) return;

      const snapshot = snapshotNode(app, child, parentId);
      if (snapshot) {
        snapshots.push(snapshot);
      }

      if (typeof child.getChildren === "function") {
        visit(child, child.id());
      }
    });
  };

  visit(app.mainLayer);
  return snapshots;
}

function collectDrawingSnapshots(app) {
  return app.drawLayer.find(".drawable")
    .map((node) => serializeDrawing(node))
    .filter(Boolean);
}

function getRootSelectableNodes(app) {
  return app.mainLayer.getChildren().filter((child) => isSelectableNode(child));
}

function clearMainLayer(app) {
  getRootSelectableNodes(app).forEach((node) => {
    app.events.emit("node:removed", { node });
    node.destroy();
  });
  app.mainLayer.batchDraw();
}

function clearDrawLayer(app) {
  app.drawLayer.destroyChildren();
  app.drawLayer.batchDraw();
}

function clearDocumentContents(app) {
  clearMainLayer(app);
  clearDrawLayer(app);
}

async function restoreNodeSnapshot(app, snapshot = {}) {
  const component = app.components.get(snapshot.type);
  if (!component?.restore) return null;

  const node = await component.restore(clonePlainData(snapshot));
  if (!node) return null;

  app.mainLayer.add(node);
  app.events.emit("node:added", { node });
  return node;
}

async function restoreNodeSnapshots(app, snapshots = []) {
  if (!snapshots.length) return;

  const regularSnapshots = snapshots.filter((snapshot) => !isConnectionSnapshot(snapshot));
  const connectionSnapshots = snapshots.filter((snapshot) => isConnectionSnapshot(snapshot));
  const restoredNodes = new Map();

  for (const snapshot of regularSnapshots) {
    const node = await restoreNodeSnapshot(app, snapshot);
    if (node) {
      restoredNodes.set(snapshot.id, node);
    }
  }

  regularSnapshots.forEach((snapshot) => {
    if (!snapshot.parentId) return;

    const node = restoredNodes.get(snapshot.id);
    const parentNode = restoredNodes.get(snapshot.parentId) ?? app.mainLayer.findOne(`#${snapshot.parentId}`);
    if (!node || !parentNode) return;

    node.moveTo(parentNode);
    node.position(normalizePoint(snapshot));
  });

  regularSnapshots.forEach((snapshot) => {
    const node = restoredNodes.get(snapshot.id);
    if (!node) return;
    app.setSelectableIndex(node, snapshot.zIndex ?? 0);
  });

  for (const snapshot of connectionSnapshots) {
    const node = await restoreNodeSnapshot(app, snapshot);
    if (node) {
      app.setSelectableIndex(node, snapshot.zIndex ?? 0);
    }
  }
}

function restoreDrawingSnapshot(app, snapshot = {}) {
  if (typeof snapshot.id !== "string" || !snapshot.id) return null;

  const existing = app.drawLayer.findOne(`#${snapshot.id}`);
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

  app.drawLayer.add(line);
  return line;
}

function restoreDrawingSnapshots(app, snapshots = []) {
  snapshots.forEach((snapshot) => {
    restoreDrawingSnapshot(app, snapshot);
  });
}

function applyDocumentView(app, view = {}) {
  app.stageApi.setViewport({
    scale: Number.isFinite(view.scale) ? view.scale : app.stageApi.getScale(),
    position: normalizePoint(view.position, {
      x: app.stage.x(),
      y: app.stage.y(),
    }),
  });
}

function redrawAllLayers(app) {
  app.mainLayer.batchDraw();
  app.drawLayer.batchDraw();
  app.overlayLayer.batchDraw();
  app.uiLayer.batchDraw();
}

function isTextSnapshot(snapshot) {
  return snapshot?.type === "text";
}

function readLegacyTermDefinition(snapshot) {
  const td = snapshot?.data?.termDefinition;
  if (!td || typeof td !== "object") return null;

  return {
    peerId: typeof td.peerId === "string" && td.peerId ? td.peerId : null,
    required: td.required === true,
  };
}

function getExistingTermdefPairs(app) {
  const pairs = new Set();
  app.mainLayer.find((node) => (
    node?.hasName?.("selectable") &&
    node.getAttr?.("componentType") === "connection" &&
    node.getAttr?.("connectionKind") === "termdef"
  )).forEach((connectionNode) => {
    const sourceId = connectionNode.getAttr("sourceNodeId");
    const targetId = connectionNode.getAttr("targetNodeId");
    if (typeof sourceId !== "string" || typeof targetId !== "string") return;
    const ids = [sourceId, targetId].sort();
    if (ids[0] && ids[1] && ids[0] !== ids[1]) {
      pairs.add(`${ids[0]}::${ids[1]}`);
    }
  });
  return pairs;
}

async function migrateLegacyTermDefLinks(app, snapshots = []) {
  const existingPairs = getExistingTermdefPairs(app);
  const pendingPairs = new Set();

  for (const snapshot of snapshots) {
    if (!isTextSnapshot(snapshot)) continue;
    const legacy = readLegacyTermDefinition(snapshot);
    if (!legacy?.peerId || !legacy.required) continue;

    const a = snapshot.id;
    const b = legacy.peerId;
    if (a === b) continue;

    const ids = [a, b].sort();
    const key = `${ids[0]}::${ids[1]}`;
    if (existingPairs.has(key) || pendingPairs.has(key)) continue;
    pendingPairs.add(key);

    const left = app.mainLayer.findOne(`#${ids[0]}`);
    const right = app.mainLayer.findOne(`#${ids[1]}`);
    if (
      left?.getAttr?.("componentType") !== "text" ||
      right?.getAttr?.("componentType") !== "text"
    ) {
      continue;
    }

    await app.addComponent("connection", {
      sourceNodeId: ids[0],
      targetNodeId: ids[1],
      connectionKind: "termdef",
    });
  }
}

export function exportDocumentSnapshot(app, {
  documentId,
  revision = 0,
  meta = {},
} = {}) {
  return createDocumentSnapshot({
    documentId,
    revision,
    meta,
    view: {
      scale: app.stageApi.getScale(),
      position: {
        x: app.stage.x(),
        y: app.stage.y(),
      },
    },
    nodes: collectNodeSnapshots(app),
    drawings: collectDrawingSnapshots(app),
  });
}

export async function importDocumentSnapshot(app, snapshot, {
  includeView = true,
} = {}) {
  const documentSnapshot = normalizeDocumentSnapshot(snapshot);

  clearDocumentContents(app);
  await restoreNodeSnapshots(app, documentSnapshot.nodes);
  await migrateLegacyTermDefLinks(app, documentSnapshot.nodes);
  restoreDrawingSnapshots(app, documentSnapshot.drawings);

  if (includeView) {
    applyDocumentView(app, documentSnapshot.view);
  }

  redrawAllLayers(app);
  return documentSnapshot;
}

export {
  clearDocumentContents,
  collectDrawingSnapshots,
  collectNodeSnapshots,
  normalizeDocumentSnapshot,
};
