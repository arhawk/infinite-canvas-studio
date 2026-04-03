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

    renderIcons(toggleEl, { width: 18, height: 18, "stroke-width": 2 });
    this._buildWidget(widgetEl);
    this.listenDom(toggleEl, "click", () => this._handleToggle());
    this._syncDisplay();
  }

  // ── Toggle ──────────────────────────────────────────────────────────────────

  _handleToggle() {
    const next = this._widget.hidden;
    this._widget.hidden = !next;
    this._toggle.setAttribute("aria-pressed", String(next));
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
