export class RoomClient {
  constructor({ roomId, role, getUrl }) {
    this.roomId = roomId;
    this.role = role;
    this.getUrl = getUrl;
    this.socket = null;
    this.handlers = new Map();
    this.pendingMessages = [];
  }

  on(type, handler) {
    const handlers = this.handlers.get(type) ?? new Set();
    handlers.add(handler);
    this.handlers.set(type, handlers);
    return () => handlers.delete(handler);
  }

  emit(type, payload) {
    for (const handler of this.handlers.get(type) ?? []) {
      handler(payload);
    }
  }

  connect() {
    this.close();
    this.socket = new WebSocket(this.getUrl(this.roomId, this.role));
    this.socket.addEventListener("open", () => {
      const pending = this.pendingMessages.splice(0);
      pending.forEach(({ type, payload }) => this.send(type, payload));
      this.emit("open");
    });
    this.socket.addEventListener("close", (event) => this.emit("close", event));
    this.socket.addEventListener("error", (event) => this.emit("error", event));
    this.socket.addEventListener("message", (event) => {
      let message = null;
      try {
        message = JSON.parse(event.data);
      } catch {
        return;
      }
      if (!message?.type) return;
      this.emit(message.type, message.payload ?? {});
      this.emit("*", message);
    });
    return this.socket;
  }

  send(type, payload = {}) {
    if (this.socket?.readyState !== WebSocket.OPEN) {
      if (this.socket?.readyState === WebSocket.CONNECTING) {
        this.pendingMessages.push({ type, payload });
      }
      return false;
    }
    this.socket.send(JSON.stringify({ type, payload }));
    return true;
  }

  close() {
    this.pendingMessages = [];
    if (!this.socket) return;
    this.socket.close();
    this.socket = null;
  }
}
