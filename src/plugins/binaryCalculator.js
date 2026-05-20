import { BasePlugin } from "../core/baseClasses.js";
import { renderIcons } from "../lib/icons.js";

// ── Pure calculator helpers ───────────────────────────────────────────────────

function defaultState() {
  return {
    inputStr: "0",
    accumulator: null,
    pendingOp: null,
    waitingForInput: false,
    currentBase: 10,
  };
}

function parseValue(str, base) {
  if (!str || str === "" || str === "-") return 0;
  const neg = str.startsWith("-");
  const s = neg ? str.slice(1) : str;
  const n =
    base === 10 && s.includes(".") ? parseFloat(s) : parseInt(s, base);
  return Number.isFinite(n) ? (neg ? -n : n) : 0;
}

function valueToString(n, base) {
  if (!Number.isFinite(n)) return "ERR";
  if (base !== 10) n = Math.trunc(n);
  const neg = n < 0;
  const abs = Math.abs(n);
  switch (base) {
    case 2:  return (neg ? "-" : "") + abs.toString(2);
    case 8:  return (neg ? "-" : "") + abs.toString(8);
    case 10: return n.toString(10);
    case 16: return (neg ? "-" : "") + abs.toString(16).toUpperCase();
    default: return n.toString(10);
  }
}

function computeOp(a, op, b) {
  switch (op) {
    case "+":   return a + b;
    case "−":   return a - b;
    case "×":   return a * b;
    case "÷":   return b === 0 ? NaN : a / b;
    case "AND": return (Math.trunc(a) & Math.trunc(b)) >>> 0;
    case "OR":  return (Math.trunc(a) | Math.trunc(b)) >>> 0;
    case "XOR": return (Math.trunc(a) ^ Math.trunc(b)) >>> 0;
    default:    return b;
  }
}

const VALID_DIGITS = { 2: "01", 8: "01234567", 10: "0123456789.", 16: "0123456789ABCDEF" };

// ── Button layout definition ──────────────────────────────────────────────────

const MAIN_BUTTONS = [
  { label: "C",   action: { type: "clear" },               cls: "clear"  },
  { label: "←",   action: { type: "back" },                cls: ""       },
  { label: "AND", action: { type: "op", value: "AND" },    cls: "logic"  },
  { label: "OR",  action: { type: "op", value: "OR" },     cls: "logic"  },

  { label: "7",   action: { type: "digit", value: "7" },   cls: "", key: "d7"  },
  { label: "8",   action: { type: "digit", value: "8" },   cls: "", key: "d8"  },
  { label: "9",   action: { type: "digit", value: "9" },   cls: "", key: "d9"  },
  { label: "XOR", action: { type: "op", value: "XOR" },    cls: "logic"  },

  { label: "4",   action: { type: "digit", value: "4" },   cls: "", key: "d4"  },
  { label: "5",   action: { type: "digit", value: "5" },   cls: "", key: "d5"  },
  { label: "6",   action: { type: "digit", value: "6" },   cls: "", key: "d6"  },
  { label: "×",   action: { type: "op", value: "×" },      cls: "op"     },

  { label: "1",   action: { type: "digit", value: "1" },   cls: "", key: "d1"  },
  { label: "2",   action: { type: "digit", value: "2" },   cls: "", key: "d2"  },
  { label: "3",   action: { type: "digit", value: "3" },   cls: "", key: "d3"  },
  { label: "÷",   action: { type: "op", value: "÷" },      cls: "op"     },

  { label: "±",   action: { type: "negate" },              cls: ""       },
  { label: "0",   action: { type: "digit", value: "0" },   cls: "", key: "d0"  },
  { label: "−",   action: { type: "op", value: "−" },      cls: "op"     },
  { label: "+",   action: { type: "op", value: "+" },      cls: "op"     },
];

// ── Plugin ────────────────────────────────────────────────────────────────────

export class BinaryCalculatorPlugin extends BasePlugin {
  static pluginId = "binaryCalculator";

  onSetup() {
    const { toggleEl, widgetEl } = this.options;
    this._toggle = toggleEl;
    this._widget = widgetEl;
    this._state = defaultState();
    this._applyingRemoteState = false;

    renderIcons(toggleEl, { width: 18, height: 18, "stroke-width": 2 });
    this._buildWidget(widgetEl);
    this.listenDom(toggleEl, "click", () => this._handleToggle());
    this.listenDom(document, "keydown", (event) => this._handleKeydown(event));
    this._syncDisplay();
  }

