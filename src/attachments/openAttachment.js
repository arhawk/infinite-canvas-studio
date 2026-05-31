import { loadHandleRecord } from "./handleStore.js";
import { isHttpUrl } from "./actions.js";

const runtimeHandles = new Map();

export function setRuntimeAttachmentHandle(id, handle) {
  if (!id || !handle) return;
  runtimeHandles.set(id, handle);
}

export function getRuntimeAttachmentHandleById(id) {
  if (!id) return null;
  return runtimeHandles.get(id) ?? null;
}

function getRuntimeAttachmentHandle(entry) {
  if (!entry?.id) return null;
  return runtimeHandles.get(entry.id) ?? null;
}

function buildOriginalPath(entry, state) {
  const sourceName = entry?.sourceName || state?.directory?.name || state?.directory?.sourceName || null;
  const path = entry?.path || entry?.fileName || null;
  if (sourceName && path) return `${sourceName}/${path}`;
  return sourceName || path || "(unknown)";
}

function showOpenFailure(entry, state, reason, showStatus = () => {}) {
  const attemptedTarget = resolveAttachmentOpenTarget(entry) || entry?.label || "(none)";
  const detail = [
    `附件打开失败：${entry?.label || "Attachment"}`,
    `尝试访问目标: ${attemptedTarget}`,
    `原始路径: ${buildOriginalPath(entry, state)}`,
    `失败原因: ${reason}`,
  ].join("\n");
  showStatus(reason, "error");
  window.alert(detail);
}

function isOpenableProtocol(protocol) {
  return protocol === "http:" || protocol === "https:" || protocol === "file:";
}

function resolveAttachmentOpenTarget(entry) {
  const explicit = String(entry?.url ?? "").trim();
  if (explicit) {
    try {
      const parsed = new URL(explicit, window.location.href);
      if (isOpenableProtocol(parsed.protocol)) return explicit;
    } catch {
      return null;
    }
  }

  const fallbackPath = String(entry?.path || entry?.fileName || "").trim().replaceAll("\\", "/");
  if (!fallbackPath) return null;
  if (!explicit && entry?.path === "Attachment" && entry?.fileName === "Attachment") return null;
  const normalized = fallbackPath.replace(/^\.?\/*/, "");
  return normalized ? `./${normalized}` : null;
}

function getFileExtension(value) {
  const label = String(value ?? "").toLowerCase().trim();
  if (!label.includes(".")) return "";
  return label.split(".").pop() ?? "";
}

function isSafeRelativeAttachmentPath(pathValue) {
  const raw = String(pathValue ?? "").trim().replaceAll("\\", "/");
  if (!raw) return false;
  if (raw.startsWith("/") || /^[a-zA-Z]:\//.test(raw)) return false;
  const segments = raw.split("/").map((segment) => segment.trim()).filter(Boolean);
  if (!segments.length) return false;
  return segments.every((segment) => segment !== "." && segment !== "..");
}

function isTextLikeAttachment(entry, file = null) {
  const entryMimeType = String(entry?.mimeType ?? "").toLowerCase();
  const fileMimeType = String(file?.type ?? "").toLowerCase();
  const mimeType = fileMimeType || entryMimeType;

  if (mimeType === "text/html" || mimeType === "application/xhtml+xml") return false;
  if (mimeType.startsWith("text/")) return true;
  if (mimeType === "application/json") return true;

  const extension = getFileExtension(file?.name || entry?.fileName || entry?.label || entry?.path);
  return ["txt", "md", "csv", "log", "json", "yaml", "yml", "xml", "ini", "conf"].includes(extension);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function openBlobUrl(file) {
  const url = URL.createObjectURL(file);
  window.open(url, "_blank", "noopener,noreferrer");
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

async function openDecodedTextPreview(file) {
  const decoder = new TextDecoder("utf-8");
  const bytes = await file.arrayBuffer();
  const text = decoder.decode(bytes);
  const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Text Preview</title>
    <style>
      body { margin: 0; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; background: #fffdf8; color: #2f2419; }
      pre { margin: 0; padding: 14px; white-space: pre-wrap; word-break: break-word; line-height: 1.45; }
    </style>
  </head>
  <body>
    <pre>${escapeHtml(text)}</pre>
  </body>
</html>`;
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  openBlobUrl(blob);
}

async function ensureReadPermission(handle) {
  if (!handle?.queryPermission || !handle?.requestPermission) return true;

  const query = await handle.queryPermission({ mode: "read" });
  if (query === "granted") return true;

  const next = await handle.requestPermission({ mode: "read" });
  return next === "granted";
}

async function getEntryFileHandle(handle, relativePath) {
  if (!handle) return null;
  if (handle.kind === "file") return handle;

  const segments = String(relativePath ?? "")
    .split("/")
    .map((segment) => segment.trim())
    .filter(Boolean);

  if (!segments.length) return null;

  let current = handle;
  for (let index = 0; index < segments.length - 1; index += 1) {
    current = await current.getDirectoryHandle(segments[index]);
  }

  return current.getFileHandle(segments[segments.length - 1]);
}

export async function openAttachmentEntry(entry, state, showStatus = () => {}) {
  const directTarget = resolveAttachmentOpenTarget(entry);
  if (entry?.kind === "url" && directTarget && isHttpUrl(directTarget)) {
    window.open(directTarget, "_blank", "noopener,noreferrer");
    return true;
  }

  if (entry.kind !== "local-file") return false;

  try {
    const runtimeHandle = getRuntimeAttachmentHandle(entry);
    const record = runtimeHandle ? null : (entry.handleKey ? await loadHandleRecord(entry.handleKey) : null);
    const handle = runtimeHandle ?? record?.handle ?? null;

    if (!handle) {
      if (!state?.directory && directTarget) {
        window.open(directTarget, "_blank", "noopener,noreferrer");
        return true;
      }
      showOpenFailure(
        entry,
        state,
        "缺少可用本地对象。请重新 Load PROJ（或重新选择目录/文件）后再试。",
        showStatus,
      );
      return false;
    }

    if (handle instanceof File) {
      if (isTextLikeAttachment(entry, handle)) {
        try {
          await openDecodedTextPreview(handle);
          return true;
        } catch (error) {
          console.error(error);
          showStatus("Failed to decode text; opened raw file instead.", "error");
        }
      }
      openBlobUrl(handle);
      return true;
    }

    const granted = await ensureReadPermission(handle);
    if (!granted) {
      showOpenFailure(
        entry,
        state,
        "读取权限被拒绝。请重新 Load PROJ（或重新选择目录）后再试。",
        showStatus,
      );
      return false;
    }

    const targetPath = entry.path ?? entry.fileName;
    if (!isSafeRelativeAttachmentPath(targetPath)) {
      showOpenFailure(entry, state, "附件路径非法或越界，已拒绝访问。", showStatus);
      return false;
    }

    const fileHandle = await getEntryFileHandle(handle, targetPath);
    if (!fileHandle) {
      showOpenFailure(
        entry,
        state,
        "无法定位附件文件。请重新 Load PROJ（或重新选择目录）后再试。",
        showStatus,
      );
      return false;
    }
    const file = await fileHandle.getFile();
    if (isTextLikeAttachment(entry, file)) {
      try {
        await openDecodedTextPreview(file);
        return true;
      } catch (error) {
        console.error(error);
        showStatus("Failed to decode text; opened raw file instead.", "error");
      }
    }
    openBlobUrl(file);
    return true;
  } catch (error) {
    console.error(error);
    showOpenFailure(entry, state, error?.message || "Failed to open attachment.", showStatus);
    return false;
  }
}
