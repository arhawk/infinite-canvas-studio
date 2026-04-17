import { describe, expect, it } from "vitest";
import { normalizeTextAnnotations } from "../../../src/lib/textAnnotations.js";

describe("text annotations", () => {
  it("merges overlapping ranges on the same target", () => {
    expect(normalizeTextAnnotations([
      { id: "a", target: "text", start: 6, end: 10, color: "#f4b74c" },
      { id: "b", target: "text", start: 8, end: 14, color: "#f4b74c" },
    ])).toEqual([
      { id: "a", target: "text", start: 6, end: 14, color: "#f4b74c" },
    ]);
  });

  it("keeps separate ranges when they do not touch", () => {
    expect(normalizeTextAnnotations([
      { id: "a", target: "text", start: 0, end: 4, color: "#f4b74c" },
      { id: "b", target: "text", start: 6, end: 10, color: "#f4b74c" },
    ])).toEqual([
      { id: "a", target: "text", start: 0, end: 4, color: "#f4b74c" },
      { id: "b", target: "text", start: 6, end: 10, color: "#f4b74c" },
    ]);
  });
});
