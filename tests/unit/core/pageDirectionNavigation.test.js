import { describe, expect, it } from "vitest";

import {
  chooseDirectionalNavigationCandidate,
  scoreDirectionalNavigationCandidate,
} from "../../../src/lib/pageDirectionNavigation.js";

describe("pageDirectionNavigation", () => {
  it("prefers the candidate with the closest directional angle match", () => {
    const best = chooseDirectionalNavigationCandidate({
      origin: { x: 0, y: 0 },
      direction: "right",
      candidates: [
        {
          id: "exact-right",
          target: { x: 900, y: 0 },
        },
        {
          id: "closer-diagonal",
          target: { x: 500, y: -260 },
        },
      ],
    });

    expect(best?.id).toBe("exact-right");
    expect(best?.score.angle).toBeCloseTo(0, 8);
  });

  it("prefers the closer candidate when direction alignment is tied", () => {
    const best = chooseDirectionalNavigationCandidate({
      origin: { x: 0, y: 0 },
      direction: "up",
      candidates: [
        {
          id: "near-up",
          target: { x: 0, y: -400 },
        },
        {
          id: "far-up",
          target: { x: 0, y: -900 },
        },
      ],
    });

    expect(best?.id).toBe("near-up");
    expect(best?.score.distance).toBeCloseTo(400, 8);
  });

  it("ignores candidates that are not in the requested direction", () => {
    expect(scoreDirectionalNavigationCandidate({
      origin: { x: 0, y: 0 },
      target: { x: -240, y: 0 },
      direction: "right",
    })).toBeNull();
  });
});
