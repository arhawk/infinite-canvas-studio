import { loadHandleRecord } from "../attachments/handleStore.js";
import { normalizeDocumentSnapshot, stringifyDocumentSnapshot } from "./schema.js";
import { buildRuntimeExportHtml, validateEmbeddedSnapshotInHtml } from "./runtimeHtmlExport.js";
import { getRuntimeAttachmentHandleById } from "../attachments/openAttachment.js";

function clonePlainData(value) {
  if (value == null) return value;
  return JSON.parse(JSON.stringify(value));
}

function sanitizePathSegment(value, fallback = "attachment") {
  const source = String(value ?? "").trim();
  const cleaned = source
    .replaceAll("\\", "-")
    .replaceAll("/", "-")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
  return cleaned || fallback;
}

function basename(value, fallback = "attachment") {
  const raw = String(value ?? "").trim().replaceAll("\\", "/");
  if (!raw) return fallback;
  const parts = raw.split("/").filter(Boolean);
  return parts.at(-1) || fallback;
}

function ensureLocalFileEntry(entry) {
  return entry && entry.kind === "local-file";
}

async function resolveStoredHandle(entry) {
  if (!entry?.handleKey) return null;
  const record = await loadHandleRecord(entry.handleKey).catch(() => null);
  return record?.handle ?? null;
}

async function fileFromHandle(handle, entry) {
  if (!handle) return null;
  if (handle instanceof File) return handle;
  if (handle.kind === "file") return handle.getFile();
  if (handle.kind !== "directory") return null;

  const relativePath = String(entry?.path || entry?.fileName || "")
    .split("/")
    .map((part) => part.trim())
    .filter(Boolean);
  if (!relativePath.length) return null;

  let current = handle;
  for (let index = 0; index < relativePath.length - 1; index += 1) {
    current = await current.getDirectoryHandle(relativePath[index]);
  }
  const fileHandle = await current.getFileHandle(relativePath.at(-1));
  return fileHandle.getFile();
}

function collectAttachmentEntries(snapshot) {
  const matches = [];
  const nodes = Array.isArray(snapshot?.nodes) ? snapshot.nodes : [];
  nodes.forEach((node, nodeIndex) => {
    const entries = node?.data?.attachments?.entries;
    if (!Array.isArray(entries)) return;
    entries.forEach((entry, entryIndex) => {
      if (!ensureLocalFileEntry(entry)) return;
      matches.push({ node, entry, nodeIndex, entryIndex });
    });
  });
  return matches;
}

function createAttachmentFilename(entry, usedNames) {
  const baseName = basename(entry?.fileName || entry?.path || entry?.label, "attachment");
  const dotIndex = baseName.lastIndexOf(".");
  const stemRaw = dotIndex > 0 ? baseName.slice(0, dotIndex) : baseName;
  const extRaw = dotIndex > 0 ? baseName.slice(dotIndex) : "";
  const stem = sanitizePathSegment(stemRaw, "attachment");
  const ext = extRaw
    .replace(/[^a-zA-Z0-9.]+/g, "")
    .replace(/^\.+/, ".");
  let candidate = `${stem}${ext}`;
  let suffix = 1;
  while (usedNames.has(candidate)) {
    suffix += 1;
    candidate = `${stem}-${suffix}${ext}`;
  }
  usedNames.add(candidate);
  return candidate;
}

function createProjectFolderName(base = "mind-map") {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const safe = sanitizePathSegment(base, "mind-map");
  return `${safe}-project-${stamp}`;
}

export function isProjectExportSupported() {
  return typeof window !== "undefined" && typeof window.showDirectoryPicker === "function";
}

export async function exportDocumentAsProject({
  snapshot,
  title,
  suggestedBase,
  htmlTemplate,
}) {
  if (!isProjectExportSupported()) {
    throw new Error("Save as PROJ requires File System Access API (Chromium-based browser).");
  }

  const normalized = normalizeDocumentSnapshot(snapshot);
  const exportedSnapshot = clonePlainData(normalized);
  const picker = await window.showDirectoryPicker({ mode: "readwrite" });
  const projectDir = await picker.getDirectoryHandle(createProjectFolderName(suggestedBase), {
    create: true,
  });
  const attachmentsDir = await projectDir.getDirectoryHandle("attachments", { create: true });
  const warnings = [];
  const usedNames = new Set();
  const renamedAttachments = [];

  for (const { entry } of collectAttachmentEntries(exportedSnapshot)) {
    const runtimeHandle = getRuntimeAttachmentHandleById(entry.id);
    const storedHandle = runtimeHandle ? null : await resolveStoredHandle(entry);
    const handle = runtimeHandle ?? storedHandle;

    try {
      const file = await fileFromHandle(handle, entry);
      if (!file) {
        warnings.push(`Skipped attachment \"${entry.label || entry.id}\": missing file handle.`);
        continue;
      }

      const originalName = basename(entry?.fileName || entry?.path || entry?.label, "attachment");
      const fileName = createAttachmentFilename(entry, usedNames);
      const relativePath = `attachments/${fileName}`;
      const target = await attachmentsDir.getFileHandle(fileName, { create: true });
      const writer = await target.createWritable();
      await writer.write(file);
      await writer.close();

      entry.url = `./${relativePath}`;
      entry.path = relativePath;
      entry.fileName = fileName;
      if (fileName !== originalName) {
        renamedAttachments.push({
          id: entry.id,
          from: originalName,
          to: fileName,
        });
      }
    } catch (error) {
      warnings.push(
        `Skipped attachment \"${entry.label || entry.id}\": ${error instanceof Error ? error.message : "failed to export"}`,
      );
    }
  }

  const html = buildRuntimeExportHtml(htmlTemplate, exportedSnapshot, {
    title,
  });
  validateEmbeddedSnapshotInHtml(html, exportedSnapshot);

  const htmlHandle = await projectDir.getFileHandle("index.html", { create: true });
  const htmlWriter = await htmlHandle.createWritable();
  await htmlWriter.write(html);
  await htmlWriter.close();

  const jsonHandle = await projectDir.getFileHandle("project.json", { create: true });
  const jsonWriter = await jsonHandle.createWritable();
  await jsonWriter.write(stringifyDocumentSnapshot(exportedSnapshot));
  await jsonWriter.close();

  return {
    folderName: projectDir.name,
    warnings,
    renamedAttachments,
    snapshot: exportedSnapshot,
  };
}
