import { BasePlugin } from "../core/baseClasses.js";
import { Konva } from "../lib/konva.js";
import { DISPLAY_FONT_FAMILY } from "../lib/fonts.js";
import { createEmptyAttachmentState } from "../attachments/model.js";
import { openAttachmentEntry } from "../attachments/openAttachment.js";

const BOOKMARK_WIDTH = 112;
const BOOKMARK_ITEM_HEIGHT = 22;
const BOOKMARK_ITEM_GAP = 6;
const BOOKMARK_OFFSET_X = -1;
const BOOKMARK_OFFSET_Y = 40;
const BOOKMARK_FONT_SIZE = 11;

const BOOKMARK_COLORS = {
  url: "#0284c7",
  image: "#16a34a",
  video: "#dc2626",
  document: "#d97706",
  other: "#475569",
};

function getAttachmentCategory(entry) {
  if (!entry) return "other";
  if (entry.kind === "url") return "url";

  const mimeType = String(entry.mimeType ?? "").toLowerCase();
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType.startsWith("video/")) return "video";

  const name = String(entry.fileName ?? entry.label ?? entry.path ?? "").toLowerCase();
  const extension = name.includes(".") ? name.split(".").pop() : "";
  if (["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp", "avif", "heic"].includes(extension)) {
    return "image";
  }
  if (["mp4", "mov", "m4v", "webm", "avi", "mkv", "wmv"].includes(extension)) {
    return "video";
  }
  if (["pdf", "doc", "docx", "ppt", "pptx", "xls", "xlsx", "txt", "md", "csv"].includes(extension)) {
    return "document";
  }

  return "other";
}

function toCompactBookmarkLabel(value) {
  const label = String(value ?? "").trim();
  if (!label) return "Attachment";
  if (label.length <= 16) return label;
  return `${label.slice(0, 13)}...`;
}

export class AttachmentsBookmarksPlugin extends BasePlugin {
  static pluginId = "attachments-bookmarks";
  static modes = {
    edit: {},
    presentation: {},
  };

  onSetup() {
    this.selectedNode = null;
    this.bookmarkAnchorNode = null;
    this.positionRafId = null;
    this.pendingPositionNode = null;
    this.bookmarkGroup = new Konva.Group({
      visible: false,
      listening: true,
      name: "attachments-bookmarks-group",
    });
    this.app.uiLayer.add(this.bookmarkGroup);

    this.listen("selection:change", ({ nodes }) => {
      this.selectedNode = nodes?.length === 1 ? nodes[0] : null;
      this.syncBookmarks();
    });
    this.listen("viewport:change", () => this.syncBookmarks());
    this.listen("interaction:change", () => this.syncBookmarks());
    this.listen("node:changing", ({ node }) => {
      if (!node || !this.bookmarkGroup.visible()) return;
      if (node !== this.getPageBookmarkNode()) return;
      this.queueBookmarkPosition(node);
    });
    this.listen("node:changed", ({ node }) => {
      if (!node) return;
      if (node === this.selectedNode || node === this.bookmarkAnchorNode) this.syncBookmarks();
    });
    this.listen("node:removed", ({ node }) => {
      if (!node) return;
      if (node === this.bookmarkAnchorNode) this.bookmarkAnchorNode = null;
      if (node === this.selectedNode) this.selectedNode = null;
      this.syncBookmarks();
    });
    this.listen("document:load:start", () => {
      this.bookmarkAnchorNode = null;
      this.clearBookmarks();
    });

    this.app.stage.on("click.attachmentsBookmarks tap.attachmentsBookmarks", (event) => {
      this.syncBookmarkAnchorFromTarget(event.target);
    });
    this.app.stage.on("dblclick.attachmentsBookmarks dbltap.attachmentsBookmarks", (event) => {
      this.syncBookmarkAnchorFromTarget(event.target);
    });

    this.cleanups.push(() => {
      if (this.positionRafId != null) {
        window.cancelAnimationFrame(this.positionRafId);
        this.positionRafId = null;
      }
      this.app.stage.off(".attachmentsBookmarks");
      this.bookmarkGroup.destroy();
      this.app.uiLayer.batchDraw();
    });
  }

  clearBookmarks() {
    if (this.positionRafId != null) {
      window.cancelAnimationFrame(this.positionRafId);
      this.positionRafId = null;
    }
    this.pendingPositionNode = null;
    this.bookmarkGroup.destroyChildren();
    this.bookmarkGroup.visible(false);
    this.app.uiLayer.batchDraw();
  }

  updateBookmarkPosition(node) {
    if (!node?.getStage?.()) return;
    const bounds = node.getClientRect({ relativeTo: this.app.stage, skipShadow: true });
    const topRight = {
      x: bounds.x + bounds.width,
      y: bounds.y,
    };
    this.bookmarkGroup.position({
      x: topRight.x + BOOKMARK_OFFSET_X,
      y: topRight.y + BOOKMARK_OFFSET_Y,
    });
  }

