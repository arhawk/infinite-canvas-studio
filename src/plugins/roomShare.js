import QRCode from "qrcode";
import { BasePlugin } from "../core/baseClasses.js";
import { createCollab, createCollabHostClient, createHostClient, createRoom } from "../online/roomHost.js";
import { getCollabIdFromPath, getRoomIdFromPath, getShareUrl } from "../online/roomRoute.js";
import { createCollaboratorClient, createViewerClient } from "../online/roomViewer.js";

const VIEW_MODE_HOST = "host";
const VIEW_MODE_VIEWER = "viewer";
const VIEWPORT_THROTTLE_MS = 80;
const STATE_DEBOUNCE_MS = 500;
const REMOTE_STATE_GUARD_TIMEOUT_MS = 1500;
const ROOM_READY_TIMEOUT_MS = 4000;
const ROOM_VIEWER_LOCK_REASON = "room-viewer";
const SESSION_ROOM = "room";
const SESSION_COLLAB = "collab";
const APP_TIMER_STATE_EVENT = "app:timer-state";
const APP_CALCULATOR_STATE_EVENT = "app:calculator-state";

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

export class RoomSharePlugin extends BasePlugin {
  static pluginId = "room-share";

  emitAppEvent(eventName, payload = {}) {
    if (this.app.emit) {
      this.app.emit(eventName, payload);
      return;
    }
    this.app.events?.emit?.(eventName, payload);
  }

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
      sessionType: SESSION_ROOM,
      shareUrl: null,
      connected: false,
      applyingRemoteState: false,
      remoteStateGuardTimer: null,
      lastViewportPayload: null,
      pendingViewportTimer: null,
      pendingStateTimer: null,
      viewerCount: 0,
      creating: false,
      pendingAppStateTimerByType: new Map(),
      pendingAppStateByType: new Map(),
      remoteAppGuardTimerByType: new Map(),
      applyingRemoteAppStateByType: new Map(),
    };
    this.viewer = {
      client: null,
      roomId: null,
      sessionType: SESSION_ROOM,
      role: "viewer",
      joined: false,
      viewMode: VIEW_MODE_HOST,
      latestHostViewport: null,
      applyingRemoteViewport: false,
      closedByServer: false,
      receivedState: false,
      connectionFailed: false,
      readyTimer: null,
      autoJoinTimer: null,
      waitingLayer: null,
    };

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
    this.listen("interaction:change", () => this.syncSharePopoverLabels());
    this.syncViewerUi();

    this.cleanups.push(() => {
      this.clearViewerReadyTimer();
      this.clearViewerAutoJoinTimer();
      window.clearTimeout(this.host.remoteStateGuardTimer);
      this.host.remoteStateGuardTimer = null;
      for (const timer of this.host.pendingAppStateTimerByType.values()) {
        window.clearTimeout(timer);
      }
      this.host.pendingAppStateTimerByType.clear();
      this.host.pendingAppStateByType.clear();
      for (const timer of this.host.remoteAppGuardTimerByType.values()) {
        window.clearTimeout(timer);
      }
      this.host.remoteAppGuardTimerByType.clear();
      this.host.applyingRemoteAppStateByType.clear();
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

  getRouteSession() {
    const roomId = getRoomIdFromPath();
    if (roomId) return { sessionType: SESSION_ROOM, roomId };
    const collabId = getCollabIdFromPath();
    if (collabId) return { sessionType: SESSION_COLLAB, roomId: collabId };
    return null;
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
          <span data-room-share-password-label>Room password</span>
          <input
            type="password"
            autocomplete="new-password"
            data-testid="room-share-password"
            data-room-share-password
            placeholder="Blank for no password"
          />
        </label>
        <button type="submit" class="room-share-popover__primary" data-testid="room-share-create">
          Create
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
      void this.createAndShareSession();
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
      this.submitSessionJoin(this.passwordInputEl?.value ?? "");
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
    this.syncSharePopoverLabels();
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

  getShareSessionType() {
    return this.app.getMode() === "edit" ? SESSION_COLLAB : SESSION_ROOM;
  }

  syncSharePopoverLabels() {
    const isCollab = this.getShareSessionType() === SESSION_COLLAB;
    const verb = isCollab ? "collaboration" : "room";
    const createLabel = isCollab ? "Create collaborate link" : "Create room";
    this.shareCreateButtonEl.textContent = this.host.creating ? "Creating..." : createLabel;
    this.setShareStatus(this.host.creating ? `Creating ${verb}...` : "");
  }

  async createAndShareSession() {
    if (this.host.creating) return;
    this.setShareCreating(true);
    const sessionType = this.getShareSessionType();
    this.host.sessionType = sessionType;
    this.setShareStatus(sessionType === SESSION_COLLAB ? "Creating collaboration..." : "Creating room...");
    const password = this.sharePasswordEl?.value ?? "";
    try {
      const room = sessionType === SESSION_COLLAB
        ? await createCollab({ password })
        : await createRoom({ password });
      this.host.roomId = room.roomId;
      this.host.shareUrl = getShareUrl(room.roomId, window.location.origin, sessionType);
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
    const shareUrl = this.host.shareUrl ?? getShareUrl(room.roomId, window.location.origin, this.host.sessionType);
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
    const createLabel = this.getShareSessionType() === SESSION_COLLAB ? "Create collaborate link" : "Create room";
    this.shareCreateButtonEl.textContent = this.host.creating ? "Creating..." : createLabel;
    this.shareCreateButtonEl.setAttribute("aria-busy", String(this.host.creating));
  }

  connectHost(room) {
    this.host.client?.close();
    const client = this.host.sessionType === SESSION_COLLAB
      ? createCollabHostClient(room.roomId)
      : createHostClient(room.roomId);
    this.host.client = client;
    this.host.connected = false;
    client.on("open", () => {
      client.send("host:join", { hostToken: room.hostToken });
    });
    client.on("host:joined", () => {
      this.host.connected = true;
      this.emitAppEvent("room:share:change");
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
    client.on("room:state", ({ document }) => {
      if (!document || !this.app.documentManager?.loadDocument) return;
      this.host.applyingRemoteState = true;
      window.clearTimeout(this.host.remoteStateGuardTimer);
      this.host.remoteStateGuardTimer = window.setTimeout(() => {
        this.host.remoteStateGuardTimer = null;
        this.host.applyingRemoteState = false;
      }, REMOTE_STATE_GUARD_TIMEOUT_MS);
      void this.app.documentManager.loadDocument(document, { source: "room" }).finally(() => {
        window.clearTimeout(this.host.remoteStateGuardTimer);
        this.host.remoteStateGuardTimer = null;
        this.host.applyingRemoteState = false;
      });
    });
    client.on(APP_TIMER_STATE_EVENT, ({ state }) => {
      this.applyRemoteAppState(APP_TIMER_STATE_EVENT, state);
    });
    client.on(APP_CALCULATOR_STATE_EVENT, ({ state }) => {
      this.applyRemoteAppState(APP_CALCULATOR_STATE_EVENT, state);
    });
    client.on("room:error", ({ message }) => {
      this.setShareStatus(message || "Room error.", true);
    });
    client.on("close", () => {
      this.host.connected = false;
      this.emitAppEvent("room:share:change");
      this.updateRoomBadge();
    });
    client.connect();
  }

  installHostEventRelays() {
    this.listen("viewport:change", (payload) => {
      if (this.viewer.client && this.viewer.sessionType === SESSION_ROOM) return;
      if (!this.canBroadcastSessionState()) return;
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

    this.listen("timer:state-change", (payload) => {
      this.scheduleAppStateRelay(APP_TIMER_STATE_EVENT, payload);
    });
    this.listen("calculator:state-change", (payload) => {
      this.scheduleAppStateRelay(APP_CALCULATOR_STATE_EVENT, payload);
    });
  }

  scheduleAppStateRelay(type, payload) {
    if (!this.viewer.client && !this.host.connected) return;
    if (this.host.applyingRemoteAppStateByType.get(type)) return;
    const sessionType = this.host.connected ? this.host.sessionType : this.viewer.sessionType;
    if (sessionType !== SESSION_COLLAB) return;
    this.host.pendingAppStateByType.set(type, clonePlainData(payload));
    window.clearTimeout(this.host.pendingAppStateTimerByType.get(type));
    const timer = window.setTimeout(() => {
      this.host.pendingAppStateTimerByType.delete(type);
      const nextPayload = this.host.pendingAppStateByType.get(type);
      this.host.pendingAppStateByType.delete(type);
      const client = this.getBroadcastClient();
      if (!client || !nextPayload) return;
      client.send(type, { state: nextPayload });
    }, 80);
    this.host.pendingAppStateTimerByType.set(type, timer);
  }

  applyRemoteAppState(type, state) {
    this.host.applyingRemoteAppStateByType.set(type, true);
    window.clearTimeout(this.host.remoteAppGuardTimerByType.get(type));
    const timer = window.setTimeout(() => {
      this.host.remoteAppGuardTimerByType.delete(type);
      this.host.applyingRemoteAppStateByType.set(type, false);
    }, 500);
    this.host.remoteAppGuardTimerByType.set(type, timer);

    if (type === APP_TIMER_STATE_EVENT) {
      this.app.getPlugin?.("timer")?.applySyncState?.(state, { remote: true });
      return;
    }
    if (type === APP_CALCULATOR_STATE_EVENT) {
      this.app.getPlugin?.("binaryCalculator")?.applySyncState?.(state, { remote: true });
    }
  }

  scheduleHostViewport() {
    if (this.host.pendingViewportTimer != null) return;
    this.host.pendingViewportTimer = window.setTimeout(() => {
      this.host.pendingViewportTimer = null;
      this.flushHostViewport();
    }, VIEWPORT_THROTTLE_MS);
  }

  flushHostViewport() {
    if (!this.host.lastViewportPayload) return;
    const client = this.getBroadcastClient();
    if (!client) return;
    client.send("room:viewport", this.host.lastViewportPayload);
  }

  scheduleHostState() {
    if (!this.canBroadcastSessionState() || this.app.isRestoringDocument || this.host.applyingRemoteState) return;
    window.clearTimeout(this.host.pendingStateTimer);
    this.host.pendingStateTimer = window.setTimeout(() => {
      this.host.pendingStateTimer = null;
      void this.sendHostState();
    }, STATE_DEBOUNCE_MS);
  }

  async sendHostState() {
    const client = this.getBroadcastClient();
    if (!client || !this.app.documentManager?.exportDocument) return;
    const document = await this.app.documentManager.exportDocument({
      download: false,
      format: "json",
    });
    client.send("room:state", { document });
  }

  canBroadcastSessionState() {
    if (this.host.connected) return true;
    return Boolean(this.viewer.client && this.viewer.joined && this.viewer.sessionType === SESSION_COLLAB);
  }

  getBroadcastClient() {
    if (this.host.connected) return this.host.client;
    if (this.viewer.client && this.viewer.joined && this.viewer.sessionType === SESSION_COLLAB) {
      return this.viewer.client;
    }
    return null;
  }

  async startSession(sessionType, roomId) {
    this.viewer.roomId = roomId;
    this.viewer.sessionType = sessionType;
    this.viewer.role = sessionType === SESSION_COLLAB ? "collaborator" : "viewer";
    this.viewer.viewMode = sessionType === SESSION_COLLAB ? VIEW_MODE_VIEWER : VIEW_MODE_HOST;
    this.viewer.joined = false;
    this.viewer.latestHostViewport = null;
    this.viewer.closedByServer = false;
    this.viewer.receivedState = false;
    this.viewer.connectionFailed = false;
    this.clearViewerReadyTimer();
    this.clearViewerAutoJoinTimer();
    if (sessionType === SESSION_ROOM) {
      document.body.classList.add("is-room-viewer");
      this.app.lockPresentationMode?.(ROOM_VIEWER_LOCK_REASON);
    } else {
      document.body.classList.remove("is-room-viewer");
      this.app.unlockPresentationMode?.(ROOM_VIEWER_LOCK_REASON);
    }
    this.syncViewerUi();
    this.updateRoomBadge("Waiting for room...");

    const client = sessionType === SESSION_COLLAB
      ? createCollaboratorClient(roomId)
      : createViewerClient(roomId);
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
        this.submitSessionJoin("");
      }
    });
    client.on("room:joined", () => {
      this.viewer.joined = true;
      this.clearViewerAutoJoinTimer();
      this.emitAppEvent("room:share:change");
      this.hidePasswordPrompt();
      this.updateRoomBadge(sessionType === SESSION_COLLAB ? "Connected" : "Waiting for host...");
      if (sessionType === SESSION_ROOM) {
        this.showViewerWaitingLayer();
        this.startViewerReadyTimer();
      }
    });
    client.on("room:state", ({ document }) => {
      if (!document) return;
      this.viewer.receivedState = true;
      this.clearViewerReadyTimer();
      void this.app.documentManager?.loadDocument?.(document, { source: "room" }).then(() => {
        if (sessionType === SESSION_ROOM) {
          this.app.lockPresentationMode?.(ROOM_VIEWER_LOCK_REASON);
        }
        this.syncViewerUi();
        this.hideViewerWaitingLayer();
      }).catch(() => {
        this.hideViewerWaitingLayer();
      });
    });
    client.on(APP_TIMER_STATE_EVENT, ({ state }) => {
      this.applyRemoteAppState(APP_TIMER_STATE_EVENT, state);
    });
    client.on(APP_CALCULATOR_STATE_EVENT, ({ state }) => {
      this.applyRemoteAppState(APP_CALCULATOR_STATE_EVENT, state);
    });
    client.on("room:viewport", (payload) => {
      if (sessionType === SESSION_ROOM) this.handleRemoteViewport(payload);
    });
    client.on("room:closed", ({ reason }) => {
      this.viewer.closedByServer = true;
      this.clearViewerReadyTimer();
      if (sessionType === SESSION_ROOM) this.hideViewerWaitingLayer();
      this.updateRoomBadge(reason === "host-disconnected" ? "Host disconnected" : "Room closed");
    });
    client.on("room:error", ({ message }) => {
      if (sessionType === SESSION_ROOM) this.hideViewerWaitingLayer();
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
      if (!this.viewer.joined) {
        if (!this.viewer.closedByServer) {
          this.showViewerRoomUnavailable();
        }
        return;
      }
      if (this.viewer.closedByServer) return;
      this.emitAppEvent("room:share:change");
      if (sessionType === SESSION_ROOM) this.hideViewerWaitingLayer();
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

  scheduleViewerAutoJoin() {
    this.clearViewerAutoJoinTimer();
    this.viewer.autoJoinTimer = window.setTimeout(() => {
      this.viewer.autoJoinTimer = null;
      if (this.viewer.joined) return;
      if (!this.passwordPromptEl?.hidden) return;
      this.updateRoomBadge("Waiting for host...");
      this.startViewerReadyTimer();
      this.submitSessionJoin("");
    }, 100);
  }

  clearViewerAutoJoinTimer() {
    if (this.viewer?.autoJoinTimer == null) return;
    window.clearTimeout(this.viewer.autoJoinTimer);
    this.viewer.autoJoinTimer = null;
  }

  submitSessionJoin(password) {
    this.hidePasswordPrompt();
    if (this.viewer.sessionType === SESSION_ROOM) {
      this.showViewerWaitingLayer();
      this.viewer.client?.send("viewer:join", { password });
      return;
    }
    this.viewer.client?.send("collaborator:join", { password });
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
      if (!this.viewer.client || this.viewer.sessionType !== SESSION_ROOM) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      this.setViewerViewMode(VIEW_MODE_VIEWER);
    }, true);

    this.listenDom(modeCapsulePresentEl, "click", (event) => {
      if (!this.viewer.client || this.viewer.sessionType !== SESSION_ROOM) return;
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
      if (!this.viewer.client || this.viewer.sessionType !== SESSION_ROOM) return;
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
    const isViewer = Boolean(this.viewer.client) && this.viewer.sessionType === SESSION_ROOM;
    document.body.classList.toggle("is-room-viewer", isViewer);
    const { modeCapsuleEditEl, modeCapsulePresentEl, loadEl, shareEl } = this.ui;

    if (modeCapsuleEditEl) {
      modeCapsuleEditEl.textContent = isViewer ? "Viewer" : "Edit";
      const editPressed = isViewer
        ? this.viewer.viewMode === VIEW_MODE_VIEWER
        : this.app.getMode() === "edit";
      modeCapsuleEditEl.setAttribute("aria-pressed", String(editPressed));
      modeCapsuleEditEl.dataset.roomViewMode = isViewer ? VIEW_MODE_VIEWER : "";
    }
    if (modeCapsulePresentEl) {
      modeCapsulePresentEl.textContent = isViewer ? "Host" : "Present";
      modeCapsulePresentEl.setAttribute("aria-pressed", String(isViewer ? this.viewer.viewMode === VIEW_MODE_HOST : this.app.getMode() === "presentation"));
      modeCapsulePresentEl.dataset.roomViewMode = isViewer ? VIEW_MODE_HOST : "";
    }
    if (loadEl) loadEl.hidden = isViewer;
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
      if (this.viewer.sessionType === SESSION_COLLAB) {
        this.roomBadgeEl.textContent = `Collab ${this.viewer.roomId} · Connected`;
      } else {
        const modeLabel = this.viewer.viewMode === VIEW_MODE_HOST ? "Host view" : "Viewer view";
        this.roomBadgeEl.textContent = `Room ${this.viewer.roomId} · ${modeLabel}`;
      }
      return;
    }

    const prefix = this.host.sessionType === SESSION_COLLAB ? "Collab" : "Room";
    this.roomBadgeEl.textContent = `${prefix} ${this.host.roomId} · ${this.host.viewerCount} viewers`;
  }
}
