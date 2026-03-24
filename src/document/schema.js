const DOCUMENT_SCHEMA_VERSION = 1;

function clonePlainData(value) {
  if (value == null) return value;
  return JSON.parse(JSON.stringify(value));
}

function createPoint(point = {}, fallback = { x: 0, y: 0 }) {
  return {
    x: Number.isFinite(point.x) ? point.x : fallback.x,
    y: Number.isFinite(point.y) ? point.y : fallback.y,
  };
}

function createStageView(view = {}) {
  return {
    scale: Number.isFinite(view.scale) ? view.scale : 1,
    position: createPoint(view.position),
  };
}

function normalizeNodeSnapshot(snapshot = {}) {
  if (!snapshot || typeof snapshot !== "object") {
    throw new Error("Invalid node snapshot.");
  }

  if (typeof snapshot.id !== "string" || !snapshot.id) {
    throw new Error("Node snapshot is missing a valid id.");
  }

  if (typeof snapshot.type !== "string" || !snapshot.type) {
    throw new Error(`Node ${snapshot.id} is missing a valid type.`);
  }

  return {
    id: snapshot.id,
    type: snapshot.type,
    parentId:
      typeof snapshot.parentId === "string" && snapshot.parentId
        ? snapshot.parentId
        : null,
    x: Number.isFinite(snapshot.x) ? snapshot.x : 0,
    y: Number.isFinite(snapshot.y) ? snapshot.y : 0,
    rotation: Number.isFinite(snapshot.rotation) ? snapshot.rotation : 0,
    scaleX: Number.isFinite(snapshot.scaleX) ? snapshot.scaleX : 1,
    scaleY: Number.isFinite(snapshot.scaleY) ? snapshot.scaleY : 1,
    visible: snapshot.visible !== false,
    opacity: Number.isFinite(snapshot.opacity) ? snapshot.opacity : 1,
    focusPositionMode:
      snapshot.focusPositionMode === "relative" || snapshot.focusPositionMode === "absolute"
        ? snapshot.focusPositionMode
        : null,
    savedFocus: clonePlainData(snapshot.savedFocus ?? null),
    data:
      snapshot.data && typeof snapshot.data === "object"
        ? clonePlainData(snapshot.data)
        : {},
  };
}

function normalizeDrawingSnapshot(snapshot = {}) {
  if (!snapshot || typeof snapshot !== "object") {
    throw new Error("Invalid drawing snapshot.");
  }

  if (typeof snapshot.id !== "string" || !snapshot.id) {
    throw new Error("Drawing snapshot is missing a valid id.");
  }

  const points = Array.isArray(snapshot.points)
    ? snapshot.points.filter(Number.isFinite)
    : [];

  return {
    id: snapshot.id,
    points,
    stroke: typeof snapshot.stroke === "string" && snapshot.stroke ? snapshot.stroke : "#1f6feb",
    strokeWidth: Number.isFinite(snapshot.strokeWidth) ? snapshot.strokeWidth : 4,
    opacity: Number.isFinite(snapshot.opacity) ? snapshot.opacity : 1,
    lineCap: typeof snapshot.lineCap === "string" && snapshot.lineCap ? snapshot.lineCap : "round",
    lineJoin:
      typeof snapshot.lineJoin === "string" && snapshot.lineJoin ? snapshot.lineJoin : "round",
    globalCompositeOperation:
      typeof snapshot.globalCompositeOperation === "string" && snapshot.globalCompositeOperation
        ? snapshot.globalCompositeOperation
        : "source-over",
  };
}

function assertUniqueIds(entries, entryType) {
  const seen = new Set();

  entries.forEach((entry) => {
    if (seen.has(entry.id)) {
      throw new Error(`Duplicate ${entryType} id "${entry.id}" detected in document.`);
    }
    seen.add(entry.id);
  });
}

export function createDocumentSnapshot({
  documentId,
  revision = 0,
  savedAt = new Date().toISOString(),
  meta = {},
  view = {},
  nodes = [],
  drawings = [],
} = {}) {
  return normalizeDocumentSnapshot({
    schemaVersion: DOCUMENT_SCHEMA_VERSION,
    documentId,
    revision,
    savedAt,
    meta,
    view,
    nodes,
    drawings,
  });
}

export function normalizeDocumentSnapshot(snapshot = {}) {
  if (!snapshot || typeof snapshot !== "object") {
    throw new Error("Document must be an object.");
  }

  if (
    snapshot.schemaVersion != null &&
    snapshot.schemaVersion !== DOCUMENT_SCHEMA_VERSION
  ) {
    throw new Error(
      `Unsupported document schema version: ${snapshot.schemaVersion}. Expected ${DOCUMENT_SCHEMA_VERSION}.`,
    );
  }

  if (typeof snapshot.documentId !== "string" || !snapshot.documentId) {
    throw new Error("Document is missing a valid documentId.");
  }

  const normalized = {
    schemaVersion: DOCUMENT_SCHEMA_VERSION,
    documentId: snapshot.documentId,
    revision: Number.isFinite(snapshot.revision) ? snapshot.revision : 0,
    savedAt:
      typeof snapshot.savedAt === "string" && snapshot.savedAt
        ? snapshot.savedAt
        : new Date().toISOString(),
    meta:
      snapshot.meta && typeof snapshot.meta === "object"
        ? {
            title:
              typeof snapshot.meta.title === "string" && snapshot.meta.title.trim()
                ? snapshot.meta.title.trim()
                : "Untitled",
          }
        : { title: "Untitled" },
    view: createStageView(snapshot.view),
    nodes: Array.isArray(snapshot.nodes)
      ? snapshot.nodes.map((nodeSnapshot) => normalizeNodeSnapshot(nodeSnapshot))
      : [],
    drawings: Array.isArray(snapshot.drawings)
      ? snapshot.drawings.map((drawingSnapshot) => normalizeDrawingSnapshot(drawingSnapshot))
      : [],
  };

  assertUniqueIds(normalized.nodes, "node");
  assertUniqueIds(normalized.drawings, "drawing");

  return normalized;
}

export function stringifyDocumentSnapshot(snapshot, spacing = 2) {
  return JSON.stringify(normalizeDocumentSnapshot(snapshot), null, spacing);
}

export { DOCUMENT_SCHEMA_VERSION };
