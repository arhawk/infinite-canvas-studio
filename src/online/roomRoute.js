export const ROOM_BACKEND_HOST = "au.baitian.moe:3001";

function isLocalDevHost(locationRef = window.location) {
  const hostname = locationRef.hostname ?? "";
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "::1" ||
    hostname === "[::1]"
  );
}

function getRoomBackendHost(locationRef = window.location) {
  const overrideHost = globalThis.window?.__ROOM_BACKEND_HOST__;
  if (overrideHost) {
    return overrideHost;
  }

  if (isLocalDevHost(locationRef) && locationRef.host) {
    return locationRef.host;
  }

  return ROOM_BACKEND_HOST;
}

export function getRoomIdFromPath(pathname = window.location.pathname) {
  const match = String(pathname ?? "").match(/^\/room\/(\d{4})\/?$/);
  return match?.[1] ?? null;
}

function normalizeSessionType(value) {
  if (value === "room") return "room";
  return null;
}

export function getRouteSession(pathname = window.location.pathname, search = window.location.search) {
  const querySessionType = normalizeSessionType(new URLSearchParams(String(search ?? "")).get("session"));
  const roomId = getRoomIdFromPath(pathname);
  if (!roomId) return null;
  if (querySessionType) return { roomId, sessionType: querySessionType };
  return { roomId, sessionType: "room" };
}

export function getShareUrl(roomId, origin = window.location.origin) {
  return `${origin}/room/${roomId}?session=room`;
}

export function getRoomWebSocketUrl(roomId, role, locationRef = window.location) {
  const protocol = locationRef.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${getRoomBackendHost(locationRef)}/ws/rooms/${roomId}?role=${encodeURIComponent(role)}`;
}

export function getCreateRoomApiUrl(locationRef = window.location) {
  const protocol = locationRef.protocol === "https:" ? "https:" : "http:";
  return `${protocol}//${getRoomBackendHost(locationRef)}/api/rooms`;
}
