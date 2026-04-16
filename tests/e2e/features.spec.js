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

async function canvasPointToPage(page, point) {
  const [rect, viewport] = await Promise.all([
    page.evaluate(() => window.__APP_TEST_API__.getCanvasContainerRect()),
    page.evaluate(() => window.__APP_TEST_API__.getViewportState()),
  ]);

  return {
    x: rect.left + point.x * viewport.scale + viewport.position.x,
    y: rect.top + point.y * viewport.scale + viewport.position.y,
  };
}

async function listCatalogItems(page) {
  return page.evaluate(() => window.__APP_TEST_API__.listCatalogItems());
}

async function waitForPaint(page) {
  await page.evaluate(() => new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(resolve));
  }));
}

async function drawStroke(page, { xRatio = 0.45, yRatio = 0.45, dx = 80, dy = 36 } = {}) {
  const rect = await page.evaluate(() => window.__APP_TEST_API__.getCanvasContainerRect());
  const start = {
    x: rect.left + rect.width * xRatio,
    y: rect.top + rect.height * yRatio,
  };

  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(start.x + dx, start.y + dy, { steps: 6 });
  await page.mouse.up();
  await waitForPaint(page);
}

async function listRecentColors(page) {
  return page.getByTestId("recent-colors").locator(".recent-color-swatch").evaluateAll(
    (items) => items.map((item) => item.dataset.color),
  );
}

function getExpectedAutoFocus(nodeSnapshot, canvasRect) {
  const bounds = nodeSnapshot?.bounds;
  if (!bounds) return null;

  return {
    center: {
      x: bounds.x + bounds.width / 2,
      y: bounds.y + bounds.height / 2,
    },
    scale: Math.max(
      0.1,
      Math.min(
        5,
        (canvasRect.width * 0.8) / Math.max(bounds.width, 1),
        (canvasRect.height * 0.8) / Math.max(bounds.height, 1),
      ),
    ),
  };
}

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await waitForTestApi(page);
  await clearBoard(page);
});

test("adds the selected node to the outline panel", async ({ page }) => {
  await page.evaluate(() => window.__APP_TEST_API__.ensureCatalogNode());

  const sticky = await addComponent(page, "sticky", { x: 220, y: 220 });
  await page.evaluate((nodeId) => window.__APP_TEST_API__.selectNode(nodeId), sticky.id);

  await page.getByTestId("catalog-add-selected").click();

  await expect
    .poll(async () => (await listCatalogItems(page)).map((item) => item.renderedTitle))
    .toEqual(["Sticky note"]);

  await expect(page.getByTestId("catalog-panel")).toContainText("Sticky note");
});

