import { describe, it, expect, vi } from "vitest";

// Mock Konva before importing the component (Konva needs `canvas` in Node.js)
vi.mock("../../../src/lib/konva.js", () => {
  class FakeNode {
    constructor(cfg = {}) {
      this._attrs = { ...cfg };
    }
    add() {}
    on() {}
    findOne() { return null; }
    getLayer() { return null; }
    getAttr(k) { return this._attrs[k]; }
    setAttr(k, v) { this._attrs[k] = v; }
  }
  return { Konva: { Group: FakeNode, Rect: FakeNode, Text: FakeNode } };
});

import {
  BinaryCalculatorComponent,
  defaultState,
  parseValue,
  valueToString,
  compute,
} from "../../../src/component/binaryCalculator.js";

// ── Minimal mock so the component can be instantiated without a real App ───────
function makeApp() {
  return { events: { emit: vi.fn() } };
}

// Mock node that only stores attrs (no real Konva required)
function makeMockNode(initialState = null) {
  const attrs = {};
  if (initialState) attrs.calcState = { ...initialState };
  return {
    attrs,
    getAttr(key) { return this.attrs[key]; },
    setAttr(key, val) { this.attrs[key] = val; },
    findOne() { return null; },   // _updateDisplay degrades gracefully
    getLayer() { return null; },
  };
}

// ── Pure helpers ───────────────────────────────────────────────────────────────

describe("parseValue", () => {
  it("parses decimal", () => {
    expect(parseValue("42", 10)).toBe(42);
    expect(parseValue("-7", 10)).toBe(-7);
    expect(parseValue("3.5", 10)).toBeCloseTo(3.5);
  });
  it("parses binary", () => {
    expect(parseValue("1010", 2)).toBe(10);
    expect(parseValue("11111111", 2)).toBe(255);
  });
  it("parses octal", () => {
    expect(parseValue("17", 8)).toBe(15);
  });
  it("parses hex", () => {
    expect(parseValue("FF", 16)).toBe(255);
    expect(parseValue("1A", 16)).toBe(26);
  });
  it("returns 0 for empty/invalid input", () => {
    expect(parseValue("", 10)).toBe(0);
    expect(parseValue("-", 10)).toBe(0);
  });
});

describe("valueToString", () => {
  it("formats decimal", () => {
    expect(valueToString(42, 10)).toBe("42");
    expect(valueToString(-7, 10)).toBe("-7");
  });
  it("formats binary", () => {
    expect(valueToString(10, 2)).toBe("1010");
    expect(valueToString(255, 2)).toBe("11111111");
  });
  it("formats octal", () => {
    expect(valueToString(15, 8)).toBe("17");
  });
  it("formats hex (uppercase)", () => {
    expect(valueToString(255, 16)).toBe("FF");
    expect(valueToString(26, 16)).toBe("1A");
  });
  it("truncates to integer for non-decimal bases", () => {
    expect(valueToString(10.9, 2)).toBe("1010");
  });
  it("returns ERR for non-finite", () => {
    expect(valueToString(NaN, 10)).toBe("ERR");
    expect(valueToString(Infinity, 10)).toBe("ERR");
  });
});

describe("compute", () => {
  it("arithmetic", () => {
    expect(compute(10, "+", 5)).toBe(15);
    expect(compute(10, "−", 3)).toBe(7);
    expect(compute(4, "×", 3)).toBe(12);
    expect(compute(10, "÷", 4)).toBe(2.5);
  });
  it("division by zero → NaN", () => {
    expect(compute(5, "÷", 0)).toBeNaN();
  });
  it("bitwise AND", () => {
    expect(compute(0b1100, "AND", 0b1010)).toBe(0b1000);
  });
  it("bitwise OR", () => {
    expect(compute(0b1100, "OR", 0b1010)).toBe(0b1110);
  });
  it("bitwise XOR", () => {
    expect(compute(0b1100, "XOR", 0b1010)).toBe(0b0110);
  });
});

// ── State machine (_processAction) ────────────────────────────────────────────