  // ── Toggle ──────────────────────────────────────────────────────────────────

  _handleToggle() {
    const next = this._widget.hidden;
    this._widget.hidden = !next;
    this._toggle.setAttribute("aria-pressed", String(next));
    this._emitStateChange();
  }

  _handleKeydown(event) {
    if (this._widget.hidden || isEditableTarget(event.target)) return;

    const action = actionFromKeyboardEvent(event);
    if (!action) return;

    event.preventDefault();
    this._handleButton(action);
  }

  // ── Build DOM ───────────────────────────────────────────────────────────────

  _buildWidget(container) {
    container.innerHTML = "";

    // Header row: title + close button
    const header = el("div", "calc-widget__header");
    header.append(
      text("span", "calc-widget__title", "Binary Calculator"),
    );
    const closeBtn = el("button", "calc-widget__close");
    closeBtn.type = "button";
    closeBtn.setAttribute("aria-label", "Close calculator");
    closeBtn.textContent = "✕";
    this.listenDom(closeBtn, "click", () => this._handleToggle());
    header.append(closeBtn);
    container.append(header);

    // Display
    const disp = el("div", "calc-widget__display");
    const meta = el("div", "calc-widget__display-meta");
    this._opEl    = text("span", "calc-widget__op", "");
    this._baseLbl = text("span", "calc-widget__base-lbl", "DEC");
    meta.append(this._opEl, this._baseLbl);
    this._dispVal = text("div", "calc-widget__display-val", "0");
    disp.append(meta, this._dispVal);
    container.append(disp);

    // Multi-base panel
    const panel = el("div", "calc-widget__base-panel");
    this._bpRows = {};
    for (const [key, label, base] of [
      ["bin", "BIN", 2], ["oct", "OCT", 8], ["dec", "DEC", 10], ["hex", "HEX", 16],
    ]) {
      const row = el("div", "calc-widget__bp-row");
      row.dataset.base = base;
      const lbl = text("span", "calc-widget__bp-lbl", label);
      const val = text("span", "calc-widget__bp-val", "0");
      row.append(lbl, val);
      this._bpRows[key] = { row, lbl, val };
      panel.append(row);
    }
    container.append(panel);

    // Base selector
    const bsel = el("div", "calc-widget__base-sel");
    this._baseButtons = {};
    for (const [label, base] of [["BIN", 2], ["OCT", 8], ["DEC", 10], ["HEX", 16]]) {
      const btn = el("button", "calc-widget__base-btn");
      btn.type = "button";
      btn.textContent = label;
      btn.dataset.base = base;
      this.listenDom(btn, "click", () => this._handleButton({ type: "base", value: base }));
      this._baseButtons[base] = btn;
      bsel.append(btn);
    }
    container.append(bsel);

    // Hex row (A–F)
    const hexRow = el("div", "calc-widget__hex-row");
    this._hexBtns = {};
    for (const d of "ABCDEF".split("")) {
      const btn = el("button", "calc-widget__hex-btn");
      btn.type = "button";
      btn.textContent = d;
      this.listenDom(btn, "click", () => this._handleButton({ type: "digit", value: d }));
      this._hexBtns[d] = btn;
      hexRow.append(btn);
    }
    container.append(hexRow);

    // Main 5 × 4 button grid
    const grid = el("div", "calc-widget__buttons");
    this._digitBtns = {};
    for (const { label, action, cls, key } of MAIN_BUTTONS) {
      const btn = el("button", `calc-btn${cls ? ` calc-btn--${cls}` : ""}`);
      btn.type = "button";
      btn.textContent = label;
      const captured = action;
      this.listenDom(btn, "click", () => this._handleButton(captured));
      if (key) this._digitBtns[key] = btn; // d0–d9 references for dimming
      grid.append(btn);
    }
    container.append(grid);

    // Wide = button
    const eqBtn = el("button", "calc-btn calc-btn--eq");
    eqBtn.type = "button";
    eqBtn.textContent = "=";
    this.listenDom(eqBtn, "click", () => this._handleButton({ type: "equals" }));
    container.append(eqBtn);

    this._setupDrag(header);
  }

  // ── Drag ────────────────────────────────────────────────────────────────────