test("undoes and redoes an outline add action", async ({ page }) => {
  await page.evaluate(() => window.__APP_TEST_API__.ensureCatalogNode());

  const sticky = await addComponent(page, "sticky", { x: 240, y: 240 });
  await page.evaluate((nodeId) => window.__APP_TEST_API__.selectNode(nodeId), sticky.id);

  await page.getByTestId("catalog-add-selected").click();
  await expect.poll(async () => (await listCatalogItems(page)).length).toBe(1);

  await page.getByTestId("undo-action").click();
  await expect.poll(async () => (await listCatalogItems(page)).length).toBe(0);

  await page.getByTestId("redo-action").click();
  await expect
    .poll(async () => (await listCatalogItems(page)).map((item) => item.renderedTitle))
    .toEqual(["Sticky note"]);
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

test("pulses transparent connections red when an endpoint or the line itself is selected", async ({ page }) => {
  const source = await addComponent(page, "sticky", { x: 180, y: 180 });
  const target = await addComponent(page, "sticky", { x: 560, y: 220 });
  const other = await addComponent(page, "sticky", { x: 860, y: 220 });

  const connection = await page.evaluate(
    ({ sourceId, targetId }) => window.__APP_TEST_API__.createConnection(sourceId, targetId),
    { sourceId: source.id, targetId: target.id },
  );

  await page.evaluate((nodeId) => window.__APP_TEST_API__.openComponentEditor(nodeId), connection.id);
  await expect(page.getByTestId("component-editor-dialog")).toBeVisible();

  await page.getByTestId("component-editor-input-hiddenUntilEndpointSelected").check();
  await page.getByTestId("component-editor-apply").click();

  await expect
    .poll(async () => (await getNode(page, connection.id))?.summary?.hiddenUntilEndpointSelected ?? false)
    .toBe(true);
  await page.evaluate((nodeId) => window.__APP_TEST_API__.selectNode(nodeId), other.id);
  await expect
    .poll(async () => (await getNode(page, connection.id))?.summary?.transparentPulseActive ?? true)
    .toBe(false);
  await expect
    .poll(async () => (await getNode(page, connection.id))?.summary?.opacity ?? null)
    .toBe(0);

  await page.evaluate((nodeId) => window.__APP_TEST_API__.selectNode(nodeId), source.id);

  await expect
    .poll(async () => (await getNode(page, connection.id))?.summary?.transparentPulseActive ?? false)
    .toBe(true);

  const pulseSamples = await page.evaluate(async (connectionId) => {
    const samples = [];
    for (let index = 0; index < 6; index += 1) {
      await new Promise((resolve) => window.setTimeout(resolve, 180));
      const node = window.__APP_TEST_API__.getNode(connectionId);
      samples.push({
        stroke: node?.summary?.stroke ?? null,
        opacity: node?.summary?.opacity ?? null,
      });
    }
    return samples;
  }, connection.id);

  expect(pulseSamples.some((sample) => sample.stroke === "#ef4444")).toBe(true);
  expect(Math.max(...pulseSamples.map((sample) => sample.opacity ?? 0))).toBeGreaterThan(0.7);
  expect(Math.min(...pulseSamples.map((sample) => sample.opacity ?? 1))).toBeLessThan(0.25);

  await page.evaluate((nodeId) => window.__APP_TEST_API__.selectNode(nodeId), connection.id);

  await expect
    .poll(async () => (await getNode(page, connection.id))?.summary?.transparentPulseActive ?? false)
    .toBe(true);

  const lineSelectedPulseSamples = await page.evaluate(async (connectionId) => {
    const samples = [];
    for (let index = 0; index < 8; index += 1) {
      await new Promise((resolve) => window.setTimeout(resolve, 220));
      const node = window.__APP_TEST_API__.getNode(connectionId);
      samples.push(node?.summary?.opacity ?? null);
    }
    return samples;
  }, connection.id);

  expect(Math.max(...lineSelectedPulseSamples.map((sample) => sample ?? 0))).toBeGreaterThan(0.7);
  expect(Math.min(...lineSelectedPulseSamples.map((sample) => sample ?? 1))).toBeLessThan(0.35);

  await page.evaluate((nodeId) => window.__APP_TEST_API__.selectNode(nodeId), other.id);

  await expect
    .poll(async () => (await getNode(page, connection.id))?.summary?.transparentPulseActive ?? true)
    .toBe(false);
  await expect
    .poll(async () => (await getNode(page, connection.id))?.summary?.opacity ?? null)
    .toBe(0);
});

test("does not let fully transparent connections capture mouse selection", async ({ page }) => {
  const source = await addComponent(page, "sticky", { x: 180, y: 180 });
  const target = await addComponent(page, "sticky", { x: 560, y: 220 });
  const other = await addComponent(page, "sticky", { x: 860, y: 220 });

  const connection = await page.evaluate(
    ({ sourceId, targetId }) => window.__APP_TEST_API__.createConnection(sourceId, targetId),
    { sourceId: source.id, targetId: target.id },
  );

  await page.evaluate((nodeId) => window.__APP_TEST_API__.openComponentEditor(nodeId), connection.id);
  await expect(page.getByTestId("component-editor-dialog")).toBeVisible();
  await page.getByTestId("component-editor-input-hiddenUntilEndpointSelected").check();
  await page.getByTestId("component-editor-apply").click();

  await page.evaluate((nodeId) => window.__APP_TEST_API__.selectNode(nodeId), other.id);
  await expect
    .poll(async () => (await getNode(page, connection.id))?.summary?.opacity ?? null)
    .toBe(0);

  await page.evaluate((nodeId) => window.__APP_TEST_API__.selectNode(nodeId), other.id);
  await expect.poll(async () => page.evaluate(() => window.__APP_TEST_API__.getSelectedNodeIds())).toEqual([
    other.id,
  ]);

  const connectionCurvePoint = await page.evaluate((connectionId) => {
    const node = window.__APP_TEST_API__.getNode(connectionId);
    const points = node?.summary?.points ?? [];
    if (points.length !== 8) return null;
    const t = 0.5;

    const cubicPoint = (t, p0, p1, p2, p3) => {
      const mt = 1 - t;
      return (mt ** 3) * p0 + 3 * (mt ** 2) * t * p1 + 3 * mt * (t ** 2) * p2 + (t ** 3) * p3;
    };

    const canvasPoint = {
      x: cubicPoint(t, points[0], points[2], points[4], points[6]),
      y: cubicPoint(t, points[1], points[3], points[5], points[7]),
    };

    return window.__APP_TEST_API__.canvasToPagePoint(canvasPoint);
  }, connection.id);

  await page.mouse.click(connectionCurvePoint.x, connectionCurvePoint.y);

  await expect
    .poll(async () => page.evaluate((connectionId) => (
      window.__APP_TEST_API__.getSelectedNodeIds().includes(connectionId)
    ), connection.id))
    .toBe(false);
});

test("button components keep one hidden outgoing connection and jump to the target auto focus", async ({ page }) => {
  const button = await addComponent(page, "button", { x: 180, y: 180, label: "Go" });
  const firstTarget = await addComponent(page, "sticky", { x: 980, y: 180, text: "First" });
  const secondTarget = await addComponent(page, "sticky", { x: 1840, y: 180, text: "Second" });

  const firstConnection = await page.evaluate(
    ({ sourceId, targetId }) => window.__APP_TEST_API__.createConnection(sourceId, targetId),
    { sourceId: button.id, targetId: firstTarget.id },
  );

  expect(firstConnection.summary.sourceNodeId).toBe(button.id);
  expect(firstConnection.summary.targetNodeId).toBe(firstTarget.id);
  expect(firstConnection.summary.hiddenUntilEndpointSelected).toBe(true);

  await page.evaluate(
    ({ sourceId, targetId }) => window.__APP_TEST_API__.createConnection(sourceId, targetId),
    { sourceId: button.id, targetId: secondTarget.id },
  );

  await expect.poll(async () => {
    const nodes = await page.evaluate(() => window.__APP_TEST_API__.listNodes());
    return nodes.filter((node) => node.componentType === "connection").map((node) => ({
      sourceNodeId: node.summary.sourceNodeId,
      targetNodeId: node.summary.targetNodeId,
      hidden: node.summary.hiddenUntilEndpointSelected,
    }));
  }).toEqual([
    {
      sourceNodeId: button.id,
      targetNodeId: secondTarget.id,
      hidden: true,
    },
  ]);

  await page.evaluate((nodeId) => window.__APP_TEST_API__.centerOnNode(nodeId, { duration: 0 }), button.id);
  const beforeClickViewport = await page.evaluate(() => window.__APP_TEST_API__.getViewportState());

  await page.getByTestId("mode-toggle").click();
  await expect.poll(async () => page.evaluate(() => window.__APP_TEST_API__.getMode())).toBe(
    "presentation",
  );
  await page.waitForTimeout(450);

  const secondTargetSnapshot = await getNode(page, secondTarget.id);
  const canvasRect = await page.evaluate(() => window.__APP_TEST_API__.getCanvasContainerRect());
  const expectedFocus = await page.evaluate(
    (nodeId) => window.__APP_TEST_API__.getComputedFocus(nodeId),
    secondTarget.id,
  );
  const expectedAutoFocus = getExpectedAutoFocus(secondTargetSnapshot, canvasRect);
  expect(expectedFocus.scale).toBeCloseTo(expectedAutoFocus.scale, 3);

  await page.evaluate((nodeId) => window.__APP_TEST_API__.activateButton(nodeId), button.id);

  await expect
    .poll(async () => {
      const viewport = await page.evaluate(() => window.__APP_TEST_API__.getViewportState());
      return Math.abs(viewport.center.x - expectedFocus.center.x);
    })
    .toBeLessThan(4);

  await expect
    .poll(async () => {
      const viewport = await page.evaluate(() => window.__APP_TEST_API__.getViewportState());
      return Math.abs(viewport.center.y - expectedFocus.center.y);
    })
    .toBeLessThan(4);

  await expect
    .poll(async () => {
      const viewport = await page.evaluate(() => window.__APP_TEST_API__.getViewportState());
      return Math.abs(viewport.scale - expectedFocus.scale);
    })
    .toBeLessThan(0.05);

  await expect
    .poll(async () => {
      const viewport = await page.evaluate(() => window.__APP_TEST_API__.getViewportState());
      return viewport.center.x - beforeClickViewport.center.x;
    })
    .toBeGreaterThan(1000);
});

test("buttons start compact and can be resized", async ({ page }) => {
  const button = await addComponent(page, "button", { x: 220, y: 180, label: "Go" });

  expect(button.summary.width).toBeCloseTo(132, 3);
  expect(button.summary.height).toBeCloseTo(44, 3);

  const resized = await page.evaluate(
    ({ id, size }) => window.__APP_TEST_API__.resizeButton(id, size),
    {
      id: button.id,
      size: { width: 96, height: 36 },
    },
  );

  expect(resized.summary.width).toBeCloseTo(96, 3);
  expect(resized.summary.height).toBeCloseTo(36, 3);

  const reloaded = await getNode(page, button.id);
  expect(reloaded.summary.width).toBeCloseTo(96, 3);
  expect(reloaded.summary.height).toBeCloseTo(36, 3);
});

test("double-clicking a button follows its connected target instead of its own focus", async ({ page }) => {
  const button = await addComponent(page, "button", { x: 180, y: 180, label: "Go" });
  const target = await addComponent(page, "sticky", { x: 1120, y: 180, text: "Target" });

  await page.evaluate(
    ({ sourceId, targetId }) => window.__APP_TEST_API__.createConnection(sourceId, targetId),
    { sourceId: button.id, targetId: target.id },
  );

  const [buttonFocus, targetFocus] = await Promise.all([
    page.evaluate((nodeId) => window.__APP_TEST_API__.getComputedFocus(nodeId), button.id),
    page.evaluate((nodeId) => window.__APP_TEST_API__.getComputedFocus(nodeId), target.id),
  ]);

  expect(Math.abs(targetFocus.center.x - buttonFocus.center.x)).toBeGreaterThan(200);

  await page.evaluate((nodeId) => window.__APP_TEST_API__.centerOnNode(nodeId, { duration: 0 }), button.id);
  await page.getByTestId("mode-toggle").click();
  await expect.poll(async () => page.evaluate(() => window.__APP_TEST_API__.getMode())).toBe(
    "presentation",
  );
  await page.waitForTimeout(450);

  await page.evaluate((nodeId) => window.__APP_TEST_API__.doubleClickNode(nodeId), button.id);

  await expect
    .poll(async () => {
      const viewport = await page.evaluate(() => window.__APP_TEST_API__.getViewportState());
      return Math.abs(viewport.center.x - targetFocus.center.x);
    })
    .toBeLessThan(4);

  await expect
    .poll(async () => {
      const viewport = await page.evaluate(() => window.__APP_TEST_API__.getViewportState());
      return Math.abs(viewport.center.x - buttonFocus.center.x);
    })
    .toBeGreaterThan(200);
});

test("saves focus through the focus api for a node", async ({ page }) => {
  const sticky = await addComponent(page, "sticky", { x: 280, y: 220 });
  await expect(page.getByTestId("save-focus")).toBeHidden();
  await page.evaluate((nodeId) => window.__APP_TEST_API__.saveFocus(nodeId), sticky.id);
  await expect(page.getByTestId("focus-save-toast")).toHaveText("Focus saved");

  await expect
    .poll(async () => Boolean((await getNode(page, sticky.id))?.savedFocus))
    .toBe(true);
});

test("reopens the context menu without Konva destroyed-shape warnings", async ({ page }) => {
  const warnings = [];
  page.on("console", (message) => {
    if (message.type() === "warning" && message.text().includes("destroyed shape")) {
      warnings.push(message.text());
    }
  });

  const sticky = await addComponent(page, "sticky", { x: 280, y: 220 });
  const center = await getNodePageCenter(page, sticky.id);
  const rect = await page.evaluate(() => window.__APP_TEST_API__.getCanvasContainerRect());
  const emptyCanvasPoint = {
    x: rect.left + rect.width - 48,
    y: rect.top + rect.height / 2,
  };

  await page.mouse.click(center.x, center.y, { button: "right" });
  await waitForPaint(page);
  await page.mouse.click(emptyCanvasPoint.x, emptyCanvasPoint.y);
  await waitForPaint(page);

  await page.mouse.click(center.x, center.y, { button: "right" });
  await waitForPaint(page);
  await page.mouse.click(emptyCanvasPoint.x, emptyCanvasPoint.y);
  await waitForPaint(page);

  expect(warnings).toEqual([]);
});

test("follows a presentation navigation button toward an auto focus", async ({ page }) => {
  const source = await addComponent(page, "sticky", { x: 180, y: 180 });
  const target = await addComponent(page, "sticky", { x: 1800, y: 180 });

  await page.evaluate(
    ({ sourceId, targetId }) => window.__APP_TEST_API__.createConnection(sourceId, targetId),
    { sourceId: source.id, targetId: target.id },
  );

  await page.evaluate((nodeId) => window.__APP_TEST_API__.centerOnNode(nodeId, { duration: 0 }), source.id);
  const beforeNavigation = await page.evaluate(() => window.__APP_TEST_API__.getViewportState());

  await page.getByTestId("mode-toggle").click();
  await expect.poll(async () => page.evaluate(() => window.__APP_TEST_API__.getMode())).toBe(
    "presentation",
  );
  await page.waitForTimeout(450);

  const targetSnapshot = await getNode(page, target.id);
  const canvasRect = await page.evaluate(() => window.__APP_TEST_API__.getCanvasContainerRect());
  const expectedFocus = await page.evaluate(
    (nodeId) => window.__APP_TEST_API__.getComputedFocus(nodeId),
    target.id,
  );
  const expectedAutoFocus = getExpectedAutoFocus(targetSnapshot, canvasRect);
  expect(expectedFocus.scale).toBeCloseTo(expectedAutoFocus.scale, 3);

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
      return Math.abs(viewport.center.x - expectedFocus.center.x);
    })
    .toBeLessThan(4);

  await expect
    .poll(async () => {
      const viewport = await page.evaluate(() => window.__APP_TEST_API__.getViewportState());
      return Math.abs(viewport.center.y - expectedFocus.center.y);
    })
    .toBeLessThan(4);

  await expect
    .poll(async () => {
      const viewport = await page.evaluate(() => window.__APP_TEST_API__.getViewportState());
      return Math.abs(viewport.scale - expectedFocus.scale);
    })
    .toBeLessThan(0.05);

  await expect
    .poll(async () => {
      const viewport = await page.evaluate(() => window.__APP_TEST_API__.getViewportState());
      return viewport.center.x - beforeNavigation.center.x;
    })
    .toBeGreaterThan(1000);

  await expect
    .poll(async () => page.evaluate(() => window.__APP_TEST_API__.getNavigationButtons().length))
    .toBeGreaterThan(0);
});

