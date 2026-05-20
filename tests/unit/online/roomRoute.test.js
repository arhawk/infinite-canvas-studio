import { describe, expect, it } from "vitest";
import {
  getCollabIdFromPath,
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
    expect(getCollabIdFromPath("/collab/5678")).toBe("5678");
    expect(getCollabIdFromPath("/collab/567")).toBeNull();
  });

  it("builds share URLs without host secrets", () => {
    const url = getShareUrl("1234", "https://example.test");
    const collabUrl = getShareUrl("1234", "https://example.test", "collab");

    expect(url).toBe("https://example.test/room/1234");
    expect(collabUrl).toBe("https://example.test/collab/1234");
    expect(url).not.toContain("hostToken");
  });

  it("builds backend URLs against the fixed room backend host", () => {
    const apiUrl = getCreateRoomApiUrl({
      protocol: "https:",
      hostname: "mimi.example",
      host: "mimi.example",
    });
    const url = getRoomWebSocketUrl("1234", "host", {
      protocol: "https:",
      hostname: "mimi.example",
      host: "mimi.example",
    });
    const collabApiUrl = getCreateRoomApiUrl({
      protocol: "https:",
      hostname: "mimi.example",
      host: "mimi.example",
    }, "collab");
    const collabUrl = getRoomWebSocketUrl("1234", "collaborator", {
      protocol: "https:",
      hostname: "mimi.example",
      host: "mimi.example",
    }, "collab");

    expect(apiUrl).toBe(`https://${ROOM_BACKEND_HOST}/api/rooms`);
    expect(url).toBe(`wss://${ROOM_BACKEND_HOST}/ws/rooms/1234?role=host`);
    expect(collabApiUrl).toBe(`https://${ROOM_BACKEND_HOST}/api/collab`);
    expect(collabUrl).toBe(`wss://${ROOM_BACKEND_HOST}/ws/collab/1234?role=collaborator`);
    expect(url).not.toContain("hostToken");
  });

  it("uses the Vite dev server as the room backend on local hosts", () => {
    const apiUrl = getCreateRoomApiUrl({
      protocol: "http:",
      hostname: "localhost",
      host: "localhost:3000",
    });
    const url = getRoomWebSocketUrl("1234", "viewer", {
      protocol: "http:",
      hostname: "127.0.0.1",
      host: "127.0.0.1:3000",
    });

    expect(apiUrl).toBe("http://localhost:3000/api/rooms");
    expect(url).toBe("ws://127.0.0.1:3000/ws/rooms/1234?role=viewer");
  });
});
