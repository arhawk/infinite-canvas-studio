import QRCode from "qrcode";
import { BasePlugin } from "../core/baseClasses.js";
import { COLLAB_MESSAGE_TYPES } from "../collaboration/ops.js";
import { CollaborationSync } from "../collaboration/sync.js";
import { createRoom, createHostClient } from "../online/roomHost.js";
import { getRoomIdFromPath, getShareUrl } from "../online/roomRoute.js";
import { createViewerClient } from "../online/roomViewer.js";

const VIEW_MODE_HOST = "host";
const VIEW_MODE_VIEWER = "viewer";
const VIEWPORT_THROTTLE_MS = 80;
const ROOM_READY_TIMEOUT_MS = 4000;
const ROOM_VIEWER_LOCK_REASON = "room-viewer";

function clonePlainData(value) {
  if (value == null) return value;
  return JSON.parse(JSON.stringify(value));
}

function normalizeViewportPayload(payload = {}) {
  const scale = Number(payload.scale);
  const position = payload.position ?? {};
  if (!Number.isFinite(scale) || !Number.isFinite(position.x) || !Number.isFinite(position.y)) {
    return null;
  }
  return {
    scale,
    position: {
      x: position.x,
      y: position.y,
    },
  };
}

function isFileProtocolLocation(locationRef = window.location) {
  return locationRef?.protocol === "file:";
}

