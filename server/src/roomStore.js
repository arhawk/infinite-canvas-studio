import { randomBytes, randomUUID, scryptSync, timingSafeEqual } from "node:crypto";

const ROOM_ID_SPACE = 10000;
const ROOM_ID_WIDTH = 4;
const DEFAULT_UNHOSTED_TTL_MS = 60_000;
const DEFAULT_ROOM_TTL_MS = 12 * 60 * 60 * 1000;

function now() {
  return Date.now();
}

function generateRoomId() {
  return String(Math.floor(Math.random() * ROOM_ID_SPACE)).padStart(ROOM_ID_WIDTH, "0");
}

function hashPassword(password) {
  const normalized = typeof password === "string" ? password : "";
  if (!normalized) return null;

  const salt = randomBytes(16);
  const hash = scryptSync(normalized, salt, 32);
  return {
    salt: salt.toString("base64"),
    hash: hash.toString("base64"),
  };
}

export function verifyPassword(password, passwordHash) {
  if (!passwordHash) return true;
  const salt = Buffer.from(passwordHash.salt, "base64");
  const expected = Buffer.from(passwordHash.hash, "base64");
  const actual = scryptSync(typeof password === "string" ? password : "", salt, expected.length);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export class RoomStore {
  constructor({
    unhostedTtlMs = DEFAULT_UNHOSTED_TTL_MS,
    roomTtlMs = DEFAULT_ROOM_TTL_MS,
    roomIdGenerator = generateRoomId,
  } = {}) {
    this.rooms = new Map();
    this.unhostedTtlMs = unhostedTtlMs;
    this.roomTtlMs = roomTtlMs;
    this.roomIdGenerator = roomIdGenerator;
  }

  createRoom({ password = "", kind = "room" } = {}) {
    if (this.rooms.size >= ROOM_ID_SPACE) {
      const error = new Error("No room ids are available.");
      error.code = "room-capacity";
      throw error;
    }

    let roomId = this.roomIdGenerator();
    while (this.rooms.has(roomId)) {
      roomId = this.roomIdGenerator();
    }

    const passwordHash = hashPassword(password);
    const room = {
      kind: kind === "collab" ? "collab" : "room",
      roomId,
      hostToken: randomUUID(),
      passwordHash,
      requiresPassword: Boolean(passwordHash),
      hostSocket: null,
      viewers: new Set(),
      createdAt: now(),
      lastSeenAt: now(),
    };

    this.rooms.set(roomId, room);
    return room;
  }

  getRoom(roomId) {
    return this.rooms.get(roomId) ?? null;
  }

  deleteRoom(roomId) {
    return this.rooms.delete(roomId);
  }

  touchRoom(room) {
    if (room) room.lastSeenAt = now();
  }

  setHost(room, socket) {
    room.hostSocket = socket;
    this.touchRoom(room);
  }

  addViewer(room, socket) {
    room.viewers.add(socket);
    this.touchRoom(room);
  }

  removeViewer(room, socket) {
    room.viewers.delete(socket);
    this.touchRoom(room);
  }

  removeSocket(socket) {
    for (const room of this.rooms.values()) {
      if (room.hostSocket === socket) {
        room.hostSocket = null;
      }
      room.viewers.delete(socket);
    }
  }

  collectExpiredRooms(currentTime = now()) {
    const expired = [];

    for (const room of this.rooms.values()) {
      const isUnhostedExpired = !room.hostSocket && currentTime - room.createdAt > this.unhostedTtlMs;
      const isRoomExpired = currentTime - room.createdAt > this.roomTtlMs;
      if (isUnhostedExpired || isRoomExpired) {
        expired.push(room);
      }
    }

    return expired;
  }
}
