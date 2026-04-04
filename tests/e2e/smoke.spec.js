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
