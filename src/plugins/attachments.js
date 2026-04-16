import { BasePlugin } from "../core/baseClasses.js";
import {
  appendAttachmentEntries,
  createEmptyAttachmentState,
  normalizeAttachmentEntry,
  replaceDirectoryEntries,
} from "../attachments/model.js";
import {
  loadHandleRecord,
  saveHandleRecord,
  supportsHandlePersistence,
} from "../attachments/handleStore.js";

function createHandleKey(prefix = "attachment-handle") {
  if (typeof crypto?.randomUUID === "function") {
    return `${prefix}-${crypto.randomUUID()}`;
  }

  return `${prefix}-${Date.now()}-${Math.round(Math.random() * 1e6)}`;
}

function isFileSystemAccessSupported() {
  return typeof window !== "undefined" && typeof window.showDirectoryPicker === "function";
}

function supportsManualFileAttachments() {
  return typeof File !== "undefined";
}

function isHttpUrl(value) {
  if (typeof value !== "string" || !value.trim()) return false;

  try {
    const parsed = new URL(value.trim());
    return ["http:", "https:"].includes(parsed.protocol);
  } catch {
    return false;
  }
}

function formatFileSize(size) {
  if (!Number.isFinite(size) || size <= 0) return "";
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  if (size < 1024 * 1024 * 1024) return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  return `${(size / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

function getComponentLabel(node) {
  return node?.findOne?.(".container-label")?.text?.() ?? "Attachments";
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

export class AttachmentsPlugin extends BasePlugin {
  static pluginId = "attachments";
  static modes = {
    presentation: {},
    edit: {
      tools: {
        arrange: {},
      },
    },
  };

  onSetup() {
    this.selectedNode = null;
    this.activeNode = null;
    this.statusTimeout = null;

    this.buildPanel();

    this.listen("selection:change", ({ nodes }) => {
      this.selectedNode = nodes?.length === 1 ? nodes[0] : null;
      if (!this.resolveAttachmentNode(this.selectedNode)) {
        this.closePanel();
      }
    });

    this.listen("document:load:start", () => {
      this.closePanel();
    });

    this.listen("interaction:change", () => {
      if (!this.isEnabled()) {
        this.closePanel();
        return;
      }
      this.syncPanel();
    });

    this.app.stage.on("click.attachments tap.attachments", (event) => {
      const node = this.resolveAttachmentNode(event.target);
      if (!node || node !== this.activeNode) {
        this.closePanel();
      }
    });
    this.app.stage.on("dblclick.attachments dbltap.attachments", (event) => {
      if (!this.isEnabled()) return;
      const button = event.evt?.button;
      if (button != null && button !== 0) return;
      this.openPanelFor(event.target);
    });
    this.listenDom(document, "mousedown", (event) => {
      if (this.panelEl?.hidden) return;
      if (this.panelEl?.contains(event.target)) return;
      this.closePanel();
    });

    const stageContainer = this.app.stage.container();
    this.listenDom(stageContainer, "dragover", (event) => this.handleDragOver(event));
    this.listenDom(stageContainer, "drop", (event) => {
      void this.handleDrop(event);
    });
    this.listenDom(this.panelEl, "dragover", (event) => this.handleDragOver(event));
    this.listenDom(this.panelEl, "drop", (event) => {
      void this.handleDrop(event);
    });
    this.listenDom(window, "dragover", (event) => this.handleGlobalDragOver(event));
    this.listenDom(window, "drop", (event) => this.handleGlobalDrop(event));

    this.cleanups.push(() => {
      this.app.stage.off(".attachments");
      window.clearTimeout(this.statusTimeout);
      this.fileInputEl?.remove();
      this.panelEl?.remove();
    });
  }

  buildPanel() {
    this.panelEl = document.createElement("aside");
    this.panelEl.className = "attachments-panel";
    this.panelEl.hidden = true;
    this.panelEl.style.display = "none";
    this.panelEl.dataset.testid = "attachments-panel";
    document.body.append(this.panelEl);

    this.fileInputEl = document.createElement("input");
    this.fileInputEl.type = "file";
    this.fileInputEl.multiple = true;
    this.fileInputEl.hidden = true;
    this.fileInputEl.dataset.testid = "attachments-file-input";
    document.body.append(this.fileInputEl);

    this.listenDom(this.panelEl, "click", (event) => {
      const elementTarget =
        event.target instanceof Element ? event.target : event.target?.parentElement ?? null;
      const target = elementTarget?.closest?.("button") ?? null;
      if (!target) return;

      const attachmentId = target.getAttribute("data-attachment-id");
      if (attachmentId) {
        const state = this.getAttachmentState();
        const entry = state.entries.find((candidate) => candidate.id === attachmentId);
        if (!entry) return;
        void this.openAttachment(entry, state);
        return;
      }

      const deleteAttachmentId = target.getAttribute("data-delete-attachment-id");
      if (deleteAttachmentId) {
        this.deleteAttachment(deleteAttachmentId);
        return;
      }

      if (target.getAttribute("data-action") === "pick-directory") {
        void this.pickDirectoryForActiveNode();
        return;
      }

      if (target.getAttribute("data-action") === "pick-files") {
        this.openFilePicker();
        return;
      }

      if (target.getAttribute("data-action") === "add-url") {
        this.promptForUrl();
        return;
      }

      if (target.getAttribute("data-action") === "disconnect-directory") {
        this.disconnectDirectory();
        return;
      }

      if (target.getAttribute("data-action") === "close-attachments") {
        this.closePanel();
      }
    });

    this.listenDom(this.fileInputEl, "change", () => {
      void this.handleManualFileInputChange();
    });
  }

  resolveAttachmentNode(target) {
    const selectable =
      target?.findAncestor?.(".selectable", true) ?? (target?.hasName?.("selectable") ? target : null);
    if (!selectable) return null;

    const component = this.app.components.getByNode(selectable);
    if (!component?.supportsAttachments?.(selectable)) return null;
    return selectable;
  }

  setActiveNode(node) {
    const nextNode = this.resolveAttachmentNode(node);
    this.activeNode = nextNode;
    this.syncPanel();
  }

  openPanelFor(node) {
    const nextNode = this.resolveAttachmentNode(node);
    if (!nextNode) {
      this.closePanel();
      return;
    }

    this.activeNode = nextNode;
    this.syncPanel();
  }

  getAttachmentComponent(node = this.activeNode) {
    if (!node) return null;
    const component = this.app.components.getByNode(node);
    if (!component?.supportsAttachments?.(node)) return null;
    return component;
  }

  getAttachmentState(node = this.activeNode) {
    const component = this.getAttachmentComponent(node);
    return component?.getAttachmentState?.(node) ?? createEmptyAttachmentState();
  }

  updateAttachmentState(node, nextState) {
    const component = this.getAttachmentComponent(node);
    if (!component) return;

    this.app.events.emit("node:change:start", { node });
    component.setAttachmentState(node, nextState);
    this.app.events.emit("node:changed", { node });
    node.getLayer()?.batchDraw();
    this.syncPanel();
  }

  showStatus(message, tone = "info") {
    if (!this.panelEl) return;

    window.clearTimeout(this.statusTimeout);
    const statusEl = this.panelEl.querySelector("[data-role='attachments-status']");
    if (!statusEl) return;

    statusEl.textContent = message;
    statusEl.dataset.tone = tone;
    statusEl.hidden = false;

    this.statusTimeout = window.setTimeout(() => {
      statusEl.hidden = true;
      statusEl.textContent = "";
      statusEl.dataset.tone = "info";
    }, 2200);
  }

  hidePanel() {
    if (this.panelEl) {
      this.panelEl.hidden = true;
      this.panelEl.style.display = "none";
    }
  }

  closePanel() {
    this.activeNode = null;
    this.hidePanel();
  }

  syncPanel() {
    const node = this.activeNode;
    const component = this.getAttachmentComponent(node);
    const editable = this.app.getMode() === "edit";

    if (!this.isEnabled() || !node || !component) {
      this.hidePanel();
      return;
    }

    const state = this.getAttachmentState(node);
    const supportsFsApi = isFileSystemAccessSupported();
    const supportsUploads = supportsManualFileAttachments();

    const entryMarkup = state.entries.length
      ? state.entries
          .map((entry) => {
            const metaBits = [];
            if (entry.kind === "local-file" && entry.path) metaBits.push(entry.path);
            if (entry.size) metaBits.push(formatFileSize(entry.size));
            if (entry.kind === "url" && entry.url) metaBits.push(entry.url);
            const unavailable =
              entry.kind === "local-file" &&
              entry.handleKey &&
              !supportsHandlePersistence();

            return `
              <li class="attachments-panel__item">
                <div class="attachments-panel__item-row">
                  <button
                    type="button"
                    class="attachments-panel__open"
                    data-attachment-id="${entry.id}"
                    ${unavailable ? "disabled" : ""}
                  >
                    <span class="attachments-panel__item-title">${entry.label}</span>
                    <span class="attachments-panel__item-meta">${metaBits.join(" · ")}</span>
                  </button>
                  <button
                    type="button"
                    class="attachments-panel__delete"
                    data-delete-attachment-id="${entry.id}"
                    aria-label="Delete attachment ${entry.label}"
                    title="Remove attachment"
                  >
                    ×
                  </button>
                </div>
              </li>
            `;
          })
          .join("")
      : `<li class="attachments-panel__empty">No attachments yet.</li>`;

    const canChooseFolder = editable && supportsFsApi;
    const canDisconnect = editable && Boolean(state.directory);
    const canPickFiles = editable && supportsUploads;

    this.panelEl.innerHTML = `
      <div class="attachments-panel__header">
        <div>
          <p class="attachments-panel__eyebrow">Attachments</p>
          <h2 class="attachments-panel__title">${getComponentLabel(node)}</h2>
        </div>
        <div class="attachments-panel__header-actions">
          ${canDisconnect ? `
            <button
              type="button"
              class="ghost-button attachments-panel__action"
              data-action="disconnect-directory"
            >
              Disconnect
            </button>
          ` : ""}
          ${canChooseFolder ? `
            <button
              type="button"
              class="ghost-button attachments-panel__action"
              data-action="pick-directory"
            >
              Choose Folder
            </button>
          ` : ""}
          ${canPickFiles ? `
            <button
              type="button"
              class="ghost-button attachments-panel__action"
              data-action="pick-files"
            >
              Add File
            </button>
          ` : ""}
          ${editable ? `
            <button
              type="button"
              class="ghost-button attachments-panel__action"
              data-action="add-url"
            >
              Add URL
            </button>
          ` : ""}
          <button
            type="button"
            class="ghost-button attachments-panel__action"
            data-action="close-attachments"
          >
            Close
          </button>
        </div>
      </div>
      <p class="attachments-panel__hint">
        ${
          editable
            ? "Drop a folder, file, or URL onto this page/container to attach it."
            : "Click an item to open it."
        }
      </p>
      <p
        class="attachments-panel__status"
        data-role="attachments-status"
        data-tone="info"
        hidden
      ></p>
      ${
        state.directory
          ? `<p class="attachments-panel__folder">Folder: ${state.directory.name}</p>`
          : ""
      }
      ${
        !supportsFsApi && editable
          ? `<p class="attachments-panel__warning">Folder access is Chromium-only. Safari can still use Add File and Add URL, but local files are browser-local attachments.</p>`
          : ""
      }
      <ul class="attachments-panel__list">${entryMarkup}</ul>
    `;

    this.panelEl.hidden = false;
    this.panelEl.style.display = "";
  }

  deleteAttachment(attachmentId) {
    const node = this.activeNode;
    if (!node || !attachmentId) return;

    const state = this.getAttachmentState(node);
    const nextEntries = state.entries.filter((entry) => entry.id !== attachmentId);
    this.updateAttachmentState(node, {
      directory: state.directory,
      entries: nextEntries,
    });
    this.showStatus("Attachment removed.");
  }

  disconnectDirectory() {
    const node = this.activeNode;
    if (!node) return;

    const state = this.getAttachmentState(node);
    const nextState = {
      directory: null,
      entries: state.entries.filter((entry) => entry.sourceKind !== "directory"),
    };
    this.updateAttachmentState(node, nextState);
    this.showStatus("Folder disconnected.");
  }

  async pickDirectoryForActiveNode() {
    const node = this.activeNode;
    if (!node) return;
    if (!isFileSystemAccessSupported()) {
      this.showStatus("Directory access is unavailable in this browser.", "error");
      return;
    }

    try {
      const directoryHandle = await window.showDirectoryPicker({ mode: "read" });
      await this.attachDirectoryToNode(node, directoryHandle);
      this.showStatus("Folder indexed.");
    } catch (error) {
      if (error?.name === "AbortError") return;
      console.error(error);
      this.showStatus("Failed to attach folder.", "error");
    }
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

    this.updateAttachmentState(node, nextState);
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

    const nextState = appendAttachmentEntries(this.getAttachmentState(node), [
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
    ]);

    this.updateAttachmentState(node, nextState);
  }

  async attachUploadedFilesToNode(node, files = []) {
    if (!supportsHandlePersistence()) {
      throw new Error("This browser cannot persist local file attachments.");
    }

    // Safari fallback stores picked File objects in IndexedDB. They reopen in
    // the same browser, but they are not equivalent to Chromium directory handles.
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

    if (!nextEntries.length) return;

    this.updateAttachmentState(node, appendAttachmentEntries(this.getAttachmentState(node), nextEntries));
  }

  attachUrlToNode(node, url) {
    const nextState = appendAttachmentEntries(this.getAttachmentState(node), [
      normalizeAttachmentEntry({
        kind: "url",
        sourceKind: "url",
        url,
      }),
    ]);

    this.updateAttachmentState(node, nextState);
  }

  resolveDropNode(event) {
    const stage = this.app.stage;
    stage.setPointersPositions(event);
    const pointer = stage.getPointerPosition();
    const intersection = pointer ? stage.getIntersection(pointer) : null;
    return (
      this.resolveAttachmentNode(intersection) ??
      this.resolveAttachmentNode(this.activeNode) ??
      this.resolveAttachmentNode(this.selectedNode)
    );
  }

  hasDroppableData(event) {
    const types = [...(event.dataTransfer?.types ?? [])];
    return (
      event.dataTransfer?.items?.length > 0 ||
      types.includes("Files") ||
      types.includes("text/plain") ||
      types.includes("text/uri-list")
    );
  }

  handleDragOver(event) {
    if (this.app.getMode() !== "edit" || this.app.getEditorTool() !== "arrange") return;
    if (!this.hasDroppableData(event)) return;
    const node = this.resolveDropNode(event);
    if (!node) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
  }

  handleGlobalDragOver(event) {
    if (this.app.getMode() !== "edit" || this.app.getEditorTool() !== "arrange") return;
    if (!this.hasDroppableData(event)) return;
    if (!this.resolveDropNode(event)) return;
    event.preventDefault();
  }

  async handleGlobalDrop(event) {
    if (this.app.getMode() !== "edit" || this.app.getEditorTool() !== "arrange") return;
    if (!this.hasDroppableData(event)) return;
    if (!this.resolveDropNode(event)) return;
    event.preventDefault();
  }

  async handleDrop(event) {
    if (this.app.getMode() !== "edit" || this.app.getEditorTool() !== "arrange") return;

    const node = this.resolveDropNode(event);
    if (!node) return;

    event.preventDefault();
    this.setActiveNode(node);

    const items = [...(event.dataTransfer?.items ?? [])];
    let handled = false;

    for (const item of items) {
      if (typeof item.getAsFileSystemHandle !== "function") {
        continue;
      }

      const handle = await item.getAsFileSystemHandle();
      if (!handle) continue;

      handled = true;
      if (handle.kind === "directory") {
        await this.attachDirectoryToNode(node, handle);
      } else if (handle.kind === "file") {
        await this.attachFileHandleToNode(node, handle);
      }
    }

    if (!handled) {
      const droppedFiles = [...(event.dataTransfer?.files ?? [])].filter((file) => file instanceof File);
      if (droppedFiles.length) {
        await this.attachUploadedFilesToNode(node, droppedFiles);
        handled = true;
      }
    }

    if (!handled) {
      const droppedUrl =
        event.dataTransfer?.getData("text/uri-list") ||
        event.dataTransfer?.getData("text/plain") ||
        "";
      if (isHttpUrl(droppedUrl)) {
        this.attachUrlToNode(node, droppedUrl.trim());
        handled = true;
      }
    }

    if (!handled) {
      this.showStatus("Drop a file, folder, or URL onto a page/container.", "error");
      return;
    }

    this.showStatus("Attachment added.");
  }

  async openAttachment(entry, state) {
    if (entry.kind === "url" && entry.url) {
      window.open(entry.url, "_blank", "noopener,noreferrer");
      return;
    }

    if (entry.kind !== "local-file") return;

    try {
      const record = entry.handleKey ? await loadHandleRecord(entry.handleKey) : null;
      const handle = record?.handle ?? null;

      if (!handle) {
        this.showStatus(
          state.directory
            ? "Local file handle missing. Reconnect the folder to reopen files."
            : "Local file handle missing in this browser.",
          "error",
        );
        return;
      }

      // Browser-local uploaded files are stored as File objects, while
      // Chromium directory/file attachments reopen through file-system handles.
      if (handle instanceof File) {
        const url = URL.createObjectURL(handle);
        window.open(url, "_blank", "noopener,noreferrer");
        window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
        return;
      }

      const granted = await ensureReadPermission(handle);
      if (!granted) {
        this.showStatus("Permission to read this file was denied.", "error");
        return;
      }

      const fileHandle = await getEntryFileHandle(handle, entry.path ?? entry.fileName);
      const file = await fileHandle.getFile();
      const url = URL.createObjectURL(file);
      window.open(url, "_blank", "noopener,noreferrer");
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (error) {
      console.error(error);
      this.showStatus("Failed to open attachment.", "error");
    }
  }

  openFilePicker() {
    if (!this.activeNode || !this.fileInputEl) return;
    this.fileInputEl.value = "";
    this.fileInputEl.click();
  }

  async handleManualFileInputChange() {
    const node = this.activeNode;
    const files = [...(this.fileInputEl?.files ?? [])];
    if (!node || !files.length) return;

    try {
      await this.attachUploadedFilesToNode(node, files);
      this.showStatus(files.length === 1 ? "File attached." : "Files attached.");
    } catch (error) {
      console.error(error);
      this.showStatus("Failed to attach files.", "error");
    } finally {
      if (this.fileInputEl) {
        this.fileInputEl.value = "";
      }
    }
  }

  promptForUrl() {
    const node = this.activeNode;
    if (!node) return;

    const value = window.prompt("Enter an http(s) URL to attach:");
    if (value == null) return;

    const url = value.trim();
    if (!isHttpUrl(url)) {
      this.showStatus("Please enter a valid http(s) URL.", "error");
      return;
    }

    this.attachUrlToNode(node, url);
    this.showStatus("URL attached.");
  }
}
