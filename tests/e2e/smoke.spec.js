import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

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

function getBoundsCenter(bounds) {
  return {
    x: bounds.x + bounds.width / 2,
    y: bounds.y + bounds.height / 2,
  };
}

async function clickPaletteCard(page, componentType) {
  const card = page.getByTestId(`palette-card-${componentType}`);
  if (!(await card.isVisible())) {
    await page.getByTestId("components-trigger").click();
  }
  await expect(card).toBeVisible();
  await card.click();
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

async function drawShape(page, options = {}) {
  const {
    xRatio = 0.42,
    yRatio = 0.42,
    dx = 150,
    dy = 95,
    steps = 8,
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

async function setInputValue(page, testId, value) {
  await page.getByTestId(testId).evaluate((input, nextValue) => {
    input.value = nextValue;
    input.dispatchEvent(new Event("input", { bubbles: true }));
  }, value);
}

async function expectShapePanelLayout(page) {
  const panel = page.getByTestId("shape-panel");
  const panelBox = await panel.boundingBox();
  expect(panelBox).not.toBeNull();

  const ids = [
    "shape-panel-type-rectangle",
    "shape-panel-type-oval",
    "shape-panel-type-rhombus",
    "shape-panel-type-triangle",
    "shape-style-font-size",
    "shape-style-text-color",
    "shape-style-fill",
    "shape-style-border",
    "shape-layer-menu",
  ];
  for (const id of ids) {
    const box = await page.getByTestId(id).boundingBox();
    expect(box).not.toBeNull();
    expect(box.x).toBeGreaterThanOrEqual(panelBox.x - 1);
    expect(box.x + box.width).toBeLessThanOrEqual(panelBox.x + panelBox.width + 1);
  }
}

async function expectShapeControlTooltips(page) {
  await expect(page.getByTestId("shape-fill-color")).toHaveAttribute("title", "Fill color");
  await expect(page.getByTestId("shape-opacity")).toHaveAttribute("title", /Opacity/);
  await expect(page.getByTestId("shape-stroke-color")).toHaveAttribute("title", "Border color");
  await expect(page.getByTestId("shape-stroke-width")).toHaveAttribute("title", /Thickness/);
}

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await waitForTestApi(page);
  await clearBoard(page);
});

test("switches between edit and presentation mode", async ({ page }) => {
  await expect(page.getByTestId("mode-capsule-edit")).toHaveAttribute("aria-pressed", "true");

  await page.getByTestId("mode-capsule-present").click();
  await expect(page.getByTestId("mode-capsule-present")).toHaveAttribute("aria-pressed", "true");
  await expect.poll(async () => page.evaluate(() => window.__APP_TEST_API__.getMode())).toBe(
    "presentation",
  );

  await page.getByTestId("mode-capsule-edit").click();
  await expect(page.getByTestId("mode-capsule-edit")).toHaveAttribute("aria-pressed", "true");
  await expect.poll(async () => page.evaluate(() => window.__APP_TEST_API__.getMode())).toBe(
    "edit",
  );
});

test("toggles board fullscreen with Mod+Shift+F only in presentation mode", async ({ page }) => {
  const toggleShortcut = process.platform === "darwin" ? "Meta+Shift+F" : "Control+Shift+F";

  await page.keyboard.press(toggleShortcut);
  await expect
    .poll(async () => page.evaluate(() => Boolean(document.fullscreenElement)))
    .toBe(false);

  await page.getByTestId("mode-capsule-present").click();
  await expect.poll(async () => page.evaluate(() => window.__APP_TEST_API__.getMode())).toBe(
    "presentation",
  );

  await page.keyboard.press(toggleShortcut);
  await expect.poll(async () => page.evaluate(() => {
    const target = document.querySelector(".board-shell");
    return document.fullscreenElement === target;
  })).toBe(true);

  await page.keyboard.press(toggleShortcut);
  await expect
    .poll(async () => page.evaluate(() => document.fullscreenElement === null))
    .toBe(true);
});

test("keeps the edit canvas visible after narrowing the window", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await clearBoard(page);

  await page.setViewportSize({ width: 840, height: 900 });

  await expect.poll(async () => page.evaluate(() => {
    const boardShell = document.querySelector(".board-shell");
    const container = document.querySelector("#canvas-container");
    const canvas = container?.querySelector("canvas");
    const boardRect = boardShell?.getBoundingClientRect?.();
    const containerRect = container?.getBoundingClientRect?.();

    return Boolean(
      document.body.classList.contains("is-edit-mode") &&
      boardRect &&
      containerRect &&
      boardRect.width > 100 &&
      boardRect.height > 100 &&
      containerRect.width > 100 &&
      containerRect.height > 100 &&
      canvas &&
      canvas.width > 100 &&
      canvas.height > 100,
    );
  })).toBe(true);

  await clickPaletteCard(page, "sticky");
  await expect.poll(async () => (await listNodes(page)).length).toBe(1);
});

