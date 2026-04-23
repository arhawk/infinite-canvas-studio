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

test("adds a ranking box from the palette", async ({ page }) => {
  await page.getByTestId("palette-card-rankingBox").click();

  await expect.poll(async () => (await listNodes(page)).length).toBe(1);
  const [node] = await listNodes(page);
  expect(node.componentType).toBe("rankingBox");
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

test("marquee selects multiple components and supports JSON clipboard paste", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"], {
    origin: new URL(page.url()).origin,
  });
  const nodes = await page.evaluate(async () => Promise.all([
    window.__APP_TEST_API__.addComponent("sticky", { x: 80, y: 80 }),
    window.__APP_TEST_API__.addComponent("text", { x: 300, y: 120 }),
  ]));

  const start = await page.evaluate(() => window.__APP_TEST_API__.canvasToPagePoint({ x: 40, y: 40 }));
  const end = await page.evaluate(() => window.__APP_TEST_API__.canvasToPagePoint({ x: 520, y: 260 }));

  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(end.x, end.y, { steps: 10 });
  await page.mouse.up();

  await expect
    .poll(async () => page.evaluate(() => window.__APP_TEST_API__.getSelectedNodeIds()))
    .toEqual(expect.arrayContaining(nodes.map((node) => node.id)));

  await page.keyboard.press(process.platform === "darwin" ? "Meta+C" : "Control+C");
  const clipboardText = await page.evaluate(() => navigator.clipboard.readText());
  const payload = JSON.parse(clipboardText);
  expect(payload.kind).toBe("mind-map-selection");
  expect(payload.nodes).toHaveLength(2);

  await page.keyboard.press(process.platform === "darwin" ? "Meta+V" : "Control+V");
  await expect.poll(async () => (await listNodes(page)).length).toBe(4);

  const selectedIds = await page.evaluate(() => window.__APP_TEST_API__.getSelectedNodeIds());
  expect(selectedIds).toHaveLength(2);
  expect(selectedIds).not.toEqual(expect.arrayContaining(nodes.map((node) => node.id)));
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

test("draws and erases strokes in presentation mode", async ({ page }) => {
  await page.getByTestId("mode-toggle").click();
  await expect(page.getByTestId("mode-toggle-label")).toHaveText("View");

  await page.getByTestId("tool-button-pen").click();
  await expect(page.getByTestId("stroke-width")).toBeEnabled();

  const { start, end } = await drawStroke(page, {
    xRatio: 0.38,
    yRatio: 0.42,
    dx: 140,
    dy: 72,
    steps: 12,
  });

  await expect
    .poll(async () => page.evaluate(() => window.__APP_TEST_API__.countDrawables()))
    .toBeGreaterThan(0);

  await page.getByTestId("tool-button-eraser").click();
  await expect(page.getByTestId("stroke-width")).toBeEnabled();
  await expect(page.getByTestId("clear-strokes")).toBeVisible();

  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(end.x, end.y, { steps: 12 });
  await page.mouse.up();

  await expect
    .poll(async () => page.evaluate(() => window.__APP_TEST_API__.countDrawables()))
    .toBe(0);
});

test("toggles pen and eraser on and off in presentation mode", async ({ page }) => {
  await page.getByTestId("mode-toggle").click();
  await expect(page.getByTestId("mode-toggle-label")).toHaveText("View");

  const canvas = page.getByTestId("canvas-container");
  const penButton = page.getByTestId("tool-button-pen");
  const eraserButton = page.getByTestId("tool-button-eraser");

  await expect(penButton).toHaveAttribute("aria-pressed", "false");
  await penButton.click();
  await expect(penButton).toHaveAttribute("aria-pressed", "true");
  await expect.poll(async () => canvas.evaluate((node) => getComputedStyle(node).cursor)).toBe(
    "crosshair",
  );

  const firstStroke = await drawStroke(page, {
    xRatio: 0.34,
    yRatio: 0.4,
    dx: 110,
    dy: 58,
    steps: 10,
  });
  await expect
    .poll(async () => page.evaluate(() => window.__APP_TEST_API__.countDrawables()))
    .toBe(1);

  await penButton.click();
  await expect(penButton).toHaveAttribute("aria-pressed", "false");
  await expect.poll(async () => canvas.evaluate((node) => getComputedStyle(node).cursor)).toBe(
    "grab",
  );

  await page.mouse.move(firstStroke.start.x, firstStroke.start.y);
  await page.mouse.down();
  await page.mouse.move(firstStroke.end.x, firstStroke.end.y, { steps: 10 });
  await page.mouse.up();
  await expect
    .poll(async () => page.evaluate(() => window.__APP_TEST_API__.countDrawables()))
    .toBe(1);

  await eraserButton.click();
  await expect(eraserButton).toHaveAttribute("aria-pressed", "true");
  await expect.poll(async () => canvas.evaluate((node) => getComputedStyle(node).cursor)).toBe(
    "crosshair",
  );

  await page.mouse.move(firstStroke.start.x, firstStroke.start.y);
  await page.mouse.down();
  await page.mouse.move(firstStroke.end.x, firstStroke.end.y, { steps: 10 });
  await page.mouse.up();
  await expect
    .poll(async () => page.evaluate(() => window.__APP_TEST_API__.countDrawables()))
    .toBe(0);

  await eraserButton.click();
  await expect(eraserButton).toHaveAttribute("aria-pressed", "false");
  await expect.poll(async () => canvas.evaluate((node) => getComputedStyle(node).cursor)).toBe(
    "grab",
  );
});

test.skip("toggles drawing layer visibility in presentation mode", async ({ page }) => {
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
