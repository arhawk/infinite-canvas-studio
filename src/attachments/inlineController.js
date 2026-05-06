import {
  createEmptyAttachmentState,
} from "./model.js";
import { openAttachmentEntry } from "./openAttachment.js";
import {
  AttachmentActions,
  isFileSystemAccessSupported,
  isHttpUrl,
  supportsManualFileAttachments,
} from "./actions.js";

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

export class AttachmentsInlineController {
  constructor(app) {
    this.app = app;
    this.actions = new AttachmentActions(app);
    this.activeNode = null;
    this.inlineHostEl = null;
    this.inlineCleanup = null;
    this.statusTimeout = null;

    this.fileInputEl = document.createElement("input");
    this.fileInputEl.type = "file";
    this.fileInputEl.multiple = true;
    this.fileInputEl.hidden = true;
    this.fileInputEl.dataset.testid = "attachments-file-input";
    document.body.append(this.fileInputEl);

    this.fileInputEl.addEventListener("change", () => {
      void this.handleManualFileInputChange();
    });
  }

  destroy() {
    this.unmountInline();
    window.clearTimeout(this.statusTimeout);
    this.fileInputEl?.remove();
  }

  resolveAttachmentNode(target) {
    const selectable =
      target?.findAncestor?.(".selectable", true) ?? (target?.hasName?.("selectable") ? target : null);
    if (!selectable) return null;

    const component = this.app.components.getByNode(selectable);
    if (!component?.supportsAttachments?.(selectable)) return null;
    return selectable;
  }

  getAttachmentComponent(node = this.activeNode) {
    return this.actions.getAttachmentComponent(node);
  }

  getAttachmentState(node = this.activeNode) {
    return this.actions.getAttachmentState(node) ?? createEmptyAttachmentState();
  }

  updateAttachmentState(node, nextState) {
    this.actions.updateAttachmentState(node, nextState);
    this.syncInlinePanel();
  }

  mountInline(hostEl, node) {
    if (!(hostEl instanceof Element)) return;

    this.unmountInline();

    const resolvedNode = this.resolveAttachmentNode(node);
    if (!resolvedNode) {
      hostEl.replaceChildren();
      return;
    }

    this.inlineHostEl = hostEl;
    this.activeNode = resolvedNode;

    const onClick = (event) => this.handlePanelClick(event);
    const onDragOver = (event) => this.handleDragOver(event);
    const onDrop = (event) => {
      void this.handleDrop(event);
    };

    hostEl.addEventListener("click", onClick);
    hostEl.addEventListener("dragover", onDragOver);
    hostEl.addEventListener("drop", onDrop);

    this.inlineCleanup = () => {
      hostEl.removeEventListener("click", onClick);
      hostEl.removeEventListener("dragover", onDragOver);
      hostEl.removeEventListener("drop", onDrop);
    };

    this.syncInlinePanel();
  }

  unmountInline() {
    if (typeof this.inlineCleanup === "function") {
      this.inlineCleanup();
    }

    this.inlineCleanup = null;
    this.inlineHostEl = null;
    this.activeNode = null;
  }

  showStatus(message, tone = "info") {
    if (!this.inlineHostEl) return;

    window.clearTimeout(this.statusTimeout);
    const statusEl = this.inlineHostEl.querySelector("[data-role='attachments-status']");
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

  handlePanelClick(event) {
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
    }
  }

  buildPanelMarkup(node, state, {
    editable,
    supportsFsApi,
    supportsUploads,
  } = {}) {
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

    const canChooseFolder = editable && supportsFsApi && !state.directory;
    const canDisconnect = editable && Boolean(state.directory);
    const canPickFiles = editable && supportsUploads;

    return `
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
  }

  syncInlinePanel() {
    if (!this.inlineHostEl) return;

    const node = this.activeNode;
    const component = this.getAttachmentComponent(node);
    const editable = this.app.getMode() === "edit";

    if (!node || !component) {
      this.inlineHostEl.replaceChildren();
      return;
    }

    const state = this.getAttachmentState(node);
    const supportsFsApi = isFileSystemAccessSupported();
    const supportsUploads = supportsManualFileAttachments();

    const markup = this.buildPanelMarkup(node, state, {
      editable,
      supportsFsApi,
      supportsUploads,
    });

    this.inlineHostEl.innerHTML = `
      <section class="attachments-panel attachments-panel--embedded" data-testid="attachments-panel-embedded">
        ${markup}
      </section>
    `;
  }

  deleteAttachment(attachmentId) {
    const node = this.activeNode;
    if (!node || !attachmentId) return;

    const state = this.getAttachmentState(node);
    this.actions.deleteAttachment(node, attachmentId);
    this.showStatus("Attachment removed.");
  }

  disconnectDirectory() {
    const node = this.activeNode;
    if (!node) return;

    this.actions.disconnectDirectory(node);
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
      await this.actions.attachDirectoryToNode(node, directoryHandle);
      this.showStatus("Folder indexed.");
    } catch (error) {
      if (error?.name === "AbortError") return;
      console.error(error);
      this.showStatus("Failed to attach folder.", "error");
    }
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
    if (!this.activeNode) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
  }

  async handleDrop(event) {
    if (this.app.getMode() !== "edit" || this.app.getEditorTool() !== "arrange") return;
    if (!this.activeNode) return;

    event.preventDefault();
    const node = this.activeNode;
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
        await this.actions.attachDirectoryToNode(node, handle);
      } else if (handle.kind === "file") {
        await this.actions.attachFileHandleToNode(node, handle);
      }
    }

    if (!handled) {
        const droppedFiles = [...(event.dataTransfer?.files ?? [])].filter((file) => file instanceof File);
      if (droppedFiles.length) {
        await this.actions.attachUploadedFilesToNode(node, droppedFiles);
        handled = true;
      }
    }

    if (!handled) {
      const droppedUrl =
        event.dataTransfer?.getData("text/uri-list") ||
        event.dataTransfer?.getData("text/plain") ||
        "";
      if (isHttpUrl(droppedUrl)) {
        this.actions.attachUrlToNode(node, droppedUrl.trim());
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
    await openAttachmentEntry(entry, state, (message, tone) => this.showStatus(message, tone));
  }

  openFilePicker() {
    if (!this.activeNode || !this.fileInputEl) return;
    this.fileInputEl.value = "";
    this.fileInputEl.click();
  }

  async handleManualFileInputChange() {
    const node = this.activeNode;
    if (!node || !this.fileInputEl?.files?.length) return;

    const files = [...this.fileInputEl.files];
    try {
      await this.actions.attachUploadedFilesToNode(node, files);
      this.syncInlinePanel();
      this.showStatus("Attachment added.");
    } catch (error) {
      console.error(error);
      this.showStatus("Failed to add file attachment.", "error");
    } finally {
      this.fileInputEl.value = "";
    }
  }

  promptForUrl() {
    const node = this.activeNode;
    if (!node) return;

    const input = window.prompt("Enter a URL to attach", "https://");
    if (input == null) return;

    const trimmed = input.trim();
    if (!isHttpUrl(trimmed)) {
      this.showStatus("Please enter a valid http(s) URL.", "error");
      return;
    }

    this.actions.attachUrlToNode(node, trimmed);
    this.syncInlinePanel();
    this.showStatus("Attachment added.");
  }
}
