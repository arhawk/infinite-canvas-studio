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
    this._applyingRemoteState = false;

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
    const { widgetEl, toggleEl } = this.ui;
    const isHidden = widgetEl.hidden;
    widgetEl.hidden = !isHidden;
    toggleEl.setAttribute("aria-pressed", String(isHidden));
    this._emitStateChange();
  }

  _hide() {
    this.ui.widgetEl.hidden = true;
    this.ui.toggleEl.setAttribute("aria-pressed", "false");
    this._emitStateChange();
  }

  _setupDrag(widget) {
    let dragging = false;
    let startX, startY, startLeft, startTop;

    this.listenDom(widget, "pointerdown", (e) => {
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
      this._emitStateChange();
    });

    const endDrag = () => {
      if (!dragging) return;
      dragging = false;
      widget.style.cursor = "";
    };
    this.listenDom(widget, "pointerup", endDrag);
    this.listenDom(widget, "pointercancel", endDrag);
  }

  _switchMode(newMode) {
    if (newMode === this.state.mode) return;
    this._clearTick();
    this.state.mode = newMode;
    this.state.running = false;
    this.state.elapsed = 0;
    this.state.remaining = this.state.timerDuration;
    this.state.finished = false;
    this.state.lastTick = null;
    this._syncUi();
  }

  _handleStartPause() {
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
  }

  _pause() {
    this._clearTick();
    this.state.running = false;
    this._syncUi();
  }

  _clearTick() {
    if (this.state.intervalId != null) {
      window.clearInterval(this.state.intervalId);
      this.state.intervalId = null;
    }
  }

  _handleReset() {
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
  }

  _handleDurationInput() {
    if (this.state.running) return;
    const ms = this._readDurationMs();
    this.state.timerDuration = ms;
    this.state.remaining = ms;
    this.state.finished = false;
    this._syncUi();
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
    mmInputEl.disabled = running;
    ssInputEl.disabled = running;

    const ms = mode === "stopwatch" ? elapsed : remaining;
    displayEl.textContent = this._formatMs(ms);
    displayEl.classList.toggle("is-finished", finished);

    startPauseEl.textContent = running ? "Pause" : "Start";
    startPauseEl.disabled =
      finished || (mode === "timer" && timerDuration === 0 && !running);

    const isOpen = !this.ui.widgetEl.hidden;
    toggleEl.setAttribute("aria-pressed", String(isOpen));
    this._emitStateChange();
  }

  _emitStateChange() {
    if (this._applyingRemoteState) return;
    if (this.app.emit) {
      this.app.emit("timer:state-change", this.exportSyncState());
      return;
    }
    this.app.events?.emit?.("timer:state-change", this.exportSyncState());
  }

  exportSyncState() {
    const widgetEl = this.ui.widgetEl;
    return {
      visible: !widgetEl.hidden,
      position: {
        left: widgetEl.style.left || "",
        top: widgetEl.style.top || "",
        right: widgetEl.style.right || "",
        bottom: widgetEl.style.bottom || "",
      },
      mode: this.state.mode,
      running: this.state.running,
      elapsed: this.state.elapsed,
      remaining: this.state.remaining,
      timerDuration: this.state.timerDuration,
      finished: this.state.finished,
      lastTick: this.state.lastTick,
      capturedAt: Date.now(),
    };
  }

  applySyncState(nextState, { remote = false } = {}) {
    if (!nextState || typeof nextState !== "object") return;
    const numeric = (value, fallback) => (Number.isFinite(value) ? value : fallback);

    if (remote) this._applyingRemoteState = true;
    this._clearTick();

    const widgetEl = this.ui.widgetEl;
    widgetEl.hidden = !Boolean(nextState.visible);
    this.ui.toggleEl.setAttribute("aria-pressed", String(Boolean(nextState.visible)));

    const position = nextState.position ?? {};
    widgetEl.style.left = typeof position.left === "string" ? position.left : "";
    widgetEl.style.top = typeof position.top === "string" ? position.top : "";
    widgetEl.style.right = typeof position.right === "string" ? position.right : "";
    widgetEl.style.bottom = typeof position.bottom === "string" ? position.bottom : "";

    this.state.mode = nextState.mode === "stopwatch" ? "stopwatch" : "timer";
    this.state.running = Boolean(nextState.running);
    this.state.elapsed = numeric(nextState.elapsed, 0);
    this.state.remaining = numeric(nextState.remaining, 0);
    this.state.timerDuration = numeric(nextState.timerDuration, this.state.remaining);
    this.state.finished = Boolean(nextState.finished);
    this.state.lastTick = Number.isFinite(nextState.lastTick) ? nextState.lastTick : null;

    const capturedAt = numeric(nextState.capturedAt, Date.now());
    const now = Date.now();
    const drift = Math.max(0, now - capturedAt);
    if (this.state.running && !this.state.finished) {
      if (this.state.mode === "stopwatch") {
        this.state.elapsed += drift;
      } else {
        this.state.remaining = Math.max(0, this.state.remaining - drift);
        if (this.state.remaining === 0) {
          this.state.finished = true;
          this.state.running = false;
        }
      }
    }

    if (this.state.running && !this.state.finished) {
      this.state.lastTick = now;
      this.state.intervalId = window.setInterval(() => this._tick(), TICK_INTERVAL_MS);
    } else {
      this.state.running = false;
      this.state.intervalId = null;
    }

    this._syncUi();
    if (remote) this._applyingRemoteState = false;
  }
}
