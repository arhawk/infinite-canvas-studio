import {
  appendAttachmentEntries,
  createEmptyAttachmentState,
  normalizeAttachmentEntry,
  replaceDirectoryEntries,
} from "./model.js";
import {
  saveHandleRecord,
  supportsHandlePersistence,
} from "./handleStore.js";

function createHandleKey(prefix = "attachment-handle") {
  if (typeof crypto?.randomUUID === "function") {
    return `${prefix}-${crypto.randomUUID()}`;
  }

  return `${prefix}-${Date.now()}-${Math.round(Math.random() * 1e6)}`;
}

export function isFileSystemAccessSupported() {
  return typeof window !== "undefined" && typeof window.showDirectoryPicker === "function";
}

export function supportsManualFileAttachments() {
  return typeof File !== "undefined";
}

export function isHttpUrl(value) {
  if (typeof value !== "string" || !value.trim()) return false;

  try {
    const parsed = new URL(value.trim());
    return ["http:", "https:"].includes(parsed.protocol);
  } catch {
    return false;
  }
}

async function collectDirectoryEntries(directoryHandle, parentPath = "") {
  const entries = [];

  for await (const [name, handle] of directoryHandle.entries()) {
    const nextPath = parentPath ? `${parentPath}/${name}` : name;

    if (handle.kind === "directory") {
      entries.push(...await collectDirectoryEntries(handle, nextPath));
      continue;
    }

    const file = await handle.getFile();
    entries.push(
      normalizeAttachmentEntry({
        kind: "local-file",
        sourceKind: "directory",
        label: file.name,
        fileName: file.name,
        path: nextPath,
        mimeType: file.type || null,
        size: file.size,
        sourceName: directoryHandle.name,
      }),
    );
  }

  return entries.sort((left, right) => left.path.localeCompare(right.path));
}

export class AttachmentActions {
  constructor(app) {
    this.app = app;
  }

  getAttachmentComponent(node) {
    if (!node) return null;
    const component = this.app.components.getByNode(node);
    if (!component?.supportsAttachments?.(node)) return null;
    return component;
  }

  getAttachmentState(node) {
    const component = this.getAttachmentComponent(node);
    return component?.getAttachmentState?.(node) ?? createEmptyAttachmentState();
  }

  updateAttachmentState(node, nextState, options = {}) {
    const component = this.getAttachmentComponent(node);
    if (!component) return false;

    if (options.emitEvents !== false) {
      this.app.events.emit("node:change:start", { node });
    }
    component.setAttachmentState(node, nextState);
    if (options.emitEvents !== false) {
      this.app.events.emit("node:changed", { node });
    }

    node.getLayer()?.batchDraw?.();
    return true;
  }

  disconnectDirectory(node) {
    const state = this.getAttachmentState(node);
    return this.updateAttachmentState(node, {
      directory: null,
      entries: state.entries.filter((entry) => entry.sourceKind !== "directory"),
    });
  }

  deleteAttachment(node, attachmentId) {
    if (!attachmentId) return false;
    const state = this.getAttachmentState(node);
    return this.updateAttachmentState(node, {
      directory: state.directory,
      entries: state.entries.filter((entry) => entry.id !== attachmentId),
    });
  }

  async attachDirectoryToNode(node, directoryHandle) {
    if (!supportsHandlePersistence()) {
      throw new Error("This browser cannot persist folder handles.");
    }

    const handleKey = createHandleKey("attachment-directory");
    await saveHandleRecord(handleKey, directoryHandle, {
      kind: "directory",
      name: directoryHandle.name,
    });

    const entries = await collectDirectoryEntries(directoryHandle);
    const nextEntries = entries.map((entry) => ({
      ...entry,
      handleKey,
      sourceKind: "directory",
      sourceName: directoryHandle.name,
    }));

    const nextState = replaceDirectoryEntries(
      this.getAttachmentState(node),
      {
        handleKey,
        name: directoryHandle.name,
      },
      nextEntries,
    );

    return this.updateAttachmentState(node, nextState);
  }

  async attachFileHandleToNode(node, fileHandle) {
    if (!supportsHandlePersistence()) {
      throw new Error("This browser cannot persist file handles.");
    }

    const file = await fileHandle.getFile();
    const handleKey = createHandleKey("attachment-file");

    await saveHandleRecord(handleKey, fileHandle, {
      kind: "file",
      name: file.name,
    });

    return this.updateAttachmentState(node, appendAttachmentEntries(this.getAttachmentState(node), [
      normalizeAttachmentEntry({
        kind: "local-file",
        sourceKind: "file",
        handleKey,
        label: file.name,
        fileName: file.name,
        path: file.name,
        mimeType: file.type || null,
        size: file.size,
        sourceName: file.name,
      }),
    ]));
  }

  async attachUploadedFilesToNode(node, files = []) {
    if (!supportsHandlePersistence()) {
      throw new Error("This browser cannot persist local file attachments.");
    }

    const nextEntries = [];
    for (const file of files) {
      if (!(file instanceof File)) continue;

      const handleKey = createHandleKey("attachment-upload");
      await saveHandleRecord(handleKey, file, {
        kind: "upload",
        name: file.name,
      });

      nextEntries.push(
        normalizeAttachmentEntry({
          kind: "local-file",
          sourceKind: "upload",
          handleKey,
          label: file.name,
          fileName: file.name,
          path: file.name,
          mimeType: file.type || null,
          size: file.size,
          sourceName: file.name,
        }),
      );
    }

    if (!nextEntries.length) return false;
    return this.updateAttachmentState(node, appendAttachmentEntries(this.getAttachmentState(node), nextEntries));
  }

  attachUrlToNode(node, url) {
    return this.updateAttachmentState(node, appendAttachmentEntries(this.getAttachmentState(node), [
      normalizeAttachmentEntry({
        kind: "url",
        sourceKind: "url",
        url,
      }),
    ]));
  }
}
