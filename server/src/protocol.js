export const ROOM_ID_PATTERN = /^\d{4}$/;
export const APP_MESSAGE_PREFIX = "app:";
export const VIEWER_CONTROL_MESSAGE_TYPES = new Set(["viewer:join"]);
export const COLLABORATOR_CONTROL_MESSAGE_TYPES = new Set(["collaborator:join"]);

// Future frontend features can add app-prefixed business events without a
// backend deploy, while room-prefixed messages stay reserved for room protocol.
export const HOST_ONLY_ROOM_MESSAGE_TYPES = new Set(["room:state", "room:viewport"]);
export const VIEWER_CONTROL_ROOM_MESSAGE_TYPES = new Set(["room:ping", "room:request-state"]);
export const COLLABORATOR_ROOM_MESSAGE_TYPES = new Set(["room:ping"]);
export const SERVER_MESSAGE_TYPES = {
  HOST_JOINED: "host:joined",
  ROOM_AUTH_REQUIRED: "room:auth-required",
  ROOM_CLOSED: "room:closed",
  ROOM_ERROR: "room:error",
  ROOM_JOINED: "room:joined",
  VIEWER_JOINED: "viewer:joined",
  VIEWER_LEFT: "viewer:left",
};

export const MAX_WS_MESSAGE_BYTES = Number.parseInt(
  process.env.ROOM_MAX_MESSAGE_BYTES ?? String(10 * 1024 * 1024),
  10,
);
export const MAX_HTTP_BODY_BYTES = Number.parseInt(
  process.env.ROOM_MAX_HTTP_BODY_BYTES ?? String(64 * 1024),
  10,
);

export function isRoomId(value) {
  return typeof value === "string" && ROOM_ID_PATTERN.test(value);
}

export function isAppRelayMessageType(type) {
  return typeof type === "string" && type.startsWith(APP_MESSAGE_PREFIX);
}

export function canHostRelayMessageType(type) {
  return HOST_ONLY_ROOM_MESSAGE_TYPES.has(type) || isAppRelayMessageType(type);
}

export function canViewerRelayMessageType(type) {
  return isAppRelayMessageType(type);
}

export function canCollaboratorRelayMessageType(type) {
  return HOST_ONLY_ROOM_MESSAGE_TYPES.has(type) || isAppRelayMessageType(type);
}

export function safeJsonParse(text) {
  try {
    return { value: JSON.parse(text), error: null };
  } catch (error) {
    return { value: null, error };
  }
}

export function serializeMessage(type, payload = {}) {
  return JSON.stringify({ type, payload });
}

export function sendJson(socket, type, payload = {}) {
  if (socket.readyState !== 1) return false;
  socket.send(serializeMessage(type, payload));
  return true;
}

export function sendError(socket, message, code = "bad-request") {
  return sendJson(socket, SERVER_MESSAGE_TYPES.ROOM_ERROR, { code, message });
}

export function readMessage(raw, maxBytes = MAX_WS_MESSAGE_BYTES) {
  const text = typeof raw === "string" ? raw : raw?.toString?.("utf8") ?? "";
  if (Buffer.byteLength(text, "utf8") > maxBytes) {
    return { value: null, error: new Error("Message too large.") };
  }

  const parsed = safeJsonParse(text);
  if (parsed.error) {
    return parsed;
  }

  const message = parsed.value;
  if (!message || typeof message !== "object" || typeof message.type !== "string") {
    return { value: null, error: new Error("Message must be a JSON object with a type.") };
  }

  return {
    value: {
      type: message.type,
      payload: message.payload && typeof message.payload === "object" ? message.payload : {},
    },
    error: null,
  };
}
