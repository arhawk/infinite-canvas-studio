import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { createServer } from "node:net";
import { pathToFileURL } from "node:url";
import { expect, test } from "@playwright/test";

test.describe.configure({ mode: "serial" });

let roomServer = null;
let roomServerPort = null;

function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : null;
      server.close(() => {
        if (port) {
          resolve(port);
        } else {
          reject(new Error("Failed to allocate a room server port."));
        }
      });
    });
  });
}

async function waitForRoomServer(port) {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/health`);
      if (response.ok) return;
    } catch {
      // Retry until the server accepts connections.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("Room server did not start.");
}

test.beforeAll(async () => {
  roomServerPort = await getFreePort();
  roomServer = spawn(process.execPath, ["server/src/index.js"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      PORT: String(roomServerPort),
    },
    stdio: "ignore",
  });
  await waitForRoomServer(roomServerPort);
});

test.afterAll(() => {
  roomServer?.kill();
  roomServer = null;
});

test.beforeEach(async ({ context }) => {
  await context.addInitScript((backendHost) => {
    window.__ROOM_BACKEND_HOST__ = backendHost;
  }, `127.0.0.1:${roomServerPort}`);
});

async function waitForTestApi(page) {
  await page.waitForFunction(() => Boolean(window.__APP_TEST_API__));
}

async function getViewport(page) {
  return page.evaluate(() => window.__APP_TEST_API__.getViewportState());
}

async function getToolbarThemeSnapshot(page) {
  return page.evaluate(() => {
    const toolbar = document.querySelector('[data-testid="toolbar"]');
    const styles = toolbar ? getComputedStyle(toolbar) : null;
    return {
      colorful: document.body.classList.contains("theme-colorful"),
      toolbarBackground: styles?.backgroundColor ?? "",
      toolbarBorder: styles?.borderColor ?? "",
    };
  });
}

async function showTopToolbar(page) {
  const hoverZone = page.getByTestId("presentation-toolbar-hover-zone");
  const box = await hoverZone.boundingBox();
  if (!box) throw new Error("Presentation toolbar hover zone is not available.");
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await expect(page.getByTestId("toolbar")).toHaveClass(/is-visible/);
}

function getRoomUrl(path) {
  const port = process.env.PLAYWRIGHT_PORT || "3000";
  return `http://127.0.0.1:${port}${path}`;
}

function getRoomSocketUrl(roomPath, role) {
  const roomId = roomPath.match(/\/room\/(\d{4})/)?.[1];
  return `ws://127.0.0.1:${roomServerPort}/ws/rooms/${roomId}?role=${role}`;
}

function getCreateRoomApiUrl() {
  return `http://127.0.0.1:${roomServerPort}/api/rooms`;
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

test("shows pending feedback while creating a room", async ({ page }) => {
  let releaseCreateRoom;
  const createRoomReleased = new Promise((resolve) => {
    releaseCreateRoom = resolve;
  });
  let createAttempts = 0;
  await page.route("**/api/rooms", async (route) => {
    createAttempts += 1;
    await createRoomReleased;
    await route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({ error: "Delayed failure" }),
    });
  });

  await page.goto("/");
  await waitForTestApi(page);

  await page.getByTestId("share-btn").click();
  await page.getByTestId("room-share-create").click();

  await expect(page.getByTestId("room-share-create")).toBeDisabled();
  await expect(page.getByTestId("room-share-create")).toHaveText("Creating...");
  await expect(page.getByTestId("room-share-status")).toHaveText("Creating room...");
  await page.getByTestId("room-share-create").click({ force: true });
  expect(createAttempts).toBe(1);

  releaseCreateRoom();

  await expect(page.getByTestId("room-share-create")).toBeEnabled();
  await expect(page.getByTestId("room-share-create")).toHaveText("Create room");
  await expect(page.getByTestId("room-share-status")).toHaveText("Delayed failure");
  expect(createAttempts).toBe(1);
});

