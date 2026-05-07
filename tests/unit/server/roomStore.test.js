import { describe, expect, it } from "vitest";
import { RoomStore, verifyPassword } from "../../../server/src/roomStore.js";

describe("RoomStore", () => {
  it("creates four digit room ids", () => {
    const store = new RoomStore();
    const room = store.createRoom();

    expect(room.roomId).toMatch(/^\d{4}$/);
    expect(room.hostToken).toEqual(expect.any(String));
    expect(room.requiresPassword).toBe(false);
  });

  it("retries room id generation on collision", () => {
    const generatedIds = ["1234", "1234", "5678"];
    const store = new RoomStore({
      roomIdGenerator: () => generatedIds.shift(),
    });

    expect(store.createRoom().roomId).toBe("1234");
    expect(store.createRoom().roomId).toBe("5678");
  });

  it("stores password metadata in memory and verifies passwords", () => {
    const store = new RoomStore();
    const room = store.createRoom({ password: "secret" });

    expect(room.requiresPassword).toBe(true);
    expect(room.passwordHash).not.toBeNull();
    expect(room.passwordHash.hash).not.toBe("secret");
    expect(verifyPassword("secret", room.passwordHash)).toBe(true);
    expect(verifyPassword("wrong", room.passwordHash)).toBe(false);
  });

  it("tracks host and viewer sockets without persistence", () => {
    const store = new RoomStore();
    const room = store.createRoom();
    const hostSocket = {};
    const viewerSocket = {};

    store.setHost(room, hostSocket);
    store.addViewer(room, viewerSocket);

    expect(room.hostSocket).toBe(hostSocket);
    expect(room.viewers.has(viewerSocket)).toBe(true);

    store.removeViewer(room, viewerSocket);
    expect(room.viewers.has(viewerSocket)).toBe(false);
  });

  it("collects unhosted expired rooms", () => {
    const store = new RoomStore({ unhostedTtlMs: 10 });
    const room = store.createRoom();
    room.createdAt = Date.now() - 100;

    expect(store.collectExpiredRooms()).toContain(room);
  });
});
