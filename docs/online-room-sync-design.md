# Online Room Sync Design Report

## 30 秒版

目标是给当前 infinite canvas 增加一个极简在线分享方案：

- 无数据库。
- 无用户系统。
- 只有临时房间。
- 新增 `/server/` 目录放房间服务器代码。
- HTTP 只负责创建房间。
- WebSocket 只负责转发房间消息。
- 服务器不把白板、房间历史、用户数据保存到本地文件或数据库。
- 点击 Share 后创建 4 位数字房间号，并生成链接：`当前网址/room/房间号`。
- 通过链接加入的人直接进入 `presentation` 模式。
- 加入者默认跟随 host 视角。
- 在 viewer 权限下，原来的 Edit / Present 开关变成 Viewer / Host 视角开关。
- `Host` 视角表示跟随 host；`Viewer` 视角表示本地自由视角。
- 如果 viewer 正在 `Host` 跟随视角下尝试 pan / zoom，前端自动切到 `Viewer` 自由视角。
- 加入者没有 edit 权限，不能切到 edit，也不能看到 edit 入口。

这不是协同编辑。它更接近“host 直播当前画布状态和视角，viewer 只观看”。

## Hard Exclusions

这个方案压根没有这些能力，也不把它们作为后续扩展内容写进本设计：

- 不做账号、登录、权限后台。
- 不做数据库、文件持久化、房间恢复。
- 不做多人编辑。
- 不做 viewer 临时接管、申请控制权、评论、光标协作。
- 不把 JSON 文档存在服务器。
- 不让 server 理解 Konva 节点结构或业务语义。

服务器只知道房间、host socket、viewer socket、消息转发。

## Repository Layout

新增目录：

```txt
server/
  package.json
  src/
    index.js
    roomStore.js
    protocol.js
```

服务器和前端必须保持低耦合：

- `server/src/index.js`: HTTP server 与 WebSocket server 入口。
- `server/src/roomStore.js`: 内存房间表，负责创建、查找、关闭、过期清理。
- `server/src/protocol.js`: 消息类型常量、payload 校验、错误响应帮助函数。

服务器必须使用 Node.js。HTTP 层必须使用 Node.js 原生 HTTP server，WebSocket 层必须使用 `ws`。`server/package.json` 必须声明 Node.js 运行时要求，并把 `ws` 作为 server 依赖。

服务器必须从项目根目录启动：

```bash
pnpm run server
```

不要求开发者切换到 `/server/` 目录后再启动服务器。不能使用裸 `pnpm server`，因为 pnpm 10 的 `server` 是包管理器内置命令，不会执行项目脚本。

Frontend QR dependency requirements:

