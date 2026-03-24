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

async function addComponent(page, type, payload) {
  return page.evaluate(
    ({ componentType, componentPayload }) => (
      window.__APP_TEST_API__.addComponent(componentType, componentPayload)
    ),
    { componentType: type, componentPayload: payload },
  );
}

async function getNode(page, id) {
  return page.evaluate((nodeId) => window.__APP_TEST_API__.getNode(nodeId), id);
}

async function getNodePageCenter(page, id) {
  return page.evaluate((nodeId) => window.__APP_TEST_API__.getNodePageCenter(nodeId), id);
}

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await waitForTestApi(page);
  await clearBoard(page);
});

test("creates a connection from the toolbar and updates it when a node moves", async ({ page }) => {
  const source = await addComponent(page, "sticky", { x: 180, y: 180 });
  const target = await addComponent(page, "sticky", { x: 560, y: 220 });

  const sourceCenter = await getNodePageCenter(page, source.id);
  const targetCenter = await getNodePageCenter(page, target.id);

  await page.mouse.click(sourceCenter.x, sourceCenter.y);
  await expect(page.getByTestId("connect-selection")).toBeEnabled();
  await page.getByTestId("connect-selection").click();
  await page.mouse.click(targetCenter.x, targetCenter.y);

  await expect
    .poll(async () => {
      const nodes = await page.evaluate(() => window.__APP_TEST_API__.listNodes());
      return nodes.filter((node) => node.componentType === "connection").length;
    })
    .toBe(1);

  const createdConnection = await page.evaluate(() => (
    window.__APP_TEST_API__.listNodes().find((node) => node.componentType === "connection")
  ));

  expect(createdConnection.summary.sourceNodeId).toBe(source.id);
  expect(createdConnection.summary.targetNodeId).toBe(target.id);
  expect(createdConnection.summary.points.length).toBe(8);

  const originalPoints = createdConnection.summary.points;

  await page.evaluate(
    ({ id, position }) => window.__APP_TEST_API__.moveNode(id, position),
    { id: target.id, position: { x: 760, y: 320 } },
  );

  await expect
    .poll(async () => {
      const current = await getNode(page, createdConnection.id);
      return JSON.stringify(current?.summary?.points ?? []);
    })
    .not.toBe(JSON.stringify(originalPoints));
});

test("saves focus from the toolbar for the selected node", async ({ page }) => {
  const sticky = await addComponent(page, "sticky", { x: 280, y: 220 });
  const center = await getNodePageCenter(page, sticky.id);

  await page.mouse.click(center.x, center.y);
  await expect(page.getByTestId("save-focus")).toBeEnabled();
  await page.getByTestId("save-focus").click();
  await expect(page.getByTestId("focus-save-toast")).toHaveText("Focus saved");

  await expect
    .poll(async () => Boolean((await getNode(page, sticky.id))?.savedFocus))
    .toBe(true);
});

test("follows a presentation navigation button toward a saved focus", async ({ page }) => {
  const source = await addComponent(page, "sticky", { x: 180, y: 180 });
  const target = await addComponent(page, "sticky", { x: 1800, y: 180 });

  await page.evaluate(
    ({ sourceId, targetId }) => window.__APP_TEST_API__.createConnection(sourceId, targetId),
    { sourceId: source.id, targetId: target.id },
  );

  await page.evaluate((nodeId) => window.__APP_TEST_API__.centerOnNode(nodeId, { duration: 0 }), target.id);
  await page.evaluate((nodeId) => window.__APP_TEST_API__.saveFocus(nodeId), target.id);

  await expect
    .poll(async () => Boolean((await getNode(page, target.id))?.savedFocus))
    .toBe(true);

  const targetSnapshot = await getNode(page, target.id);
  const savedFocusCenter = targetSnapshot.savedFocus.center;

  await page.evaluate((nodeId) => window.__APP_TEST_API__.centerOnNode(nodeId, { duration: 0 }), source.id);
  const beforeNavigation = await page.evaluate(() => window.__APP_TEST_API__.getViewportState());

  await page.getByTestId("mode-toggle").click();
  await expect.poll(async () => page.evaluate(() => window.__APP_TEST_API__.getMode())).toBe(
    "presentation",
  );

  await expect
    .poll(async () => {
      const buttons = await page.evaluate(() => window.__APP_TEST_API__.getNavigationButtons());
      return buttons.length;
    })
    .toBeGreaterThan(0);

  await page.evaluate(() => window.__APP_TEST_API__.clickNavigationButton(0));

  await expect
    .poll(async () => {
      const viewport = await page.evaluate(() => window.__APP_TEST_API__.getViewportState());
      return Math.abs(viewport.center.x - savedFocusCenter.x);
    })
    .toBeLessThan(150);

  await expect
    .poll(async () => {
      const viewport = await page.evaluate(() => window.__APP_TEST_API__.getViewportState());
      return viewport.center.x - beforeNavigation.center.x;
    })
    .toBeGreaterThan(1000);

  await expect
    .poll(async () => page.evaluate(() => window.__APP_TEST_API__.getNavigationButtons().length))
    .toBe(0);
});

test("opens the component editor and applies sticky text changes", async ({ page }) => {
  const sticky = await addComponent(page, "sticky", { x: 220, y: 220 });
  const center = await getNodePageCenter(page, sticky.id);

  await page.mouse.dblclick(center.x, center.y);

  await expect(page.getByTestId("component-editor-dialog")).toBeVisible();
  await expect(page.getByTestId("component-editor-title")).toHaveText("Sticky Note");

  const textarea = page.getByTestId("component-editor-input-text");
  await textarea.fill("Updated from Playwright");
  await page.getByTestId("component-editor-apply").click();

  await expect(page.getByTestId("component-editor-dialog")).toBeHidden();
  await expect
    .poll(async () => {
      const node = await getNode(page, sticky.id);
      return node?.summary?.text ?? "";
    })
    .toBe("Updated from Playwright");
});
