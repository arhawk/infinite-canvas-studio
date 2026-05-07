import { describe, expect, it } from "vitest";
import {
  getCreateRoomApiUrl,
  getRoomIdFromPath,
  getRoomWebSocketUrl,
  getShareUrl,
  ROOM_BACKEND_HOST,
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

  it("builds backend URLs against the fixed room backend host", () => {
    const apiUrl = getCreateRoomApiUrl({
      protocol: "https:",
    });
    const url = getRoomWebSocketUrl("1234", "host", {
      protocol: "https:",
    });

    expect(apiUrl).toBe(`https://${ROOM_BACKEND_HOST}/api/rooms`);
    expect(url).toBe(`wss://${ROOM_BACKEND_HOST}/ws/rooms/1234?role=host`);
    expect(url).not.toContain("hostToken");
  });
});