- Frontend must use [`qrcode`](https://www.npmjs.com/package/qrcode) as the QR generation library.
- `qrcode` is fixed as the project dependency because it is the most widely used package among the common JavaScript QR generation options checked for this report.
- QR rendering must happen in the browser with `toCanvas()` or `toDataURL()`.
- The room server must not generate QR images.

## Architecture

```txt
Host Browser
  |
  | POST /api/rooms
  v
Room Server creates in-memory room
  |
  | returns { roomId, hostToken }
  v
Host opens WebSocket as role=host
  |
  | share link: https://app.example/room/1234
  v
Viewer Browser opens /room/1234
  |
  | enters room password if required
  |
  | WebSocket role=viewer + viewer:join
  v
Server relays host messages to viewers
```

The server stores only runtime room metadata:

```js
{
  roomId: "1234",
  hostToken: "random-secret",
  passwordHash: "memory-only-password-hash" | null,
  requiresPassword: true,
  hostSocket: WebSocket | null,
  viewers: Set<WebSocket>,
  createdAt: number,
  lastSeenAt: number,
}
```

No board snapshot is stored in this object. When a viewer joins, the server tells the host that a viewer needs the current state. The host sends the latest document snapshot through the WebSocket, and the server forwards it.

If the host sets a room password, the server stores only an in-memory password hash for that room. The password is not a user account, is not persisted, and disappears when the room closes or the server restarts.

## Room Identity

Room ids are exactly four digits:

```txt
0000
0001
...
9999
```

Creation rules:

- `POST /api/rooms` creates a room.
- Server randomly generates a 4 digit id.
- If id already exists, retry until available.
- If all ids are occupied, return `503`.
- Room id is public and appears in the URL.
- `hostToken` is private and returned only to the creator.
- Host can set a room password during creation.
- Room password is required for viewers when `requiresPassword` is true.

The 4 digit id is intentionally small and easy to share. Because there is no user system, the host token distinguishes host control and the room password gates viewer entry when the host sets one.

## HTTP API

### Create Room

```http
POST /api/rooms
Content-Type: application/json
```

Request:

```json
{
  "password": "room-password-or-empty-string"
}
```

Response:

```json
{
  "roomId": "1234",
  "url": "/room/1234",
  "hostToken": "opaque-random-token",
  "requiresPassword": true
}
```

Server behavior:

- Create an in-memory room.
- Return a private host token.
- Hash the room password in memory if one is provided.
- Do not create local files.
- Do not store board state.
- Do not persist the password or password hash outside process memory.

### Health Check

```http
GET /health
```

Response:

```json
{
  "ok": true
}
```

Useful for local development and deployment checks.

## WebSocket API

WebSocket endpoint:

```txt
ws://host/ws/rooms/:roomId?role=host
ws://host/ws/rooms/:roomId?role=viewer
```

Host connection rules:

- `hostToken` must never be placed in the WebSocket URL, share URL, QR code, browser route, or query string.
- `role=host` connects by room id, then sends `host:join`.
- `host:join` must include the correct `hostToken`.
- Host sockets remain pending until token validation succeeds.
- Only one host is active per room.
- A second host connection is rejected, even if it has a valid token.

Viewer connection rules:

- `role=viewer` connects by room id, then sends `viewer:join`.
- If `requiresPassword` is true, `viewer:join` must include the correct room password.
- Viewer sockets remain pending until password validation succeeds.
- Viewer cannot send edit messages.
- Viewer messages are limited to `viewer:join`, ping, and snapshot request.

## Message Protocol

All WebSocket messages are JSON:

```json
{
  "type": "room:viewport",
  "roomId": "1234",
  "payload": {}
}
```

### Host To Server

`host:join`

Validates the private host token before the host socket can broadcast room state or viewport updates.

```json
{
  "type": "host:join",
  "payload": {
    "hostToken": "opaque-random-token"
  }
}
```

The server does not forward `host:join` to viewers. It also does not log `hostToken`.

### Host To Viewers

`room:state`

Full current document snapshot. Sent when host starts sharing and whenever a new viewer joins.

```json
{
  "type": "room:state",
  "payload": {
    "document": {}
  }
}
```

`room:viewport`

Host camera state. Viewers apply this message only while their local view toggle is set to `Host`.

```json
{
  "type": "room:viewport",
  "payload": {
    "scale": 1,
    "position": { "x": 0, "y": 0 }
  }
}
```

### Viewer To Server

`viewer:join`

Validates room password before the viewer is added to the room. If the room has no password, payload password is omitted.

```json
{
  "type": "viewer:join",
  "payload": {
    "password": "room-password"
  }
}
```

The server does not forward `viewer:join` to the host or other viewers.

### Server To Host

`host:joined`

Sent after `host:join` succeeds. After this message, the host can send `room:state` and `room:viewport`.

```json
{
  "type": "host:joined",
  "payload": {
    "roomId": "1234"
  }
}
```

`viewer:joined`

Tells the host to send a fresh `room:state`.

```json
{
  "type": "viewer:joined",
  "payload": {
    "viewerId": "connection-id"
  }
}
```

`viewer:left`

Useful for showing viewer count.

```json
{
  "type": "viewer:left",
  "payload": {
    "viewerId": "connection-id"
  }
}
```

### Server To Viewer

`room:auth-required`

Sent immediately after viewer WebSocket connection when the room has a password.

```json
{
  "type": "room:auth-required",
  "payload": {
    "requiresPassword": true
  }
}
```

`room:joined`

Sent after `viewer:join` succeeds. After this message, the viewer can receive `room:state` and `room:viewport`.

```json
{
  "type": "room:joined",
  "payload": {
    "roomId": "1234"
  }
}
```

`room:closed`

Sent when host disconnects or the room expires.

```json
{
  "type": "room:closed",
  "payload": {
    "reason": "host-disconnected"
  }
}
```

`room:error`

Sent when the room does not exist or a message is invalid.

```json
{
  "type": "room:error",
  "payload": {
    "message": "Room not found"
  }
}
```

## Frontend Flow

### Host Share Flow

Share button behavior:

1. User clicks Share.
2. Frontend calls `POST /api/rooms`.
3. Server returns `{ roomId, url, hostToken }`.
4. Frontend opens host WebSocket using `roomId` only.
5. Frontend sends `host:join` with `hostToken` as the first host WebSocket message.
6. Frontend copies or displays `${window.location.origin}/room/${roomId}`.
7. Frontend renders a QR code beside the share link using `qrcode`.
8. Host immediately sends `room:state` with `app.documentManager.exportDocument({ download: false })` or a lower-level `exportDocumentSnapshot(app)`.
9. Host sends `room:viewport` whenever `viewport:change` fires, throttled to avoid flooding.
10. If the host entered a room password, only viewers who provide that password can join.

Required throttle:

- Viewport messages: 10-15 per second.
- Full state snapshot: on share start, on viewer join, and after larger edits.

### Viewer Join Flow

When the app opens `/room/1234`:

1. Parse room id from `window.location.pathname`.
2. Set app mode to `presentation`.
3. Activate a new read-only room viewer lock inside the existing app shell.
4. Hide or disable every edit entry point.
5. Connect WebSocket as `role=viewer`.
6. If the server sends `room:auth-required`, show a password prompt before joining.
7. Send `viewer:join` with the entered password, or an empty payload for rooms without a password.
8. Wait for `room:joined`.
9. Wait for `room:state`.
10. Load received document snapshot.
11. Start in local `Host` view mode and apply received `room:viewport`.

Viewer must not be able to:

- Switch to edit mode.
- See the Edit / Present capsule as an edit-mode control.
- Use keyboard shortcuts that mutate the board.
- Drag nodes.
- Draw.
- Open component editor or floating edit toolbars.
- Mutate the live room state.

Viewer can still use the existing JSON / HTML download feature. That export is a local copy only; it does not send anything back to the room server or host. After the viewer opens the downloaded HTML, or loads the downloaded JSON into the normal app outside `/room/:roomId`, it is a normal editable board with the same functionality as the host's local app.

Viewer pan and zoom are allowed only in local `Viewer` view mode. In local `Host` view mode, any user attempt to pan or zoom automatically switches the local view mode to `Viewer`, then applies the user's camera change. Incoming host viewport updates must still be remembered while in `Viewer` view mode, but not applied until the viewer switches back to `Host`.

## Frontend Integration Points

New client module:

```txt
src/online/
  roomClient.js
  roomHost.js
  roomViewer.js
  roomRoute.js
```

Required responsibilities:

- `roomRoute.js`: detect `/room/:roomId`.
- `roomClient.js`: wraps WebSocket connect, reconnect, send JSON, parse JSON.
- `roomHost.js`: creates room, sends snapshots, sends viewport, responds to viewer join.
- `roomViewer.js`: locks app to presentation, loads snapshots, manages local Viewer / Host view mode, applies host viewport only while in `Host` view mode.

Required plugin:

```txt
src/plugins/roomShare.js
```

This plugin owns:

- Share button wiring.
- Host WebSocket lifecycle.
- Viewer room mode lifecycle.
- Toast/status UI for room link, disconnected state, and room closed state.

Do not put room logic inside `StageController`, `DocumentPlugin`, or `HistoryPlugin`. Those remain reusable state and interaction layers.

## Permission Model

There are only two runtime roles:

```txt
host
viewer
```

Host:

- Owns edit permissions locally.
- Owns the private `hostToken`.
- Can set the room password at room creation.
- Sends document snapshots and viewport updates.

Viewer:

- Has no edit permissions.
- Does not receive host token.
- Must provide the room password when the room requires one.
- Is forced into presentation mode.
- Receives state and viewport only.
- Starts in local `Host` view mode, following host camera updates.
- Can switch to local `Viewer` view mode for a free local camera.
- Does not gain edit permission in either local view mode.
- Can download JSON or HTML using the existing document export feature.
- Owns any downloaded copy locally; that copy is not connected to the room and can be edited freely.

Server enforcement:

- Host socket must pass `host:join` before sending `room:state` or `room:viewport`.
- Only sockets with valid host token can broadcast `room:state` and `room:viewport`.
- Server must reject host messages sent before `host:join` succeeds.
- Password-protected rooms reject viewers before `viewer:join` succeeds.
- Viewer-originated mutation messages are ignored or rejected.

Frontend enforcement:

- `app.setMode("presentation")` on room join.
- Add a stronger room lock so UI cannot switch back to edit.
- Replace the normal Edit / Present mode toggle with a Viewer / Host view toggle while room viewer lock is active.
- Hide or disable live edit controls in the current app UI.
- Disable mutating keybindings while room viewer lock is active.
- In `Host` view mode, apply incoming `room:viewport`.
- In `Viewer` view mode, keep the local camera independent and ignore applying incoming `room:viewport`.
- If the user pans or zooms while in `Host` view mode, switch to `Viewer` view mode automatically before applying that camera change.

The frontend lock is for UX and runs in the same application, not in a separate viewer-only page. The server host-token check is the actual protection against viewers broadcasting fake host state.

## Routing

The share link format is:

```txt
${window.location.origin}/room/${roomId}
```

Vite dev server and production hosting must serve `index.html` for `/room/:roomId`, then the app parses the route client-side.

Implementation notes:

- `/room/:roomId` is not a separate page. It loads the same app and applies room viewer restrictions at runtime.
- In local Vite dev, history fallback usually serves the app automatically.
- In static deployment, configure fallback rewrites:
  - `/room/* -> /index.html`
- The room server and static app must be deployed on the same origin.

## Room Lifecycle

Room creation:

- Room exists after `POST /api/rooms`.
- Room is empty until host WebSocket connects.
- Password-protected room stores its password hash only in memory.

Viewer joins before host socket:

- Show a short waiting state.
- If the host socket does not appear, show `Room not ready`.

Host disconnect:

- Close the room.
- Notify all viewers with `room:closed`.
- Remove room from memory.

Viewer disconnect:

- Remove viewer socket from room.
- Keep room alive while host is connected.

Server restart:

- All rooms are lost.
- This is expected because there is no persistence.

Idle cleanup:

- If a room has no host for 30-60 seconds, delete it.
- If a room is older than a maximum TTL, close it to prevent abandoned rooms.

## State Sync Strategy

Use snapshot sync:

- Host sends full `room:state` at share start.
- Host sends full `room:state` when a viewer joins.
- Host sends viewport updates continuously.
- Host sends full `room:state` after edits, throttled or debounced.

This is simple and matches the “server only forwards messages” requirement.

Tradeoff:

- Large documents can make repeated snapshots expensive.
- But implementation risk is low, and the app already has document serialization.

No incremental edit event protocol is included in this design. The server remains a message relay and does not become a collaboration backend.

## UI Requirements

Host UI:

- Add Share button in the toolbar.
- Share flow includes a room password field; a blank value creates a room without a password.
- On click, show generated room link.
- Render a QR code directly beside the generated room link.
- QR code encodes only `${window.location.origin}/room/${roomId}`.
- QR code must not include `hostToken` or room password.
- Show room id and viewer count if available.
- Show connection state: sharing, reconnecting, stopped.

Viewer UI:

- Show a password prompt before room entry when the server sends `room:auth-required`.
- No Edit / Present capsule.
- The same capsule location becomes a Viewer / Host view toggle.
- `Host` means follow host camera updates.
- `Viewer` means use a free local camera while staying read-only.
- No component dropdown.
- No pen/shape/edit toolbar.
- No context menu edit actions.
- Keep the existing JSON / HTML download controls available.
- Show small read-only room badge such as `Room 1234 · Host view` or `Room 1234 · Viewer view`.
- Show disconnected/room closed notice when host leaves.

Room viewer mode only hides or disables live editing paths. It must not create a separate stripped-down viewer page.

Do not rely on visible text explaining how to use the app. The badge/status communicates state and does not become an instruction panel.

## Server Pseudocode

```js
const rooms = new Map();

function createRoom({ password = "" } = {}) {
  const roomId = allocateFourDigitRoomId();
  const hostToken = crypto.randomUUID();
  const passwordHash = password ? hashRoomPassword(password) : null;
  rooms.set(roomId, {
    roomId,
    hostToken,
    passwordHash,
    requiresPassword: Boolean(passwordHash),
    hostSocket: null,
    viewers: new Set(),
    createdAt: Date.now(),
    lastSeenAt: Date.now(),
  });
  return { roomId, hostToken, requiresPassword: Boolean(passwordHash) };
}

function handleHostMessage(room, hostSocket, message) {
  if (hostSocket !== room.hostSocket) {
    return;
  }

  if (!["room:state", "room:viewport"].includes(message.type)) {
    return;
  }
  for (const viewer of room.viewers) {
    viewer.send(JSON.stringify(message));
  }
}

function handleHostJoin(room, hostSocket, { hostToken = "" } = {}) {
  if (hostToken !== room.hostToken) {
    hostSocket.send(JSON.stringify({
      type: "room:error",
      payload: { message: "Invalid host token" },
    }));
    hostSocket.close();
    return;
  }

  if (room.hostSocket) {
    hostSocket.send(JSON.stringify({
      type: "room:error",
      payload: { message: "Host already connected" },
    }));
    hostSocket.close();
    return;
  }

  room.hostSocket = hostSocket;
  hostSocket.send(JSON.stringify({
    type: "host:joined",
    payload: { roomId: room.roomId },
  }));
}

function handleViewerJoin(room, viewerSocket, { password = "" } = {}) {
  if (room.requiresPassword && !verifyRoomPassword(password, room.passwordHash)) {
    viewerSocket.send(JSON.stringify({
      type: "room:error",
      payload: { message: "Invalid room password" },
    }));
    viewerSocket.close();
    return;
  }

  room.viewers.add(viewerSocket);
  viewerSocket.send(JSON.stringify({
    type: "room:joined",
    payload: { roomId: room.roomId },
  }));
  room.hostSocket?.send(JSON.stringify({
    type: "viewer:joined",
    payload: { viewerId: viewerSocket.id },
  }));
}
```

This pseudocode is intentionally plain. The server stays boring.

## Security And Limits

Because room ids are only 4 digits, assume links are guessable.

Minimum protections:

- Host token must be high entropy.
- Host token must not be placed in URLs.
- Host token must not be logged.
- Room password must not be logged.
- Room password must be hashed in memory instead of stored as plaintext.
- Only host token can publish room state.
- Rate limit `POST /api/rooms`.
- Rate limit repeated failed viewer password attempts.
- Cap max rooms, max viewers per room, max message size.
- Validate JSON message shape.
- Drop connections that send oversized or invalid messages repeatedly.
- Use HTTPS/WSS in production.

This design is appropriate for casual sharing, classroom demos, and presentation follow mode. It is not appropriate for private or sensitive documents; authentication and stronger access control belong to a different design, not this one.

## Testing Plan

Unit tests:

- Room id generation returns 4 digit strings.
- Room generation avoids collisions.
- Room creation stores `requiresPassword` correctly.
- Host WebSocket URL does not contain `hostToken`.
- Host token is required in `host:join`.
- Host messages before successful `host:join` are rejected.
- Password-protected room rejects wrong viewer password.
- Password-protected room accepts correct viewer password.
- Viewer cannot broadcast host-only message types.
- Room closes when host disconnects.

E2E tests:

- Host clicks Share and receives `/room/1234` link.
- Host Share UI shows a QR code next to the link.
- QR code data matches the share URL and does not include password or host token.
- Host can create a password-protected room.
- Viewer opens `/room/1234` and enters `presentation`.
- Viewer must enter the correct room password before receiving state.
- Viewer cannot switch to edit.
- Viewer sees a Viewer / Host toggle instead of the Edit / Present toggle.
- Viewer edit controls are hidden or disabled.
- Viewer can still download JSON or HTML.
- Downloaded HTML opens, and downloaded JSON loads, as a normal editable board outside the room route.
- Host pan/zoom updates viewer viewport while viewer is in `Host` view mode.
- Viewer can switch to `Viewer` view mode and pan/zoom freely without changing room state.
- Viewer pan/zoom while in `Host` view mode automatically switches to `Viewer` view mode.
- Viewer receives initial document snapshot.
- Host disconnect shows room closed state on viewer.

Manual checks:

- Refreshing viewer rejoins room while host is active.
- Server restart loses room and viewer gets a clear error.
- Two viewers can follow one host independently.
- One viewer can use local `Viewer` view mode while another stays in `Host` follow mode.

## Implementation Checklist

### Phase 1: Server Skeleton

- [x] Add `/server/`.
- [x] Add root `pnpm run server` command so the server starts without changing directories.
- [x] Implement `POST /api/rooms`.
- [x] Support host-set room password; a blank password creates an unprotected room.
- [x] Implement WebSocket endpoint.
- [x] Validate `host:join` before accepting host-originated room messages.
- [x] Validate `viewer:join` before adding viewer sockets to the room.
- [x] Keep all room data in memory.
- [x] Add basic message validation and room cleanup.
- [x] Rate limit `POST /api/rooms` in memory.
- [x] Rate limit repeated failed viewer password attempts in memory.
- [x] Cap viewer sockets per room.
- [x] Reject viewer-originated host message types.

### Phase 2: Host Share Button

- [x] Add toolbar Share entry.
- [x] Create room by HTTP.
- [x] Connect host WebSocket without token in the URL.
- [x] Send `host:join` as the first host WebSocket message.
- [x] Generate `/room/:roomId` link.
- [x] Add `qrcode` dependency to the frontend package.
- [x] Render QR code beside the generated link.
- [x] Keep the room password out of the share URL.
- [x] Send initial document snapshot.
- [x] Relay viewport changes.

### Phase 3: Viewer Room Route

- [x] Detect `/room/:roomId` in the same app shell.
- [x] Lock app to `presentation`.
- [x] Enforce the presentation lock against direct `app.setMode("edit")` calls and presentation-exit shortcuts.
- [x] Hide or disable live edit UI.
- [x] Replace Edit / Present with Viewer / Host local view toggle.
- [x] Keep existing JSON / HTML download behavior unchanged.
- [x] Connect viewer WebSocket.
- [x] Prompt for room password when required.
- [x] Send `viewer:join`.
- [x] Load `room:state`.
- [x] Default to `Host` view mode and follow `room:viewport`.
- [x] Support `Viewer` view mode for free local pan / zoom.
- [x] Auto-switch from `Host` to `Viewer` view mode when the user attempts pan / zoom.
- [x] Show waiting state and `Room not ready` when a viewer joins before the host socket is ready.

### Phase 4: Verification

- [x] Add room server unit tests.
- [x] Add room server WebSocket enforcement E2E tests.
- [x] Add room rate-limit unit tests.
- [x] Add room route and host-token URL unit tests.
- [x] Add Playwright multi-page E2E for host/viewer.
- [x] Add Playwright coverage for viewer presentation lock, export menu availability, and waiting state.
- [x] Test disconnection and room cleanup.

## Implemented File Map

- `server/src/index.js`: Node.js HTTP server, WebSocket upgrade handling, in-memory rate limits, host/viewer validation, static `/room/*` fallback.
- `server/src/roomStore.js`: four digit room creation, in-memory password hashing, host/viewer socket tracking, room expiry collection.
- `server/src/protocol.js`: JSON message validation, allowed host/viewer message types, max message size constants.
- `server/src/rateLimit.js`: in-memory rate bucket helpers for room creation and password attempts.
- `src/online/roomRoute.js`: `/room/:roomId` parsing, share URL creation, WebSocket URL creation without host secrets.
- `src/online/roomClient.js`: browser WebSocket wrapper.
- `src/online/roomHost.js`: room creation and host WebSocket client creation.
- `src/online/roomViewer.js`: viewer WebSocket client creation.
- `src/plugins/roomShare.js`: Share UI, QR rendering, host snapshot/viewport relay, viewer password prompt, Viewer / Host local view toggle, read-only room lock, waiting and closed-room status.
- `src/core/app.js`: presentation lock used by room viewer mode to prevent edit-mode re-entry.
- `src/stage.js`: user pan / zoom intent hook used to switch viewer from `Host` follow mode to local `Viewer` mode.
- `tests/unit/server/roomStore.test.js`: room id, collision retry, password hash, socket tracking, expiry tests.
- `tests/unit/server/rateLimit.test.js`: in-memory rate-limit bucket behavior.
- `tests/unit/online/roomRoute.test.js`: route parsing and no-token URL tests.
- `tests/e2e/room.spec.js`: full host/viewer flow, QR, password prompt, export menu, presentation lock, Host / Viewer camera behavior, waiting state, host disconnect, and server WebSocket authorization rejection.

## Fixed Runtime Requirements

- Viewer must see a waiting state when the room exists but the host WebSocket has not connected yet.
- Production deployment must run the frontend and room server on the same origin.
- Server must enforce a maximum JSON message size.
- Server must close connections that exceed the maximum message size.

## Required Implementation

Build this implementation:

1. Server creates in-memory 4 digit rooms and relays WebSocket messages.
2. Host can set a room password; server keeps only an in-memory hash.
3. Share UI shows both the room link and a QR code generated with `qrcode`.
4. Host sends full document snapshot on share start and viewer join.
5. Host sends throttled viewport updates.
6. Viewer route locks the same app into presentation after password validation.
7. Viewer sees Viewer / Host local view toggle instead of Edit / Present.
8. `Host` view mode follows host viewport; `Viewer` view mode allows free local camera.
9. Pan / zoom in `Host` view mode automatically switches to `Viewer` view mode.
10. No incremental edit sync, no user system, no database, no viewer edit path.
11. Viewer downloads remain normal exports; downloaded copies are editable outside the room.

This satisfies the requested online mode while keeping the server deliberately simple and disposable.