test("adds a sticky note from the palette and deletes it with the keyboard", async ({ page }) => {
  await clickPaletteCard(page, "sticky");

  await expect.poll(async () => (await listNodes(page)).length).toBe(1);
  const [node] = await listNodes(page);
  const center = await getNodePageCenter(page, node.id);

  await page.mouse.click(center.x, center.y);
  await page.evaluate(() => {
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Delete", bubbles: true }));
  });

  await expect.poll(async () => (await listNodes(page)).length).toBe(0);
});

test("opens the component palette from another active tool", async ({ page }) => {
  await page.getByTestId("tool-button-pen").click();
  await expect(page.getByTestId("tool-button-pen")).toHaveAttribute("aria-pressed", "true");

  await page.getByTestId("components-trigger").click();
  await expect(page.getByTestId("components-trigger")).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("tool-button-pen")).toHaveAttribute("aria-pressed", "false");

  const stickyCard = page.getByTestId("palette-card-sticky");
  await expect(stickyCard).toBeVisible();
  await expect(stickyCard).toBeEnabled();
  await stickyCard.click();

  await expect.poll(async () => (await listNodes(page)).length).toBe(1);
  await expect(page.getByTestId("components-trigger")).toHaveAttribute("aria-pressed", "false");
  await expect(page.getByTestId("tool-button-arrange")).toHaveAttribute("aria-pressed", "true");
});

test("adds a palette-clicked component in the current viewport", async ({ page }) => {
  const viewport = await page.evaluate(() => window.__APP_TEST_API__.setViewport({
    scale: 0.7,
    position: { x: -2200, y: -1400 },
  }));

  await clickPaletteCard(page, "sticky");

  await expect.poll(async () => (await listNodes(page)).length).toBe(1);
  const [node] = await listNodes(page);
  const center = getBoundsCenter(node.bounds);
  expect(Math.abs(center.x - viewport.center.x)).toBeLessThan(8);
  expect(Math.abs(center.y - viewport.center.y)).toBeLessThan(8);
});

test("adds a ranking box from the palette", async ({ page }) => {
  await clickPaletteCard(page, "rankingBox");

  await expect.poll(async () => (await listNodes(page)).length).toBe(1);
  const [node] = await listNodes(page);
  expect(node.componentType).toBe("rankingBox");
});

test("undoes and redoes adding a sticky note", async ({ page }) => {
  await expect(page.getByTestId("undo-action")).toBeDisabled();
  await expect(page.getByTestId("redo-action")).toBeDisabled();

  await clickPaletteCard(page, "sticky");
  await expect.poll(async () => (await listNodes(page)).length).toBe(1);

  await page.getByTestId("undo-action").click();
  await expect.poll(async () => (await listNodes(page)).length).toBe(0);

  await page.getByTestId("redo-action").click();
  await expect.poll(async () => (await listNodes(page)).length).toBe(1);
});

test("shows save and load actions to the left of share with tooltips", async ({ page }) => {
  const saveAction = page.getByTestId("save-document-action");
  const loadAction = page.getByTestId("load-document-action");
  const shareAction = page.getByTestId("share-btn");

  await expect(saveAction).toBeVisible();
  await expect(loadAction).toBeVisible();
  await expect(shareAction).toBeVisible();
  await expect(saveAction).toHaveAttribute("data-tooltip", "Save document (Mod+S)");
  await expect(loadAction).toHaveAttribute("data-tooltip", "Load document (Mod+O)");
  await expect(saveAction.locator("svg")).toBeVisible();
  await expect(loadAction.locator("svg")).toBeVisible();

  const order = await page.evaluate(() => {
    const actions = Array.from(document.querySelectorAll(".toolbar__actions > button"));
    return actions.map((element) => element.getAttribute("data-testid"));
  });
  expect(order).toEqual([
    "save-document-action",
    "load-document-action",
    "share-btn",
  ]);
});

