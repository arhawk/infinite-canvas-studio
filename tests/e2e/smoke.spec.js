import { expect, test } from "@playwright/test";

async function waitForTestApi(page) {
  await page.waitForFunction(() => Boolean(window.__APP_TEST_API__));
}

async function clearBoard(page) {
  await page.evaluate(() => {
    window.__APP_TEST_API__.clearBoard();
    window.__APP_TEST_API__.setMode("edit");
    window.__APP_TEST_API__.setEditorTool("arrange");
  });
}

async function listNodes(page) {
  return page.evaluate(() => window.__APP_TEST_API__.listNodes());
}

async function getNodePageCenter(page, id) {
  return page.evaluate((nodeId) => window.__APP_TEST_API__.getNodePageCenter(nodeId), id);
}

async function drawStroke(page, options = {}) {
  const {
    xRatio = 0.45,
    yRatio = 0.45,
    dx = 120,
    dy = 80,
    steps = 10,
  } = options;
  const rect = await page.evaluate(() => window.__APP_TEST_API__.getCanvasContainerRect());
  const start = {
    x: rect.left + rect.width * xRatio,
    y: rect.top + rect.height * yRatio,
  };
  const end = {
    x: start.x + dx,
    y: start.y + dy,
  };

  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(end.x, end.y, { steps });
  await page.mouse.up();

  return { start, end };
}

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await waitForTestApi(page);
  await clearBoard(page);
});

test("switches between edit and presentation mode", async ({ page }) => {
  await expect(page.getByTestId("mode-toggle-label")).toHaveText("Edit");

  await page.getByTestId("mode-toggle").click();
  await expect(page.getByTestId("mode-toggle-label")).toHaveText("View");
  await expect.poll(async () => page.evaluate(() => window.__APP_TEST_API__.getMode())).toBe(
    "presentation",
  );

  await page.getByTestId("mode-toggle").click();
  await expect(page.getByTestId("mode-toggle-label")).toHaveText("Edit");
  await expect.poll(async () => page.evaluate(() => window.__APP_TEST_API__.getMode())).toBe(
    "edit",
  );
});

test("adds a sticky note from the palette and deletes it with the keyboard", async ({ page }) => {
  await page.getByTestId("palette-card-sticky").click();

  await expect.poll(async () => (await listNodes(page)).length).toBe(1);
  const [node] = await listNodes(page);
  const center = await getNodePageCenter(page, node.id);

  await page.mouse.click(center.x, center.y);
  await page.evaluate(() => {
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Delete", bubbles: true }));
  });

  await expect.poll(async () => (await listNodes(page)).length).toBe(0);
});

test("undoes and redoes adding a sticky note", async ({ page }) => {
  await expect(page.getByTestId("undo-action")).toBeDisabled();
  await expect(page.getByTestId("redo-action")).toBeDisabled();

  await page.getByTestId("palette-card-sticky").click();
  await expect.poll(async () => (await listNodes(page)).length).toBe(1);

  await page.getByTestId("undo-action").click();
  await expect.poll(async () => (await listNodes(page)).length).toBe(0);

  await page.getByTestId("redo-action").click();
  await expect.poll(async () => (await listNodes(page)).length).toBe(1);
});

test("draws a brush stroke on the canvas", async ({ page }) => {
  await page.getByTestId("tool-button-pen").click();
  const rect = await page.evaluate(() => window.__APP_TEST_API__.getCanvasContainerRect());
  const start = {
    x: rect.left + rect.width * 0.45,
    y: rect.top + rect.height * 0.45,
  };
  const end = {
    x: start.x + 120,
    y: start.y + 80,
  };

  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(end.x, end.y, { steps: 10 });
  await page.mouse.up();

  await expect
    .poll(async () => page.evaluate(() => window.__APP_TEST_API__.countDrawables()))
    .toBeGreaterThan(0);

  await page.getByTestId("undo-action").click();
  await expect
    .poll(async () => page.evaluate(() => window.__APP_TEST_API__.countDrawables()))
    .toBe(0);

  await page.getByTestId("redo-action").click();
  await expect
    .poll(async () => page.evaluate(() => window.__APP_TEST_API__.countDrawables()))
    .toBeGreaterThan(0);
});