test("does not show presentation navigation buttons for hidden connections", async ({ page }) => {
  const source = await addComponent(page, "sticky", { x: 180, y: 180 });
  const target = await addComponent(page, "sticky", { x: 1800, y: 180 });

  const connection = await page.evaluate(
    ({ sourceId, targetId }) => window.__APP_TEST_API__.createConnection(sourceId, targetId),
    { sourceId: source.id, targetId: target.id },
  );

  await page.evaluate((nodeId) => window.__APP_TEST_API__.openComponentEditor(nodeId), connection.id);
  await expect(page.getByTestId("component-editor-dialog")).toBeVisible();
  await page.getByTestId("component-editor-input-hiddenUntilEndpointSelected").check();
  await page.getByTestId("component-editor-apply").click();

  await expect
    .poll(async () => (await getNode(page, connection.id))?.summary?.hiddenUntilEndpointSelected ?? false)
    .toBe(true);

  await page.evaluate((nodeId) => window.__APP_TEST_API__.centerOnNode(nodeId, { duration: 0 }), source.id);
  await page.getByTestId("mode-toggle").click();
  await expect.poll(async () => page.evaluate(() => window.__APP_TEST_API__.getMode())).toBe(
    "presentation",
  );
  await page.waitForTimeout(450);

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
  await expect(page.getByTestId("history-action-toast")).toHaveText("Undid editing Sticky Note");
  await expect
    .poll(async () => {
      const node = await getNode(page, sticky.id);
      return node?.summary?.text ?? "";
    })
    .toBe("Sticky note");

  await page.getByTestId("redo-action").click();
  await expect(page.getByTestId("history-action-toast")).toHaveText("Redid editing Sticky Note");
  await expect
    .poll(async () => {
      const node = await getNode(page, sticky.id);
      return node?.summary?.text ?? "";
    })
    .toBe("Updated from Playwright");
});