test("keeps save/load keyboard shortcuts working", async ({ page }) => {
  await page.keyboard.press(process.platform === "darwin" ? "Meta+S" : "Control+S");
  await expect(page.getByTestId("save-document-format-menu")).toBeVisible();

  await page.keyboard.press(process.platform === "darwin" ? "Meta+O" : "Control+O");
  await expect(page.getByTestId("load-document-format-menu")).toBeVisible();
});

test("shows load menu with html/json and proj actions", async ({ page }) => {
  await page.getByTestId("load-document-action").click();
  await expect(page.getByTestId("load-document-format-menu")).toBeVisible();
  await expect(page.getByTestId("load-document-as-file")).toBeVisible();
  await expect(page.getByTestId("load-document-as-project")).toBeVisible();
});

test("closes save format menu when clicking outside", async ({ page }) => {
  const formatMenu = page.getByTestId("save-document-format-menu");
  await page.getByTestId("save-document-action").click();
  await expect(formatMenu).toBeVisible();
  await page.mouse.click(24, 180);
  await expect(formatMenu).toBeHidden();
});

test("shows save as PROJ option and reflects File System Access support", async ({ page }) => {
  await page.getByTestId("save-document-action").click();
  const projectAction = page.getByTestId("save-document-as-project");
  await expect(projectAction).toBeVisible();

  const supported = await page.evaluate(() => typeof window.showDirectoryPicker === "function");
  if (supported) {
    await expect(projectAction).toBeEnabled();
  } else {
    await expect(projectAction).toBeDisabled();
    await expect(projectAction.locator("..")).toHaveAttribute(
      "title",
      /Save as PROJ requires File System Access API/,
    );
  }
});

test("shows load as PROJ option and reflects File System Access support", async ({ page }) => {
  await page.getByTestId("load-document-action").click();
  const projectAction = page.getByTestId("load-document-as-project");
  await expect(projectAction).toBeVisible();

  const supported = await page.evaluate(() => typeof window.showDirectoryPicker === "function");
  if (supported) {
    await expect(projectAction).toBeEnabled();
  } else {
    await expect(projectAction).toBeDisabled();
    await expect(projectAction.locator("..")).toHaveAttribute(
      "title",
      /Load PROJ requires File System Access API/,
    );
  }
});

