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
  const panel = page.getByTestId("shape-controls");
  const panelBox = await panel.boundingBox();
  expect(panelBox).not.toBeNull();

  const ids = [
    "shape-fill-color",
    "shape-opacity",
    "shape-opacity-value",
    "shape-stroke-color",
    "shape-stroke-width",
    "shape-stroke-width-value",
  ];
  const boxes = Object.fromEntries(await Promise.all(ids.map(async (id) => [
    id,
    await page.getByTestId(id).boundingBox(),
  ])));

  for (const box of Object.values(boxes)) {
    expect(box).not.toBeNull();
    expect(box.x).toBeGreaterThanOrEqual(panelBox.x - 1);
    expect(box.x + box.width).toBeLessThanOrEqual(panelBox.x + panelBox.width + 1);
  }

  expect(boxes["shape-fill-color"].x).toBeLessThan(boxes["shape-opacity"].x);
  expect(boxes["shape-opacity-value"].x).toBeLessThan(boxes["shape-stroke-color"].x);
  expect(boxes["shape-stroke-color"].x).toBeLessThan(boxes["shape-stroke-width"].x);
}

async function expectShapeControlTooltips(page) {
  await expect(page.getByTestId("shape-fill-color")).toHaveAttribute("title", /Shape fill color/);
  await expect(page.getByTestId("shape-opacity")).toHaveAttribute("title", /Shape fill opacity/);
  await expect(page.getByTestId("shape-stroke-color")).toHaveAttribute("title", /Shape border color/);
  await expect(page.getByTestId("shape-stroke-width")).toHaveAttribute("title", /Shape border width/);
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

test("draws a styled shape from the toolbar and supports undo and redo", async ({ page }) => {
  await page.getByTestId("tool-button-shape").click();
  await expect(page.getByTestId("shape-controls")).toBeVisible();
  await expectShapePanelLayout(page);
  await expectShapeControlTooltips(page);

  const rect = await page.evaluate(() => window.__APP_TEST_API__.getCanvasContainerRect());
  await page.mouse.click(rect.left + rect.width * 0.25, rect.top + rect.height * 0.25);
  await expect.poll(async () => (await listNodes(page)).length).toBe(0);

  await page.getByTestId("shape-type-rhombus").click();
  await setInputValue(page, "shape-fill-color", "#dbeafe");
  await setInputValue(page, "shape-stroke-color", "#7c3aed");
  await setInputValue(page, "shape-stroke-width", "6");
  await setInputValue(page, "shape-opacity", "0.65");
  await expect(page.getByTestId("shape-opacity")).toHaveAttribute("title", "Shape fill opacity: 0.65");
  await expect(page.getByTestId("shape-stroke-width")).toHaveAttribute("title", "Shape border width: 6");

  await drawShape(page);

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
  await expect(page.getByTestId("shape-controls")).toBeVisible();

  const shapeCenter = await getNodePageCenter(page, snapshot.id);
  await page.mouse.click(shapeCenter.x, shapeCenter.y);
  await expect(page.getByTestId("canvas-shape-text-editor")).toBeVisible();
  await expect.poll(async () => (await listNodes(page)).length).toBe(1);
  await page.getByTestId("canvas-shape-text-editor").press("Escape");
  await expect(page.getByTestId("canvas-shape-text-editor")).toBeHidden();

  await page.getByTestId("tool-button-shape").click();
  await expect(page.getByTestId("tool-button-shape")).toHaveAttribute("aria-pressed", "false");
  await expect(page.getByTestId("shape-controls")).toBeHidden();

  await page.getByTestId("undo-action").click();
  await expect.poll(async () => (await listNodes(page)).length).toBe(0);

  await page.getByTestId("redo-action").click();
  await expect.poll(async () => (await listNodes(page)).length).toBe(1);
  const [restored] = await listNodes(page);
  expect(restored.summary).toEqual(expect.objectContaining({
    shapeType: "rhombus",
    fill: "#dbeafe",
    fillOpacity: 0.65,
    stroke: "#7c3aed",
    strokeWidth: 6,
    opacity: 1,
  }));
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
  await page.mouse.click(firstCenter.x, firstCenter.y);

  const inlineEditor = page.getByTestId("canvas-shape-text-editor");
  await expect(inlineEditor).toBeVisible();
  await inlineEditor.fill("sef");

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

test("draws a new shape starting on an existing selected shape", async ({ page }) => {
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

  await page.mouse.click(center.x, center.y);
  await expect(page.getByTestId("canvas-shape-text-editor")).toBeVisible();
  await expect.poll(async () => (await listNodes(page)).length).toBe(1);
  await page.getByTestId("canvas-shape-text-editor").press("Escape");

  await page.mouse.move(center.x, center.y);
  await page.mouse.down();
  await page.mouse.move(center.x + 170, center.y + 90, { steps: 8 });
  await page.mouse.up();

  await expect(page.getByTestId("canvas-shape-text-editor")).toBeHidden();
  await expect
    .poll(async () => (await listNodes(page)).filter((node) => node.componentType === "shape").length)
    .toBe(2);

  const finalCenter = await getNodePageCenter(page, firstSnapshot.id);
  expect(finalCenter.x).toBeCloseTo(originalCenter.x, 1);
  expect(finalCenter.y).toBeCloseTo(originalCenter.y, 1);
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
  await page.getByTestId("mode-capsule-present").click();
  await expect(page.getByTestId("mode-capsule-present")).toHaveAttribute("aria-pressed", "true");

  await page.evaluate(() => window.__APP_TEST_API__.setEditorTool("pen"));
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

  await page.evaluate(() => window.__APP_TEST_API__.setEditorTool("eraser"));
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
  await page.getByTestId("mode-capsule-present").click();
  await expect(page.getByTestId("mode-capsule-present")).toHaveAttribute("aria-pressed", "true");

  const canvas = page.getByTestId("canvas-container");

  await expect.poll(async () => (
    page.evaluate(() => window.__APP_TEST_API__.getEditorTool())
  )).toBe("arrange");
  await page.evaluate(() => window.__APP_TEST_API__.setEditorTool("pen"));
  await expect.poll(async () => (
    page.evaluate(() => window.__APP_TEST_API__.getEditorTool())
  )).toBe("pen");
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

  await page.evaluate(() => window.__APP_TEST_API__.setEditorTool("arrange"));
  await expect.poll(async () => (
    page.evaluate(() => window.__APP_TEST_API__.getEditorTool())
  )).toBe("arrange");
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

  await page.evaluate(() => window.__APP_TEST_API__.setEditorTool("eraser"));
  await expect.poll(async () => (
    page.evaluate(() => window.__APP_TEST_API__.getEditorTool())
  )).toBe("eraser");
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

  await page.evaluate(() => window.__APP_TEST_API__.setEditorTool("arrange"));
  await expect.poll(async () => (
    page.evaluate(() => window.__APP_TEST_API__.getEditorTool())
  )).toBe("arrange");
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