test("clamps text block font size in the editor without blocking submit", async ({ page }) => {
  const text = await addComponent(page, "text", {
    x: 220,
    y: 220,
    text: "Editor check",
    fontSize: 24,
  });

  await page.evaluate((nodeId) => window.__APP_TEST_API__.openComponentEditor(nodeId), text.id);
  await expect(page.getByTestId("component-editor-dialog")).toBeVisible();

  const fontSizeInput = page.getByTestId("component-editor-input-fontSize");
  await fontSizeInput.fill("5");
  await page.getByTestId("component-editor-apply").click();

  await expect(page.getByTestId("component-editor-dialog")).toBeHidden();
  await expect
    .poll(async () => (await getNode(page, text.id))?.summary?.fontSize ?? null)
    .toBe(12);
});

test("edits text inline and resizes the box without scaling the font", async ({ page }) => {
  const text = await addComponent(page, "text", {
    x: 220,
    y: 220,
    width: 160,
    height: 80,
    text: "Short text",
    fontSize: 24,
  });
  const center = await getNodePageCenter(page, text.id);

  await page.mouse.dblclick(center.x, center.y);
  const inlineEditor = page.getByTestId("canvas-text-editor");
  await expect(inlineEditor).toBeVisible();
  await expect(page.getByTestId("component-editor-dialog")).toBeHidden();
  await expect(inlineEditor).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  await expect(inlineEditor).toHaveCSS("border-top-style", "dashed");

  const boundsDuringEdit = (await getNode(page, text.id)).bounds;
  await page.mouse.move(center.x, center.y);
  await page.mouse.down();
  await page.mouse.move(center.x + 60, center.y + 28, { steps: 4 });
  await page.mouse.up();

  await expect
    .poll(async () => {
      const currentBounds = (await getNode(page, text.id)).bounds;
      return Math.abs(currentBounds.x - boundsDuringEdit.x) + Math.abs(currentBounds.y - boundsDuringEdit.y);
    })
    .toBeLessThan(2);

  const longText = "This inline text should wrap inside the fixed text box instead of stretching sideways.";
  await inlineEditor.fill(longText);
  await inlineEditor.press("Control+Enter");

  await expect(inlineEditor).toHaveCount(0);
  await expect
    .poll(async () => (await getNode(page, text.id))?.summary?.text ?? "")
    .toBe(longText);

  const afterEdit = await getNode(page, text.id);
  expect(afterEdit.summary.width).toBeCloseTo(160, 1);
  expect(afterEdit.summary.fontSize).toBe(24);

  const resized = await page.evaluate(
    ({ id }) => window.__APP_TEST_API__.resizeTextBox(id, { width: 120, height: 140 }),
    { id: text.id },
  );

  expect(resized.summary.width).toBeCloseTo(120, 1);
  expect(resized.summary.height).toBeCloseTo(140, 1);
  expect(resized.summary.fontSize).toBe(24);
  expect(resized.summary.scaleX).toBeCloseTo(1, 4);
  expect(resized.summary.scaleY).toBeCloseTo(1, 4);
});

