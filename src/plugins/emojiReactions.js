import { BasePlugin } from "../core/baseClasses.js";
import { renderIcons } from "../lib/icons.js";

const EMOJIS = [
  { emoji: "👍", label: "Thumbs up" },
  { emoji: "❓", label: "Question" },
  { emoji: "❤️", label: "Heart" },
];

const SENT_ID_TTL_MS = 3000;
const REACTION_MESSAGE_TYPE = "app:reaction";

export class EmojiReactionsPlugin extends BasePlugin {
  static pluginId = "emojiReactions";

  onSetup() {
    const { toggleEl } = this.options;
    this._toggleBtn = toggleEl;
    this._panelOpen = false;
    this._pendingEmoji = null;
    this._registeredHostClient = null;
    this._registeredViewerClient = null;
    this._sentIds = new Set();

    this._buildPanel();
    renderIcons(toggleEl, { width: 18, height: 18, "stroke-width": 2 });

    this.listenDom(toggleEl, "click", () => this._handleToggle());
    this.app.stage?.on?.("click.emojiReactions tap.emojiReactions", (event) => {
      this._handleStagePlacement(event);
    });

    this.listen("room:share:change", () => this._syncOnlineVisibility());
    this.listen("interaction:change", () => this._syncOnlineVisibility());

    this.listenDom(document, "pointerdown", (e) => {
      if (!this._panelOpen) return;
      if (this._panelEl?.contains(e.target) || this._toggleBtn?.contains(e.target)) return;
      this._closePanel();
    });
    this.listenDom(window, "keydown", (event) => {
      if (event.key !== "Escape" || !this._pendingEmoji) return;
      this._clearPendingEmoji();
    });

    this._syncOnlineVisibility();

    this.cleanups.push(() => {
      this.app.stage?.off?.(".emojiReactions");
      this._clearPendingEmoji();
    });
  }

  _buildPanel() {
    const panel = document.createElement("div");
    panel.className = "emoji-reactions-panel";
    panel.hidden = true;
    panel.setAttribute("role", "toolbar");
    panel.setAttribute("aria-label", "Emoji reactions");
    panel.dataset.testid = "emoji-reactions-panel";

    for (const { emoji, label } of EMOJIS) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "emoji-reactions-panel__btn";
      btn.setAttribute("aria-label", label);
      btn.dataset.tooltip = label;
      btn.textContent = emoji;
      this.listenDom(btn, "click", () => {
        this._selectEmojiForPlacement(emoji);
        this._closePanel();
      });
      panel.append(btn);
    }

