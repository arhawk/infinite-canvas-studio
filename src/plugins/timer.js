import { BasePlugin } from "../core/baseClasses.js";
import { renderIcons } from "../lib/icons.js";

const TICK_INTERVAL_MS = 100;

export class TimerPlugin extends BasePlugin {
  static pluginId = "timer";

  onSetup() {
    const {
      toggleEl,
      widgetEl,
      headerEl,
      closeEl,
      displayEl,
      startPauseEl,
      resetEl,
      mmInputEl,
      ssInputEl,
      durationRowEl,
    } = this.options;

    this.ui = {
      toggleEl,
      widgetEl,
      headerEl,
      closeEl,
      displayEl,
      startPauseEl,
      resetEl,
      mmInputEl,
      ssInputEl,
      durationRowEl,
      tabs: widgetEl.querySelectorAll(".timer-widget__tab"),
    };

    renderIcons(toggleEl, { width: 18, height: 18, "stroke-width": 2 });

    const initialDuration = this._readDurationMs();
    this.state = {
      mode: "timer",
      running: false,
      elapsed: 0,
      remaining: initialDuration,
      timerDuration: initialDuration,
      intervalId: null,
      finished: false,
      lastTick: null,
    };
    this._readonly = false;
    this._isApplyingRemoteState = false;
    this._stateListeners = new Set();

    this.listenDom(toggleEl, "click", () => this._handleToggle());
    this.listenDom(closeEl, "click", () => this._hide());

    for (const tab of this.ui.tabs) {
      this.listenDom(tab, "click", () => this._switchMode(tab.dataset.mode));
    }

    this.listenDom(startPauseEl, "click", () => this._handleStartPause());
    this.listenDom(resetEl, "click", () => this._handleReset());

    this.listenDom(mmInputEl, "change", () => this._handleDurationInput());
    this.listenDom(ssInputEl, "change", () => this._handleDurationInput());

    this.listenDom(mmInputEl, "keydown", (e) => {
      if (e.key === "Enter") mmInputEl.blur();
    });
    this.listenDom(ssInputEl, "keydown", (e) => {
      if (e.key === "Enter") ssInputEl.blur();
    });

    this._setupDrag(widgetEl);
    this._syncUi();
  }

  onDestroy() {
    this._clearTick();
  }

  _readDurationMs() {
    const mm = Math.max(
      0,
      Math.min(99, parseInt(this.options.mmInputEl?.value ?? "1", 10) || 0),
    );
    const ss = Math.max(
      0,
      Math.min(59, parseInt(this.options.ssInputEl?.value ?? "0", 10) || 0),
    );
    return (mm * 60 + ss) * 1000;
  }

  _handleToggle() {
    if (this._readonly) return;
    const { widgetEl, toggleEl } = this.ui;
    const isHidden = widgetEl.hidden;
    widgetEl.hidden = !isHidden;
    toggleEl.setAttribute("aria-pressed", String(isHidden));
    this._notifyStateChange();
  }

  _hide() {
    if (this._readonly) return;
    this.ui.widgetEl.hidden = true;
    this.ui.toggleEl.setAttribute("aria-pressed", "false");
    this._notifyStateChange();
  }