function createEditorToken() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `editor-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export class RoomSharePlugin extends BasePlugin {
  static pluginId = "room-share";

  onSetup() {
    const {
      shareEl = null,
      loadEl = null,
      modeCapsuleEditEl = null,
      modeCapsulePresentEl = null,
    } = this.options;

    this.ui = {
      shareEl,
      loadEl,
      modeCapsuleEditEl,
      modeCapsulePresentEl,
    };
    this.shareDisabled = isFileProtocolLocation();
    this.host = {
      client: null,
      roomId: null,
      shareUrl: null,
      connected: false,
      lastViewportPayload: null,
      pendingViewportTimer: null,
      viewerCount: 0,
      creating: false,
      viewers: new Map(),
      coEditors: new Map(),
    };
    this.viewer = {
      client: null,
      roomId: null,
      viewerId: null,
      joined: false,
      isCoEditor: false,
      editorToken: null,
      viewMode: VIEW_MODE_HOST,
      latestHostViewport: null,
      applyingRemoteViewport: false,
      closedByServer: false,
      receivedState: false,
      connectionFailed: false,
      readyTimer: null,
      autoJoinTimer: null,
      waitingLayer: null,
      compareStatePending: false,
    };

    this.collaboration = new CollaborationSync(this.app, {
      getRevision: () => this.app.documentManager?.getCollaborationRevision?.() ?? 0,
      setRevision: (revision) => this.app.documentManager?.setCollaborationRevision?.(revision),
      advanceRevision: () => this.app.documentManager?.advanceCollaborationRevision?.() ?? 0,
      isHost: () => Boolean(this.host.connected && !this.viewer.client),
      isCoEditor: () => Boolean(this.viewer.isCoEditor),
      getConnectionId: () => this.viewer.viewerId ?? this.host.client?.connectionId ?? null,
      sendPatch: (payload) => this.host.client?.send("room:patch", payload),
      sendCoEditorOp: (payload) => this.viewer.client?.send(COLLAB_MESSAGE_TYPES.OP, payload),
      sendFullState: () => this.sendHostState(),
      getCompareState: () => this.app.getPlugin?.("page-compare")?.exportRoomCompareState?.() ?? null,
      shouldIncludeCompareState: () => this.viewer.compareStatePending || this.host.compareStatePending,
      consumeCompareStateFlag: () => {
        this.viewer.compareStatePending = false;
        this.host.compareStatePending = false;
      },
    });
    this.host.compareStatePending = false;
    this.collaboration.start();

    this.app.roomShare = this;
    this.buildSharePopover();
    this.buildViewerPasswordPrompt();
    this.buildRoomBadge();

    if (shareEl) {
      this.listenDom(shareEl, "click", (event) => {
        event.preventDefault();
        if (this.shareDisabled) return;
        this.toggleSharePopover();
      });
    }

    this.installViewerModeToggle();
    this.installViewerKeyGuards();
    this.installHostEventRelays();
    this.syncViewerUi();

    this.cleanups.push(() => {
      this.clearViewerReadyTimer();
      this.clearViewerAutoJoinTimer();
      this.collaboration.destroy();
      this.revokeCoEditorAccess();
      this.app.unlockPresentationMode?.(ROOM_VIEWER_LOCK_REASON);
      this.host.client?.close();
      this.viewer.client?.close();
      this.sharePopoverEl?.remove();
      this.passwordPromptEl?.remove();
      this.roomBadgeEl?.remove();
      if (this.app.roomShare === this) {
        this.app.roomShare = null;
      }
    });
  }

  getRouteRoomId() {
    return getRoomIdFromPath();
  }

  isRoomViewerClient() {
    return Boolean(this.viewer.client);
  }

  isCoEditorClient() {
    return Boolean(this.viewer.client && this.viewer.isCoEditor);
  }

  isRoomReadOnlyClient() {
    return this.isRoomViewerClient() && !this.isCoEditorClient();
  }

  canRoomClientEdit() {
    return this.isCoEditorClient();
  }

  adoptViewerWaitingLayer(layer) {
    if (!layer) return;
    this.viewer.waitingLayer?.hide?.();
    this.viewer.waitingLayer = layer;
  }

  buildSharePopover() {
    const popover = document.createElement("section");
    popover.className = "room-share-popover";
    popover.hidden = true;
    popover.dataset.testid = "room-share-popover";
    popover.innerHTML = `
      <form class="room-share-popover__form" data-room-share-form>
        <label class="room-share-popover__field">
          <span>Room password</span>
          <input
            type="password"
            autocomplete="new-password"
            data-testid="room-share-password"
            data-room-share-password
            placeholder="Blank for no password"
          />
        </label>
        <button type="submit" class="room-share-popover__primary" data-testid="room-share-create">
          Create room
        </button>
        <p
          class="room-share-popover__status"
          aria-live="polite"
          data-room-share-status
          data-testid="room-share-status"
        ></p>
      </form>
      <div class="room-share-popover__result" data-room-share-result hidden>
        <canvas width="144" height="144" aria-label="Room QR code" data-room-share-qr data-testid="room-share-qr"></canvas>
        <a href="#" target="_blank" rel="noreferrer" data-room-share-link data-testid="room-share-link"></a>
        <div class="room-share-popover__coeditors" data-room-coeditors hidden>
          <p class="room-share-popover__coeditors-title">Co-editors</p>
          <ul class="room-share-popover__viewer-list" data-room-viewer-list data-testid="room-viewer-list"></ul>
        </div>
      </div>
    `;
    document.body.append(popover);
    this.sharePopoverEl = popover;
    this.shareFormEl = popover.querySelector("[data-room-share-form]");
    this.sharePasswordEl = popover.querySelector("[data-room-share-password]");
    this.shareCreateButtonEl = popover.querySelector("[data-testid='room-share-create']");
    this.shareResultEl = popover.querySelector("[data-room-share-result]");
    this.shareLinkEl = popover.querySelector("[data-room-share-link]");
    this.shareQrEl = popover.querySelector("[data-room-share-qr]");
    this.shareStatusEl = popover.querySelector("[data-room-share-status]");
    this.shareCoeditorsEl = popover.querySelector("[data-room-coeditors]");
    this.shareViewerListEl = popover.querySelector("[data-room-viewer-list]");

    this.listenDom(this.shareFormEl, "submit", (event) => {
      event.preventDefault();
      void this.createAndShareRoom();
    });
    this.listenDom(window, "pointerdown", (event) => {
      if (popover.hidden) return;
      if (popover.contains(event.target) || this.ui.shareEl?.contains(event.target)) return;
      this.closeSharePopover();
    }, true);
  }

  buildViewerPasswordPrompt() {
    const prompt = document.createElement("section");
    prompt.className = "room-password-prompt";
    prompt.hidden = true;
    prompt.dataset.testid = "room-password-prompt";
    prompt.innerHTML = `
      <form class="room-password-prompt__panel" data-room-password-form>
        <h2>Room password</h2>
        <input
          type="password"
          autocomplete="current-password"
          data-room-password-input
          data-testid="room-password-input"
        />
        <button type="submit" data-testid="room-password-submit">Join</button>
        <p data-room-password-status></p>
      </form>
    `;
    document.body.append(prompt);
    this.passwordPromptEl = prompt;
    this.passwordFormEl = prompt.querySelector("[data-room-password-form]");
    this.passwordInputEl = prompt.querySelector("[data-room-password-input]");
    this.passwordStatusEl = prompt.querySelector("[data-room-password-status]");
    this.listenDom(this.passwordFormEl, "submit", (event) => {
      event.preventDefault();
      this.submitViewerJoin(this.passwordInputEl?.value ?? "");
    });
  }

  buildRoomBadge() {
    const badge = document.createElement("div");
    badge.className = "room-status-badge";
    badge.hidden = true;
    badge.dataset.testid = "room-status-badge";
    document.body.append(badge);
    this.roomBadgeEl = badge;
  }

  openSharePopover() {
    if (!this.sharePopoverEl || !this.ui.shareEl) return;
    if (this.shareDisabled) return;
    this.sharePopoverEl.hidden = false;
    this.positionSharePopover();
    this.sharePasswordEl?.focus();
  }

  closeSharePopover() {
    if (this.sharePopoverEl) this.sharePopoverEl.hidden = true;
  }

  toggleSharePopover() {
    if (!this.sharePopoverEl) return;
    if (this.shareDisabled) return;
    if (this.sharePopoverEl.hidden) {
      this.openSharePopover();
    } else {
      this.closeSharePopover();
    }
  }

  positionSharePopover() {
    if (!this.sharePopoverEl || !this.ui.shareEl) return;
    const rect = this.ui.shareEl.getBoundingClientRect();
    const popoverRect = this.sharePopoverEl.getBoundingClientRect();
    const gutter = 10;
    const left = Math.min(window.innerWidth - popoverRect.width - gutter, Math.max(gutter, rect.right - popoverRect.width));
    const top = Math.min(window.innerHeight - popoverRect.height - gutter, rect.bottom + 8);
    this.sharePopoverEl.style.left = `${left}px`;
    this.sharePopoverEl.style.top = `${Math.max(gutter, top)}px`;
  }

  async createAndShareRoom() {
    if (this.host.creating) return;
    this.setShareCreating(true);
    this.setShareStatus("Creating room...");
    const password = this.sharePasswordEl?.value ?? "";
    try {
      const room = await createRoom({ password });
      this.host.roomId = room.roomId;
      this.host.shareUrl = getShareUrl(room.roomId);
      await this.connectHost(room);
      await this.renderShareResult(room);
    } catch (error) {
      console.error(error);
      this.setShareStatus(error instanceof Error ? error.message : "Failed to create room.", true);
    } finally {
      this.setShareCreating(false);
    }
  }

  async renderShareResult(room) {
    if (!this.shareResultEl || !this.shareLinkEl || !this.shareQrEl) return;
    const shareUrl = this.host.shareUrl ?? getShareUrl(room.roomId);
    if (this.shareFormEl) this.shareFormEl.hidden = true;
    this.shareResultEl.hidden = false;
    if (this.shareCoeditorsEl) this.shareCoeditorsEl.hidden = false;
    this.shareLinkEl.href = shareUrl;
    this.shareLinkEl.textContent = shareUrl;
    await QRCode.toCanvas(this.shareQrEl, shareUrl, {
      width: 144,
      margin: 1,
      errorCorrectionLevel: "M",
    });
    this.renderHostViewerList();
    this.positionSharePopover();
  }

  setShareStatus(message, isError = false) {
    if (!this.shareStatusEl) return;
    this.shareStatusEl.textContent = message;
    this.shareStatusEl.classList.toggle("room-share-popover__status--error", isError);
  }

  setShareCreating(isCreating) {
    this.host.creating = Boolean(isCreating);
    if (!this.shareCreateButtonEl) return;
    this.shareCreateButtonEl.disabled = this.host.creating;
    this.shareCreateButtonEl.textContent = this.host.creating ? "Creating..." : "Create room";
    this.shareCreateButtonEl.setAttribute("aria-busy", String(this.host.creating));
  }

  connectHost(room) {
    this.host.client?.close();
    const client = createHostClient(room.roomId);
    this.host.client = client;
    this.host.connected = false;
    this.host.viewers = new Map();
    this.host.coEditors = new Map();

    client.on("open", () => {
      client.send("host:join", { hostToken: room.hostToken });
    });
    client.on("host:joined", () => {
      this.host.connected = true;
      this.app.events.emit("room:share:change");
      void this.sendHostState();
      this.flushHostViewport();
    });
    client.on("viewer:joined", ({ viewerId }) => {
      if (typeof viewerId === "string" && viewerId) {
        this.host.viewers.set(viewerId, { viewerId, coEditor: false });
      }
      this.renderHostViewerList();
      void this.sendHostState();
      window.setTimeout(() => {
        this.app.events.emit("room:viewer:joined");
      }, 0);
    });
    client.on("viewer:left", ({ viewerId }) => {
      if (typeof viewerId === "string") {
        this.host.coEditors.delete(viewerId);
        this.host.viewers.delete(viewerId);
      }
      this.renderHostViewerList();
    });
    client.on(COLLAB_MESSAGE_TYPES.OP, (payload) => {
      void this.handleHostCoEditorOp(payload);
    });
    client.on("room:viewers", ({ count }) => {
      this.host.viewerCount = Number.isFinite(count) ? count : 0;
      this.updateRoomBadge();
    });
    client.on("room:error", ({ message }) => {
      this.setShareStatus(message || "Room error.", true);
    });
    client.on("close", () => {
      this.host.connected = false;
      this.app.events.emit("room:share:change");
      this.updateRoomBadge();
    });
    client.connect();
  }

  renderHostViewerList() {
    if (!this.shareViewerListEl) return;
    this.shareViewerListEl.innerHTML = "";

    if (!this.host.viewers.size) {
      const empty = document.createElement("li");
      empty.className = "room-share-popover__viewer-empty";
      empty.textContent = "No viewers connected yet.";
      this.shareViewerListEl.append(empty);
      return;
    }

    for (const viewer of this.host.viewers.values()) {
      const item = document.createElement("li");
      item.className = "room-share-popover__viewer-item";
      item.dataset.testid = "room-viewer-item";

      const label = document.createElement("span");
      label.className = "room-share-popover__viewer-id";
      label.textContent = viewer.coEditor ? `${viewer.viewerId} · co-editor` : viewer.viewerId;

      const action = document.createElement("button");
      action.type = "button";
      action.className = "room-share-popover__viewer-action";
      action.dataset.testid = viewer.coEditor ? "room-revoke-coeditor" : "room-grant-coeditor";
      action.textContent = viewer.coEditor ? "Revoke edit" : "Allow edit";
      this.listenDom(action, "click", () => {
        if (viewer.coEditor) {
          this.revokeCoEditor(viewer.viewerId);
        } else {
          this.grantCoEditor(viewer.viewerId);
        }
      });

      item.append(label, action);
      this.shareViewerListEl.append(item);
    }
  }

  grantCoEditor(viewerId) {
    if (!viewerId || !this.host.client) return;
    const editorToken = createEditorToken();
    this.host.coEditors.set(viewerId, editorToken);
    const viewer = this.host.viewers.get(viewerId);
    if (viewer) viewer.coEditor = true;
    this.host.client.send(COLLAB_MESSAGE_TYPES.GRANT, { viewerId, editorToken });
    this.renderHostViewerList();
  }

  revokeCoEditor(viewerId) {
    if (!viewerId || !this.host.client) return;
    this.host.coEditors.delete(viewerId);
    const viewer = this.host.viewers.get(viewerId);
    if (viewer) viewer.coEditor = false;
    this.host.client.send(COLLAB_MESSAGE_TYPES.REVOKE, { viewerId });
    this.renderHostViewerList();
  }

  async handleHostCoEditorOp(payload) {
    const result = await this.collaboration.handleHostCoEditorOp(payload, {
      applyOperations: (operations) => this.app.history?.applyCollaborationOperations?.(operations),
    });
    if (result.reason === "revision-mismatch") {
      void this.sendHostState();
    }
  }

  installHostEventRelays() {
    this.listen("viewport:change", (payload) => {
      if (!this.host.connected || this.viewer.client) return;
      this.host.lastViewportPayload = {
        scale: payload.scale,
        position: clonePlainData(payload.position),
      };
      this.scheduleHostViewport();
    });

    const markCompareState = () => {
      this.host.compareStatePending = true;
      this.collaboration.markCompareStateNeeded();
    };
    [
      "page-compare:room-sync-needed",
      "page-compare:open",
      "page-compare:close",
    ].forEach((eventName) => this.listen(eventName, markCompareState));

    this.listen("document:load:end", ({ source }) => {
      if (source === "room" || source === "room-patch") return;
      if (this.host.connected) {
        void this.sendHostState();
      }
    });
  }

  scheduleHostViewport() {
    if (this.host.pendingViewportTimer != null) return;
    this.host.pendingViewportTimer = window.setTimeout(() => {
      this.host.pendingViewportTimer = null;
      this.flushHostViewport();
    }, VIEWPORT_THROTTLE_MS);
  }

  flushHostViewport() {
    if (!this.host.connected || !this.host.lastViewportPayload) return;
    this.host.client?.send("room:viewport", this.host.lastViewportPayload);
  }

  async sendHostState() {
    if (!this.host.connected || !this.app.documentManager?.getDocumentSnapshot) return;
    const document = this.app.documentManager.getDocumentSnapshot();
    const compareState = this.app.getPlugin?.("page-compare")?.exportRoomCompareState?.() ?? null;
    this.collaboration.setRevisionFromDocument(document);
    this.host.client?.send("room:state", { document, compareState });
  }

  async applyRemotePatch(payload) {
    const result = await this.collaboration.applyRemotePatch(payload, {
      applyOperations: (operations) => this.app.history?.applyCollaborationOperations?.(operations),
    });

    if (result.reason === "revision-mismatch") {
      this.viewer.client?.send("room:request-state");
      return result;
    }

    if (result.ok && payload.compareState != null) {
      this.app.getPlugin?.("page-compare")?.applyRoomCompareState?.(payload.compareState);
    }

    return result;
  }

  async startViewer(roomId) {
    this.viewer.roomId = roomId;
    this.viewer.viewerId = null;
    this.viewer.isCoEditor = false;
    this.viewer.editorToken = null;
    this.viewer.viewMode = VIEW_MODE_HOST;
    this.viewer.joined = false;
    this.viewer.latestHostViewport = null;
    this.viewer.closedByServer = false;
    this.viewer.receivedState = false;
    this.viewer.connectionFailed = false;
    this.viewer.compareStatePending = false;
    this.clearViewerReadyTimer();
    this.clearViewerAutoJoinTimer();
    document.body.classList.add("is-room-viewer");
    this.app.lockPresentationMode?.(ROOM_VIEWER_LOCK_REASON);
    this.syncViewerUi();
    this.updateRoomBadge("Waiting for room...");

    const client = createViewerClient(roomId);
    this.viewer.client = client;
    client.on("open", () => {
      this.updateRoomBadge("Waiting for host...");
      this.startViewerReadyTimer();
      this.scheduleViewerAutoJoin();
    });
    client.on("room:auth-required", ({ requiresPassword }) => {
      if (requiresPassword) {
        this.clearViewerAutoJoinTimer();
        this.showPasswordPrompt();
      } else {
        this.clearViewerAutoJoinTimer();
        this.submitViewerJoin("");
      }
    });
    client.on("room:joined", ({ viewerId }) => {
      this.viewer.joined = true;
      if (typeof viewerId === "string") {
        this.viewer.viewerId = viewerId;
      }
      this.clearViewerAutoJoinTimer();
      this.app.events.emit("room:share:change");
      this.hidePasswordPrompt();
      this.updateRoomBadge("Waiting for host...");
      this.showViewerWaitingLayer();
      this.startViewerReadyTimer();
    });
    client.on("room:state", ({ document, compareState }) => {
      if (!document) return;
      this.viewer.receivedState = true;
      this.clearViewerReadyTimer();
      void this.app.documentManager?.loadDocument?.(document, { source: "room" }).then(() => {
        this.collaboration.setRevisionFromDocument(document);
        const pageCompare = this.app.getPlugin?.("page-compare");
        pageCompare?.applyRoomCompareState?.(compareState ?? null);
        if (this.viewer.isCoEditor) {
          this.enterCoEditorEditingMode();
        } else {
          this.app.lockPresentationMode?.(ROOM_VIEWER_LOCK_REASON);
        }
        this.syncViewerUi();
        this.hideViewerWaitingLayer();
      }).catch(() => {
        this.hideViewerWaitingLayer();
      });
    });
    client.on("room:patch", (payload) => {
      if (!this.viewer.receivedState) return;
      void this.applyRemotePatch(payload).then((result) => {
        if (result?.ok) {
          this.syncViewerUi();
        }
      });
    });
    client.on("room:viewport", (payload) => {
      this.handleRemoteViewport(payload);
    });
    client.on(COLLAB_MESSAGE_TYPES.GRANT, ({ viewerId, editorToken }) => {
      if (viewerId !== this.viewer.viewerId) return;
      this.grantCoEditorAccess(editorToken);
    });
    client.on(COLLAB_MESSAGE_TYPES.REVOKE, ({ viewerId }) => {
      if (viewerId !== this.viewer.viewerId) return;
      this.revokeCoEditorAccess();
    });
    client.on(COLLAB_MESSAGE_TYPES.OP_REJECT, () => {
      void this.sendHostState();
    });
    client.on("room:closed", ({ reason }) => {
      this.viewer.closedByServer = true;
      this.revokeCoEditorAccess();
      this.clearViewerReadyTimer();
      this.hideViewerWaitingLayer();
      this.updateRoomBadge(reason === "host-disconnected" ? "Host disconnected" : "Room closed");
    });
    client.on("room:error", ({ message }) => {
      this.hideViewerWaitingLayer();
      if (this.viewer.client) {
        this.showPasswordPrompt();
      }
      if (this.passwordStatusEl) {
        this.passwordStatusEl.textContent = message || "Room error.";
      }
      this.updateRoomBadge(message || "Room error");
    });
    client.on("error", () => {
      if (this.viewer.joined || this.viewer.closedByServer) return;
      this.showViewerRoomUnavailable();
    });
    client.on("close", () => {
      this.revokeCoEditorAccess();
      if (!this.viewer.joined) {
        if (!this.viewer.closedByServer) {
          this.showViewerRoomUnavailable();
        }
        return;
      }
      if (this.viewer.closedByServer) return;
      this.app.events.emit("room:share:change");
      this.hideViewerWaitingLayer();
      this.updateRoomBadge("Room disconnected");
    });
    client.connect();
  }

  grantCoEditorAccess(editorToken) {
    if (!editorToken) return;
    this.viewer.isCoEditor = true;
    this.viewer.editorToken = editorToken;
    this.enterCoEditorEditingMode();
    this.updateRoomBadge("Co-editing enabled");
  }

  enterCoEditorEditingMode() {
    this.app.unlockPresentationMode?.(ROOM_VIEWER_LOCK_REASON);
    this.app.setMode?.("edit");
    this.app.setEditorTool?.("arrange");
    document.body.classList.remove("is-room-viewer");
    document.body.classList.add("is-room-coeditor");
    this.syncViewerUi();
    this.app.getPlugin?.("toolbar")?.syncUi?.();
    this.app.events.emit("room:share:change");
  }

  revokeCoEditorAccess() {
    if (!this.viewer.isCoEditor && !this.viewer.editorToken) return;
    this.viewer.isCoEditor = false;
    this.viewer.editorToken = null;
    document.body.classList.remove("is-room-coeditor");
    if (this.viewer.client) {
      this.app.lockPresentationMode?.(ROOM_VIEWER_LOCK_REASON);
    } else {
      this.app.unlockPresentationMode?.(ROOM_VIEWER_LOCK_REASON);
    }
    this.syncViewerUi();
  }

  showPasswordPrompt() {
    if (!this.passwordPromptEl) return;
    this.passwordPromptEl.hidden = false;
    this.passwordInputEl.value = "";
    if (this.passwordStatusEl) {
      this.passwordStatusEl.textContent = "";
    }
    window.setTimeout(() => this.passwordInputEl?.focus(), 0);
  }

  hidePasswordPrompt() {
    if (this.passwordPromptEl) this.passwordPromptEl.hidden = true;
  }

  startViewerReadyTimer() {
    this.clearViewerReadyTimer();
    this.viewer.readyTimer = window.setTimeout(() => {
      this.viewer.readyTimer = null;
      if (!this.viewer.receivedState && !this.viewer.closedByServer) {
        this.updateRoomBadge("Room not ready");
      }
    }, ROOM_READY_TIMEOUT_MS);
  }

  clearViewerReadyTimer() {
    if (this.viewer?.readyTimer == null) return;
    window.clearTimeout(this.viewer.readyTimer);
    this.viewer.readyTimer = null;
  }

  scheduleViewerAutoJoin() {
    this.clearViewerAutoJoinTimer();
    this.viewer.autoJoinTimer = window.setTimeout(() => {
      this.viewer.autoJoinTimer = null;
      if (this.viewer.joined) return;
      if (!this.passwordPromptEl?.hidden) return;
      this.updateRoomBadge("Waiting for host...");
      this.startViewerReadyTimer();
      this.submitViewerJoin("");
    }, 100);
  }

  clearViewerAutoJoinTimer() {
    if (this.viewer?.autoJoinTimer == null) return;
    window.clearTimeout(this.viewer.autoJoinTimer);
    this.viewer.autoJoinTimer = null;
  }

  submitViewerJoin(password) {
    this.hidePasswordPrompt();
    this.showViewerWaitingLayer();
    this.viewer.client?.send("viewer:join", { password });
  }

  showViewerWaitingLayer() {
    if (this.viewer.waitingLayer || !this.app.documentManager?.showDocumentLoadingLayer) {
      this.viewer.waitingLayer?.update?.({
        completed: 0,
        total: 0,
        remaining: 0,
        label: "Waiting for host...",
      });
      return;
    }

    this.viewer.waitingLayer = this.app.documentManager.showDocumentLoadingLayer({
      label: "Waiting for host...",
      total: 0,
    });
  }

  hideViewerWaitingLayer() {
    this.viewer.waitingLayer?.hide?.();
    this.viewer.waitingLayer = null;
  }

  showViewerRoomUnavailable(message = "Room not found") {
    if (this.viewer.connectionFailed) return;
    this.viewer.connectionFailed = true;
    this.clearViewerReadyTimer();
    this.clearViewerAutoJoinTimer();
    this.hidePasswordPrompt();
    this.showViewerWaitingLayer();
    this.viewer.waitingLayer?.update?.({
      completed: 0,
      total: 0,
      remaining: 0,
      label: message,
      meta: "Check the room code and try again.",
      tone: "error",
    });
    this.updateRoomBadge(message);
  }

  handleRemoteViewport(payload) {
    const viewport = normalizeViewportPayload(payload);
    if (!viewport) return;
    this.viewer.latestHostViewport = viewport;
    if (this.viewer.viewMode !== VIEW_MODE_HOST) return;
    this.applyHostViewport(viewport);
  }

  applyHostViewport(viewport) {
    this.viewer.applyingRemoteViewport = true;
    this.app.stageApi.setViewport(viewport);
    this.viewer.applyingRemoteViewport = false;
  }

  handleUserViewportIntent() {
    if (!this.viewer.client || this.viewer.applyingRemoteViewport) return;
    if (this.viewer.viewMode === VIEW_MODE_HOST) {
      this.setViewerViewMode(VIEW_MODE_VIEWER);
    }
  }

  installViewerModeToggle() {
    const { modeCapsuleEditEl, modeCapsulePresentEl } = this.ui;
    if (!modeCapsuleEditEl || !modeCapsulePresentEl) return;

    this.listenDom(modeCapsuleEditEl, "click", (event) => {
      if (!this.viewer.client) return;
      if (this.viewer.isCoEditor) {
        event.preventDefault();
        event.stopImmediatePropagation();
        this.enterCoEditorEditingMode();
        return;
      }
      event.preventDefault();
      event.stopImmediatePropagation();
      this.setViewerViewMode(VIEW_MODE_VIEWER);
    }, true);

    this.listenDom(modeCapsulePresentEl, "click", (event) => {
      if (!this.viewer.client) return;
      if (this.viewer.isCoEditor) {
        event.preventDefault();
        event.stopImmediatePropagation();
        this.app.setMode?.("presentation");
        this.syncViewerUi();
        this.app.getPlugin?.("toolbar")?.syncUi?.();
        return;
      }
      event.preventDefault();
      event.stopImmediatePropagation();
      this.setViewerViewMode(VIEW_MODE_HOST);
    }, true);

    this.listen("interaction:change", () => {
      if (this.viewer.client) this.syncViewerUi();
    });
  }

  installViewerKeyGuards() {
    this.listenDom(document, "keydown", (event) => {
      if (!this.viewer.client || this.viewer.isCoEditor) return;
      const mod = event.metaKey || event.ctrlKey;
      if (!mod) return;
      const key = event.key.toLowerCase();
      if (["o", "z", "y"].includes(key)) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    }, true);
  }

  setViewerViewMode(mode) {
    this.viewer.viewMode = mode === VIEW_MODE_VIEWER ? VIEW_MODE_VIEWER : VIEW_MODE_HOST;
    if (this.viewer.viewMode === VIEW_MODE_HOST && this.viewer.latestHostViewport) {
      this.applyHostViewport(this.viewer.latestHostViewport);
    }
    this.syncViewerUi();
  }

  syncViewerUi() {
    const isViewer = Boolean(this.viewer.client);
    const isCoEditor = Boolean(this.viewer.isCoEditor);
    document.body.classList.toggle("is-room-viewer", isViewer && !isCoEditor);
    document.body.classList.toggle("is-room-coeditor", isCoEditor);
    const { modeCapsuleEditEl, modeCapsulePresentEl, loadEl, shareEl } = this.ui;

    if (modeCapsuleEditEl) {
      if (isCoEditor) {
        modeCapsuleEditEl.textContent = "Co-edit";
        modeCapsuleEditEl.setAttribute("aria-pressed", "true");
        modeCapsuleEditEl.dataset.roomViewMode = "coeditor";
      } else {
        modeCapsuleEditEl.textContent = isViewer ? "Viewer" : "Edit";
        modeCapsuleEditEl.setAttribute("aria-pressed", String(isViewer && this.viewer.viewMode === VIEW_MODE_VIEWER));
        modeCapsuleEditEl.dataset.roomViewMode = isViewer ? VIEW_MODE_VIEWER : "";
      }
    }
    if (modeCapsulePresentEl) {
      if (isCoEditor) {
        modeCapsulePresentEl.textContent = "Present";
        modeCapsulePresentEl.setAttribute("aria-pressed", String(this.app.getMode() === "presentation"));
        modeCapsulePresentEl.dataset.roomViewMode = "";
      } else {
        modeCapsulePresentEl.textContent = isViewer ? "Host" : "Present";
        modeCapsulePresentEl.setAttribute("aria-pressed", String(isViewer ? this.viewer.viewMode === VIEW_MODE_HOST : this.app.getMode() === "presentation"));
        modeCapsulePresentEl.dataset.roomViewMode = isViewer ? VIEW_MODE_HOST : "";
      }
    }
    if (loadEl) loadEl.hidden = isViewer && !isCoEditor;
    if (shareEl) shareEl.hidden = isViewer || this.shareDisabled;
    if (this.shareDisabled && this.sharePopoverEl) this.sharePopoverEl.hidden = true;
    this.updateRoomBadge();
  }

  updateRoomBadge(message = null) {
    if (!this.roomBadgeEl) return;
    const active = Boolean(this.viewer.client || this.host.connected);
    this.roomBadgeEl.hidden = !active;
    if (!active) return;

    if (message) {
      this.roomBadgeEl.textContent = message;
      return;
    }

    if (this.viewer.client) {
      if (this.viewer.isCoEditor) {
        this.roomBadgeEl.textContent = `Room ${this.viewer.roomId} · Co-editing`;
        return;
      }
      const modeLabel = this.viewer.viewMode === VIEW_MODE_HOST ? "Host view" : "Viewer view";
      this.roomBadgeEl.textContent = `Room ${this.viewer.roomId} · ${modeLabel}`;
      return;
    }

    this.roomBadgeEl.textContent = `Room ${this.host.roomId} · ${this.host.viewerCount} viewers`;
  }
}
