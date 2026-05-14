import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { WebSocketServer } from "ws";
import {
  MAX_HTTP_BODY_BYTES,
  MAX_WS_MESSAGE_BYTES,
  SERVER_MESSAGE_TYPES,
  VIEWER_CONTROL_MESSAGE_TYPES,
  VIEWER_CONTROL_ROOM_MESSAGE_TYPES,
  canHostRelayMessageType,
  canViewerRelayMessageType,
  isRoomId,
  readMessage,
  safeJsonParse,
  sendError,
  sendJson,
} from "./protocol.js";
import { cleanupRateBuckets, consumeRateLimit } from "./rateLimit.js";
import { RoomStore, verifyPassword } from "./roomStore.js";

const PORT = Number.parseInt(process.env.PORT ?? "3001", 10);
const CLEANUP_INTERVAL_MS = 30_000;
const CREATE_ROOM_RATE_LIMIT = {
  max: Number.parseInt(process.env.ROOM_CREATE_RATE_LIMIT_MAX ?? "30", 10),
  windowMs: Number.parseInt(process.env.ROOM_CREATE_RATE_LIMIT_WINDOW_MS ?? "60000", 10),
};
const PASSWORD_RATE_LIMIT = {
  max: Number.parseInt(process.env.ROOM_PASSWORD_RATE_LIMIT_MAX ?? "6", 10),
  windowMs: Number.parseInt(process.env.ROOM_PASSWORD_RATE_LIMIT_WINDOW_MS ?? "60000", 10),
};
const MAX_VIEWERS_PER_ROOM = Number.parseInt(process.env.ROOM_MAX_VIEWERS ?? "100", 10);
const __dirname = fileURLToPath(new URL(".", import.meta.url));
const projectRoot = resolve(__dirname, "../..");
const distRoot = resolve(projectRoot, "dist");
const store = new RoomStore();
const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_WS_MESSAGE_BYTES });
const createRoomRateBuckets = new Map();
const passwordRateBuckets = new Map();

function sendHttpJson(res, statusCode, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Origin": "*",
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
  });
  res.end(body);
}

function getClientIp(req) {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.trim()) {
    return forwarded.split(",")[0].trim();
  }
  return req.socket.remoteAddress ?? "unknown";
}

function readRequestBody(req, maxBytes = MAX_HTTP_BODY_BYTES) {
  return new Promise((resolveBody, rejectBody) => {
    let total = 0;
    const chunks = [];

    req.on("data", (chunk) => {
      total += chunk.length;
      if (total > maxBytes) {
        rejectBody(new Error("Request body too large."));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });

    req.on("end", () => {
      resolveBody(Buffer.concat(chunks).toString("utf8"));
    });
    req.on("error", rejectBody);
  });
}

async function handleCreateRoom(req, res) {
  try {
    if (!consumeRateLimit(createRoomRateBuckets, getClientIp(req), CREATE_ROOM_RATE_LIMIT)) {
      sendHttpJson(res, 429, { error: "Too many room creation attempts." });
      return;
    }

    const bodyText = await readRequestBody(req);
    const parsed = bodyText.trim() ? safeJsonParse(bodyText) : { value: {}, error: null };
    if (parsed.error) {
      sendHttpJson(res, 400, { error: "Invalid JSON body." });
      return;
    }

    const password = typeof parsed.value?.password === "string" ? parsed.value.password : "";
    const room = store.createRoom({ password });
    sendHttpJson(res, 201, {
      roomId: room.roomId,
      url: `/room/${room.roomId}`,
      hostToken: room.hostToken,
      requiresPassword: room.requiresPassword,
    });
  } catch (error) {
    const status = error?.code === "room-capacity" ? 503 : 400;
    sendHttpJson(res, status, { error: error instanceof Error ? error.message : "Failed to create room." });
  }
}

function getContentType(pathname) {
  const extension = extname(pathname).toLowerCase();
  return {
    ".css": "text/css; charset=utf-8",
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
  }[extension] ?? "application/octet-stream";
}

function serveStatic(req, res, url) {
  if (!existsSync(distRoot)) {
    sendHttpJson(res, 404, { error: "Static dist directory not found." });
    return;
  }

  const requestedPath = decodeURIComponent(url.pathname);
  const candidate = requestedPath === "/" || requestedPath.startsWith("/room/")
    ? join(distRoot, "index.html")
    : join(distRoot, requestedPath);
  const resolved = resolve(candidate);

  if (!resolved.startsWith(distRoot)) {
    sendHttpJson(res, 403, { error: "Forbidden." });
    return;
  }

  const filePath = existsSync(resolved) && statSync(resolved).isFile()
    ? resolved
    : join(distRoot, "index.html");

  if (!existsSync(filePath)) {
    sendHttpJson(res, 404, { error: "File not found." });
    return;
  }

  res.writeHead(200, { "Content-Type": getContentType(filePath) });
  createReadStream(filePath).pipe(res);
}

const server = createServer((req, res) => {
  const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);

  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
      "Access-Control-Allow-Origin": "*",
    });
    res.end();
    return;
  }

  if (req.method === "GET" && url.pathname === "/health") {
    sendHttpJson(res, 200, { ok: true });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/rooms") {
    void handleCreateRoom(req, res);
    return;
  }

  if (req.method !== "GET" && req.method !== "HEAD") {
    sendHttpJson(res, 405, { error: "Method not allowed." });
    return;
  }

  serveStatic(req, res, url);
});

