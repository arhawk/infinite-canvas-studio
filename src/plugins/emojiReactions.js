import { BasePlugin } from "../core/baseClasses.js";
import { renderIcons } from "../lib/icons.js";

const EMOJIS = [
  { emoji: "👍", label: "Thumbs up" },
  { emoji: "❓", label: "Question" },
  { emoji: "❤️", label: "Heart" },
];

const SENT_ID_TTL_MS = 3000;

export class EmojiReactionsPlugin extends BasePlugin {
  static pluginId = "emojiReactions";

  onSetup() {
    const { toggleEl } = this.options;
    this._toggleBtn = toggleEl;
    this._panelOpen = false;
    this._registeredHostClient = null;
    this._registeredViewerClient = null;
    this._sentIds = new Set();

    this._buildPanel();
    renderIcons(toggleEl, { width: 18, height: 18, "stroke-width": 2 });

    this.listenDom(toggleEl, "click", () => this._handleToggle());

    this.listen("room:share:change", () => this._syncOnlineVisibility());
    this.listen("interaction:change", () => this._syncOnlineVisibility());

    this.listenDom(document, "pointerdown", (e) => {
      if (!this._panelOpen) return;
      if (this._panelEl?.contains(e.target) || this._toggleBtn?.contains(e.target)) return;
      this._closePanel();
    });

    this._syncOnlineVisibility();
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
        this._sendReaction(emoji);
        this._closePanel();
      });
      panel.append(btn);
    }

    document.body.append(panel);
    this._panelEl = panel;
    this.cleanups.push(() => panel.remove());
  }

  _handleToggle() {
    if (this._panelOpen) {
      this._closePanel();
    } else {
      this._openPanel();
    }
  }

  _openPanel() {
    this._panelEl.hidden = false;
    this._panelOpen = true;
    this._toggleBtn.setAttribute("aria-pressed", "true");
    this._positionPanel();
    this._ensureClientListeners();
  }

  _closePanel() {
    this._panelEl.hidden = true;
    this._panelOpen = false;
    this._toggleBtn.setAttribute("aria-pressed", "false");
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
    this._ensureClientListeners();
  }

  _ensureClientListeners() {
    const rs = this.app.roomShare;

    const hc = rs?.host?.client;
    if (hc && hc !== this._registeredHostClient) {
      this._registeredHostClient = hc;
      hc.on("room:reaction", ({ emoji, id, relay }) => {
        if (relay) return;
        this._playAnimation(emoji);
        // Fan-out: re-broadcast viewer reaction to all viewers via host
        hc.send("room:reaction", { emoji, id, relay: true });
      });
    }

    const vc = rs?.viewer?.client;
    if (vc && vc !== this._registeredViewerClient) {
      this._registeredViewerClient = vc;
      vc.on("room:reaction", ({ emoji, id }) => {
        // Suppress echo of our own reaction that was re-broadcast by the host
        if (id && this._sentIds.has(id)) {
          this._sentIds.delete(id);
          return;
        }
        this._playAnimation(emoji);
      });
    }
  }

  _sendReaction(emoji) {
    const id = Math.random().toString(36).slice(2, 8);
    this._playAnimation(emoji);

    const rs = this.app.roomShare;
    if (rs?.host?.connected) {
      rs.host.client?.send("room:reaction", { emoji, id, relay: false });
    } else if (rs?.viewer?.joined) {
      this._sentIds.add(id);
      window.setTimeout(() => this._sentIds.delete(id), SENT_ID_TTL_MS);
      rs.viewer.client?.send("room:reaction", { emoji, id, relay: false });
    }
  }

  _playAnimation(emoji) {
    const container = document.querySelector("#canvas-container") ?? document.body;
    const rect = container.getBoundingClientRect();

    const el = document.createElement("div");
    el.className = "emoji-reaction-sticker";
    el.textContent = emoji;

    const centerX = rect.left + rect.width / 2 + (Math.random() - 0.5) * 120;
    const centerY = rect.top + rect.height / 2;

    el.style.left = `${centerX}px`;
    el.style.top = `${centerY}px`;

    document.body.append(el);
    el.addEventListener("animationend", () => el.remove(), { once: true });
  }
}