describe("BinaryCalculatorComponent._processAction", () => {
  function make() {
    return new BinaryCalculatorComponent(makeApp());
  }

  it("types digits", () => {
    const comp = make();
    const s = defaultState();
    comp._processAction(s, { type: "digit", value: "4" });
    comp._processAction(s, { type: "digit", value: "2" });
    expect(s.inputStr).toBe("42");
  });

  it("ignores digits invalid for current base", () => {
    const comp = make();
    const s = { ...defaultState(), currentBase: 2 };
    comp._processAction(s, { type: "digit", value: "2" }); // invalid in BIN
    expect(s.inputStr).toBe("0");
    comp._processAction(s, { type: "digit", value: "1" });
    expect(s.inputStr).toBe("1");
  });

  it("addition: 3 + 4 = 7", () => {
    const comp = make();
    const s = defaultState();
    comp._processAction(s, { type: "digit", value: "3" });
    comp._processAction(s, { type: "op", value: "+" });
    comp._processAction(s, { type: "digit", value: "4" });
    comp._processAction(s, { type: "equals" });
    expect(s.inputStr).toBe("7");
  });

  it("chained ops: 2 + 3 × 4 = 20 (left-to-right, no precedence)", () => {
    const comp = make();
    const s = defaultState();
    comp._processAction(s, { type: "digit", value: "2" });
    comp._processAction(s, { type: "op", value: "+" });
    comp._processAction(s, { type: "digit", value: "3" });
    comp._processAction(s, { type: "op", value: "×" }); // evaluates 2+3=5 first
    comp._processAction(s, { type: "digit", value: "4" });
    comp._processAction(s, { type: "equals" });
    expect(s.inputStr).toBe("20");
  });

  it("AND in binary mode", () => {
    const comp = make();
    const s = { ...defaultState(), currentBase: 2 };
    // 1100 AND 1010 = 1000
    "1100".split("").forEach((d) => comp._processAction(s, { type: "digit", value: d }));
    comp._processAction(s, { type: "op", value: "AND" });
    "1010".split("").forEach((d) => comp._processAction(s, { type: "digit", value: d }));
    comp._processAction(s, { type: "equals" });
    expect(s.inputStr).toBe("1000");
  });

  it("base change converts inputStr", () => {
    const comp = make();
    const s = defaultState();
    comp._processAction(s, { type: "digit", value: "1" });
    comp._processAction(s, { type: "digit", value: "0" });
    // decimal 10 → binary 1010
    comp._processAction(s, { type: "base", value: 2 });
    expect(s.inputStr).toBe("1010");
    expect(s.currentBase).toBe(2);
  });

  it("clear resets input but keeps current base", () => {
    const comp = make();
    const s = { ...defaultState(), currentBase: 16, inputStr: "FF" };
    comp._processAction(s, { type: "clear" });
    expect(s.inputStr).toBe("0");
    expect(s.currentBase).toBe(16);
    expect(s.pendingOp).toBeNull();
  });

  it("backspace removes last character", () => {
    const comp = make();
    const s = { ...defaultState(), inputStr: "123" };
    comp._processAction(s, { type: "back" });
    expect(s.inputStr).toBe("12");
  });

  it("negate flips sign", () => {
    const comp = make();
    const s = { ...defaultState(), inputStr: "5" };
    comp._processAction(s, { type: "negate" });
    expect(s.inputStr).toBe("-5");
    comp._processAction(s, { type: "negate" });
    expect(s.inputStr).toBe("5");
  });
});

// ── Serialization roundtrip ───────────────────────────────────────────────────

describe("serializeNode / applySerializedData roundtrip", () => {
  it("restores calculator state after save/load", async () => {
    const comp = new BinaryCalculatorComponent(makeApp());

    // Build a non-default state
    const saved = {
      inputStr: "1A",
      accumulator: 26,
      pendingOp: "+",
      waitingForInput: true,
      currentBase: 16,
    };
    const node = makeMockNode(saved);

    // Serialize
    const snapshot = comp.serializeNode(node);
    expect(snapshot).toMatchObject(saved);

    // Apply to a fresh node
    const freshNode = makeMockNode();
    await comp.applySerializedData(freshNode, snapshot);

    const restored = freshNode.getAttr("calcState");
    expect(restored.inputStr).toBe("1A");
    expect(restored.currentBase).toBe(16);
    expect(restored.pendingOp).toBe("+");
    expect(restored.accumulator).toBe(26);
  });

  it("missing fields fall back to defaults", async () => {
    const comp = new BinaryCalculatorComponent(makeApp());
    const node = makeMockNode();
    await comp.applySerializedData(node, { inputStr: "FF", currentBase: 16 });

    const state = node.getAttr("calcState");
    expect(state.inputStr).toBe("FF");
    expect(state.currentBase).toBe(16);
    expect(state.pendingOp).toBeNull();        // default
    expect(state.waitingForInput).toBe(false); // default
  });
});