test("exports html with embedded snapshot in dev mode", async ({ page }) => {
  await page.evaluate(() => window.__APP_TEST_API__.addComponent("sticky", { x: 220, y: 220 }));
  await expect.poll(async () => (await listNodes(page)).length).toBe(1);

  await page.getByTestId("save-document-action").click();
  const formatMenu = page.getByTestId("save-document-format-menu");
  await expect(formatMenu).toBeVisible();
  const menuBox = await formatMenu.boundingBox();
  expect(menuBox).toBeTruthy();
  const viewportSize = page.viewportSize();
  expect(viewportSize).toBeTruthy();
  expect(menuBox.x + menuBox.width).toBeLessThanOrEqual(viewportSize.width);
  const downloadPromise = page.waitForEvent("download");
  await page.getByTestId("save-document-as-html").click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/\.html$/i);

  const filePath = await download.path();
  expect(filePath).toBeTruthy();
  const htmlPath = `${filePath}.html`;
  await download.saveAs(htmlPath);
  const html = await readFile(htmlPath, "utf8");

  expect(html.trimStart()).toMatch(/^<!doctype html>/i);
  expect(html).toContain('id="app-snapshot"');
  expect(html).toMatch(/"nodes":\s*\[/);
  expect(html).toMatch(/"type":\s*"sticky"/);
  expect(html).not.toContain("/assets/");
  expect(html).not.toMatch(/<link[^>]+rel=["']stylesheet["']/i);
  expect(html).not.toMatch(/<script[^>]+src=/i);
  expect(html.match(/<\/script>/gi) ?? []).toHaveLength(2);

  const exportedPage = await page.context().newPage();
  await exportedPage.goto(pathToFileURL(htmlPath).href);
  await exportedPage.waitForFunction(() => Boolean(document.querySelector("#canvas-container canvas")));
  await expect(exportedPage.locator("body")).not.toContainText("RegExp(`^`");
  await expect(exportedPage.getByTestId("components-trigger")).toBeVisible();
  await expect(exportedPage.getByTestId("share-btn")).toBeHidden();
  await exportedPage.getByTestId("save-document-action").click();
  await expect(exportedPage.getByTestId("save-document-format-menu")).toBeVisible();
  await expect(exportedPage.getByTestId("save-document-as-html")).toBeVisible();
  await expect(exportedPage.getByTestId("save-document-as-json")).toBeVisible();
  await expect(exportedPage.getByTestId("save-document-as-project")).toBeVisible();
  await exportedPage.close();
});

test("exports json from save format menu", async ({ page }) => {
  await page.evaluate(() => window.__APP_TEST_API__.addComponent("sticky", { x: 220, y: 220 }));
  await expect.poll(async () => (await listNodes(page)).length).toBe(1);

  await page.getByTestId("save-document-action").click();
  await expect(page.getByTestId("save-document-format-menu")).toBeVisible();
  const downloadPromise = page.waitForEvent("download");
  await page.getByTestId("save-document-as-json").click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/\.json$/i);

  const filePath = await download.path();
  expect(filePath).toBeTruthy();
  const raw = await readFile(filePath, "utf8");
  const parsed = JSON.parse(raw);
  expect(parsed).toHaveProperty("nodes");
  expect(parsed).toHaveProperty("drawings");
  expect(parsed.nodes.some((node) => node.type === "sticky")).toBe(true);
});

test("marquee selects multiple components and supports JSON clipboard paste", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"], {
    origin: new URL(page.url()).origin,
  });
  const nodes = await page.evaluate(async () => Promise.all([
    window.__APP_TEST_API__.addComponent("sticky", { x: 140, y: 220 }),
    window.__APP_TEST_API__.addComponent("text", { x: 420, y: 260 }),
  ]));

  const nodeBounds = await listNodes(page);
  const marqueeBounds = nodeBounds.reduce((bounds, node) => ({
    minX: Math.min(bounds.minX, node.bounds.x),
    minY: Math.min(bounds.minY, node.bounds.y),
    maxX: Math.max(bounds.maxX, node.bounds.x + node.bounds.width),
    maxY: Math.max(bounds.maxY, node.bounds.y + node.bounds.height),
  }), {
    minX: Infinity,
    minY: Infinity,
    maxX: -Infinity,
    maxY: -Infinity,
  });
  const start = await page.evaluate((point) => (
    window.__APP_TEST_API__.canvasToPagePoint(point)
  ), {
    x: marqueeBounds.minX - 40,
    y: marqueeBounds.minY - 40,
  });
  const end = await page.evaluate((point) => (
    window.__APP_TEST_API__.canvasToPagePoint(point)
  ), {
    x: marqueeBounds.maxX + 40,
    y: marqueeBounds.maxY + 40,
  });

  await page.keyboard.down("Shift");
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(end.x, end.y, { steps: 10 });
  await page.mouse.up();
  await page.keyboard.up("Shift");

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
  await expect(page.getByTestId("tool-button-pen")).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("pen-dropdown")).toBeVisible();
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

  await expect(page.getByTestId("tool-button-pen")).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("pen-dropdown")).toBeVisible();

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

