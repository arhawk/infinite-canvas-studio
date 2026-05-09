import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../src/lib/konva.js", () => {
  class MockNode {
    constructor(attrs = {}) {
      this.attrs = { ...attrs };
      this.children = [];
    }

    add(child) {
      this.children.push(child);
      return this;
    }

    destroyChildren() {
      this.children = [];
    }

    batchDraw() {}

    on() {}

    destroy() {}

    getAttr(key) {
      return this.attrs[key];
    }

    setAttr(key, value) {
      this.attrs[key] = value;
    }
  }

  class MockStage extends MockNode {
    constructor({ container, width, height }) {
      super();
      this._container = container;
      this._width = width;
      this._height = height;
      this._x = 0;
      this._y = 0;
      this._scaleX = 1;
      this._scaleY = 1;
    }

    container() {
      return this._container;
    }

    width() {
      return this._width;
    }

    height() {
      return this._height;
    }

    size({ width, height }) {
      this._width = width;
      this._height = height;
    }

    scale(nextScale) {
      this._scaleX = nextScale.x;
      this._scaleY = nextScale.y;
    }

    scaleX() {
      return this._scaleX;
    }

    x() {
      return this._x;
    }

    y() {
      return this._y;
    }

    position({ x, y }) {
      this._x = x;
      this._y = y;
    }

    getPointerPosition() {
      return null;
    }
  }

  class MockLayer extends MockNode {}
  class MockLine extends MockNode {}
  class MockTween {
    constructor(config) {
      this.config = config;
    }

    play() {
      this.config.onUpdate?.();
      this.config.onFinish?.();
    }
  }

  return {
    Konva: {
      Stage: MockStage,
      Layer: MockLayer,
      Line: MockLine,
      Tween: MockTween,
      Easings: {
        EaseInOut: "EaseInOut",
      },
    },
  };
});

import { StageController } from "../../../src/stage.js";

function createContainer(width, height) {
  const size = { width, height };
  const container = document.createElement("div");
  Object.defineProperties(container, {
    clientWidth: {
      configurable: true,
      get: () => size.width,
    },
    clientHeight: {
      configurable: true,
      get: () => size.height,
    },
  });
  container.getBoundingClientRect = () => ({
    width: size.width,
    height: size.height,
    top: 0,
    left: 0,
    right: size.width,
    bottom: size.height,
  });

  return {
    container,
    setSize: (nextWidth, nextHeight) => {
      size.width = nextWidth;
      size.height = nextHeight;
    },
  };
}

describe("StageController", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal("requestAnimationFrame", (callback) => {
      return setTimeout(() => callback(0), 0);
    });
    vi.stubGlobal("cancelAnimationFrame", (handle) => clearTimeout(handle));
    vi.stubGlobal("ResizeObserver", class {
      constructor(callback) {
        this.callback = callback;
      }

      observe() {}

      disconnect() {}
    });
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("ignores zero-sized resize measurements instead of blanking the stage", () => {
    const { container, setSize } = createContainer(640, 480);
    const controller = new StageController(container);

    setSize(0, 0);
    controller.onResize();
    vi.runOnlyPendingTimers();

    expect(controller.stage.width()).toBe(640);
    expect(controller.stage.height()).toBe(480);

    controller.destroy();
  });

  it("recovers once the container has a valid size again", () => {
    const { container, setSize } = createContainer(640, 480);
    const controller = new StageController(container);

    setSize(0, 0);
    controller.onResize();
    vi.runOnlyPendingTimers();
    setSize(360, 240);
    controller.onResize();
    vi.runOnlyPendingTimers();

    expect(controller.stage.width()).toBe(360);
    expect(controller.stage.height()).toBe(240);

    controller.destroy();
  });

  it("keeps the canvas point under the pointer stable when scaling", () => {
    const { container } = createContainer(800, 600);
    const controller = new StageController(container);
    controller.setViewport({
      scale: 1,
      position: { x: -120, y: -80 },
    });

    const pointer = { x: 340, y: 260 };
    const before = controller.screenToCanvas(pointer);

    controller.setScale(1.8, pointer);

    const after = controller.screenToCanvas(pointer);
    expect(after.x).toBeCloseTo(before.x, 6);
    expect(after.y).toBeCloseTo(before.y, 6);

    controller.destroy();
  });

  it("clamps scale changes to the configured zoom bounds", () => {
    const { container } = createContainer(800, 600);
    const controller = new StageController(container);

    controller.setScale(99, { x: 400, y: 300 });
    expect(controller.getScale()).toBe(5);

    controller.setScale(0.001, { x: 400, y: 300 });
    expect(controller.getScale()).toBe(0.1);

    controller.destroy();
  });
});
