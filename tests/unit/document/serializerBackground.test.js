import { describe, expect, it, vi } from "vitest";
import { DEFAULT_BACKGROUND_STATE } from "../../../src/background/state.js";

vi.mock("../../../src/lib/konva.js", () => ({
  Konva: {
    Line: class MockLine {},
  },
}));

import {
  exportDocumentSnapshot,
  importDocumentSnapshot,
} from "../../../src/document/serializer.js";

function createApp(backgroundState = DEFAULT_BACKGROUND_STATE) {
  const background = { ...backgroundState };

  return {
    stage: {
      x: () => 120,
      y: () => -40,
    },
    stageApi: {
      getScale: () => 1.5,
      getBackgroundState: () => ({ ...background }),
      setViewport: vi.fn(),
    },
    getBackgroundState: () => ({ ...background }),
    setBackgroundState: vi.fn((nextState) => {
      background.type = nextState.type;
      background.color = nextState.color;
      background.opacity = nextState.opacity;
      background.themeId = nextState.themeId;
      return { ...background };
    }),
    mainLayer: {
      getChildren: () => [],
      batchDraw: vi.fn(),
      find: vi.fn(() => []),
      findOne: vi.fn(() => null),
    },
    drawLayer: {
      find: vi.fn(() => []),
      destroyChildren: vi.fn(),
      batchDraw: vi.fn(),
    },
    overlayLayer: {
      batchDraw: vi.fn(),
    },
    uiLayer: {
      batchDraw: vi.fn(),
    },
    events: {
      emit: vi.fn(),
    },
    components: {
      get: vi.fn(() => null),
    },
    addComponent: vi.fn(),
    setSelectableIndex: vi.fn(),
  };
}

describe("document serializer background support", () => {
  it("includes background settings in exported documents", () => {
    const app = createApp({
      type: "grid",
      color: "#dde6f5",
    });

    const snapshot = exportDocumentSnapshot(app, {
      documentId: "doc-bg-1",
      revision: 4,
      meta: { title: "Background test" },
    });

    expect(snapshot.background).toEqual({
      type: "grid",
      color: "#dde6f5",
      opacity: 1,
      themeId: "default",
    });
  });

  it("exports the latest background type and color after user changes", () => {
    const app = createApp({
      type: "warm-paper",
      color: "#ead7b1",
    });

    const snapshot = exportDocumentSnapshot(app, {
      documentId: "doc-bg-4",
      revision: 5,
      meta: { title: "Updated background" },
    });

    expect(snapshot.background).toEqual({
      type: "warm-paper",
      color: "#ead7b1",
      opacity: 1,
      themeId: "default",
    });
  });

  it("restores background settings when loading a saved document", async () => {
    const app = createApp();

    await importDocumentSnapshot(app, {
      schemaVersion: 1,
      documentId: "doc-bg-2",
      background: {
        type: "warm-paper",
        color: "#ead7b1",
        opacity: 0.42,
      },
      view: {
        scale: 1.1,
        position: { x: 12, y: 34 },
      },
      nodes: [],
      drawings: [],
    });

    expect(app.setBackgroundState).toHaveBeenCalledWith({
      type: "warm-paper",
      color: "#ead7b1",
      opacity: 0.42,
      themeId: "default",
    });
  });

  it("restores the latest saved background type and color values from imported data", async () => {
    const app = createApp();

    await importDocumentSnapshot(app, {
      schemaVersion: 1,
      documentId: "doc-bg-5",
      background: {
        type: "solid",
        color: "#c8d8f0",
        opacity: 0.66,
      },
      view: {
        scale: 0.9,
        position: { x: -12, y: 18 },
      },
      nodes: [],
      drawings: [],
    });

    expect(app.setBackgroundState).toHaveBeenCalledWith({
      type: "solid",
      color: "#c8d8f0",
      opacity: 0.66,
      themeId: "default",
    });
  });

  it("uses the default background when loading current documents without a background field", async () => {
    const app = createApp({
      type: "solid",
      color: "#111111",
    });

    await importDocumentSnapshot(app, {
      schemaVersion: 1,
      documentId: "doc-bg-3",
      view: {
        scale: 1,
        position: { x: 0, y: 0 },
      },
      nodes: [],
      drawings: [],
    });

    expect(app.setBackgroundState).toHaveBeenCalledWith(DEFAULT_BACKGROUND_STATE);
  });
});
