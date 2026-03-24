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
  await page.evaluate((nodeId) => window.__APP_TEST_API__.openComponentEditor(nodeId), sticky.id);

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

  await page.getByTestId("undo-action").click();
  await expect
    .poll(async () => {
      const node = await getNode(page, sticky.id);
      return node?.summary?.text ?? "";
    })
    .toBe("Sticky note");

  await page.getByTestId("redo-action").click();
  await expect
    .poll(async () => {
      const node = await getNode(page, sticky.id);
      return node?.summary?.text ?? "";
    })
    .toBe("Updated from Playwright");
});

test("loads a saved document snapshot and resets the undo baseline", async ({ page }) => {
  const source = await addComponent(page, "sticky", { x: 180, y: 180 });
  const target = await addComponent(page, "sticky", { x: 560, y: 260 });

  await page.evaluate(
    ({ sourceId, targetId }) => window.__APP_TEST_API__.createConnection(sourceId, targetId),
    { sourceId: source.id, targetId: target.id },
  );
  await page.evaluate((nodeId) => window.__APP_TEST_API__.saveFocus(nodeId), target.id);
  await page.evaluate(() => window.__APP_TEST_API__.setViewport({
    scale: 1.35,
    position: { x: -240, y: -140 },
  }));

  await page.getByTestId("tool-button-brush").click();
  const rect = await page.evaluate(() => window.__APP_TEST_API__.getCanvasContainerRect());
  await page.mouse.move(rect.left + 240, rect.top + 220);
  await page.mouse.down();
  await page.mouse.move(rect.left + 360, rect.top + 280, { steps: 10 });
  await page.mouse.up();

  const exported = await page.evaluate(() => window.__APP_TEST_API__.exportDocument());

  await page.evaluate(() => window.__APP_TEST_API__.clearBoard());
  await expect.poll(async () => (await page.evaluate(() => window.__APP_TEST_API__.listNodes())).length).toBe(0);

  await page.getByTestId("load-document-input").setInputFiles({
    name: "mind-map.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(exported)),
  });

  await expect(page.getByTestId("document-status-toast")).toHaveText("Document loaded");
  await expect
    .poll(async () => (await page.evaluate(() => window.__APP_TEST_API__.listNodes())).length)
    .toBe(3);
  await expect
    .poll(async () => page.evaluate(() => window.__APP_TEST_API__.countDrawables()))
    .toBeGreaterThan(0);
  await expect.poll(async () => page.evaluate(() => window.__APP_TEST_API__.canUndo())).toBe(
    false,
  );

  const restoredTarget = await getNode(page, target.id);
  expect(restoredTarget?.savedFocus).toBeTruthy();

  const restoredConnection = await page.evaluate(() => (
    window.__APP_TEST_API__.listNodes().find((node) => node.componentType === "connection")
  ));
  expect(restoredConnection.summary.sourceNodeId).toBe(source.id);
  expect(restoredConnection.summary.targetNodeId).toBe(target.id);

  const viewport = await page.evaluate(() => window.__APP_TEST_API__.getViewportState());
  expect(viewport.scale).toBeCloseTo(exported.view.scale, 4);
  expect(viewport.position.x).toBeCloseTo(exported.view.position.x, 4);
  expect(viewport.position.y).toBeCloseTo(exported.view.position.y, 4);

  const beforeMove = await getNode(page, source.id);
  await page.evaluate(
    ({ id, position }) => window.__APP_TEST_API__.moveNode(id, position),
    { id: source.id, position: { x: 760, y: 420 } },
  );

  await page.getByTestId("undo-action").click();
  await expect
    .poll(async () => Math.abs(((await getNode(page, source.id))?.bounds?.x ?? 0) - (beforeMove?.bounds?.x ?? 0)))
    .toBeLessThan(2);
});

test("undoes and redoes a node move", async ({ page }) => {
  const sticky = await addComponent(page, "sticky", { x: 200, y: 200 });
  const beforeMove = await getNode(page, sticky.id);

  await page.evaluate(
    ({ id, position }) => window.__APP_TEST_API__.moveNode(id, position),
    { id: sticky.id, position: { x: 640, y: 360 } },
  );

  await expect
    .poll(async () => (await getNode(page, sticky.id))?.bounds?.x ?? 0)
    .toBeGreaterThan((beforeMove?.bounds?.x ?? 0) + 300);

  await page.getByTestId("undo-action").click();
  await expect
    .poll(async () => Math.abs(((await getNode(page, sticky.id))?.bounds?.x ?? 0) - (beforeMove?.bounds?.x ?? 0)))
    .toBeLessThan(2);

  await page.getByTestId("redo-action").click();
  await expect
    .poll(async () => (await getNode(page, sticky.id))?.bounds?.x ?? 0)
    .toBeGreaterThan((beforeMove?.bounds?.x ?? 0) + 300);
});