function parseRoomSocketUrl(request) {
  const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);
  const match = url.pathname.match(/^\/ws\/rooms\/(\d{4})$/);
  const roomId = match?.[1] ?? null;
  const role = url.searchParams.get("role");
  if (!roomId || !isRoomId(roomId) || !["host", "viewer"].includes(role)) {
    return null;
  }
  return { roomId, role };
}

function closeRoom(room, reason = "host-disconnected") {
  for (const viewer of room.viewers) {
    sendJson(viewer, SERVER_MESSAGE_TYPES.ROOM_CLOSED, { reason });
    viewer.close();
  }
  if (room.hostSocket) {
    sendJson(room.hostSocket, SERVER_MESSAGE_TYPES.ROOM_CLOSED, { reason });
    room.hostSocket.close();
  }
  store.deleteRoom(room.roomId);
}

function broadcastViewerCount(room) {
  sendJson(room.hostSocket, "room:viewers", { count: room.viewers.size });
}

function handleHostJoin(room, socket, payload = {}) {
  const hostToken = typeof payload.hostToken === "string" ? payload.hostToken : "";
  if (hostToken !== room.hostToken) {
    sendError(socket, "Invalid host token.", "invalid-host-token");
    socket.close();
    return;
  }

  if (room.hostSocket && room.hostSocket !== socket) {
    sendError(socket, "Host already connected.", "host-already-connected");
    socket.close();
    return;
  }

  store.setHost(room, socket);
  socket.roomJoined = true;
  sendJson(socket, SERVER_MESSAGE_TYPES.HOST_JOINED, { roomId: room.roomId });

  for (const viewer of room.viewers) {
    sendJson(socket, SERVER_MESSAGE_TYPES.VIEWER_JOINED, { viewerId: viewer.connectionId });
  }
  broadcastViewerCount(room);
}

function handleViewerJoin(room, socket, payload = {}) {
  const password = typeof payload.password === "string" ? payload.password : "";
  if (room.requiresPassword && !verifyPassword(password, room.passwordHash)) {
    const passwordBucketKey = `${room.roomId}:${socket.clientIp ?? "unknown"}`;
    if (!consumeRateLimit(passwordRateBuckets, passwordBucketKey, PASSWORD_RATE_LIMIT)) {
      sendError(socket, "Too many password attempts.", "room-rate-limited");
      socket.close();
      return;
    }
    sendError(socket, "Invalid room password.", "invalid-room-password");
    socket.close();
    return;
  }

  if (room.viewers.size >= MAX_VIEWERS_PER_ROOM) {
    sendError(socket, "Room is full.", "room-full");
    socket.close();
    return;
  }

  socket.roomJoined = true;
  store.addViewer(room, socket);
  sendJson(socket, SERVER_MESSAGE_TYPES.ROOM_JOINED, { roomId: room.roomId });
  if (room.hostSocket) {
    sendJson(room.hostSocket, SERVER_MESSAGE_TYPES.VIEWER_JOINED, { viewerId: socket.connectionId });
    broadcastViewerCount(room);
  }
}