test("shares a password-protected room with QR and viewer camera modes", async ({ page, context }) => {
  await page.goto("/");
  await waitForTestApi(page);

  await page.getByTestId("share-btn").click();
  await page.getByTestId("room-share-password").fill("secret");
  await page.getByTestId("room-share-create").click();

  const shareLink = page.getByTestId("room-share-link");
  await expect(shareLink).toBeVisible();
  await expect(page.getByTestId("room-share-password")).toBeHidden();
  await expect(page.getByTestId("room-share-create")).toBeHidden();
  const linkBox = await shareLink.boundingBox();
  const qrBox = await page.getByTestId("room-share-qr").boundingBox();
  expect(linkBox.y).toBeGreaterThan(qrBox.y + qrBox.height - 1);
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
  await expect(viewer.getByTestId("room-password-prompt")).toBeVisible();
  await viewer.getByTestId("room-password-input").fill("secret");
  await viewer.getByTestId("room-password-submit").click();

  await expect(viewer.getByTestId("mode-capsule-edit")).toHaveText("Viewer");
  await expect(viewer.getByTestId("mode-capsule-present")).toHaveText("Host");
  await expect(viewer.getByTestId("load-document-action")).toBeHidden();
  await expect(viewer.getByTestId("components-trigger")).toBeHidden();
  await expect.poll(async () => (
    viewer.evaluate(() => window.__APP_TEST_API__.listNodes().length)
  )).toBeGreaterThan(0);
  await page.getByTestId("mode-capsule-present").click();
  await page.getByTestId("presentation-tool-timer").click();
  await expect(viewer.getByTestId("timer-widget")).toBeVisible();

  await showTopToolbar(viewer);
  await viewer.getByTestId("mode-capsule-edit").click();
  await expect(viewer.getByTestId("mode-capsule-edit")).toHaveAttribute("aria-pressed", "true");

  await showTopToolbar(page);
  await page.getByTestId("presentation-tool-calculator").click();
  await expect(viewer.getByTestId("calculator-widget")).toBeVisible();

  await page.getByTestId("timer-start-pause").click();
  await expect(viewer.getByTestId("timer-start-pause")).toHaveText("Pause");
  await page.getByTestId("timer-start-pause").click();
  await expect(viewer.getByTestId("timer-start-pause")).toHaveText("Start");

  await page.locator("#calculator-widget .calc-btn", { hasText: "1" }).first().click();
  await expect(viewer.locator("#calculator-widget .calc-widget__display-val")).toHaveText("1");

  await expect(viewer.getByTestId("toolbar")).not.toHaveClass(/is-visible/);
  await showTopToolbar(viewer);
  await expect(viewer.getByTestId("save-document-action")).toBeVisible();
  await viewer.getByTestId("save-document-action").click();
  await expect(viewer.getByTestId("save-document-format-menu")).toBeVisible();
  await expect(viewer.getByTestId("save-document-as-html")).toBeVisible();
  await expect(viewer.getByTestId("save-document-as-json")).toBeVisible();
  await expect(viewer.getByTestId("save-document-as-project")).toBeVisible();
  const htmlDownloadPromise = viewer.waitForEvent("download");
  await viewer.getByTestId("save-document-as-html").click();
  const htmlDownload = await htmlDownloadPromise;
  expect(htmlDownload.suggestedFilename()).toMatch(/\.html$/i);
  const htmlPath = await htmlDownload.path();
  expect(htmlPath).toBeTruthy();
  const savedHtmlPath = `${htmlPath}.html`;
  await htmlDownload.saveAs(savedHtmlPath);
  const html = await readFile(savedHtmlPath, "utf8");
  expect(html.trimStart()).toMatch(/^<!doctype html>/i);
  expect(html).toContain('id="app-snapshot"');
  expect(html.match(/<\/script>/gi) ?? []).toHaveLength(2);

  const exportedViewerCopy = await context.newPage();
  await exportedViewerCopy.goto(pathToFileURL(savedHtmlPath).href);
  await exportedViewerCopy.waitForFunction(() => Boolean(document.querySelector("#canvas-container canvas")));
  await expect(exportedViewerCopy.locator("body")).not.toContainText("RegExp(`^`");
  await expect(exportedViewerCopy.getByTestId("mode-capsule-edit")).toHaveText("Edit");
  await expect(exportedViewerCopy.getByTestId("components-trigger")).toBeVisible();
  await expect(exportedViewerCopy.getByTestId("share-btn")).toBeHidden();
  await exportedViewerCopy.getByTestId("save-document-action").click();
  await expect(exportedViewerCopy.getByTestId("save-document-format-menu")).toBeVisible();
  await expect(exportedViewerCopy.getByTestId("save-document-as-project")).toBeVisible();
  const exportedCopyDownloadPromise = exportedViewerCopy.waitForEvent("download");
  await exportedViewerCopy.getByTestId("save-document-as-html").click();
  const exportedCopyDownload = await exportedCopyDownloadPromise;
  expect(exportedCopyDownload.suggestedFilename()).toMatch(/\.html$/i);
  await exportedViewerCopy.close();
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

  await showTopToolbar(viewer);
  await viewer.getByTestId("mode-capsule-present").click();
  await expect(viewer.getByTestId("mode-capsule-present")).toHaveAttribute("aria-pressed", "true");
  await expect.poll(async () => (await getViewport(viewer)).scale).toBeCloseTo(0.4, 1);

  await page.close();
  await expect(viewer.getByTestId("room-status-badge")).toContainText("Host disconnected");
});

