import { describe, expect, it } from "vitest";
import { DEFAULT_BACKGROUND_STATE, normalizeBackgroundState } from "../../../src/background/state.js";

describe("background state normalization", () => {
  it("keeps default opacity at 1", () => {
    expect(DEFAULT_BACKGROUND_STATE.opacity).toBe(1);
    expect(normalizeBackgroundState({})).toEqual(DEFAULT_BACKGROUND_STATE);
  });

  it("accepts valid opacity values and clamps boundaries", () => {
    expect(normalizeBackgroundState({ opacity: 0 }).opacity).toBe(0);
    expect(normalizeBackgroundState({ opacity: 1 }).opacity).toBe(1);
    expect(normalizeBackgroundState({ opacity: 0.42 }).opacity).toBe(0.42);
    expect(normalizeBackgroundState({ opacity: -0.3 }).opacity).toBe(0);
    expect(normalizeBackgroundState({ opacity: 9 }).opacity).toBe(1);
  });

  it("falls back to default opacity for invalid values", () => {
    expect(normalizeBackgroundState({ opacity: null }).opacity).toBe(1);
    expect(normalizeBackgroundState({ opacity: "not-a-number" }).opacity).toBe(1);
  });
});