  _setupDrag(widget) {
    let dragging = false;
    let startX, startY, startLeft, startTop;

    this.listenDom(widget, "pointerdown", (e) => {
      if (!this._isDragAllowed()) return;
      if (e.target.closest("button, input, label, select")) return;
      e.preventDefault();

      const parentEl = widget.offsetParent ?? document.body;
      const rect = widget.getBoundingClientRect();
      const parentRect = parentEl.getBoundingClientRect();

      startLeft = rect.left - parentRect.left;
      startTop  = rect.top  - parentRect.top;
      startX = e.clientX;
      startY = e.clientY;

      widget.style.left   = startLeft + "px";
      widget.style.top    = startTop  + "px";
      widget.style.bottom = "auto";
      widget.style.right  = "auto";

      widget.style.cursor = "grabbing";
      widget.setPointerCapture(e.pointerId);
      dragging = true;
    });

    this.listenDom(widget, "pointermove", (e) => {
      if (!dragging) return;

      const parentEl = widget.offsetParent ?? document.body;
      const maxLeft = parentEl.clientWidth  - widget.offsetWidth;
      const maxTop  = parentEl.clientHeight - widget.offsetHeight;

      const newLeft = Math.max(0, Math.min(maxLeft, startLeft + (e.clientX - startX)));
      const newTop  = Math.max(0, Math.min(maxTop,  startTop  + (e.clientY - startY)));

      widget.style.left = newLeft + "px";
      widget.style.top  = newTop  + "px";
    });

    const endDrag = () => {
      if (!dragging) return;
      dragging = false;
      widget.style.cursor = "";
      this._notifyStateChange();
    };
    this.listenDom(widget, "pointerup", endDrag);
    this.listenDom(widget, "pointercancel", endDrag);
  }

  _switchMode(newMode) {
    if (this._readonly) return;
    if (newMode === this.state.mode) return;
    this._clearTick();
    this.state.mode = newMode;
    this.state.running = false;
    this.state.elapsed = 0;
    this.state.remaining = this.state.timerDuration;
    this.state.finished = false;
    this.state.lastTick = null;
    this._syncUi();
    this._notifyStateChange();
  }

  _handleStartPause() {
    if (this._readonly) return;
    if (this.state.running) {
      this._pause();
    } else {
      this._start();
    }
  }

  _start() {
    if (this.state.mode === "timer" && this.state.timerDuration === 0) return;
    if (this.state.finished) return;

    this.state.running = true;
    this.state.lastTick = Date.now();
    this.state.intervalId = window.setInterval(
      () => this._tick(),
      TICK_INTERVAL_MS,
    );
    this._syncUi();
    this._notifyStateChange();
  }

  _pause() {
    this._clearTick();
    this.state.running = false;
    this._syncUi();
    this._notifyStateChange();
  }

  _clearTick() {
    if (this.state.intervalId != null) {
      window.clearInterval(this.state.intervalId);
      this.state.intervalId = null;
    }
  }

  _handleReset() {
    if (this._readonly) return;
    this._clearTick();
    this.state.running = false;
    this.state.finished = false;
    this.state.lastTick = null;
    if (this.state.mode === "stopwatch") {
      this.state.elapsed = 0;
    } else {
      this.state.remaining = this.state.timerDuration;
    }
    this._syncUi();
    this._notifyStateChange();
  }

  _handleDurationInput() {
    if (this._readonly) return;
    if (this.state.running) return;
    const ms = this._readDurationMs();
    this.state.timerDuration = ms;
    this.state.remaining = ms;
    this.state.finished = false;
    this._syncUi();
    this._notifyStateChange();
  }

  _tick() {
    const now = Date.now();
    const delta = now - (this.state.lastTick ?? now);
    this.state.lastTick = now;

    if (this.state.mode === "stopwatch") {
      this.state.elapsed += delta;
    } else {
      this.state.remaining -= delta;
      if (this.state.remaining <= 0) {
        this.state.remaining = 0;
        this.state.finished = true;
        this._pause();
        return;
      }
    }
    this._syncUi();
    this._notifyStateChange();
  }

  getSyncState() {
    return {
      mode: this.state.mode,
      running: this.state.running,
      elapsed: this.state.elapsed,
      remaining: this.state.remaining,
      timerDuration: this.state.timerDuration,
      finished: this.state.finished,
      visible: !this.ui.widgetEl.hidden,
      position: this._getInlinePosition(),
    };
  }

