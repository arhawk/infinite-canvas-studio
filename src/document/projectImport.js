import { normalizeDocumentSnapshot } from "./schema.js";
import { setRuntimeAttachmentHandle } from "../attachments/openAttachment.js";

function isPathSegmentSafe(segment) {
  return Boolean(segment) && segment !== "." && segment !== "..";
}

export function isProjectImportSupported() {
  return typeof window !== "undefined" && typeof window.showDirectoryPicker === "function";
}

export function isSafeRelativeAttachmentPath(pathValue) {
  const raw = String(pathValue ?? "").trim().replaceAll("\\", "/");
  if (!raw) return false;
  if (raw.startsWith("/") || /^[a-zA-Z]:\//.test(raw)) return false;
  const segments = raw.split("/").map((part) => part.trim()).filter(Boolean);
  if (!segments.length) return false;
  return segments.every(isPathSegmentSafe);
}

export function bindProjectAttachmentRuntimeHandles(snapshot, projectRootHandle) {
  const warnings = [];
  const normalized = normalizeDocumentSnapshot(snapshot);
  const nodes = Array.isArray(normalized?.nodes) ? normalized.nodes : [];

  nodes.forEach((node) => {
    const entries = node?.data?.attachments?.entries;
    if (!Array.isArray(entries)) return;
    entries.forEach((entry) => {
      if (!entry || entry.kind !== "local-file" || !entry.id) return;
      if (!isSafeRelativeAttachmentPath(entry.path)) {
        warnings.push(`Attachment "${entry.label || entry.id}" blocked: invalid relative path.`);
        entry.url = null;
        entry.path = null;
        return;
      }
      setRuntimeAttachmentHandle(entry.id, projectRootHandle);
    });
  });

  return {
    snapshot: normalized,
    warnings,
  };
}

export async function importProjectFromDirectoryHandle(projectRootHandle) {
  const projectFileHandle = await projectRootHandle.getFileHandle("project.json", { create: false });
  const projectFile = await projectFileHandle.getFile();
  const projectText = await projectFile.text();
  const parsed = JSON.parse(projectText);
  return bindProjectAttachmentRuntimeHandles(parsed, projectRootHandle);
}