test("resizes a text box after it is captured by a page", async ({ page }) => {
  const pageNode = await addComponent(page, "page", { x: 120, y: 120 });
  const text = await addComponent(page, "text", {
    x: 180,
    y: 210,
    width: 160,
    height: 80,
    text: "Text inside page",
    fontSize: 24,
  });

  await expect.poll(async () => (await getNode(page, text.id))?.parentId).toBe(pageNode.id);

  const center = await getNodePageCenter(page, text.id);
  await page.mouse.click(center.x, center.y);
  await waitForPaint(page);

  const before = await getNode(page, text.id);
  const rightAnchor = await canvasPointToPage(page, {
    x: before.bounds.x + before.bounds.width,
    y: before.bounds.y + before.bounds.height / 2,
  });

  await page.mouse.move(rightAnchor.x, rightAnchor.y);
  await page.mouse.down();
  await page.mouse.move(rightAnchor.x + 90, rightAnchor.y, { steps: 8 });
  await page.mouse.up();

  await expect
    .poll(async () => (await getNode(page, text.id))?.summary?.width ?? 0)
    .toBeGreaterThan(before.summary.width + 40);

  const after = await getNode(page, text.id);
  expect(after.parentId).toBe(pageNode.id);
  expect(after.summary.fontSize).toBe(24);
  expect(after.summary.scaleX).toBeCloseTo(1, 4);
  expect(after.summary.scaleY).toBeCloseTo(1, 4);
});

