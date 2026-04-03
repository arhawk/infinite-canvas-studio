import { BaseComponent } from "../core/baseClasses.js";
import { Konva } from "../lib/konva.js";

// ── Layout ────────────────────────────────────────────────────────────────────
const W   = 300;   // widget width
const H   = 465;   // widget height
const PAD = 8;     // outer horizontal padding
const GAP = 8;     // gap between buttons
const BH  = 36;    // button height
const BW  = Math.floor((W - 2 * PAD - 3 * GAP) / 4); // ≈ 65 per button

// ── Colours ───────────────────────────────────────────────────────────────────
const C = {
  bg:          "#1c1c2e",
  displayBg:   "#0a0a18",
  basePanelBg: "#0e0e1e",
  btnNormal:   "#252538",
  btnOp:       "#1e1428",
  btnLogic:    "#0e2018",
  btnClear:    "#2e0e0e",
  btnEq:       "#1a2f5a",
  btnBase:     "#141828",
  btnBaseAct:  "#1e3c6e",
  btnHexDim:   "#16162a",
  btnHexOn:    "#1a2640",
  btnDim:      "#1a1a28",
  textNorm:    "#c8c8e8",
  textOp:      "#ff9944",
  textLogic:   "#44dd88",
  textClear:   "#ff5555",
  textEq:      "#55aaff",
  textBase:    "#7788aa",
  textBaseAct: "#99ccff",
  textHexDim:  "#3a3a5a",
  textHexOn:   "#88aacc",
  textDim:     "#3a3a5a",
  displayVal:  "#e0ffe0",
  displaySub:  "#445566",
  opIndicator: "#ff8833",
  title:       "#555577",
  bpActive:    "#aaddff",
};

// ── Calculator helpers ────────────────────────────────────────────────────────

export function defaultState() {
  return {
    inputStr: "0",
    accumulator: null,
    pendingOp: null,
    waitingForInput: false,
    currentBase: 10,
  };
}

/** Parse a string typed by the user (in the given base) to a JS number. */
export function parseValue(str, base) {
  if (!str || str === "" || str === "-") return 0;
  const neg = str.startsWith("-");
  const s = neg ? str.slice(1) : str;
  const n =
    base === 10 && s.includes(".") ? parseFloat(s) : parseInt(s, base);
  return Number.isFinite(n) ? (neg ? -n : n) : 0;
}

/** Format a JS number as a string in the given base. */
export function valueToString(n, base) {
  if (!Number.isFinite(n)) return "ERR";
  if (base !== 10) n = Math.trunc(n);
  const neg = n < 0;
  const absN = Math.abs(n);
  let s;
  switch (base) {
    case 2:  s = absN.toString(2);  break;
    case 8:  s = absN.toString(8);  break;
    case 10: return n.toString(10);
    case 16: s = absN.toString(16).toUpperCase(); break;
    default: return n.toString(10);
  }
  return (neg ? "-" : "") + s;
}