  applySyncState(state = {}) {
    this._isApplyingRemoteState = true;
    try {
      this._clearTick();
      this.state.mode = state.mode === "stopwatch" ? "stopwatch" : "timer";
      this.state.running = Boolean(state.running);
      this.state.elapsed = Math.max(0, Number(state.elapsed) || 0);
      this.state.remaining = Math.max(0, Number(state.remaining) || 0);
      this.state.timerDuration = Math.max(0, Number(state.timerDuration) || 0);
      this.state.finished = Boolean(state.finished);
      this.state.lastTick = this.state.running ? Date.now() : null;
      this.ui.widgetEl.hidden = !Boolean(state.visible);
      this._applyPosition(state.position);
      if (this.state.running && !this.state.finished) {
        this.state.intervalId = window.setInterval(() => this._tick(), TICK_INTERVAL_MS);
      }
      this._syncUi();
    } finally {
      this._isApplyingRemoteState = false;
    }
  }

  setReadonly(readonly) {
    this._readonly = Boolean(readonly);
    const disabled = this._readonly;
    const { toggleEl, startPauseEl, resetEl, mmInputEl, ssInputEl, tabs } = this.ui;
    toggleEl.disabled = disabled;
    startPauseEl.disabled = disabled || startPauseEl.disabled;
    resetEl.disabled = disabled;
    mmInputEl.disabled = disabled || this.state.running;
    ssInputEl.disabled = disabled || this.state.running;
    for (const tab of tabs) tab.disabled = disabled;
  }

  onStateChange(cb) {
    if (typeof cb !== "function") return () => {};
    this._stateListeners.add(cb);
    return () => this._stateListeners.delete(cb);
  }

  _notifyStateChange() {
    if (this._isApplyingRemoteState) return;
    const state = this.getSyncState();
    for (const cb of this._stateListeners) cb(state);
  }

  _getInlinePosition() {
    const left = Number.parseFloat(this.ui.widgetEl.style.left);
    const top = Number.parseFloat(this.ui.widgetEl.style.top);
    if (!Number.isFinite(left) || !Number.isFinite(top)) return null;
    return { left, top };
  }

  _applyPosition(position) {
    if (
      position
      && Number.isFinite(position.left)
      && Number.isFinite(position.top)
    ) {
      this.ui.widgetEl.style.left = `${position.left}px`;
      this.ui.widgetEl.style.top = `${position.top}px`;
      this.ui.widgetEl.style.right = "auto";
      this.ui.widgetEl.style.bottom = "auto";
      return;
    }
    this.ui.widgetEl.style.left = "";
    this.ui.widgetEl.style.top = "";
    this.ui.widgetEl.style.right = "";
    this.ui.widgetEl.style.bottom = "";
  }

  _isDragAllowed() {
    const roomShare = this.app?.getPlugin?.("room-share");
    return !roomShare?.viewer?.client;
  }

  _formatMs(ms) {
    const totalTenths = Math.floor(ms / 100);
    const tenths = totalTenths % 10;
    const totalSec = Math.floor(ms / 1000);
    const secs = totalSec % 60;
    const mins = Math.floor(totalSec / 60);
    return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}.${tenths}`;
  }

  _syncUi() {
    const {
      displayEl,
      startPauseEl,
      resetEl,
      durationRowEl,
      tabs,
      toggleEl,
      mmInputEl,
      ssInputEl,
    } = this.ui;
    const { mode, running, elapsed, remaining, timerDuration, finished } =
      this.state;

    for (const tab of tabs) {
      const isActive = tab.dataset.mode === mode;
      tab.classList.toggle("is-active", isActive);
      tab.setAttribute("aria-selected", String(isActive));
    }

    durationRowEl.hidden = mode !== "timer";
    mmInputEl.disabled = this._readonly || running;
    ssInputEl.disabled = this._readonly || running;

    const ms = mode === "stopwatch" ? elapsed : remaining;
    displayEl.textContent = this._formatMs(ms);
    displayEl.classList.toggle("is-finished", finished);

    startPauseEl.textContent = running ? "Pause" : "Start";
    startPauseEl.disabled =
      this._readonly || finished || (mode === "timer" && timerDuration === 0 && !running);
    resetEl.disabled = this._readonly;
    for (const tab of tabs) tab.disabled = this._readonly;

    const isOpen = !this.ui.widgetEl.hidden;
    toggleEl.disabled = this._readonly;
    toggleEl.setAttribute("aria-pressed", String(isOpen));
  }
}
