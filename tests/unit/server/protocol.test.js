import { describe, expect, it } from "vitest";
import {
  canHostRelayMessageType,
  canViewerRelayMessageType,
  isAppRelayMessageType,
} from "../../../server/src/protocol.js";

describe("room protocol relay compatibility", () => {
  it("treats future app-prefixed messages as relayable business events", () => {
    expect(isAppRelayMessageType("app:reaction")).toBe(true);
    expect(isAppRelayMessageType("app:future-widget-event")).toBe(true);
    expect(isAppRelayMessageType("room:reaction")).toBe(false);
    expect(isAppRelayMessageType("viewer:join")).toBe(false);
  });

  it("allows hosts to broadcast room protocol state and future app events", () => {
    expect(canHostRelayMessageType("room:state")).toBe(true);
    expect(canHostRelayMessageType("room:viewport")).toBe(true);
    expect(canHostRelayMessageType("app:reaction")).toBe(true);
    expect(canHostRelayMessageType("app:future-widget-event")).toBe(true);
    expect(canHostRelayMessageType("room:error")).toBe(false);
    expect(canHostRelayMessageType("room:closed")).toBe(false);
    expect(canHostRelayMessageType("room:reaction")).toBe(false);
  });

  it("allows viewers to relay future app events without granting room protocol control", () => {
    expect(canViewerRelayMessageType("app:reaction")).toBe(true);
    expect(canViewerRelayMessageType("app:future-widget-event")).toBe(true);
    expect(canViewerRelayMessageType("app:timer-state")).toBe(false);
    expect(canViewerRelayMessageType("app:calculator-state")).toBe(false);
    expect(canViewerRelayMessageType("room:reaction")).toBe(false);
    expect(canViewerRelayMessageType("room:state")).toBe(false);
    expect(canViewerRelayMessageType("room:viewport")).toBe(false);
    expect(canViewerRelayMessageType("room:request-state")).toBe(false);
  });
});