test("resizes sticky notes without scaling their font", async ({ page }) => {
  const sticky = await addComponent(page, "sticky", {
    x: 220,
    y: 220,
    width: 180,
    height: 130,
    text: "Sticky text should stay readable while the card changes size.",
  });

  const before = await getNode(page, sticky.id);
  const resized = await page.evaluate(
    ({ id, size }) => window.__APP_TEST_API__.resizeNodeBox(id, size),
    { id: sticky.id, size: { width: 280, height: 180 } },
  );

  expect(resized.summary.width).toBeCloseTo(280, 1);
  expect(resized.summary.height).toBeCloseTo(180, 1);
  expect(resized.summary.fontSize).toBe(before.summary.fontSize);
  expect(resized.summary.scaleX).toBeCloseTo(1, 4);
  expect(resized.summary.scaleY).toBeCloseTo(1, 4);
});

test("resizes pages and deletes them from the toolbar", async ({ page }) => {
  const pageNode = await addComponent(page, "page", { x: 140, y: 120 });
  const center = await getNodePageCenter(page, pageNode.id);

  await page.mouse.click(center.x, center.y);
  await waitForPaint(page);

  const before = await getNode(page, pageNode.id);
  const resized = await page.evaluate(
    ({ id, size }) => window.__APP_TEST_API__.resizeNodeBox(id, size),
    {
      id: pageNode.id,
      size: {
        width: before.summary.width + 120,
        height: before.summary.height + 80,
      },
    },
  );

  await expect(page.getByTestId("delete-selection")).toBeVisible();
  expect(resized.summary.width).toBeGreaterThan(before.summary.width + 100);
  expect(resized.summary.height).toBeGreaterThan(before.summary.height + 60);
  expect(resized.summary.scaleX).toBeCloseTo(1, 4);
  expect(resized.summary.scaleY).toBeCloseTo(1, 4);

  await page.getByTestId("delete-selection").click();
  await expect
    .poll(async () => page.evaluate(() => window.__APP_TEST_API__.listNodes().length))
    .toBe(0);
});

