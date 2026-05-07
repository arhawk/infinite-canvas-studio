import { describe, expect, it } from "vitest";
import {
  getRoomIdFromPath,
  getRoomWebSocketUrl,
  getShareUrl,
} from "../../../src/online/roomRoute.js";

describe("room route helpers", () => {
  it("detects four digit room routes only", () => {
    expect(getRoomIdFromPath("/room/1234")).toBe("1234");
    expect(getRoomIdFromPath("/room/1234/")).toBe("1234");
    expect(getRoomIdFromPath("/room/123")).toBeNull();
    expect(getRoomIdFromPath("/room/12345")).toBeNull();
    expect(getRoomIdFromPath("/edit/1234")).toBeNull();
  });

  it("builds share URLs without host secrets", () => {
    const url = getShareUrl("1234", "https://example.test");

    expect(url).toBe("https://example.test/room/1234");
    expect(url).not.toContain("hostToken");
  });

  it("builds WebSocket URLs with role only", () => {
    const url = getRoomWebSocketUrl("1234", "host", {
      protocol: "https:",
      host: "example.test",
    });

    expect(url).toBe("wss://example.test/ws/rooms/1234?role=host");
    expect(url).not.toContain("hostToken");
  });
});
