import QRCode from "qrcode";
import { BasePlugin } from "../core/baseClasses.js";
import { createRoom, createHostClient } from "../online/roomHost.js";
import { getRoomIdFromPath, getShareUrl } from "../online/roomRoute.js";
import { createViewerClient } from "../online/roomViewer.js";

const VIEW_MODE_HOST = "host";
const VIEW_MODE_VIEWER = "viewer";
const VIEWPORT_THROTTLE_MS = 80;
const STATE_DEBOUNCE_MS = 500;
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
    this.host = {
      client: null,
      roomId: null,
      shareUrl: null,
      connected: false,
      lastViewportPayload: null,
      pendingViewportTimer: null,
      pendingStateTimer: null,
      viewerCount: 0,
      creating: false,
    };
    this.viewer = {
      client: null,
      roomId: null,
      joined: false,
      viewMode: VIEW_MODE_HOST,
      latestHostViewport: null,
      applyingRemoteViewport: false,
      closedByServer: false,
      receivedState: false,
      readyTimer: null,
    };

    this.app.roomShare = this;
    this.buildSharePopover();
    this.buildViewerPasswordPrompt();
    this.buildRoomBadge();

    if (shareEl) {
      this.listenDom(shareEl, "click", (event) => {
        event.preventDefault();
        this.toggleSharePopover();
      });
    }

    this.installViewerModeToggle();
    this.installViewerKeyGuards();
    this.installHostEventRelays();

    this.cleanups.push(() => {
      this.clearViewerReadyTimer();
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
    this.sharePopoverEl.hidden = false;
    this.positionSharePopover();
    this.sharePasswordEl?.focus();
  }

  closeSharePopover() {
    if (this.sharePopoverEl) this.sharePopoverEl.hidden = true;
  }

  toggleSharePopover() {
    if (!this.sharePopoverEl) return;
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
    this.shareLinkEl.href = shareUrl;
    this.shareLinkEl.textContent = shareUrl;
    await QRCode.toCanvas(this.shareQrEl, shareUrl, {
      width: 144,
      margin: 1,
      errorCorrectionLevel: "M",
    });
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

    client.on("open", () => {
      client.send("host:join", { hostToken: room.hostToken });
    });
    client.on("host:joined", () => {
      this.host.connected = true;
      void this.sendHostState();
      this.flushHostViewport();
    });
    client.on("viewer:joined", () => {
      void this.sendHostState();
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
      this.updateRoomBadge();
    });
    client.connect();
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

    const scheduleState = () => this.scheduleHostState();
    [
      "node:added",
      "node:removed",
      "node:changed",
      "draw:added",
      "draw:removed",
      "background:change",
      "document:load:end",
    ].forEach((eventName) => this.listen(eventName, scheduleState));
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

  scheduleHostState() {
    if (!this.host.connected || this.app.isRestoringDocument) return;
    window.clearTimeout(this.host.pendingStateTimer);
    this.host.pendingStateTimer = window.setTimeout(() => {
      this.host.pendingStateTimer = null;
      void this.sendHostState();
    }, STATE_DEBOUNCE_MS);
  }

  async sendHostState() {
    if (!this.host.connected || !this.app.documentManager?.exportDocument) return;
    const document = await this.app.documentManager.exportDocument({
      download: false,
      format: "json",
    });
    this.host.client?.send("room:state", { document });
  }

  async startViewer(roomId) {
    this.viewer.roomId = roomId;
    this.viewer.viewMode = VIEW_MODE_HOST;
    this.viewer.joined = false;
    this.viewer.latestHostViewport = null;
    this.viewer.closedByServer = false;
    this.viewer.receivedState = false;
    this.clearViewerReadyTimer();
    document.body.classList.add("is-room-viewer");
    this.app.lockPresentationMode?.(ROOM_VIEWER_LOCK_REASON);
    this.syncViewerUi();
    this.updateRoomBadge("Waiting for room...");

    const client = createViewerClient(roomId);
    this.viewer.client = client;
    client.on("open", () => {
      this.updateRoomBadge("Joining room...");
    });
    client.on("room:auth-required", ({ requiresPassword }) => {
      if (requiresPassword) {
        this.showPasswordPrompt();
      } else {
        this.submitViewerJoin("");
      }
    });
    client.on("room:joined", () => {
      this.viewer.joined = true;
      this.hidePasswordPrompt();
      this.updateRoomBadge("Waiting for host...");
      this.startViewerReadyTimer();
    });
    client.on("room:state", ({ document }) => {
      if (!document) return;
      this.viewer.receivedState = true;
      this.clearViewerReadyTimer();
      void this.app.documentManager?.loadDocument?.(document, { source: "room" }).then(() => {
        this.app.lockPresentationMode?.(ROOM_VIEWER_LOCK_REASON);
        this.syncViewerUi();
      });
    });
    client.on("room:viewport", (payload) => {
      this.handleRemoteViewport(payload);
    });
    client.on("room:closed", ({ reason }) => {
      this.viewer.closedByServer = true;
      this.clearViewerReadyTimer();
      this.updateRoomBadge(reason === "host-disconnected" ? "Host disconnected" : "Room closed");
    });
    client.on("room:error", ({ message }) => {
      if (this.passwordStatusEl) {
        this.passwordStatusEl.textContent = message || "Room error.";
      }
      this.updateRoomBadge(message || "Room error");
    });
    client.on("close", () => {
      if (!this.viewer.joined) return;
      if (this.viewer.closedByServer) return;
      this.updateRoomBadge("Room disconnected");
    });
    client.connect();
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

  submitViewerJoin(password) {
    this.viewer.client?.send("viewer:join", { password });
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
      event.preventDefault();
      event.stopImmediatePropagation();
      this.setViewerViewMode(VIEW_MODE_VIEWER);
    }, true);

    this.listenDom(modeCapsulePresentEl, "click", (event) => {
      if (!this.viewer.client) return;
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
      if (!this.viewer.client) return;
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
    document.body.classList.toggle("is-room-viewer", isViewer);
    const { modeCapsuleEditEl, modeCapsulePresentEl, loadEl, shareEl } = this.ui;

    if (modeCapsuleEditEl) {
      modeCapsuleEditEl.textContent = isViewer ? "Viewer" : "Edit";
      modeCapsuleEditEl.setAttribute("aria-pressed", String(isViewer && this.viewer.viewMode === VIEW_MODE_VIEWER));
      modeCapsuleEditEl.dataset.roomViewMode = isViewer ? VIEW_MODE_VIEWER : "";
    }
    if (modeCapsulePresentEl) {
      modeCapsulePresentEl.textContent = isViewer ? "Host" : "Present";
      modeCapsulePresentEl.setAttribute("aria-pressed", String(isViewer ? this.viewer.viewMode === VIEW_MODE_HOST : this.app.getMode() === "presentation"));
      modeCapsulePresentEl.dataset.roomViewMode = isViewer ? VIEW_MODE_HOST : "";
    }
    if (loadEl) loadEl.hidden = isViewer;
    if (shareEl) shareEl.hidden = isViewer;
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
      const modeLabel = this.viewer.viewMode === VIEW_MODE_HOST ? "Host view" : "Viewer view";
      this.roomBadgeEl.textContent = `Room ${this.viewer.roomId} · ${modeLabel}`;
      return;
    }

    this.roomBadgeEl.textContent = `Room ${this.host.roomId} · ${this.host.viewerCount} viewers`;
  }
}