test("truncates long page titles inside the header", async ({ page }) => {
  const longLabel = "This is an intentionally very long page title that should truncate instead of spilling outside the page header";
  const pageNode = await addComponent(page, "page", {
    x: 140,
    y: 120,
    width: 320,
    label: longLabel,
  });

  await waitForPaint(page);

  await expect
    .poll(async () => (await getNode(page, pageNode.id))?.summary?.renderedLabel ?? "")
    .toMatch(/(\.\.\.|…)$/);

  const snapshot = await getNode(page, pageNode.id);
  expect(snapshot.summary.label).toBe(longLabel);
  expect(snapshot.summary.renderedLabel.length).toBeLessThan(longLabel.length);
});

test("asks for confirmation before loading over current content", async ({ page }) => {
  await addComponent(page, "sticky", { x: 180, y: 180 });
  const exported = await page.evaluate(() => window.__APP_TEST_API__.exportDocument());
  await addComponent(page, "sticky", { x: 520, y: 240 });

  page.once("dialog", async (dialog) => {
    expect(dialog.message()).toContain("replace the current board content");
    await dialog.dismiss();
  });

  await page.getByTestId("load-document-input").setInputFiles({
    name: "mind-map.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(exported)),
  });

  await waitForPaint(page);
  await expect
    .poll(async () => (await page.evaluate(() => window.__APP_TEST_API__.listNodes())).length)
    .toBe(2);

  page.once("dialog", async (dialog) => {
    expect(dialog.message()).toContain("replace the current board content");
    await dialog.accept();
  });

  await page.getByTestId("load-document-input").setInputFiles({
    name: "mind-map.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(exported)),
  });

  await expect(page.getByTestId("document-status-toast")).toHaveText("Document loaded");
  await expect
    .poll(async () => (await page.evaluate(() => window.__APP_TEST_API__.listNodes())).length)
    .toBe(1);
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

  await page.getByTestId("tool-button-pen").click();
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

test("keeps page ranking box items as duplicate text references", async ({ page }) => {
  const pageNode = await addComponent(page, "page", { x: 120, y: 120 });
  const textNode = await addComponent(page, "text", {
    x: 180,
    y: 210,
    text: "First ranked idea",
  });

  const rankingBox = await page.evaluate(
    (pageId) => window.__APP_TEST_API__.createRankingBox(pageId),
    pageNode.id,
  );
  expect(rankingBox.componentType).toBe("rankingBox");

  await page.evaluate(
    ({ rankingBoxId, textId }) => {
      window.__APP_TEST_API__.addTextToRankingBox(rankingBoxId, textId);
      window.__APP_TEST_API__.addTextToRankingBox(rankingBoxId, textId);
    },
    { rankingBoxId: rankingBox.id, textId: textNode.id },
  );

  await expect.poll(async () => {
    const node = await getNode(page, rankingBox.id);
    return node.summary.items.map((item) => item.sourceNodeId);
  }).toEqual([textNode.id, textNode.id]);

  const originalTextBounds = (await getNode(page, textNode.id)).bounds;
  const firstItemId = (await getNode(page, rankingBox.id)).summary.items[0].id;
  await page.evaluate(
    ({ rankingBoxId, itemId }) => (
      window.__APP_TEST_API__.removeRankingBoxItem(rankingBoxId, itemId)
    ),
    {
      rankingBoxId: rankingBox.id,
      itemId: firstItemId,
    },
  );
  await expect.poll(async () => {
    const node = await getNode(page, rankingBox.id);
    return node.summary.items.length;
  }).toBe(1);

  await page.evaluate(
    ({ rankingBoxId, textId }) => window.__APP_TEST_API__.addTextToRankingBox(rankingBoxId, textId),
    { rankingBoxId: rankingBox.id, textId: textNode.id },
  );
  await page.evaluate(
    ({ rankingBoxId, itemId }) => (
      window.__APP_TEST_API__.reorderRankingBoxItem(rankingBoxId, itemId, 0)
    ),
    {
      rankingBoxId: rankingBox.id,
      itemId: (await getNode(page, rankingBox.id)).summary.items[1].id,
    },
  );

  await expect
    .poll(async () => (await getNode(page, textNode.id)).bounds.x)
    .toBeCloseTo(originalTextBounds.x, 1);

  await page.evaluate((textId) => window.__APP_TEST_API__.deleteNode(textId), textNode.id);
  await expect.poll(async () => {
    const node = await getNode(page, rankingBox.id);
    return node.summary.items;
  }).toEqual([]);

  const replacementText = await addComponent(page, "text", {
    x: 180,
    y: 210,
    text: "First ranked idea",
  });
  await page.evaluate(
    ({ rankingBoxId, textId }) => {
      window.__APP_TEST_API__.addTextToRankingBox(rankingBoxId, textId);
      window.__APP_TEST_API__.addTextToRankingBox(rankingBoxId, textId);
    },
    { rankingBoxId: rankingBox.id, textId: replacementText.id },
  );

  const exported = await page.evaluate(() => window.__APP_TEST_API__.exportDocument());
  await page.evaluate((snapshot) => window.__APP_TEST_API__.loadDocument(snapshot), exported);
  await waitForPaint(page);

  await expect.poll(async () => {
    const ranking = (await page.evaluate(() => window.__APP_TEST_API__.listNodes()))
      .find((node) => node.componentType === "rankingBox");
    return ranking?.summary.items.map((item) => item.renderedText);
  }).toEqual(["First ranked idea", "First ranked idea"]);
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

test("keeps drawing tool settings separate and restores recent colors per tool", async ({ page }) => {
  const strokeColor = page.getByTestId("stroke-color");
  const strokeWidth = page.getByTestId("stroke-width");

  await page.getByTestId("tool-button-pen").click();
  await strokeColor.fill("#ff0000");
  await strokeWidth.fill("6");
  await expect(page.getByTestId("recent-color-ff0000")).toHaveCount(0);
  await drawStroke(page);

  await strokeColor.fill("#00ff00");
  await expect(page.getByTestId("recent-color-00ff00")).toHaveCount(0);
  await strokeColor.fill("#0000ff");
  await drawStroke(page, { xRatio: 0.52, yRatio: 0.5, dx: 70, dy: -30 });

  await page.getByTestId("tool-button-pencil").click();
  await expect(strokeColor).toHaveValue("#4a4a4a");
  await expect(strokeWidth).toHaveValue("3");

  await strokeColor.fill("#123456");
  await strokeWidth.fill("2");
  await expect(page.getByTestId("recent-color-123456")).toHaveCount(0);
  await drawStroke(page, { xRatio: 0.38, yRatio: 0.55, dx: 70, dy: 24 });

  await page.getByTestId("tool-button-pen").click();
  await expect(strokeColor).toHaveValue("#0000ff");
  await expect(strokeWidth).toHaveValue("6");

  await expect(page.getByTestId("recent-color-0000ff")).toBeVisible();
  await expect(page.getByTestId("recent-color-00ff00")).toHaveCount(0);
  await expect(page.getByTestId("recent-color-ff0000")).toBeVisible();

  await page.getByTestId("tool-button-pencil").click();
  await expect(strokeColor).toHaveValue("#123456");
  await expect(strokeWidth).toHaveValue("2");

  await expect(page.getByTestId("recent-color-123456")).toBeVisible();
  await expect(page.getByTestId("recent-color-4a4a4a")).toBeVisible();

  await page.getByTestId("tool-button-pen").click();
  await page.getByTestId("recent-color-ff0000").click();
  await expect(strokeColor).toHaveValue("#ff0000");
  await expect.poll(() => listRecentColors(page)).toEqual([
    "#ff0000",
    "#0000ff",
    "#1f6feb",
  ]);
});

test("hides color controls when the eraser is active", async ({ page }) => {
  await page.getByTestId("tool-button-pen").click();
  await expect(page.getByTestId("stroke-color")).toBeVisible();
  await expect(page.getByTestId("recent-colors")).toBeVisible();

  await page.getByTestId("tool-button-eraser").click();
  await expect(page.getByTestId("stroke-color")).toBeHidden();
  await expect(page.getByTestId("recent-colors")).toBeHidden();
});