function relayHostMessage(room, socket, message) {
  if (socket !== room.hostSocket || !socket.roomJoined) {
    sendError(socket, "Host must join before broadcasting.", "host-not-joined");
    return;
  }

  if (!canHostRelayMessageType(message.type)) {
    sendError(socket, "Unsupported host message type.", "bad-host-message");
    return;
  }

  for (const viewer of room.viewers) {
    sendJson(viewer, message.type, message.payload);
  }
  store.touchRoom(room);
}

function handleViewerMessage(room, socket, message) {
  if (VIEWER_CONTROL_MESSAGE_TYPES.has(message.type)) {
    handleViewerJoin(room, socket, message.payload);
    return;
  }

  if (!socket.roomJoined) {
    sendError(socket, "Viewer must join before sending room messages.", "viewer-not-joined");
    return;
  }

  if (VIEWER_CONTROL_ROOM_MESSAGE_TYPES.has(message.type)) {
    if (message.type === "room:request-state" && room.hostSocket) {
      sendJson(room.hostSocket, SERVER_MESSAGE_TYPES.VIEWER_JOINED, { viewerId: socket.connectionId });
    }
    return;
  }

  if (!canViewerRelayMessageType(message.type)) {
    sendError(socket, "Unsupported viewer message type.", "bad-viewer-message");
    return;
  }

  if (room.hostSocket) {
    sendJson(room.hostSocket, message.type, message.payload);
    store.touchRoom(room);
  }
}

function handleSocketMessage(room, socket, raw) {
  const { value: message, error } = readMessage(raw);
  if (error) {
    sendError(socket, error.message, "invalid-message");
    socket.close();
    return;
  }

  if (socket.role === "host") {
    if (message.type === "host:join") {
      handleHostJoin(room, socket, message.payload);
      return;
    }
    relayHostMessage(room, socket, message);
    return;
  }

  handleViewerMessage(room, socket, message);
}

let connectionCount = 0;

wss.on("connection", (socket, request, { room, role }) => {
  connectionCount += 1;
  socket.connectionId = `connection-${connectionCount}`;
  socket.role = role;
  socket.roomJoined = false;
  socket.clientIp = getClientIp(request);

  if (role === "viewer") {
    sendJson(socket, SERVER_MESSAGE_TYPES.ROOM_AUTH_REQUIRED, {
      requiresPassword: room.requiresPassword,
    });
  }

  socket.on("message", (raw) => handleSocketMessage(room, socket, raw));
  socket.on("close", () => {
    if (role === "host" && room.hostSocket === socket) {
      closeRoom(room, "host-disconnected");
      return;
    }

    if (role === "viewer") {
      const wasViewer = room.viewers.has(socket);
      store.removeViewer(room, socket);
      if (wasViewer && room.hostSocket) {
        sendJson(room.hostSocket, SERVER_MESSAGE_TYPES.VIEWER_LEFT, { viewerId: socket.connectionId });
        broadcastViewerCount(room);
      }
    }
  });
});

server.on("upgrade", (request, socket, head) => {
  const info = parseRoomSocketUrl(request);
  if (!info) {
    socket.write("HTTP/1.1 400 Bad Request\r\n\r\n");
    socket.destroy();
    return;
  }

  const room = store.getRoom(info.roomId);
  if (!room) {
    socket.write("HTTP/1.1 404 Not Found\r\n\r\n");
    socket.destroy();
    return;
  }

  wss.handleUpgrade(request, socket, head, (ws) => {
    wss.emit("connection", ws, request, { room, role: info.role });
  });
});

setInterval(() => {
  const currentTime = Date.now();
  for (const room of store.collectExpiredRooms()) {
    closeRoom(room, "room-expired");
  }
  cleanupRateBuckets(createRoomRateBuckets, currentTime);
  cleanupRateBuckets(passwordRateBuckets, currentTime);
}, CLEANUP_INTERVAL_MS).unref();

server.listen(PORT, () => {
  console.log(`Room server listening on http://localhost:${PORT}`);
});
