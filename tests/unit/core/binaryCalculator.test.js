import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../src/lib/icons.js", () => ({
  renderIcons: vi.fn(),
}));

import { BinaryCalculatorPlugin } from "../../../src/plugins/binaryCalculator.js";

let plugin;

function createDom() {
  document.body.innerHTML = `
    <button id="calculator-toggle" type="button" aria-pressed="false"></button>
    <div id="calculator-widget" hidden></div>
  `;
}

function setupPlugin() {
  plugin = new BinaryCalculatorPlugin(
    {},
    {
      toggleEl: document.querySelector("#calculator-toggle"),
      widgetEl: document.querySelector("#calculator-widget"),
    },
  );
  plugin.setup();
  return plugin;
}

function press(key, target = document) {
  const event = new KeyboardEvent("keydown", {
    key,
    bubbles: true,
    cancelable: true,
  });
  target.dispatchEvent(event);
  return event;
}

function displayValue() {
  return document.querySelector(".calc-widget__display-val").textContent;
}

describe("BinaryCalculatorPlugin", () => {
  beforeEach(() => {
    createDom();
    setupPlugin();
  });

  afterEach(() => {
    plugin?.destroy();
    plugin = null;
    document.body.innerHTML = "";
  });

  it("accepts keyboard digits and arithmetic operators while open", () => {
    document.querySelector("#calculator-toggle").click();

    press("1");
    press("2");
    press("+");
    press("3");
    press("Enter");

    expect(displayValue()).toBe("15");
  });

  it("supports keyboard multiplication, division, backspace, and equals", () => {
    document.querySelector("#calculator-toggle").click();

    press("9");
    press("Backspace");
    press("8");
    press("*");
    press("6");
    press("/");
    press("4");
    press("=");

    expect(displayValue()).toBe("12");
  });

  it("ignores keyboard input while closed or while an editor has focus", () => {
    press("7");
    expect(displayValue()).toBe("0");

    document.querySelector("#calculator-toggle").click();
    const input = document.createElement("input");
    document.body.append(input);
    input.focus();

    const event = press("7", input);

    expect(event.defaultPrevented).toBe(false);
    expect(displayValue()).toBe("0");
  });
});
