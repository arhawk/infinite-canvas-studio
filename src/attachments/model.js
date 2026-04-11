function clonePlainData(value) {
  if (value == null) return value;
  return JSON.parse(JSON.stringify(value));
}

function createAttachmentId(prefix = "attachment") {
  if (typeof crypto?.randomUUID === "function") {
    return `${prefix}-${crypto.randomUUID()}`;
  }

  return `${prefix}-${Date.now()}-${Math.round(Math.random() * 1e6)}`;
}

function sanitizeText(value, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function createUrlLabel(url) {
  try {
    const parsed = new URL(url);
    return parsed.hostname || url;
  } catch {
    return url;
  }
}

export function normalizeAttachmentEntry(entry = {}) {
  const kind = entry.kind === "url" ? "url" : "local-file";
  const sourceKind =
    entry.sourceKind === "directory" ||
    entry.sourceKind === "file" ||
    entry.sourceKind === "upload" ||
    entry.sourceKind === "url"
      ? entry.sourceKind
      : kind === "url"
        ? "url"
        : "file";
  const fileName = sanitizeText(entry.fileName, sanitizeText(entry.path, "Attachment"));
  const url = kind === "url" ? sanitizeText(entry.url) : null;

  return {
    id: sanitizeText(entry.id, createAttachmentId(kind)),
    kind,
    sourceKind,
    label: sanitizeText(entry.label, kind === "url" ? createUrlLabel(url) : fileName),
    fileName: kind === "url" ? null : fileName,
    path: kind === "url" ? null : sanitizeText(entry.path, fileName),
    url,
    mimeType: sanitizeText(entry.mimeType) || null,
    size: Number.isFinite(entry.size) ? entry.size : null,
    handleKey: sanitizeText(entry.handleKey) || null,
    sourceName: sanitizeText(entry.sourceName) || null,
    addedAt:
      typeof entry.addedAt === "string" && entry.addedAt
        ? entry.addedAt
        : new Date().toISOString(),
  };
}

export function normalizeAttachmentDirectory(directory = null) {
  if (!directory || typeof directory !== "object") return null;

  const handleKey = sanitizeText(directory.handleKey);
  if (!handleKey) return null;

  return {
    handleKey,
    name: sanitizeText(directory.name, "Folder"),
  };
}

export function normalizeAttachmentState(state = null) {
  const source = state && typeof state === "object" ? state : {};

  return {
    directory: normalizeAttachmentDirectory(source.directory),
    entries: Array.isArray(source.entries)
      ? source.entries.map((entry) => normalizeAttachmentEntry(entry))
      : [],
  };
}

export function cloneAttachmentState(state = null) {
  return clonePlainData(normalizeAttachmentState(state));
}

export function createEmptyAttachmentState() {
  return normalizeAttachmentState();
}

export function replaceDirectoryEntries(state, directory, entries = []) {
  const normalized = normalizeAttachmentState(state);
  const keptEntries = normalized.entries.filter((entry) => entry.sourceKind !== "directory");

  return normalizeAttachmentState({
    directory,
    entries: [...keptEntries, ...entries],
  });
}

export function appendAttachmentEntries(state, entries = []) {
  const normalized = normalizeAttachmentState(state);

  return normalizeAttachmentState({
    directory: normalized.directory,
    entries: [...normalized.entries, ...entries],
  });
}