test("draws a styled shape from the toolbar and supports undo and redo", async ({ page }) => {
  await page.getByTestId("tool-button-shape").click();
  await expect(page.getByTestId("shape-dropdown")).toBeVisible();

  const rect = await page.evaluate(() => window.__APP_TEST_API__.getCanvasContainerRect());
  await page.mouse.click(rect.left + rect.width * 0.25, rect.top + rect.height * 0.25);
  await expect.poll(async () => (await listNodes(page)).length).toBe(0);

  await page.getByTestId("shape-dropdown-rhombus").click();
  await expect(page.getByTestId("shape-dropdown")).toBeVisible();
  await drawShape(page);

  await expect(page.getByTestId("shape-panel")).toBeVisible();
  await expectShapePanelLayout(page);
  await expectShapeControlTooltips(page);
  await setInputValue(page, "shape-fill-color", "#dbeafe");
  await setInputValue(page, "shape-stroke-color", "#7c3aed");
  await setInputValue(page, "shape-stroke-width", "6");
  await setInputValue(page, "shape-opacity", "0.65");
  await expect(page.getByTestId("shape-opacity")).toHaveAttribute("title", "Opacity: 65%");
  await expect(page.getByTestId("shape-stroke-width")).toHaveAttribute("title", "Thickness: 6");

  const shape = await page.waitForFunction(() => (
    window.__APP_TEST_API__
      .listNodes()
      .find((node) => node.componentType === "shape") ?? null
  ));
  const snapshot = await shape.jsonValue();

  expect(snapshot.summary).toEqual(expect.objectContaining({
    shapeType: "rhombus",
    fill: "#dbeafe",
    fillOpacity: 0.65,
    stroke: "#7c3aed",
    strokeWidth: 6,
    opacity: 1,
  }));
  expect(snapshot.summary.width).toBeGreaterThan(100);
  expect(snapshot.summary.height).toBeGreaterThan(60);
  await expect(page.getByTestId("tool-button-shape")).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("shape-panel")).toBeVisible();

  const shapeCenter = await getNodePageCenter(page, snapshot.id);
  await page.mouse.dblclick(shapeCenter.x, shapeCenter.y);
  await expect(page.getByTestId("canvas-shape-text-editor")).toBeVisible();
  await expect.poll(async () => (await listNodes(page)).length).toBe(1);
  await page.getByTestId("canvas-shape-text-editor").press("Escape");
  await expect(page.getByTestId("canvas-shape-text-editor")).toBeHidden();

  await page.getByTestId("tool-button-shape").click();
  await expect(page.getByTestId("tool-button-shape")).toHaveAttribute("aria-pressed", "true");

  for (let i = 0; i < 8; i += 1) {
    if ((await listNodes(page)).length === 0) break;
    await page.getByTestId("undo-action").click();
  }
  await expect.poll(async () => (await listNodes(page)).length).toBe(0);

  for (let i = 0; i < 8; i += 1) {
    if ((await listNodes(page)).length >= 1) break;
    await page.getByTestId("redo-action").click();
  }
  await expect.poll(async () => (await listNodes(page)).length).toBe(1);
  const [restored] = await listNodes(page);
  expect(restored.summary).toEqual(expect.objectContaining({
    shapeType: "rhombus",
    opacity: 1,
  }));
});

test("sizes the shape inline editor to wrapped text", async ({ page }) => {
  const text = "test".repeat(28);
  const shape = await page.evaluate((shapeText) => (
    window.__APP_TEST_API__.addComponent("shape", {
      x: 180,
      y: 150,
      width: 420,
      height: 300,
      shapeType: "oval",
      strokeWidth: 4,
      text: shapeText,
      fontSize: 32,
    })
  ), text);

  const shapeCenter = await getNodePageCenter(page, shape.id);
  await page.mouse.dblclick(shapeCenter.x, shapeCenter.y);

  const inlineEditor = page.getByTestId("canvas-shape-text-editor");
  await expect(inlineEditor).toBeVisible();
  const editorMetrics = await inlineEditor.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const style = window.getComputedStyle(element);
    return {
      height: rect.height,
      lineHeight: Number.parseFloat(style.lineHeight),
      scrollHeight: element.scrollHeight,
    };
  });

  expect(editorMetrics.height).toBeGreaterThan(editorMetrics.lineHeight * 2.5);
  expect(editorMetrics.height).toBeGreaterThanOrEqual(editorMetrics.scrollHeight - 2);
});

test("commits shape text before drawing another shape", async ({ page }) => {
  await page.getByTestId("tool-button-shape").click();
  await drawShape(page, { xRatio: 0.34, yRatio: 0.42, dx: 150, dy: 90 });

  const firstShape = await page.waitForFunction(() => (
    window.__APP_TEST_API__
      .listNodes()
      .find((node) => node.componentType === "shape") ?? null
  ));
  const firstSnapshot = await firstShape.jsonValue();
  const firstCenter = await getNodePageCenter(page, firstSnapshot.id);
  await page.mouse.dblclick(firstCenter.x, firstCenter.y);

  const inlineEditor = page.getByTestId("canvas-shape-text-editor");
  await expect(inlineEditor).toBeVisible();
  await inlineEditor.fill("sef");

  await page.getByTestId("tool-button-shape").click();
  await drawShape(page, { xRatio: 0.62, yRatio: 0.42, dx: 150, dy: 90 });

  await expect(inlineEditor).toBeHidden();
  await expect.poll(async () => (await listNodes(page)).length).toBe(2);
  await expect
    .poll(async () => (
      (await listNodes(page)).find((node) => node.id === firstSnapshot.id)?.summary?.text ?? ""
    ))
    .toBe("sef");
});

