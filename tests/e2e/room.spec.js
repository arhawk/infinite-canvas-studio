import { spawn } from "node:child_process";
import { expect, test } from "@playwright/test";

test.describe.configure({ mode: "serial" });

let roomServer = null;

async function waitForRoomServer() {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch("http://127.0.0.1:3001/health");
      if (response.ok) return;
    } catch {
      // Retry until the server accepts connections.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("Room server did not start.");
}

test.beforeAll(async () => {
  roomServer = spawn(process.execPath, ["server/src/index.js"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      PORT: "3001",
    },
    stdio: "ignore",
  });
  await waitForRoomServer();
});

test.afterAll(() => {
  roomServer?.kill();
  roomServer = null;
});

test.beforeEach(async ({ context }) => {
  await context.addInitScript(() => {
    window.__ROOM_BACKEND_HOST__ = window.location.host;
  });
});

async function waitForTestApi(page) {
  await page.waitForFunction(() => Boolean(window.__APP_TEST_API__));
}

async function getViewport(page) {
  return page.evaluate(() => window.__APP_TEST_API__.getViewportState());
}

function getRoomUrl(path) {
  const port = process.env.PLAYWRIGHT_PORT || "3000";
  return `http://127.0.0.1:${port}${path}`;
}

function getRoomSocketUrl(roomPath, role) {
  const roomId = roomPath.match(/\/room\/(\d{4})/)?.[1];
  const port = process.env.PLAYWRIGHT_PORT || "3000";
  return `ws://127.0.0.1:${port}/ws/rooms/${roomId}?role=${role}`;
}

function createRawRoomSocket(roomPath, role) {
  const socket = new WebSocket(getRoomSocketUrl(roomPath, role));
  const messages = [];
  const waiters = [];

  socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    messages.push(message);
    for (const waiter of [...waiters]) {
      if (waiter.type === message.type) {
        waiters.splice(waiters.indexOf(waiter), 1);
        waiter.resolve(message);
      }
    }
  });

  const opened = new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true });
    socket.addEventListener("error", reject, { once: true });
  });

  return {
    socket,
    async opened() {
      await opened;
    },
    send(type, payload = {}) {
      socket.send(JSON.stringify({ type, payload }));
    },
    waitFor(type, timeoutMs = 3000) {
      const existing = messages.find((message) => message.type === type);
      if (existing) return Promise.resolve(existing);

      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          const index = waiters.indexOf(waiter);
          if (index >= 0) waiters.splice(index, 1);
          reject(new Error(`Timed out waiting for ${type}.`));
        }, timeoutMs);
        const waiter = {
          type,
          resolve: (message) => {
            clearTimeout(timeout);
            resolve(message);
          },
        };
        waiters.push(waiter);
      });
    },
    close() {
      socket.close();
    },
  };
}