  _setupDrag(header) {
    let dragging = false;
    let startX, startY, startLeft, startTop;

    this.listenDom(header, "mousedown", (e) => {
      if (e.target.closest(".calc-widget__close")) return;
      e.preventDefault();

      const parentEl = this._widget.offsetParent ?? document.body;
      const rect = this._widget.getBoundingClientRect();
      const parentRect = parentEl.getBoundingClientRect();

      startLeft = rect.left - parentRect.left;
      startTop  = rect.top  - parentRect.top;
      startX = e.clientX;
      startY = e.clientY;

      // Switch from CSS bottom/left to inline top/left so we can move freely
      this._widget.style.left   = startLeft + "px";
      this._widget.style.top    = startTop  + "px";
      this._widget.style.bottom = "auto";
      this._widget.style.right  = "auto";

      header.style.cursor = "grabbing";
      dragging = true;
    });

    this.listenDom(document, "mousemove", (e) => {
      if (!dragging) return;

      const parentEl = this._widget.offsetParent ?? document.body;
      const maxLeft = parentEl.clientWidth  - this._widget.offsetWidth;
      const maxTop  = parentEl.clientHeight - this._widget.offsetHeight;

      const newLeft = Math.max(0, Math.min(maxLeft, startLeft + (e.clientX - startX)));
      const newTop  = Math.max(0, Math.min(maxTop,  startTop  + (e.clientY - startY)));

      this._widget.style.left = newLeft + "px";
      this._widget.style.top  = newTop  + "px";
      this._emitStateChange();
    });

    this.listenDom(document, "mouseup", () => {
      if (!dragging) return;
      dragging = false;
      header.style.cursor = "";
    });
  }

  // ── State machine ───────────────────────────────────────────────────────────

  _handleButton(action) {
    this._processAction(this._state, action);
    this._syncDisplay();
  }

  _processAction(state, action) {
    switch (action.type) {
      case "digit": {
        const d = String(action.value).toUpperCase();
        if (!(VALID_DIGITS[state.currentBase] ?? "").includes(d)) return;

        if (state.waitingForInput) {
          state.inputStr = d === "." ? "0." : d;
          state.waitingForInput = false;
        } else if (d === "." && state.currentBase === 10 && !state.inputStr.includes(".")) {
          state.inputStr += ".";
        } else if (state.inputStr === "0") {
          state.inputStr = d;
        } else {
          state.inputStr += d;
        }
        break;
      }

      case "op": {
        const op = action.value;
        const cur = parseValue(state.inputStr, state.currentBase);

        if (state.pendingOp !== null && !state.waitingForInput) {
          const result = computeOp(state.accumulator, state.pendingOp, cur);
          state.accumulator = Number.isFinite(result) ? result : 0;
          state.inputStr = valueToString(state.accumulator, state.currentBase);
        } else {
          state.accumulator = cur;
        }
        state.pendingOp = op;
        state.waitingForInput = true;
        break;
      }

      case "equals": {
        if (state.pendingOp !== null) {
          const cur = parseValue(state.inputStr, state.currentBase);
          const result = computeOp(state.accumulator, state.pendingOp, cur);
          state.inputStr = Number.isFinite(result)
            ? valueToString(result, state.currentBase)
            : "ERR";
          state.accumulator = null;
          state.pendingOp = null;
          state.waitingForInput = true;
        }
        break;
      }

      case "clear": {
        const base = state.currentBase;
        Object.assign(state, defaultState());
        state.currentBase = base;
        break;
      }

      case "back": {
        if (!state.waitingForInput && state.inputStr.length > 1) {
          state.inputStr = state.inputStr.slice(0, -1);
          if (state.inputStr === "-") state.inputStr = "0";
        } else {
          state.inputStr = "0";
        }
        break;
      }

      case "negate": {
        const n = parseValue(state.inputStr, state.currentBase);
        state.inputStr = valueToString(-n, state.currentBase);
        break;
      }

      case "base": {
        if (action.value === state.currentBase) return;
        const n = parseValue(state.inputStr, state.currentBase);
        state.currentBase = action.value;
        state.inputStr = valueToString(n, action.value);
        break;
      }
    }
  }

  // ── Display sync ────────────────────────────────────────────────────────────

