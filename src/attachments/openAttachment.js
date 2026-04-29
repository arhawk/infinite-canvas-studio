import { loadHandleRecord } from "./handleStore.js";

function getFileExtension(value) {
  const label = String(value ?? "").toLowerCase().trim();
  if (!label.includes(".")) return "";
  return label.split(".").pop() ?? "";
}

function isTextLikeAttachment(entry, file = null) {
  const entryMimeType = String(entry?.mimeType ?? "").toLowerCase();
  const fileMimeType = String(file?.type ?? "").toLowerCase();
  const mimeType = fileMimeType || entryMimeType;

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
  if (entry.kind === "url" && entry.url) {
    window.open(entry.url, "_blank", "noopener,noreferrer");
    return true;
  }

  if (entry.kind !== "local-file") return false;

  try {
    const record = entry.handleKey ? await loadHandleRecord(entry.handleKey) : null;
    const handle = record?.handle ?? null;

    if (!handle) {
      showStatus(
        state.directory
          ? "Local file handle missing. Reconnect the folder to reopen files."
          : "Local file handle missing in this browser.",
        "error",
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
      showStatus("Permission to read this file was denied.", "error");
      return false;
    }

    const fileHandle = await getEntryFileHandle(handle, entry.path ?? entry.fileName);
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
    showStatus("Failed to open attachment.", "error");
    return false;
  }
}