    document.body.append(panel);
    this._panelEl = panel;
    this.cleanups.push(() => panel.remove());
  }

  _handleToggle() {
    if (this._pendingEmoji && !this._panelOpen) {
      this._clearPendingEmoji();
      return;
    }
    if (this._panelOpen) {
      this._closePanel();
    } else {
      this._openPanel();
    }
  }

  _openPanel() {
    this._panelEl.hidden = false;
    this._panelOpen = true;
    this._syncToggleState();
    this._positionPanel();
    this._ensureClientListeners();
  }

  _closePanel() {
    this._panelEl.hidden = true;
    this._panelOpen = false;
    this._syncToggleState();
  }

  _positionPanel() {
    const btn = this._toggleBtn;
    const panel = this._panelEl;
    if (!btn || !panel) return;

    panel.hidden = false;
    const btnRect = btn.getBoundingClientRect();
    const panelWidth = panel.offsetWidth || 128;
    const panelHeight = panel.offsetHeight || 52;
    const gap = 8;
    const margin = 8;

    let left = btnRect.left + btnRect.width / 2 - panelWidth / 2;
    let top = btnRect.top - panelHeight - gap;

    if (top < margin) top = btnRect.bottom + gap;
    left = Math.max(margin, Math.min(left, window.innerWidth - panelWidth - margin));
    top = Math.max(margin, Math.min(top, window.innerHeight - panelHeight - margin));

    panel.style.left = `${left}px`;
    panel.style.top = `${top}px`;
  }

  _isOnline() {
    const rs = this.app.roomShare;
    return !!(rs?.host?.connected || rs?.viewer?.joined);
  }

  _syncOnlineVisibility() {
    const online = this._isOnline();
    this._toggleBtn.hidden = !online;
    if (!online && this._panelOpen) this._closePanel();
    if (!online) this._clearPendingEmoji();
    this._ensureClientListeners();
  }

  _ensureClientListeners() {
    const rs = this.app.roomShare;

    const hc = rs?.host?.client;
    if (hc && hc !== this._registeredHostClient) {
      this._registeredHostClient = hc;
      hc.on(REACTION_MESSAGE_TYPE, ({ emoji, id, relay, placement }) => {
        if (relay) return;
        this._playAnimation(emoji, placement);
        // Fan-out: re-broadcast viewer reaction to all viewers via host
        hc.send(REACTION_MESSAGE_TYPE, { emoji, id, relay: true, placement });
      });
    }

    const vc = rs?.viewer?.client;
    if (vc && vc !== this._registeredViewerClient) {
      this._registeredViewerClient = vc;
      vc.on(REACTION_MESSAGE_TYPE, ({ emoji, id, placement }) => {
        // Suppress echo of our own reaction that was re-broadcast by the host
        if (id && this._sentIds.has(id)) {
          this._sentIds.delete(id);
          return;
        }
        this._playAnimation(emoji, placement);
      });
    }
  }

  _selectEmojiForPlacement(emoji) {
    this._pendingEmoji = emoji;
    this._syncToggleState();
  }

  _clearPendingEmoji() {
    this._pendingEmoji = null;
    this._syncToggleState();
  }

  _syncToggleState() {
    const isActive = this._panelOpen || Boolean(this._pendingEmoji);
    this._toggleBtn?.setAttribute("aria-pressed", String(isActive));
    this._toggleBtn?.classList.toggle("is-active", isActive);

    const label = this._pendingEmoji
      ? `Click canvas to place ${this._pendingEmoji}`
      : "Reactions";
    if (this._toggleBtn) {
      this._toggleBtn.dataset.tooltip = label;
      this._toggleBtn.setAttribute("aria-label", label);
    }

    const container = document.querySelector("#canvas-container");
    container?.classList.toggle("is-placing-emoji", Boolean(this._pendingEmoji));
  }

  _handleStagePlacement(event) {
    if (!this._pendingEmoji) return;

    const placement = this._getPointerPlacement();
    if (!placement) return;

    const emoji = this._pendingEmoji;
    this._clearPendingEmoji();
    event.cancelBubble = true;
    event.evt?.preventDefault?.();
    this._sendReaction(emoji, placement);
  }

  _getPointerPlacement() {
    const pointer = this.app.stage?.getPointerPosition?.();
    if (!pointer) return null;
    const canvas = this.app.stageApi?.screenToCanvas?.(pointer);
    if (!canvas) return null;
    return {
      canvas: {
        x: canvas.x,
        y: canvas.y,
      },
    };
  }

  _sendReaction(emoji, placement = null) {
    const id = Math.random().toString(36).slice(2, 8);
    this._playAnimation(emoji, placement);

    const rs = this.app.roomShare;
    if (rs?.host?.connected) {
      rs.host.client?.send(REACTION_MESSAGE_TYPE, { emoji, id, relay: false, placement });
    } else if (rs?.viewer?.joined) {
      this._sentIds.add(id);
      window.setTimeout(() => this._sentIds.delete(id), SENT_ID_TTL_MS);
      rs.viewer.client?.send(REACTION_MESSAGE_TYPE, { emoji, id, relay: false, placement });
    }
  }

  _playAnimation(emoji, placement = null) {
    const container = document.querySelector("#canvas-container") ?? document.body;
    const rect = container.getBoundingClientRect();

    const el = document.createElement("div");
    el.className = "emoji-reaction-sticker";
    el.textContent = emoji;

    const screen = placement?.canvas
      ? this.app.stageApi?.canvasToScreen?.(placement.canvas)
      : null;
    const centerX = Number.isFinite(screen?.x)
      ? rect.left + screen.x
      : rect.left + rect.width / 2 + (Math.random() - 0.5) * 120;
    const centerY = Number.isFinite(screen?.y)
      ? rect.top + screen.y
      : rect.top + rect.height / 2;

    el.style.left = `${centerX}px`;
    el.style.top = `${centerY}px`;

    document.body.append(el);
    el.addEventListener("animationend", () => el.remove(), { once: true });
  }
}