test("erases an entire brush stroke and supports undo and redo", async ({ page }) => {
  await page.getByTestId("tool-button-pen").click();
  const rect = await page.evaluate(() => window.__APP_TEST_API__.getCanvasContainerRect());
  const start = {
    x: rect.left + rect.width * 0.4,
    y: rect.top + rect.height * 0.4,
  };
  const end = {
    x: start.x + 140,
    y: start.y + 90,
  };

  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(end.x, end.y, { steps: 12 });
  await page.mouse.up();

  await expect
    .poll(async () => page.evaluate(() => window.__APP_TEST_API__.countDrawables()))
    .toBeGreaterThan(0);

  await page.getByTestId("tool-button-eraser").click();
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(end.x, end.y, { steps: 12 });
  await page.mouse.up();

  await expect
    .poll(async () => page.evaluate(() => window.__APP_TEST_API__.countDrawables()))
    .toBe(0);

  await page.getByTestId("undo-action").click();
  await expect
    .poll(async () => page.evaluate(() => window.__APP_TEST_API__.countDrawables()))
    .toBeGreaterThan(0);

  await page.getByTestId("redo-action").click();
  await expect
    .poll(async () => page.evaluate(() => window.__APP_TEST_API__.countDrawables()))
    .toBe(0);
});

test("clears all drawn strokes from the eraser controls and supports undo and redo", async ({ page }) => {
  await page.getByTestId("tool-button-pen").click();
  await drawStroke(page, { xRatio: 0.32, yRatio: 0.36, dx: 100, dy: 40 });
  await drawStroke(page, { xRatio: 0.54, yRatio: 0.5, dx: 90, dy: -50 });

  await expect
    .poll(async () => page.evaluate(() => window.__APP_TEST_API__.countDrawables()))
    .toBe(2);

  await page.getByTestId("tool-button-eraser").click();
  await expect(page.locator("#stroke-width-label")).toHaveText("Radius");
  await expect(page.getByTestId("stroke-width")).toHaveAttribute("min", "4");
  await expect(page.getByTestId("stroke-width")).toHaveAttribute("max", "48");
  await expect(page.getByTestId("clear-strokes")).toBeVisible();
  await expect(page.getByTestId("clear-strokes")).toBeEnabled();

  await page.getByTestId("clear-strokes").click();
  await expect
    .poll(async () => page.evaluate(() => window.__APP_TEST_API__.countDrawables()))
    .toBe(0);

  await page.getByTestId("undo-action").click();
  await expect
    .poll(async () => page.evaluate(() => window.__APP_TEST_API__.countDrawables()))
    .toBe(2);

  await page.getByTestId("redo-action").click();
  await expect
    .poll(async () => page.evaluate(() => window.__APP_TEST_API__.countDrawables()))
    .toBe(0);
});

test("toggles drawing layer visibility in presentation mode", async ({ page }) => {
  await page.getByTestId("tool-button-pen").click();
  await drawStroke(page);
  await expect
    .poll(async () => page.evaluate(() => window.__APP_TEST_API__.countDrawables()))
    .toBe(1);

  await page.getByTestId("mode-toggle").click();
  await expect(page.getByTestId("mode-toggle-label")).toHaveText("View");
  await expect(page.getByTestId("drawing-visibility-toggle")).toBeVisible();
  await expect(page.getByTestId("drawing-visibility-toggle")).toHaveAttribute("aria-pressed", "true");
  await expect
    .poll(async () => page.evaluate(() => window.__APP_TEST_API__.isDrawLayerVisible()))
    .toBe(true);

  await page.getByTestId("drawing-visibility-toggle").click();
  await expect(page.getByTestId("drawing-visibility-toggle")).toHaveAttribute("aria-pressed", "false");
  await expect
    .poll(async () => page.evaluate(() => window.__APP_TEST_API__.isDrawLayerVisible()))
    .toBe(false);

  await page.getByTestId("drawing-visibility-toggle").click();
  await expect(page.getByTestId("drawing-visibility-toggle")).toHaveAttribute("aria-pressed", "true");
  await expect
    .poll(async () => page.evaluate(() => window.__APP_TEST_API__.isDrawLayerVisible()))
    .toBe(true);
});