/** Apply an arithmetic or bitwise operator. */
export function compute(a, op, b) {
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

const VALID_DIGITS = {
  2:  "01",
  8:  "01234567",
  10: "0123456789.",
  16: "0123456789ABCDEF",
};

// ── Component ─────────────────────────────────────────────────────────────────

export class BinaryCalculatorComponent extends BaseComponent {
  static type = "binaryCalculator";
  static label = "Binary Calc";
  static description = "Base conversion calculator with logic ops (AND/OR/XOR)";

  // ── Public API ──────────────────────────────────────────────────────────────

  async createNode({ x, y }) {
    const group = new Konva.Group({
      x,
      y,
      width: W,
      height: H,
      draggable: true,
    });

    this._buildUI(group);

    const state = defaultState();
    group.setAttr("calcState", state);
    this._updateDisplay(group, state);

    return group;
  }

  serializeNode(node) {
    return { ...(node.getAttr("calcState") ?? defaultState()) };
  }

  async applySerializedData(node, data = {}) {
    const state = { ...defaultState(), ...data };
    node.setAttr("calcState", state);
    this._updateDisplay(node, state);
  }

  // ── Internal: build static UI ───────────────────────────────────────────────

  _buildUI(group) {
    const self = this;

    // Background
    group.add(
      new Konva.Rect({
        width: W,
        height: H,
        fill: C.bg,
        cornerRadius: 12,
        shadowColor: "rgba(0,0,0,0.6)",
        shadowBlur: 16,
        shadowOffsetY: 6,
        shadowOpacity: 0.5,
        name: "calc-bg",
      }),
    );

    // Title
    group.add(
      new Konva.Text({
        x: 0,
        y: 7,
        width: W,
        text: "Binary Calculator",
        fontSize: 12,
        fontFamily: "IBM Plex Sans, sans-serif",
        fill: C.title,
        align: "center",
        name: "calc-title",
      }),
    );

    // ── Display ─────────────────────────────────────────────────────────────
    const dispY = 24;
    group.add(
      new Konva.Rect({
        x: PAD,
        y: dispY,
        width: W - 2 * PAD,
        height: 46,
        fill: C.displayBg,
        cornerRadius: 6,
        name: "calc-display-bg",
      }),
    );

    // Pending-operator indicator (top-left)
    group.add(
      new Konva.Text({
        x: PAD + 6,
        y: dispY + 5,
        width: 70,
        text: "",
        fontSize: 10,
        fontFamily: "IBM Plex Sans, sans-serif",
        fill: C.opIndicator,
        name: "calc-op-ind",
      }),
    );

    // Current-base label (top-right)
    group.add(
      new Konva.Text({
        x: PAD,
        y: dispY + 5,
        width: W - 2 * PAD - 6,
        text: "DEC",
        fontSize: 10,
        fontFamily: "IBM Plex Sans, sans-serif",
        fill: C.displaySub,
        align: "right",
        name: "calc-base-lbl",
      }),
    );

    // Main value
    group.add(
      new Konva.Text({
        x: PAD + 6,
        y: dispY + 18,
        width: W - 2 * PAD - 12,
        text: "0",
        fontSize: 22,
        fontFamily: "Courier New, monospace",
        fontStyle: "bold",
        fill: C.displayVal,
        align: "right",
        ellipsis: true,
        wrap: "none",
        name: "calc-display-val",
      }),
    );

    // ── Base panel ──────────────────────────────────────────────────────────
    const bpY = 74;
    group.add(
      new Konva.Rect({
        x: PAD,
        y: bpY,
        width: W - 2 * PAD,
        height: 62,
        fill: C.basePanelBg,
        cornerRadius: 5,
        name: "calc-bp-bg",
      }),
    );

    [
      { key: "bin", label: "BIN", yOff: 6  },
      { key: "oct", label: "OCT", yOff: 21 },
      { key: "dec", label: "DEC", yOff: 36 },
      { key: "hex", label: "HEX", yOff: 51 },
    ].forEach(({ key, label, yOff }) => {
      group.add(
        new Konva.Text({
          x: PAD + 6,
          y: bpY + yOff,
          width: 28,
          text: label,
          fontSize: 10,
          fontFamily: "IBM Plex Sans, sans-serif",
          fill: C.textBase,
          name: `calc-bp-lbl-${key}`,
        }),
      );
      group.add(
        new Konva.Text({
          x: PAD + 36,
          y: bpY + yOff,
          width: W - 2 * PAD - 42,
          text: "0",
          fontSize: 10,
          fontFamily: "Courier New, monospace",
          fill: C.displaySub,
          align: "right",
          ellipsis: true,
          wrap: "none",
          name: `calc-bp-val-${key}`,
        }),
      );
    });

    // ── Base selector ────────────────────────────────────────────────────────
    const bsY = 140;
    const bsW = Math.floor((W - 2 * PAD - 3 * 6) / 4);
    ["BIN", "OCT", "DEC", "HEX"].forEach((label, i) => {
      const bx = PAD + i * (bsW + 6);
      const baseVal = [2, 8, 10, 16][i];
      const bg = new Konva.Rect({
        width: bsW,
        height: 24,
        fill: C.btnBase,
        cornerRadius: 5,
        name: "rect",
      });
      const txt = new Konva.Text({
        width: bsW,
        height: 24,
        text: label,
        fontSize: 11,
        fontFamily: "IBM Plex Sans, sans-serif",
        fill: C.textBase,
        align: "center",
        verticalAlign: "middle",
        name: "label",
      });
      const g = new Konva.Group({ x: bx, y: bsY, name: `calc-bsel-${label}` });
      g.add(bg, txt);
      g.on("click tap", (e) => {
        e.cancelBubble = true;
        self._handleAction(group, { type: "base", value: baseVal });
      });
      group.add(g);
    });

    // ── Hex digit row (A–F) ──────────────────────────────────────────────────
    const hexY = 168;
    const hexBW = Math.floor((W - 2 * PAD - 5 * 5) / 6);
    "ABCDEF".split("").forEach((d, i) => {
      const bx = PAD + i * (hexBW + 5);
      const bg = new Konva.Rect({
        width: hexBW,
        height: 26,
        fill: C.btnHexDim,
        cornerRadius: 4,
        name: "rect",
      });
      const txt = new Konva.Text({
        width: hexBW,
        height: 26,
        text: d,
        fontSize: 12,
        fontFamily: "Courier New, monospace",
        fill: C.textHexDim,
        align: "center",
        verticalAlign: "middle",
        name: "label",
      });
      const g = new Konva.Group({ x: bx, y: hexY, name: `calc-hex-${d}` });
      g.add(bg, txt);
      g.on("click tap", (e) => {
        e.cancelBubble = true;
        self._handleAction(group, { type: "digit", value: d });
      });
      group.add(g);
    });

    // ── Main 5 × 4 button grid ───────────────────────────────────────────────
    const gridY = 198;

    const BUTTONS = [
      // row 0 — control / logic
      { label: "C",   key: "clear", action: { type: "clear" },              style: "clear",  r: 0, c: 0 },
      { label: "←",   key: "back",  action: { type: "back" },               style: "normal", r: 0, c: 1 },
      { label: "AND", key: "and",   action: { type: "op", value: "AND" },   style: "logic",  r: 0, c: 2 },
      { label: "OR",  key: "or",    action: { type: "op", value: "OR" },    style: "logic",  r: 0, c: 3 },
      // row 1
      { label: "7",   key: "d7",    action: { type: "digit", value: "7" },  style: "normal", r: 1, c: 0 },
      { label: "8",   key: "d8",    action: { type: "digit", value: "8" },  style: "normal", r: 1, c: 1 },
      { label: "9",   key: "d9",    action: { type: "digit", value: "9" },  style: "normal", r: 1, c: 2 },
      { label: "XOR", key: "xor",   action: { type: "op", value: "XOR" },   style: "logic",  r: 1, c: 3 },
      // row 2
      { label: "4",   key: "d4",    action: { type: "digit", value: "4" },  style: "normal", r: 2, c: 0 },
      { label: "5",   key: "d5",    action: { type: "digit", value: "5" },  style: "normal", r: 2, c: 1 },
      { label: "6",   key: "d6",    action: { type: "digit", value: "6" },  style: "normal", r: 2, c: 2 },
      { label: "×",   key: "mul",   action: { type: "op", value: "×" },     style: "op",     r: 2, c: 3 },
      // row 3
      { label: "1",   key: "d1",    action: { type: "digit", value: "1" },  style: "normal", r: 3, c: 0 },
      { label: "2",   key: "d2",    action: { type: "digit", value: "2" },  style: "normal", r: 3, c: 1 },
      { label: "3",   key: "d3",    action: { type: "digit", value: "3" },  style: "normal", r: 3, c: 2 },
      { label: "÷",   key: "div",   action: { type: "op", value: "÷" },     style: "op",     r: 3, c: 3 },
      // row 4
      { label: "±",   key: "neg",   action: { type: "negate" },             style: "normal", r: 4, c: 0 },
      { label: "0",   key: "d0",    action: { type: "digit", value: "0" },  style: "normal", r: 4, c: 1 },
      { label: "−",   key: "sub",   action: { type: "op", value: "−" },     style: "op",     r: 4, c: 2 },
      { label: "+",   key: "add",   action: { type: "op", value: "+" },     style: "op",     r: 4, c: 3 },
    ];

    const BTN_STYLE = {
      normal: { bg: C.btnNormal, text: C.textNorm },
      op:     { bg: C.btnOp,     text: C.textOp   },
      logic:  { bg: C.btnLogic,  text: C.textLogic },
      clear:  { bg: C.btnClear,  text: C.textClear },
    };

    BUTTONS.forEach(({ label, key, action, style, r, c }) => {
      const bx = PAD + c * (BW + GAP);
      const by = gridY + r * (BH + GAP);
      const s = BTN_STYLE[style] ?? BTN_STYLE.normal;
      const bg = new Konva.Rect({
        width: BW,
        height: BH,
        fill: s.bg,
        cornerRadius: 6,
        name: "rect",
      });
      const txt = new Konva.Text({
        width: BW,
        height: BH,
        text: label,
        fontSize: label.length > 2 ? 11 : 13,
        fontFamily:
          label.length === 1 && /[\d±←]/.test(label)
            ? "Courier New, monospace"
            : "IBM Plex Sans, sans-serif",
        fill: s.text,
        align: "center",
        verticalAlign: "middle",
        name: "label",
      });
      const g = new Konva.Group({ x: bx, y: by, name: `calc-btn-${key}` });
      g.add(bg, txt);
      const captured = action;
      g.on("click tap", (e) => {
        e.cancelBubble = true;
        self._handleAction(group, captured);
      });
      group.add(g);
    });

    // Wide = button
    const eqY = gridY + 5 * (BH + GAP);
    const eqBg = new Konva.Rect({
      width: W - 2 * PAD,
      height: BH,
      fill: C.btnEq,
      cornerRadius: 6,
      name: "rect",
    });
    const eqTxt = new Konva.Text({
      width: W - 2 * PAD,
      height: BH,
      text: "=",
      fontSize: 16,
      fontFamily: "IBM Plex Sans, sans-serif",
      fill: C.textEq,
      align: "center",
      verticalAlign: "middle",
      name: "label",
    });
    const eqG = new Konva.Group({ x: PAD, y: eqY, name: "calc-btn-eq" });
    eqG.add(eqBg, eqTxt);
    eqG.on("click tap", (e) => {
      e.cancelBubble = true;
      self._handleAction(group, { type: "equals" });
    });
    group.add(eqG);
  }

  // ── Internal: update display from state ─────────────────────────────────────

  _updateDisplay(group, state) {
    state = state ?? group.getAttr("calcState") ?? defaultState();
    const n = parseValue(state.inputStr, state.currentBase);

    // Main display value
    const dispVal = group.findOne(".calc-display-val");
    if (dispVal) dispVal.text(state.inputStr);

    // Base label
    const baseLblMap = { 2: "BIN", 8: "OCT", 10: "DEC", 16: "HEX" };
    const baseLbl = group.findOne(".calc-base-lbl");
    if (baseLbl) baseLbl.text(baseLblMap[state.currentBase] ?? "DEC");

    // Pending-op indicator
    const opInd = group.findOne(".calc-op-ind");
    if (opInd) opInd.text(state.pendingOp ? `${state.pendingOp}` : "");

    // Base panel rows
    [
      { key: "bin", base: 2  },
      { key: "oct", base: 8  },
      { key: "dec", base: 10 },
      { key: "hex", base: 16 },
    ].forEach(({ key, base }) => {
      const active = base === state.currentBase;
      const valNode = group.findOne(`.calc-bp-val-${key}`);
      const lblNode = group.findOne(`.calc-bp-lbl-${key}`);
      if (valNode) {
        valNode.text(valueToString(n, base));
        valNode.fill(active ? C.bpActive : C.displaySub);
      }
      if (lblNode) lblNode.fill(active ? C.bpActive : C.textBase);
    });

    // Base-selector button highlights
    const baseByLabel = { BIN: 2, OCT: 8, DEC: 10, HEX: 16 };
    ["BIN", "OCT", "DEC", "HEX"].forEach((lbl) => {
      const g = group.findOne(`.calc-bsel-${lbl}`);
      const active = baseByLabel[lbl] === state.currentBase;
      g?.findOne(".rect")?.fill(active ? C.btnBaseAct : C.btnBase);
      g?.findOne(".label")?.fill(active ? C.textBaseAct : C.textBase);
    });

    // Hex row – enable only in HEX mode
    "ABCDEF".split("").forEach((d) => {
      const g = group.findOne(`.calc-hex-${d}`);
      const on = state.currentBase === 16;
      g?.findOne(".rect")?.fill(on ? C.btnHexOn : C.btnHexDim);
      g?.findOne(".label")?.fill(on ? C.textHexOn : C.textHexDim);
    });

    // Digit buttons – dim those invalid for the current base
    const validSet = new Set(VALID_DIGITS[state.currentBase] ?? "");
    for (let i = 0; i <= 9; i++) {
      const g = group.findOne(`.calc-btn-d${i}`);
      const ok = validSet.has(String(i));
      g?.findOne(".rect")?.fill(ok ? C.btnNormal : C.btnDim);
      g?.findOne(".label")?.fill(ok ? C.textNorm : C.textDim);
    }
  }

  // ── Internal: dispatch user action ──────────────────────────────────────────

  _handleAction(group, action) {
    this.app.events.emit("node:change:start", { node: group });

    const state = { ...(group.getAttr("calcState") ?? defaultState()) };
    this._processAction(state, action);

    group.setAttr("calcState", state);
    this._updateDisplay(group, state);
    group.getLayer()?.batchDraw();

    this.app.events.emit("node:changed", { node: group });
  }

  // ── Internal: pure state machine ────────────────────────────────────────────

  _processAction(state, action) {
    switch (action.type) {
      case "digit": {
        const d = String(action.value).toUpperCase();
        const valid = VALID_DIGITS[state.currentBase] ?? "";
        if (!valid.includes(d)) return;

        if (state.waitingForInput) {
          state.inputStr = d === "." ? "0." : d;
          state.waitingForInput = false;
        } else if (d === "." && state.currentBase === 10) {
          if (!state.inputStr.includes(".")) state.inputStr += ".";
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
          const result = compute(state.accumulator, state.pendingOp, cur);
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
          const result = compute(state.accumulator, state.pendingOp, cur);
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
        state.currentBase = base; // preserve active base after clear
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
        const newBase = action.value;
        if (newBase === state.currentBase) return;
        const n = parseValue(state.inputStr, state.currentBase);
        state.currentBase = newBase;
        state.inputStr = valueToString(n, newBase);
        // Keep accumulator; it's stored as a number, so no conversion needed.
        break;
      }
    }
  }
}