  queueBookmarkPosition(node) {
    this.pendingPositionNode = node;
    if (this.positionRafId != null) return;
    this.positionRafId = window.requestAnimationFrame(() => {
      this.positionRafId = null;
      const nextNode = this.pendingPositionNode;
      this.pendingPositionNode = null;
      if (!nextNode || !this.bookmarkGroup.visible()) return;
      this.updateBookmarkPosition(nextNode);
      this.app.uiLayer.batchDraw();
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

  getAttachmentState(node) {
    const component = this.app.components.getByNode(node);
    if (!component?.supportsAttachments?.(node)) return createEmptyAttachmentState();
    return component.getAttachmentState?.(node) ?? createEmptyAttachmentState();
  }

  getPageBookmarkNode() {
    const mode = this.app.getMode();
    let node = null;

    if (mode === "presentation") {
      const anchored = this.resolveAttachmentNode(this.bookmarkAnchorNode);
      const fallback = this.resolveAttachmentNode(this.selectedNode);
      node = anchored ?? fallback;
    } else if (mode === "edit") {
      node = this.resolveAttachmentNode(this.selectedNode);
    } else {
      return null;
    }

    if (!node) return null;
    if (node.getAttr("componentType") !== "page") return null;
    const state = this.getAttachmentState(node);
    if (!state.entries.length) return null;
    return node;
  }

  syncBookmarkAnchorFromTarget(target) {
    if (this.app.getMode() !== "presentation") {
      return;
    }

    const node = this.resolveAttachmentNode(target);
    if (node?.getAttr("componentType") === "page") {
      this.bookmarkAnchorNode = node;
    } else {
      this.bookmarkAnchorNode = null;
    }
    this.syncBookmarks();
  }

  buildBookmarkNode(entry, index, node) {
    const category = getAttachmentCategory(entry);
    const color = BOOKMARK_COLORS[category] ?? BOOKMARK_COLORS.other;
    const fullLabel = entry.label || entry.fileName || entry.path || entry.url || "Attachment";
    const compactLabel = toCompactBookmarkLabel(fullLabel);
    const y = index * (BOOKMARK_ITEM_HEIGHT + BOOKMARK_ITEM_GAP);

    const itemGroup = new Konva.Group({
      x: 0,
      y,
      listening: true,
      name: "attachments-bookmark-item",
    });

    const background = new Konva.Rect({
      x: 0,
      y: 0,
      width: BOOKMARK_WIDTH,
      height: BOOKMARK_ITEM_HEIGHT,
      cornerRadius: [0, 8, 8, 0],
      fill: "rgba(255, 253, 248, 0.88)",
      stroke: "rgba(31, 27, 22, 0.15)",
      strokeWidth: 1,
    });

    const accent = new Konva.Rect({
      x: 0,
      y: 0,
      width: 6,
      height: BOOKMARK_ITEM_HEIGHT,
      fill: color,
      listening: false,
    });

    const text = new Konva.Text({
      x: 8,
      y: 4,
      width: BOOKMARK_WIDTH - 12,
      height: BOOKMARK_ITEM_HEIGHT - 8,
      text: compactLabel,
      fontSize: BOOKMARK_FONT_SIZE,
      fontFamily: DISPLAY_FONT_FAMILY,
      fontStyle: "600",
      fill: "#2f2419",
      ellipsis: true,
      wrap: "none",
      listening: false,
    });

    const setHoverState = (hovered) => {
      if (hovered) this.app.setCursorOverride("pointer");
      else this.app.clearCursorOverride();
      background.opacity(hovered ? 1 : 0.88);
      this.app.uiLayer.batchDraw();
    };

    itemGroup.on("mouseenter", () => setHoverState(true));
    itemGroup.on("mouseleave", () => setHoverState(false));
    itemGroup.on("mousedown touchstart", (event) => {
      event.cancelBubble = true;
    });
    itemGroup.on("click tap", (event) => {
      event.cancelBubble = true;
      const state = this.getAttachmentState(node);
      const targetEntry = state.entries.find((candidate) => candidate.id === entry.id);
      if (!targetEntry) return;
      void openAttachmentEntry(targetEntry, state);
    });

    itemGroup.add(background, accent, text);
    return itemGroup;
  }

  syncBookmarks() {
    const node = this.getPageBookmarkNode();
    if (!node) {
      this.clearBookmarks();
      return;
    }

    const state = this.getAttachmentState(node);

    this.bookmarkGroup.destroyChildren();
    this.updateBookmarkPosition(node);

    state.entries.forEach((entry, index) => {
      this.bookmarkGroup.add(this.buildBookmarkNode(entry, index, node));
    });

    this.bookmarkGroup.visible(state.entries.length > 0);
    this.app.uiLayer.batchDraw();
  }
}
