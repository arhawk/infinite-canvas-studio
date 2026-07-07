import { flattenHistoryEntry, normalizeCollaborationPatch } from "./ops.js";

const PATCH_DEBOUNCE_MS = 120;
const FULL_STATE_DEBOUNCE_MS = 500;

function clonePlainData(value) {
  if (value == null) return value;
  return JSON.parse(JSON.stringify(value));
}

export class CollaborationSync {
  constructor(app, options = {}) {
    this.app = app;
    this.getRevision = options.getRevision ?? (() => 0);
    this.setRevision = options.setRevision ?? (() => {});
    this.advanceRevision = options.advanceRevision ?? (() => this.getRevision() + 1);
    this.isHost = options.isHost ?? (() => false);
    this.isCoEditor = options.isCoEditor ?? (() => false);
    this.getConnectionId = options.getConnectionId ?? (() => null);
    this.sendPatch = options.sendPatch ?? (() => {});
    this.sendCoEditorOp = options.sendCoEditorOp ?? (() => {});
    this.sendFullState = options.sendFullState ?? (() => {});
    this.getCompareState = options.getCompareState ?? (() => null);
    this.shouldIncludeCompareState = options.shouldIncludeCompareState ?? (() => false);
    this.consumeCompareStateFlag = options.consumeCompareStateFlag ?? (() => {});

    this.pendingOperations = [];
    this.pendingPatchTimer = null;
    this.pendingFullStateTimer = null;
    this.includeCompareState = false;
    this.lastAppliedOpId = null;
    this.unsubscribe = null;
  }

  start() {
    this.unsubscribe = this.app.on("history:committed", ({ entry }) => {
      this.handleLocalHistoryCommit(entry);
    });
  }

  destroy() {
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.clearTimers();
    this.pendingOperations = [];
  }

  clearTimers() {
    if (this.pendingPatchTimer != null) {
      window.clearTimeout(this.pendingPatchTimer);
      this.pendingPatchTimer = null;
    }
    if (this.pendingFullStateTimer != null) {
      window.clearTimeout(this.pendingFullStateTimer);
      this.pendingFullStateTimer = null;
    }
  }

  markCompareStateNeeded() {
    this.includeCompareState = true;
  }

  shouldSuppressSync() {
    return (
      this.app.isRestoringDocument ||
      this.app.isApplyingRemotePatch ||
      this.app.isReplayingHistory
    );
  }

  handleLocalHistoryCommit(entry) {
    if (this.shouldSuppressSync()) return;

    const operations = flattenHistoryEntry(entry);
    if (!operations.length) return;

    if (this.isCoEditor()) {
      this.sendCoEditorProposal(operations);
      return;
    }

    if (!this.isHost()) return;

    this.pendingOperations.push(...operations);
    this.schedulePatch();
  }

  sendCoEditorProposal(operations) {
    const baseRevision = this.getRevision();
    const opId = `${this.getConnectionId() ?? "coeditor"}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    this.sendCoEditorOp({
      baseRevision,
      operations: clonePlainData(operations),
      opId,
      viewerId: this.getConnectionId(),
    });
    this.lastAppliedOpId = opId;
  }

  schedulePatch() {
    if (this.pendingPatchTimer != null) return;
    this.pendingPatchTimer = window.setTimeout(() => {
      this.pendingPatchTimer = null;
      this.flushPatch();
    }, PATCH_DEBOUNCE_MS);
  }

  scheduleFullState() {
    if (this.pendingFullStateTimer != null) return;
    this.pendingFullStateTimer = window.setTimeout(() => {
      this.pendingFullStateTimer = null;
      void this.sendFullState();
    }, FULL_STATE_DEBOUNCE_MS);
  }

  flushPatch() {
    if (!this.isHost() || !this.pendingOperations.length || this.shouldSuppressSync()) {
      this.pendingOperations = [];
      return;
    }

    const operations = this.pendingOperations.map((operation) => clonePlainData(operation));
    this.pendingOperations = [];

    const baseRevision = this.getRevision();
    const revision = this.advanceRevision();
    const payload = {
      baseRevision,
      revision,
      operations,
      authorId: this.getConnectionId(),
    };

    if (this.includeCompareState || this.shouldIncludeCompareState()) {
      payload.compareState = this.getCompareState();
      this.includeCompareState = false;
      this.consumeCompareStateFlag?.();
    }

    this.sendPatch(payload);
  }

  async applyRemotePatch(rawPayload, { applyOperations }) {
    const patch = normalizeCollaborationPatch(rawPayload);
    if (!patch || !patch.operations.length) return { ok: false, reason: "invalid-patch" };

    const localRevision = this.getRevision();
    if (patch.revision <= localRevision) {
      return { ok: true, reason: "already-applied" };
    }

    if (patch.baseRevision !== localRevision) {
      return { ok: false, reason: "revision-mismatch", expected: localRevision, got: patch.baseRevision };
    }

    if (patch.opId && patch.opId === this.lastAppliedOpId) {
      this.setRevision(patch.revision);
      return { ok: true, reason: "self-echo" };
    }

    this.app.isApplyingRemotePatch = true;
    try {
      await applyOperations(patch.operations);
      this.setRevision(patch.revision);
      this.lastAppliedOpId = patch.opId;
      return { ok: true, reason: "applied" };
    } finally {
      this.app.isApplyingRemotePatch = false;
    }
  }

  async handleHostCoEditorOp(payload, { applyOperations }) {
    const proposal = normalizeCollaborationPatch({
      baseRevision: payload.baseRevision,
      revision: payload.baseRevision,
      operations: payload.operations,
      opId: payload.opId,
      authorId: payload.viewerId ?? payload.authorId ?? null,
    });

    if (!proposal || !proposal.operations.length) {
      return { ok: false, reason: "invalid-proposal" };
    }

    const localRevision = this.getRevision();
    if (proposal.baseRevision !== localRevision) {
      this.scheduleFullState();
      return { ok: false, reason: "revision-mismatch" };
    }

    this.app.isApplyingRemotePatch = true;
    try {
      await applyOperations(proposal.operations);
    } finally {
      this.app.isApplyingRemotePatch = false;
    }

    const revision = this.advanceRevision();
    this.sendPatch({
      baseRevision: localRevision,
      revision,
      operations: proposal.operations,
      authorId: proposal.authorId,
      opId: proposal.opId,
    });

    return { ok: true, reason: "sequenced" };
  }

  setRevisionFromDocument(document) {
    if (Number.isFinite(document?.revision)) {
      this.setRevision(document.revision);
    }
  }
}
