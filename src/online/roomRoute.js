export const ROOM_BACKEND_URL = import.meta.env.VITE_WS_URL || "ws://localhost:3001";

function getRoomBackendUrl(locationRef = window.location) {
  const overrideHost = globalThis.window?.__ROOM_BACKEND_HOST__;
  if (overrideHost) {
    const protocol = locationRef.protocol === "https:" ? "wss:" : "ws:";
    return `${protocol}//${overrideHost}`;
  }

  return ROOM_BACKEND_URL;
}

function toWebSocketUrl(backendUrl) {
  const url = new URL(backendUrl);
  if (url.protocol === "http:") {
    url.protocol = "ws:";
  } else if (url.protocol === "https:") {
    url.protocol = "wss:";
  }
  return url;
}

function toHttpUrl(backendUrl) {
  const url = new URL(backendUrl);
  if (url.protocol === "ws:") {
    url.protocol = "http:";
  } else if (url.protocol === "wss:") {
    url.protocol = "https:";
  }
  return url;
}

export function getRoomIdFromPath(pathname = window.location.pathname) {
  const match = String(pathname ?? "").match(/^\/room\/(\d{4})\/?$/);
  return match?.[1] ?? null;
}

export function getShareUrl(roomId, origin = window.location.origin) {
  return `${origin}/room/${roomId}`;
}

export function getRoomWebSocketUrl(roomId, role, locationRef = window.location) {
  const url = toWebSocketUrl(getRoomBackendUrl(locationRef));
  url.pathname = `/ws/rooms/${roomId}`;
  url.search = `?role=${encodeURIComponent(role)}`;
  return url.toString();
}

export function getCreateRoomApiUrl(locationRef = window.location) {
  const url = toHttpUrl(getRoomBackendUrl(locationRef));
  url.pathname = "/api/rooms";
  url.search = "";
  url.hash = "";
  return url.toString();
}
