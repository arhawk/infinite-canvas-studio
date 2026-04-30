import { describe, expect, it } from "vitest";
import {
  DOCUMENT_SCHEMA_VERSION,
  normalizeDocumentSnapshot,
} from "../../../src/document/schema.js";
import { DEFAULT_BACKGROUND_STATE } from "../../../src/background/state.js";

describe("document schema", () => {
  it("normalizes a valid document snapshot with defaults", () => {
    const normalized = normalizeDocumentSnapshot({
      documentId: "document-1",
      nodes: [
        {
          id: "sticky-1",
          type: "sticky",
          data: {
            text: "hello",
          },
        },
      ],
    });

    expect(normalized).toMatchObject({
      schemaVersion: DOCUMENT_SCHEMA_VERSION,
      documentId: "document-1",
      revision: 0,
      meta: {
        title: "Untitled",
      },
      view: {
        scale: 1,
        position: {
          x: 0,
          y: 0,
        },
      },
      background: DEFAULT_BACKGROUND_STATE,
    });
    expect(normalized.nodes[0]).toMatchObject({
      id: "sticky-1",
      type: "sticky",
      zIndex: 0,
      x: 0,
      y: 0,
      rotation: 0,
      scaleX: 1,
      scaleY: 1,
      visible: true,
      opacity: 1,
      data: {
        text: "hello",
      },
    });
  });

  it("rejects unsupported schema versions", () => {
    expect(() => normalizeDocumentSnapshot({
      schemaVersion: 99,
      documentId: "document-1",
    })).toThrow(/Unsupported document schema version/);
  });

  it("rejects duplicate node ids", () => {
    expect(() => normalizeDocumentSnapshot({
      documentId: "document-1",
      nodes: [
        { id: "sticky-1", type: "sticky" },
        { id: "sticky-1", type: "text" },
      ],
    })).toThrow(/Duplicate node id/);
  });

  it("keeps explicit background settings and falls back for old documents without one", () => {
    const explicit = normalizeDocumentSnapshot({
      documentId: "document-2",
      background: {
        type: "warm-paper",
        color: "#ead7b1",
      },
    });
    const legacy = normalizeDocumentSnapshot({
      documentId: "document-3",
    });

    expect(explicit.background).toEqual({
      type: "warm-paper",
      color: "#ead7b1",
    });
    expect(legacy.background).toEqual(DEFAULT_BACKGROUND_STATE);
  });
});