test("syncs page compare snapshots from host to viewer without syncing viewer local pane transforms", async ({ page, context }) => {
  await page.goto("/");
  await waitForTestApi(page);

  await page.getByTestId("share-btn").click();
  await page.getByTestId("room-share-create").click();
  const shareLink = page.getByTestId("room-share-link");
  await expect(shareLink).toBeVisible();
  await expect.poll(async () => shareLink.getAttribute("href")).not.toBe("#");
  const href = await shareLink.getAttribute("href");
  expect(href).toMatch(/\/room\/\d{4}$/);

  const viewer = await context.newPage();
  await viewer.goto(href);
  await expect(viewer.getByTestId("room-status-badge")).toBeVisible();
  const openCompare = async (targetPage) => {
    await targetPage.waitForFunction(() => Boolean(window.__APP_TEST_API__));
    return targetPage.evaluate(async () => {
      window.__APP_TEST_API__.setMode("edit");
      await window.__APP_TEST_API__.addComponent("page", { x: 120, y: 120 });
      await window.__APP_TEST_API__.addComponent("page", { x: 760, y: 120 });
      window.__APP_TEST_API__.setMode("presentation");
      const nodes = window.__APP_TEST_API__.listNodes();
      const pageIds = nodes.filter((node) => node.componentType === "page").map((node) => node.id).slice(0, 2);
      if (pageIds.length !== 2) return false;
      return window.__APP_TEST_API__.openPageCompare(pageIds);
    });
  };

  expect(await openCompare(page)).toBe(true);
  await expect(page.getByTestId("page-compare-overlay")).toBeVisible();
  await expect(viewer.getByTestId("page-compare-overlay")).toBeVisible();
  await expect.poll(async () => (
    viewer.getByTestId("page-compare-pane-1").locator("img").getAttribute("src")
  )).toContain("data:image/png");
  await expect.poll(async () => (
    viewer.getByTestId("page-compare-pane-2").locator("img").getAttribute("src")
  )).toContain("data:image/png");

  const beforeSwap = await Promise.all([
    viewer.getByTestId("page-compare-pane-1").locator(".page-compare-pane__header").textContent(),
    viewer.getByTestId("page-compare-pane-2").locator(".page-compare-pane__header").textContent(),
  ]);
  await page.getByTestId("page-compare-swap").click();
  await expect.poll(async () => Promise.all([
    viewer.getByTestId("page-compare-pane-1").locator(".page-compare-pane__header").textContent(),
    viewer.getByTestId("page-compare-pane-2").locator(".page-compare-pane__header").textContent(),
  ])).toEqual([beforeSwap[1], beforeSwap[0]]);

  const viewerInitialTransform = await viewer.getByTestId("page-compare-pane-1").locator("img").evaluate((img) => ({
    x: Number(img.dataset.compareX),
    y: Number(img.dataset.compareY),
    scale: Number(img.dataset.compareScale),
  }));
  const paneBox = await viewer.getByTestId("page-compare-pane-1").locator(".page-compare-pane__viewport").boundingBox();
  await viewer.mouse.move(paneBox.x + paneBox.width / 2, paneBox.y + paneBox.height / 2);
  await viewer.mouse.wheel(0, -260);
  const viewerZoomedTransform = await viewer.getByTestId("page-compare-pane-1").locator("img").evaluate((img) => ({
    x: Number(img.dataset.compareX),
    y: Number(img.dataset.compareY),
    scale: Number(img.dataset.compareScale),
  }));
  expect(viewerZoomedTransform.scale).toBeGreaterThan(viewerInitialTransform.scale);

  const hostTransformAfterViewerZoom = await page.getByTestId("page-compare-pane-1").locator("img").evaluate((img) => ({
    x: Number(img.dataset.compareX),
    y: Number(img.dataset.compareY),
    scale: Number(img.dataset.compareScale),
  }));
  expect(hostTransformAfterViewerZoom.scale).toBeCloseTo(viewerInitialTransform.scale, 2);

  await page.getByTestId("page-compare-exit").click();
  await expect(page.getByTestId("page-compare-overlay")).toBeHidden();
  await expect(viewer.getByTestId("page-compare-overlay")).toBeHidden();
});

