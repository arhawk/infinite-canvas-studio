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

    this._setupDrag(headerEl);
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
  }

  _hide() {
    this.ui.widgetEl.hidden = true;
    this.ui.toggleEl.setAttribute("aria-pressed", "false");
  }

  _setupDrag(header) {
    let dragging = false;
    let startX, startY, startLeft, startTop;

    this.listenDom(header, "mousedown", (e) => {
      if (e.target.closest(".timer-widget__close")) return;
      e.preventDefault();

      const parentEl = this.ui.widgetEl.offsetParent ?? document.body;
      const rect = this.ui.widgetEl.getBoundingClientRect();
      const parentRect = parentEl.getBoundingClientRect();

      startLeft = rect.left - parentRect.left;
      startTop  = rect.top  - parentRect.top;
      startX = e.clientX;
      startY = e.clientY;

      this.ui.widgetEl.style.left   = startLeft + "px";
      this.ui.widgetEl.style.top    = startTop  + "px";
      this.ui.widgetEl.style.bottom = "auto";
      this.ui.widgetEl.style.right  = "auto";

      header.style.cursor = "grabbing";
      dragging = true;
    });

    this.listenDom(document, "mousemove", (e) => {
      if (!dragging) return;

      const parentEl = this.ui.widgetEl.offsetParent ?? document.body;
      const maxLeft = parentEl.clientWidth  - this.ui.widgetEl.offsetWidth;
      const maxTop  = parentEl.clientHeight - this.ui.widgetEl.offsetHeight;

      const newLeft = Math.max(0, Math.min(maxLeft, startLeft + (e.clientX - startX)));
      const newTop  = Math.max(0, Math.min(maxTop,  startTop  + (e.clientY - startY)));

      this.ui.widgetEl.style.left = newLeft + "px";
      this.ui.widgetEl.style.top  = newTop  + "px";
    });

    this.listenDom(document, "mouseup", () => {
      if (!dragging) return;
      dragging = false;
      header.style.cursor = "";
    });
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
  }
}