test("shares a password-protected room with QR and viewer camera modes", async ({ page, context }) => {
  await page.goto("/");
  await waitForTestApi(page);

  await page.getByTestId("share-btn").click();
  await page.getByTestId("room-share-password").fill("secret");
  await page.getByTestId("room-share-create").click();

  const shareLink = page.getByTestId("room-share-link");
  await expect(shareLink).toBeVisible();
  const href = await shareLink.getAttribute("href");
  expect(href).toMatch(/\/room\/\d{4}$/);
  expect(href).not.toContain("secret");
  expect(href).not.toContain("hostToken");
  await expect(page.getByTestId("room-share-qr")).toBeVisible();
  await expect.poll(async () => (
    page.getByTestId("room-share-qr").evaluate((canvas) => canvas.toDataURL().length)
  )).toBeGreaterThan(1000);

  const viewer = await context.newPage();
  await viewer.goto(href);
  await waitForTestApi(viewer);
  await expect(viewer.getByTestId("room-password-prompt")).toBeVisible();
  await viewer.getByTestId("room-password-input").fill("secret");
  await viewer.getByTestId("room-password-submit").click();

  await expect(viewer.getByTestId("mode-capsule-edit")).toHaveText("Viewer");
  await expect(viewer.getByTestId("mode-capsule-present")).toHaveText("Host");
  await expect(viewer.getByTestId("load-document-action")).toBeHidden();
  await expect(viewer.getByTestId("save-document-action")).toBeVisible();
  await expect(viewer.getByTestId("components-trigger")).toBeHidden();
  await expect.poll(async () => (
    viewer.evaluate(() => window.__APP_TEST_API__.listNodes().length)
  )).toBeGreaterThan(0);

  await viewer.getByTestId("save-document-action").click();
  await expect(viewer.getByTestId("save-document-format-menu")).toBeVisible();
  await expect(viewer.getByTestId("save-document-as-html")).toBeVisible();
  await expect(viewer.getByTestId("save-document-as-json")).toBeVisible();
  await viewer.keyboard.press("Escape");
  await expect.poll(async () => (
    viewer.evaluate(() => window.__APP_TEST_API__.getMode())
  )).toBe("presentation");
  await viewer.evaluate(() => window.__APP_TEST_API__.setMode("edit"));
  await expect.poll(async () => (
    viewer.evaluate(() => window.__APP_TEST_API__.getMode())
  )).toBe("presentation");

  await page.evaluate(() => {
    window.__APP_TEST_API__.setViewport({
      scale: 0.6,
      position: { x: 40, y: 50 },
    });
  });
  await expect.poll(async () => (await getViewport(viewer)).scale).toBeCloseTo(0.6, 1);

  const canvasBox = await viewer.getByTestId("canvas-container").boundingBox();
  await viewer.mouse.move(canvasBox.x + canvasBox.width / 2, canvasBox.y + canvasBox.height / 2);
  await viewer.mouse.wheel(0, -240);
  await expect(viewer.getByTestId("mode-capsule-edit")).toHaveAttribute("aria-pressed", "true");

  const freeViewport = await viewer.evaluate(() => (
    window.__APP_TEST_API__.setViewport({
      scale: 1.25,
      position: { x: -120, y: -90 },
    })
  ));

  await page.evaluate(() => {
    window.__APP_TEST_API__.setViewport({
      scale: 0.4,
      position: { x: 10, y: 15 },
    });
  });
  await new Promise((resolve) => setTimeout(resolve, 250));
  const viewerViewport = await getViewport(viewer);
  expect(viewerViewport.scale).toBeCloseTo(freeViewport.scale, 2);
  expect(viewerViewport.position.x).toBeCloseTo(freeViewport.position.x, 1);

  await viewer.getByTestId("mode-capsule-present").click();
  await expect(viewer.getByTestId("mode-capsule-present")).toHaveAttribute("aria-pressed", "true");
  await expect.poll(async () => (await getViewport(viewer)).scale).toBeCloseTo(0.4, 1);

  await page.close();
  await expect(viewer.getByTestId("room-status-badge")).toContainText("Host disconnected");
});

test("shows room not ready when a viewer joins before the host socket", async ({ page, request }) => {
  const response = await request.post("/api/rooms", {
    data: { password: "" },
  });
  expect(response.ok()).toBe(true);
  const room = await response.json();

  await page.goto(getRoomUrl(room.url));
  await waitForTestApi(page);

  await expect(page.getByTestId("room-status-badge")).toContainText("Waiting for host");
  await expect(page.getByTestId("room-status-badge")).toContainText("Room not ready", {
    timeout: 6000,
  });
  await expect.poll(async () => (
    page.evaluate(() => window.__APP_TEST_API__.getMode())
  )).toBe("presentation");
});

test("server rejects unauthorized room WebSocket messages", async ({ request }) => {
  const response = await request.post("/api/rooms", {
    data: { password: "secret" },
  });
  expect(response.ok()).toBe(true);
  const room = await response.json();

  const pendingHost = createRawRoomSocket(room.url, "host");
  await pendingHost.opened();
  pendingHost.send("room:state", { document: { nodes: [] } });
  await expect(pendingHost.waitFor("room:error")).resolves.toMatchObject({
    payload: { code: "host-not-joined" },
  });
  pendingHost.close();

  const badHost = createRawRoomSocket(room.url, "host");
  await badHost.opened();
  badHost.send("host:join", { hostToken: "wrong-token" });
  await expect(badHost.waitFor("room:error")).resolves.toMatchObject({
    payload: { code: "invalid-host-token" },
  });

  const wrongViewer = createRawRoomSocket(room.url, "viewer");
  await wrongViewer.opened();
  await wrongViewer.waitFor("room:auth-required");
  wrongViewer.send("viewer:join", { password: "wrong" });
  await expect(wrongViewer.waitFor("room:error")).resolves.toMatchObject({
    payload: { code: "invalid-room-password" },
  });

  const viewer = createRawRoomSocket(room.url, "viewer");
  await viewer.opened();
  await viewer.waitFor("room:auth-required");
  viewer.send("viewer:join", { password: "secret" });
  await viewer.waitFor("room:joined");
  viewer.send("room:state", { document: { nodes: [] } });
  await expect(viewer.waitFor("room:error")).resolves.toMatchObject({
    payload: { code: "bad-viewer-message" },
  });
  viewer.close();
});