test("shows room not ready when a viewer joins before the host socket", async ({ page, request }) => {
  const response = await request.post(getCreateRoomApiUrl(), {
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

test("keeps the loading overlay in an error state for a missing room", async ({ page }) => {
  await page.goto(getRoomUrl("/room/9999"));
  await waitForTestApi(page);

  const loadingLayer = page.getByTestId("document-loading-layer");
  await expect(loadingLayer).toBeVisible();
  await expect(loadingLayer).toContainText("Room not found");
  await expect(loadingLayer).toHaveAttribute("data-tone", "error");
  await expect(page.getByTestId("room-status-badge")).toContainText("Room not found");
});

test("server relays forward-compatible app events after authorization", async ({ request }) => {
  const response = await request.post(getCreateRoomApiUrl(), {
    data: { password: "" },
  });
  expect(response.ok()).toBe(true);
  const room = await response.json();

  const host = createRawRoomSocket(room.url, "host");
  await host.opened();
  host.send("host:join", { hostToken: room.hostToken });
  await host.waitFor("host:joined");

  const viewer = createRawRoomSocket(room.url, "viewer");
  await viewer.opened();
  await viewer.waitFor("room:auth-required");
  viewer.send("viewer:join");
  await viewer.waitFor("room:joined");
  await host.waitFor("viewer:joined");

  host.send("app:future-widget-event", { value: "from-host" });
  await expect(viewer.waitFor("app:future-widget-event")).resolves.toMatchObject({
    payload: { value: "from-host" },
  });

  viewer.send("app:reaction", { emoji: "👍", id: "unit-reaction", relay: false });
  await expect(host.waitFor("app:reaction")).resolves.toMatchObject({
    payload: { emoji: "👍", id: "unit-reaction", relay: false },
  });

  host.send("app:reaction", { emoji: "👍", id: "unit-reaction", relay: true });
  await expect(viewer.waitFor("app:reaction")).resolves.toMatchObject({
    payload: { emoji: "👍", id: "unit-reaction", relay: true },
  });

  viewer.send("room:reaction", { emoji: "👍" });
  await expect(viewer.waitFor("room:error")).resolves.toMatchObject({
    payload: { code: "bad-viewer-message" },
  });

  viewer.send("app:timer-state", { state: { running: true } });
  await expect(viewer.waitFor("room:error")).resolves.toMatchObject({
    payload: { code: "bad-viewer-message" },
  });

  viewer.send("app:calculator-state", { state: { inputStr: "1" } });
  await expect(viewer.waitFor("room:error")).resolves.toMatchObject({
    payload: { code: "bad-viewer-message" },
  });

  host.close();
  viewer.close();
});

test("server rejects unauthorized room WebSocket messages", async ({ request }) => {
  const response = await request.post(getCreateRoomApiUrl(), {
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
