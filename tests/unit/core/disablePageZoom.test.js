import { afterEach, describe, expect, it } from "vitest";

import { disablePageZoom } from "../../../src/lib/disablePageZoom.js";

let cleanup = null;

afterEach(() => {
  cleanup?.();
  cleanup = null;
});

function dispatchCancelableWindowEvent(event) {
  window.dispatchEvent(event);
  return event.defaultPrevented;
}

describe("disablePageZoom", () => {
  it("prevents browser zoom wheel gestures", () => {
    cleanup = disablePageZoom();

    const prevented = dispatchCancelableWindowEvent(new WheelEvent("wheel", {
      ctrlKey: true,
      cancelable: true,
    }));

    expect(prevented).toBe(true);
  });

  it("does not prevent ordinary wheel events", () => {
    cleanup = disablePageZoom();

    const prevented = dispatchCancelableWindowEvent(new WheelEvent("wheel", {
      cancelable: true,
    }));

    expect(prevented).toBe(false);
  });

  it("prevents browser zoom keyboard shortcuts without stopping propagation", () => {
    cleanup = disablePageZoom();
    let propagated = false;
    const onKeyDown = () => {
      propagated = true;
    };

    window.addEventListener("keydown", onKeyDown);
    const prevented = dispatchCancelableWindowEvent(new KeyboardEvent("keydown", {
      key: "=",
      metaKey: true,
      cancelable: true,
    }));
    window.removeEventListener("keydown", onKeyDown);

    expect(prevented).toBe(true);
    expect(propagated).toBe(true);
  });

  it("does not prevent unrelated keyboard shortcuts", () => {
    cleanup = disablePageZoom();

    const prevented = dispatchCancelableWindowEvent(new KeyboardEvent("keydown", {
      key: "s",
      metaKey: true,
      cancelable: true,
    }));

    expect(prevented).toBe(false);
  });

  it("prevents Safari gesture zoom events", () => {
    cleanup = disablePageZoom();

    const prevented = dispatchCancelableWindowEvent(new Event("gesturestart", {
      cancelable: true,
    }));

    expect(prevented).toBe(true);
  });

  it("removes listeners when cleaned up", () => {
    cleanup = disablePageZoom();
    cleanup();
    cleanup = null;

    const prevented = dispatchCancelableWindowEvent(new WheelEvent("wheel", {
      ctrlKey: true,
      cancelable: true,
    }));

    expect(prevented).toBe(false);
  });
});
