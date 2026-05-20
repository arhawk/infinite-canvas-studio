import { describe, expect, it, vi } from "vitest";

vi.mock("../../../src/lib/konva.js", () => ({
  Konva: {
    Line: class MockLine {},
  },
}));

import { importDocumentSnapshot } from "../../../src/document/serializer.js";

function createApp() {
  return {
    stage: {
      x: () => 0,
      y: () => 0,
    },
    stageApi: {
      getScale: () => 1,
      getBackgroundState: () => ({ type: "blank", color: "#ffffff", opacity: 1 }),
      setBackgroundState: vi.fn(),
      setViewport: vi.fn(),
    },
    mainLayer: {
      getChildren: vi.fn(() => []),
      add: vi.fn(),
      batchDraw: vi.fn(),
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

describe("document serializer strict import behavior", () => {
  it("fails import for unsupported component types such as container", async () => {
    const app = createApp();

    await expect(importDocumentSnapshot(app, {
      schemaVersion: 1,
      documentId: "doc-unsupported-1",
      nodes: [
        {
          id: "container-1",
          type: "container",
          x: 0,
          y: 0,
          data: {},
        },
      ],
      drawings: [],
    })).rejects.toThrow("Unsupported component type in document: container");
  });

  it("does not attempt compatibility migration after restoring text nodes", async () => {
    const app = createApp();
    app.components.get = vi.fn((type) => {
      if (type !== "text") return null;
      return {
        restore: vi.fn(async () => ({
          id: () => "text-1",
          getParent: () => app.mainLayer,
          moveTo: vi.fn(),
          position: vi.fn(),
        })),
      };
    });

    await importDocumentSnapshot(app, {
      schemaVersion: 1,
      documentId: "doc-no-legacy-migration",
      nodes: [
        {
          id: "text-1",
          type: "text",
          x: 10,
          y: 20,
          data: {
            text: "left",
            termDefinition: { peerId: "text-2", required: true },
          },
        },
      ],
      drawings: [],
    });

    expect(app.addComponent).not.toHaveBeenCalled();
  });
});
