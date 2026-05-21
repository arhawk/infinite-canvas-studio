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

export function getCollabIdFromPath(pathname = window.location.pathname) {
  const match = String(pathname ?? "").match(/^\/collab\/(\d{4})\/?$/);
  return match?.[1] ?? null;
}

function normalizeSessionType(value) {
  if (value === "collab") return "collab";
  if (value === "room") return "room";
  return null;
}

export function getRouteSession(pathname = window.location.pathname, search = window.location.search) {
  const querySessionType = normalizeSessionType(new URLSearchParams(String(search ?? "")).get("session"));
  const roomId = getRoomIdFromPath(pathname);
  const collabId = getCollabIdFromPath(pathname);
  const pathRoomId = roomId ?? collabId;

  if (!pathRoomId) return null;
  if (querySessionType) {
    return { roomId: pathRoomId, sessionType: querySessionType };
  }
  if (collabId) {
    return { roomId: collabId, sessionType: "collab" };
  }
  return { roomId: roomId, sessionType: "room" };
}

export function getShareUrl(roomId, origin = window.location.origin, sessionType = "room") {
  const normalizedSessionType = sessionType === "collab" ? "collab" : "room";
  return `${origin}/room/${roomId}?session=${normalizedSessionType}`;
}

export function getRoomWebSocketUrl(roomId, role, locationRef = window.location, sessionType = "room") {
  const protocol = locationRef.protocol === "https:" ? "wss:" : "ws:";
  const pathPrefix = sessionType === "collab" ? "collab" : "rooms";
  return `${protocol}//${getRoomBackendHost(locationRef)}/ws/${pathPrefix}/${roomId}?role=${encodeURIComponent(role)}`;
}

export function getCreateRoomApiUrl(locationRef = window.location, sessionType = "room") {
  const protocol = locationRef.protocol === "https:" ? "https:" : "http:";
  const path = sessionType === "collab" ? "collab" : "rooms";
  return `${protocol}//${getRoomBackendHost(locationRef)}/api/${path}`;
}
