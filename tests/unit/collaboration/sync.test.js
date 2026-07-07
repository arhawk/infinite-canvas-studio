import { describe, expect, it, vi } from "vitest";
import { flattenHistoryEntry, normalizeCollaborationPatch } from "../../../src/collaboration/ops.js";
import { CollaborationSync } from "../../../src/collaboration/sync.js";

describe("collaboration ops", () => {
  it("flattens batch history entries", () => {
    const operations = flattenHistoryEntry({
      type: "batch",
      operations: [
        { type: "add-drawing", snapshot: { id: "d1" } },
        { type: "remove-drawing", snapshot: { id: "d2" } },
      ],
    });

    expect(operations).toHaveLength(2);
    expect(operations[0].type).toBe("add-drawing");
  });

  it("normalizes collaboration patch payloads", () => {
    expect(normalizeCollaborationPatch({
      baseRevision: 2,
      revision: 3,
      operations: [{ type: "update-node", after: { id: "n1" } }],
      compareState: { isOpen: true },
      authorId: "viewer-1",
      opId: "op-1",
    })).toMatchObject({
      baseRevision: 2,
      revision: 3,
      authorId: "viewer-1",
      opId: "op-1",
    });
  });
});

describe("CollaborationSync", () => {
  it("queues host patches from committed history", () => {
    vi.useFakeTimers();
    const sendPatch = vi.fn();
    const app = {
      isRestoringDocument: false,
      isApplyingRemotePatch: false,
      isReplayingHistory: false,
      on: vi.fn(() => () => {}),
    };
    const sync = new CollaborationSync(app, {
      getRevision: () => 4,
      advanceRevision: () => 5,
      isHost: () => true,
      isCoEditor: () => false,
      sendPatch,
    });
    sync.start();

    sync.handleLocalHistoryCommit({
      type: "update-node",
      before: { id: "n1" },
      after: { id: "n1", x: 10 },
    });
    vi.runAllTimers();

    expect(sendPatch).toHaveBeenCalledWith({
      baseRevision: 4,
      revision: 5,
      operations: [{ type: "update-node", before: { id: "n1" }, after: { id: "n1", x: 10 } }],
      authorId: null,
    });
    sync.destroy();
    vi.useRealTimers();
  });

  it("applies remote patches when base revision matches", async () => {
    let revision = 2;
    const applyOperations = vi.fn(async () => {});
    const app = {
      isRestoringDocument: false,
      isApplyingRemotePatch: false,
      isReplayingHistory: false,
      on: vi.fn(() => () => {}),
    };
    const sync = new CollaborationSync(app, {
      getRevision: () => revision,
      setRevision: (value) => {
        revision = value;
      },
      isHost: () => false,
      isCoEditor: () => false,
      sendPatch: vi.fn(),
    });

    const result = await sync.applyRemotePatch({
      baseRevision: 2,
      revision: 3,
      operations: [{ type: "add-drawing", snapshot: { id: "d1" } }],
    }, { applyOperations });

    expect(result).toMatchObject({ ok: true, reason: "applied" });
    expect(applyOperations).toHaveBeenCalledTimes(1);
    expect(revision).toBe(3);
    expect(app.isApplyingRemotePatch).toBe(false);
  });

  it("reports revision mismatch without applying stale patches", async () => {
    const applyOperations = vi.fn(async () => {});
    const app = {
      isRestoringDocument: false,
      isApplyingRemotePatch: false,
      isReplayingHistory: false,
      on: vi.fn(() => () => {}),
    };
    const sync = new CollaborationSync(app, {
      getRevision: () => 5,
      setRevision: vi.fn(),
      isHost: () => false,
      isCoEditor: () => false,
      sendPatch: vi.fn(),
    });

    const result = await sync.applyRemotePatch({
      baseRevision: 4,
      revision: 6,
      operations: [{ type: "add-drawing", snapshot: { id: "d1" } }],
    }, { applyOperations });

    expect(result).toMatchObject({ ok: false, reason: "revision-mismatch" });
    expect(applyOperations).not.toHaveBeenCalled();
  });
});