test("updates the selected shape from toolbar controls in real time", async ({ page }) => {
  await page.getByTestId("tool-button-shape").click();
  await drawShape(page);

  const shapeHandle = await page.waitForFunction(() => (
    window.__APP_TEST_API__
      .listNodes()
      .find((node) => node.componentType === "shape") ?? null
  ));
  const shape = await shapeHandle.jsonValue();

  await setInputValue(page, "shape-fill-color", "#fef3c7");
  await setInputValue(page, "shape-opacity", "0.2");
  await setInputValue(page, "shape-stroke-color", "#111827");
  await setInputValue(page, "shape-stroke-width", "9");

  await expect.poll(async () => (await listNodes(page)).length).toBe(1);
  await expect
    .poll(async () => (
      (await listNodes(page)).find((node) => node.id === shape.id)?.summary ?? null
    ))
    .toEqual(expect.objectContaining({
      fill: "#fef3c7",
      fillOpacity: 0.2,
      stroke: "#111827",
      strokeWidth: 9,
      opacity: 1,
    }));
});

test("draws a shape on top of a page component", async ({ page }) => {
  await page.evaluate(() => window.__APP_TEST_API__.addComponent("page", {
    x: 180,
    y: 130,
    width: 420,
    height: 260,
  }));
  await page.getByTestId("tool-button-shape").click();

  const start = await page.evaluate(() => window.__APP_TEST_API__.canvasToPagePoint({ x: 260, y: 230 }));
  const end = await page.evaluate(() => window.__APP_TEST_API__.canvasToPagePoint({ x: 430, y: 320 }));

  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(end.x, end.y, { steps: 8 });
  await page.mouse.up();

  await expect
    .poll(async () => (await listNodes(page)).filter((node) => node.componentType === "shape").length)
    .toBe(1);
});

test("moves an existing shape when dragging from it in shape mode", async ({ page }) => {
  await page.getByTestId("tool-button-shape").click();
  await drawShape(page, { xRatio: 0.38, yRatio: 0.42, dx: 150, dy: 90 });

  const firstShape = await page.waitForFunction(() => (
    window.__APP_TEST_API__
      .listNodes()
      .find((node) => node.componentType === "shape") ?? null
  ));
  const firstSnapshot = await firstShape.jsonValue();
  const center = await getNodePageCenter(page, firstSnapshot.id);
  const originalCenter = { ...center };

  await page.mouse.move(center.x, center.y);
  await page.mouse.down();
  await page.mouse.move(center.x + 170, center.y + 90, { steps: 8 });
  await page.mouse.up();

  await expect
    .poll(async () => (await listNodes(page)).filter((node) => node.componentType === "shape").length)
    .toBe(1);

  const finalCenter = await getNodePageCenter(page, firstSnapshot.id);
  expect(finalCenter.x).toBeGreaterThan(originalCenter.x + 120);
  expect(finalCenter.y).toBeGreaterThan(originalCenter.y + 60);
});

test("switches to arrange after clicking an existing shape, but not while dragging", async ({ page }) => {
  await page.getByTestId("tool-button-shape").click();
  await drawShape(page, { xRatio: 0.36, yRatio: 0.4, dx: 150, dy: 90 });
  await expect(page.getByTestId("tool-button-shape")).toHaveAttribute("aria-pressed", "true");

  const firstShape = await page.waitForFunction(() => (
    window.__APP_TEST_API__
      .listNodes()
      .find((node) => node.componentType === "shape") ?? null
  ));
  const firstSnapshot = await firstShape.jsonValue();
  const center = await getNodePageCenter(page, firstSnapshot.id);

  await page.mouse.move(center.x, center.y);
  await page.mouse.down();
  await page.mouse.move(center.x + 140, center.y + 70, { steps: 8 });
  await page.mouse.up();

  await expect(page.getByTestId("tool-button-shape")).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("tool-button-arrange")).toHaveAttribute("aria-pressed", "false");

  const movedCenter = await getNodePageCenter(page, firstSnapshot.id);
  await page.mouse.click(movedCenter.x, movedCenter.y);

  await expect(page.getByTestId("tool-button-arrange")).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("tool-button-shape")).toHaveAttribute("aria-pressed", "false");
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
  await expect(page.getByTestId("eraser-controls")).toBeVisible();
  await expect(page.getByTestId("eraser-radius")).toHaveAttribute("min", "4");
  await expect(page.getByTestId("eraser-radius")).toHaveAttribute("max", "48");
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

