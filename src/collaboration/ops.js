function clonePlainData(value) {
  if (value == null) return value;
  return JSON.parse(JSON.stringify(value));
}

export function flattenHistoryEntry(entry) {
  if (!entry) return [];
  if (entry.type === "batch") {
    return (entry.operations ?? []).map((operation) => clonePlainData(operation));
  }
  return [clonePlainData(entry)];
}

export function normalizeCollaborationPatch(payload = {}) {
  const baseRevision = Number(payload.baseRevision);
  const revision = Number(payload.revision);
  const operations = Array.isArray(payload.operations)
    ? payload.operations.map((operation) => clonePlainData(operation))
    : [];

  if (!Number.isFinite(baseRevision) || !Number.isFinite(revision)) {
    return null;
  }

  return {
    baseRevision,
    revision,
    operations,
    compareState: payload.compareState ?? null,
    authorId: typeof payload.authorId === "string" ? payload.authorId : null,
    opId: typeof payload.opId === "string" ? payload.opId : null,
  };
}

export const COLLAB_MESSAGE_TYPES = {
  GRANT: "app:collab-grant",
  REVOKE: "app:collab-revoke",
  OP: "app:collab-op",
  OP_REJECT: "app:collab-op-reject",
};