  _syncDisplay() {
    const { inputStr, pendingOp, currentBase } = this._state;
    const n = parseValue(inputStr, currentBase);
    const baseNames = { 2: "BIN", 8: "OCT", 10: "DEC", 16: "HEX" };

    this._dispVal.textContent = inputStr;
    this._opEl.textContent = pendingOp ?? "";
    this._baseLbl.textContent = baseNames[currentBase] ?? "DEC";

    // Multi-base panel
    for (const [key, base] of [["bin", 2], ["oct", 8], ["dec", 10], ["hex", 16]]) {
      const { row, val } = this._bpRows[key];
      val.textContent = valueToString(n, base);
      row.classList.toggle("is-active", base === currentBase);
    }

    // Base selector highlight
    for (const [base, btn] of Object.entries(this._baseButtons)) {
      btn.classList.toggle("is-active", Number(base) === currentBase);
    }

    // Hex row – enable/dim
    for (const btn of Object.values(this._hexBtns)) {
      btn.disabled = currentBase !== 16;
    }

    // Digit buttons – dim those out of range for current base
    const validSet = new Set(VALID_DIGITS[currentBase] ?? "");
    for (const [key, btn] of Object.entries(this._digitBtns)) {
      const digit = key[1]; // "d0" → "0"
      btn.disabled = !validSet.has(digit);
    }
    this._emitStateChange();
  }

  _emitStateChange() {
    if (this._applyingRemoteState) return;
    if (this.app.emit) {
      this.app.emit("calculator:state-change", this.exportSyncState());
      return;
    }
    this.app.events?.emit?.("calculator:state-change", this.exportSyncState());
  }

  exportSyncState() {
    return {
      visible: !this._widget.hidden,
      position: {
        left: this._widget.style.left || "",
        top: this._widget.style.top || "",
        right: this._widget.style.right || "",
        bottom: this._widget.style.bottom || "",
      },
      state: { ...this._state },
    };
  }

  applySyncState(nextState, { remote = false } = {}) {
    if (!nextState || typeof nextState !== "object") return;
    if (remote) this._applyingRemoteState = true;

    this._widget.hidden = !Boolean(nextState.visible);
    this._toggle.setAttribute("aria-pressed", String(Boolean(nextState.visible)));

    const position = nextState.position ?? {};
    this._widget.style.left = typeof position.left === "string" ? position.left : "";
    this._widget.style.top = typeof position.top === "string" ? position.top : "";
    this._widget.style.right = typeof position.right === "string" ? position.right : "";
    this._widget.style.bottom = typeof position.bottom === "string" ? position.bottom : "";

    const state = nextState.state ?? {};
    this._state.inputStr = typeof state.inputStr === "string" ? state.inputStr : "0";
    this._state.accumulator = Number.isFinite(state.accumulator) ? state.accumulator : null;
    this._state.pendingOp = typeof state.pendingOp === "string" ? state.pendingOp : null;
    this._state.waitingForInput = Boolean(state.waitingForInput);
    this._state.currentBase = [2, 8, 10, 16].includes(state.currentBase) ? state.currentBase : 10;

    this._syncDisplay();
    if (remote) this._applyingRemoteState = false;
  }
}

// ── DOM helpers ───────────────────────────────────────────────────────────────

function el(tag, cls = "") {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  return node;
}

function text(tag, cls, content) {
  const node = el(tag, cls);
  node.textContent = content;
  return node;
}

function actionFromKeyboardEvent(event) {
  if (event.metaKey || event.ctrlKey || event.altKey) return null;

  const key = event.key;
  const upperKey = key.length === 1 ? key.toUpperCase() : key;

  if (/^[0-9A-F]$/.test(upperKey)) {
    return { type: "digit", value: upperKey };
  }

  switch (key) {
    case ".":
      return { type: "digit", value: "." };
    case "+":
      return { type: "op", value: "+" };
    case "-":
      return { type: "op", value: "−" };
    case "*":
    case "x":
    case "X":
      return { type: "op", value: "×" };
    case "/":
      return { type: "op", value: "÷" };
    case "&":
      return { type: "op", value: "AND" };
    case "|":
      return { type: "op", value: "OR" };
    case "^":
      return { type: "op", value: "XOR" };
    case "=":
    case "Enter":
      return { type: "equals" };
    case "Backspace":
      return { type: "back" };
    case "Escape":
      return { type: "clear" };
    default:
      return null;
  }
}

function isEditableTarget(target) {
  if (!(target instanceof Element)) return false;
  return Boolean(target.closest("input, textarea, select, [contenteditable=''], [contenteditable='true']"));
}