test("allows pen and eraser activation in presentation mode from the floating brush ball", async ({ page }) => {
  await page.getByTestId("mode-capsule-present").click();
  await expect(page.getByTestId("mode-capsule-present")).toHaveAttribute("aria-pressed", "true");
  await expect.poll(async () => page.evaluate(() => window.__APP_TEST_API__.getEditorTool())).toBe(
    "arrange",
  );
  await expect(page.getByTestId("presentation-brush-fab")).toBeVisible();

  await page.getByTestId("presentation-brush-fab").click();
  await expect(page.getByTestId("presentation-brush-panel")).toBeVisible();
  await page.getByTestId("presentation-tool-brush").click();
  await expect.poll(async () => page.evaluate(() => window.__APP_TEST_API__.getEditorTool())).toBe(
    "pen",
  );
  await drawStroke(page, {
    xRatio: 0.38,
    yRatio: 0.42,
    dx: 140,
    dy: 72,
  });
  await expect.poll(async () => page.evaluate(() => window.__APP_TEST_API__.countDrawables())).toBe(1);

  await page.getByTestId("presentation-tool-eraser").click();
  await expect.poll(async () => page.evaluate(() => window.__APP_TEST_API__.getEditorTool())).toBe(
    "eraser",
  );
});

test("hides edit brush controls after switching to presentation and shows the floating brush ball", async ({ page }) => {
  await page.getByTestId("tool-button-pen").click();
  await expect(page.getByTestId("pen-dropdown")).toBeVisible();
  await page.getByTestId("pen-preset-0").click();
  await expect(page.getByTestId("pen-preset-editor")).toBeVisible();

  await page.getByTestId("mode-capsule-present").click();
  await expect(page.getByTestId("pen-dropdown")).toBeHidden();
  await expect(page.getByTestId("pen-preset-editor")).toBeHidden();
  await expect(page.getByTestId("presentation-brush-fab")).toBeVisible();

  await page.getByTestId("mode-capsule-edit").click();
  await page.getByTestId("tool-button-eraser").click();
  await expect(page.getByTestId("eraser-controls")).toBeVisible();

  await page.getByTestId("mode-capsule-present").click();
  await expect(page.getByTestId("eraser-controls")).toBeHidden();
  await expect(page.getByTestId("presentation-brush-fab")).toBeVisible();
});

test("switches between presentation pan and drawing cursors from the floating brush ball", async ({ page }) => {
  await page.getByTestId("mode-capsule-present").click();
  await expect(page.getByTestId("mode-capsule-present")).toHaveAttribute("aria-pressed", "true");

  const canvas = page.getByTestId("canvas-container");
  await page.getByTestId("presentation-brush-fab").click();
  await expect(page.getByTestId("presentation-brush-panel")).toBeVisible();

  await expect.poll(async () => (
    page.evaluate(() => window.__APP_TEST_API__.getEditorTool())
  )).toBe("arrange");
  await page.getByTestId("presentation-tool-brush").click();
  await expect.poll(async () => (
    page.evaluate(() => window.__APP_TEST_API__.getEditorTool())
  )).toBe("pen");
  await expect.poll(async () => canvas.evaluate((node) => getComputedStyle(node).cursor)).toBe(
    "crosshair",
  );

  await page.getByTestId("presentation-tool-arrange").click();
  await expect.poll(async () => (
    page.evaluate(() => window.__APP_TEST_API__.getEditorTool())
  )).toBe("arrange");
  await expect.poll(async () => canvas.evaluate((node) => getComputedStyle(node).cursor)).toBe(
    "grab",
  );

  await page.getByTestId("presentation-brush-fab").click();
  await page.getByTestId("presentation-tool-eraser").click();
  await expect.poll(async () => (
    page.evaluate(() => window.__APP_TEST_API__.getEditorTool())
  )).toBe("eraser");
  await expect.poll(async () => canvas.evaluate((node) => getComputedStyle(node).cursor)).toBe(
    "crosshair",
  );
});

test.skip("toggles drawing layer visibility in presentation mode", async ({ page }) => {
  await page.getByTestId("tool-button-pen").click();
  await drawStroke(page);
  await expect
    .poll(async () => page.evaluate(() => window.__APP_TEST_API__.countDrawables()))
    .toBe(1);

  await page.getByTestId("mode-capsule-present").click();
  await expect(page.getByTestId("mode-capsule-present")).toHaveAttribute("aria-pressed", "true");
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
