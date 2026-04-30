import { expect, test } from "@playwright/test";

const MARQUEE_MODIFIER_KEY = "Shift";

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

async function getNodeOrder(page, ids) {
  return page.evaluate((nodeIds) => (
    window.__APP_TEST_API__
      .listNodes()
      .filter((node) => nodeIds.includes(node.id))
      .sort((a, b) => a.zIndex - b.zIndex)
      .map((node) => node.id)
  ), ids);
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

function buildIframePageUrl({
  title = "Iframe Test Page",
  buttonLabel = "Increment",
  clickedText = "clicked",
} = {}) {
  const html = `
    <!doctype html>
    <html lang="en">
      <body style="margin:0;padding:24px;font-family:system-ui;background:#f8f4ec;color:#2f2419;">
        <main>
          <h1 style="margin:0 0 16px;">${title}</h1>
          <button
            data-testid="iframe-action"
            style="padding:10px 14px;border-radius:10px;border:1px solid #caa887;background:#fffaf3;"
          >
            ${buttonLabel}
          </button>
          <p data-testid="click-status" style="margin-top:16px;">idle</p>
        </main>
        <script>
          const action = document.querySelector('[data-testid="iframe-action"]');
          const status = document.querySelector('[data-testid="click-status"]');
          action?.addEventListener('click', () => {
            status.textContent = ${JSON.stringify(clickedText)};
          });
        </script>
      </body>
    </html>
  `;

  return `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;
}

function buildJavascriptSnippet({
  heading = "Hello sandbox",
  paragraph = "Rendered from the JavaScript editor.",
  logText = "snippet-ready",
} = {}) {
  return [
    'const root = document.getElementById("app");',
    "",
    "root.innerHTML = `",
    '  <section style="padding: 12px 16px; font-family: Arial, sans-serif;">',
    `    <h1 data-testid="js-result" style="margin: 0 0 8px;">${heading}</h1>`,
    `    <p style="margin: 0;">${paragraph}</p>`,
    "  </section>",
    "`;",
    "",
    `console.log(${JSON.stringify(logText)});`,
  ].join("\n");
}

async function createNodeFromPalette(page, componentType) {
  const existingIds = await page.evaluate(() => (
    window.__APP_TEST_API__.listNodes().map((node) => node.id)
  ));

  const card = page.getByTestId(`palette-card-${componentType}`);
  if (!(await card.isVisible())) {
    await page.getByTestId("components-trigger").click();
  }
  await expect(card).toBeVisible();
  await card.click();

  const handle = await page.waitForFunction(
    ({ type, previousIds }) => {
      const created = window.__APP_TEST_API__
        .listNodes()
        .find((node) => node.componentType === type && !previousIds.includes(node.id));
      return created?.id ?? null;
    },
    { type: componentType, previousIds: existingIds },
  );

  return handle.jsonValue();
}

async function waitForPaint(page) {
  await page.evaluate(() => new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(resolve));
  }));
}

async function dragBetweenPagePoints(page, start, end, steps = 8) {
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(end.x, end.y, { steps });
  await page.mouse.up();
  await waitForPaint(page);
}

async function marqueeBetweenPagePoints(page, start, end, steps = 8) {
  await page.keyboard.down(MARQUEE_MODIFIER_KEY);
  try {
    await dragBetweenPagePoints(page, start, end, steps);
  } finally {
    await page.keyboard.up(MARQUEE_MODIFIER_KEY);
  }
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

async function dispatchClipboardImagePaste(page, {
  targetSelector = null,
  label = "Pasted image",
} = {}) {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="160" height="96" viewBox="0 0 160 96">
      <rect width="160" height="96" rx="14" fill="#f4efe7" />
      <rect x="10" y="10" width="140" height="76" rx="12" fill="#d7612f" opacity="0.2" />
      <text
        x="80"
        y="54"
        text-anchor="middle"
        font-family="Arial, sans-serif"
        font-size="16"
        fill="#4b341f"
      >${label}</text>
    </svg>
  `;

  await page.evaluate(({ selector, markup }) => {
    const file = new File([markup], "pasted-image.svg", {
      type: "image/svg+xml",
    });
    const dataTransfer = new DataTransfer();
    dataTransfer.items.add(file);

    const event = new Event("paste", {
      bubbles: true,
      cancelable: true,
      composed: true,
    });
    Object.defineProperty(event, "clipboardData", {
      value: dataTransfer,
    });

    const target = selector
      ? document.querySelector(selector)
      : window;
    target?.dispatchEvent(event);
  }, {
    selector: targetSelector,
    markup: svg,
  });
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

test("presentation page shows attachment bookmarks and does not open attachments panel", async ({ page }) => {
  const pageNode = await addComponent(page, "page", { x: 180, y: 180, label: "Attachment Page" });

  const exported = await page.evaluate(() => window.__APP_TEST_API__.exportDocument());
  const enriched = await page.evaluate(({ snapshot, pageId }) => {
    const clone = JSON.parse(JSON.stringify(snapshot));
    const target = clone?.nodes?.find?.((node) => node?.id === pageId);
    if (!target) return clone;
    target.data = target.data || {};
    target.data.attachments = {
      directory: null,
      entries: [
        {
          id: "att-url",
          kind: "url",
          sourceKind: "url",
          label: "RFC",
          url: "https://example.com/rfc",
        },
        {
          id: "att-doc",
          kind: "local-file",
          sourceKind: "upload",
          label: "slides.pdf",
          fileName: "slides.pdf",
          path: "slides.pdf",
          mimeType: "application/pdf",
          size: 1024,
        },
      ],
    };
    return clone;
  }, { snapshot: exported, pageId: pageNode.id });

  await page.evaluate((snapshot) => {
    window.__APP_TEST_API__.loadDocument(snapshot);
  }, enriched);

  await page.evaluate(() => {
    window.__APP_TEST_API__.setMode("presentation");
  });
  await waitForPaint(page);

  const center = await getNodePageCenter(page, pageNode.id);
  await page.mouse.dblclick(center.x, center.y);

  await expect.poll(async () => page.evaluate(() => (
    window.__APP_TEST_API__.getAttachmentsBookmarksState()
  ))).toEqual(expect.objectContaining({ visible: true, count: 2 }));
  await expect(page.getByTestId("component-editor-dialog")).toBeHidden();
  await expect(page.getByTestId("attachments-panel")).toHaveCount(0);
});

test("reorders component layers and preserves them through undo and document roundtrip", async ({ page }) => {
  const first = await addComponent(page, "sticky", { x: 180, y: 180 });
  const second = await addComponent(page, "sticky", { x: 360, y: 180 });
  const third = await addComponent(page, "sticky", { x: 540, y: 180 });

  const targetCenter = await getNodePageCenter(page, first.id);
  await page.mouse.click(targetCenter.x, targetCenter.y, { button: "right" });
  await expect.poll(async () => page.evaluate(() => window.__APP_TEST_API__.getContextMenuState())).toEqual(
    expect.objectContaining({
      visible: true,
      labels: expect.arrayContaining(["Bring Forward", "Send Backward"]),
      items: expect.arrayContaining([
        expect.objectContaining({
          label: "Bring Forward",
          accessories: [expect.objectContaining({ label: "Bring to Front" })],
        }),
        expect.objectContaining({
          label: "Send Backward",
          accessories: [expect.objectContaining({ label: "Send to Back" })],
        }),
      ]),
      pagePoint: expect.any(Object),
    }),
  );

  await page.evaluate((id) => window.__APP_TEST_API__.bringNodeForward(id), first.id);
  await expect.poll(async () => getNodeOrder(page, [first.id, second.id, third.id])).toEqual([
    second.id,
    first.id,
    third.id,
  ]);

  await page.evaluate((id) => window.__APP_TEST_API__.bringNodeToFront(id), first.id);
  await expect.poll(async () => getNodeOrder(page, [first.id, second.id, third.id])).toEqual([
    second.id,
    third.id,
    first.id,
  ]);

  await page.evaluate((id) => window.__APP_TEST_API__.sendNodeBackward(id), first.id);
  await expect.poll(async () => getNodeOrder(page, [first.id, second.id, third.id])).toEqual([
    second.id,
    first.id,
    third.id,
  ]);

  await page.evaluate((id) => window.__APP_TEST_API__.sendNodeToBack(id), first.id);
  await expect.poll(async () => getNodeOrder(page, [first.id, second.id, third.id])).toEqual([
    first.id,
    second.id,
    third.id,
  ]);

  await page.evaluate((id) => window.__APP_TEST_API__.bringNodeToFront(id), first.id);
  await expect.poll(async () => getNodeOrder(page, [first.id, second.id, third.id])).toEqual([
    second.id,
    third.id,
    first.id,
  ]);

  await page.evaluate(() => window.__APP_TEST_API__.undo());
  await expect.poll(async () => getNodeOrder(page, [first.id, second.id, third.id])).toEqual([
    first.id,
    second.id,
    third.id,
  ]);

  await page.evaluate(() => window.__APP_TEST_API__.redo());
  await expect.poll(async () => getNodeOrder(page, [first.id, second.id, third.id])).toEqual([
    second.id,
    third.id,
    first.id,
  ]);

  const exported = await page.evaluate(() => window.__APP_TEST_API__.exportDocument());
  await page.evaluate(() => window.__APP_TEST_API__.clearBoard());
  await page.evaluate((snapshot) => window.__APP_TEST_API__.loadDocument(snapshot), exported);

  await expect.poll(async () => getNodeOrder(page, [first.id, second.id, third.id])).toEqual([
    second.id,
    third.id,
    first.id,
  ]);
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

test("pastes a clipboard image directly into the canvas", async ({ page }) => {
  const existingIds = await page.evaluate(() => (
    window.__APP_TEST_API__.listNodes().map((node) => node.id)
  ));
  const viewport = await page.evaluate(() => window.__APP_TEST_API__.getViewportState());

  await dispatchClipboardImagePaste(page, {
    label: "Canvas paste",
  });

  const handle = await page.waitForFunction((previousIds) => {
    const created = window.__APP_TEST_API__
      .listNodes()
      .find((node) => node.componentType === "image" && !previousIds.includes(node.id));
    return created?.id ?? null;
  }, existingIds);

  const imageId = await handle.jsonValue();
  const image = await getNode(page, imageId);

  expect(image?.componentType).toBe("image");
  expect(image?.summary?.hasImageNode).toBe(true);
  expect(image?.summary?.hasPlaceholder).toBe(false);
  expect(Math.abs((image?.bounds?.x ?? 0) + (image?.bounds?.width ?? 0) / 2 - viewport.center.x))
    .toBeLessThan(24);
  expect(Math.abs((image?.bounds?.y ?? 0) + (image?.bounds?.height ?? 0) / 2 - viewport.center.y))
    .toBeLessThan(24);
});

test("does not create an image component when image paste targets an input", async ({ page }) => {
  const editor = await addComponent(page, "javascriptEditor", {
    x: 120,
    y: 220,
    title: "Paste Guard",
  });

  await page.evaluate((nodeId) => window.__APP_TEST_API__.openComponentEditor(nodeId), editor.id);
  await expect(page.getByTestId("component-editor-dialog")).toBeVisible();

  const beforeImageCount = await page.evaluate(() => (
    window.__APP_TEST_API__.listNodes().filter((node) => node.componentType === "image").length
  ));

  await dispatchClipboardImagePaste(page, {
    targetSelector: '[data-testid="component-editor-input-title"]',
    label: "Ignored paste",
  });

  await expect
    .poll(async () => page.evaluate(() => (
      window.__APP_TEST_API__.listNodes().filter((node) => node.componentType === "image").length
    )))
    .toBe(beforeImageCount);
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

test("copies connections along with their selected endpoints", async ({ page }) => {
  const source = await addComponent(page, "sticky", { x: 180, y: 180 });
  const target = await addComponent(page, "sticky", { x: 520, y: 220 });

  const sourceCenter = await getNodePageCenter(page, source.id);
  await page.mouse.click(sourceCenter.x, sourceCenter.y);
  await page.getByTestId("connect-selection").click();

  const targetCenter = await getNodePageCenter(page, target.id);
  await page.mouse.click(targetCenter.x, targetCenter.y);

  await expect
    .poll(async () => page.evaluate(({ sourceId, targetId }) => (
      window.__APP_TEST_API__.listNodes().find((node) => (
        node.componentType === "connection" &&
        node.summary.sourceNodeId === sourceId &&
        node.summary.targetNodeId === targetId
      )) ?? null
    ), { sourceId: source.id, targetId: target.id }))
    .not.toBeNull();

  const originalConnection = await page.evaluate(({ sourceId, targetId }) => (
    window.__APP_TEST_API__.listNodes().find((node) => (
      node.componentType === "connection" &&
      node.summary.sourceNodeId === sourceId &&
      node.summary.targetNodeId === targetId
    )) ?? null
  ), { sourceId: source.id, targetId: target.id });

  await page.evaluate(({ sourceId, targetId }) => {
    window.__APP_TEST_API__.selectNodes([sourceId, targetId]);
  }, { sourceId: source.id, targetId: target.id });

  const payload = await page.evaluate(() => window.__APP_TEST_API__.createClipboardPayload());
  expect(payload?.nodes?.filter((snapshot) => snapshot.type === "connection")).toHaveLength(1);

  const pasted = await page.evaluate((clipboardPayload) => (
    window.__APP_TEST_API__.pasteClipboardPayload(clipboardPayload)
  ), payload);

  expect(pasted).toHaveLength(3);
  expect(pasted.filter((node) => node.componentType === "connection")).toHaveLength(1);

  const pastedConnection = pasted.find((node) => node.componentType === "connection");
  const pastedNodes = pasted.filter((node) => node.componentType !== "connection");
  const pastedIds = new Set(pastedNodes.map((node) => node.id));
  expect(pastedConnection.summary.sourceNodeId).not.toBe(source.id);
  expect(pastedConnection.summary.targetNodeId).not.toBe(target.id);
  expect(pastedIds.has(pastedConnection.summary.sourceNodeId)).toBe(true);
  expect(pastedIds.has(pastedConnection.summary.targetNodeId)).toBe(true);
  expect(pastedConnection.bounds.x - originalConnection.bounds.x).toBeGreaterThan(20);
  expect(pastedConnection.bounds.x - originalConnection.bounds.x).toBeLessThan(48);
  expect(pastedConnection.bounds.y - originalConnection.bounds.y).toBeGreaterThan(20);
  expect(pastedConnection.bounds.y - originalConnection.bounds.y).toBeLessThan(48);
});

test("connects another component to the JavaScript editor preview", async ({ page }) => {
  const source = await addComponent(page, "sticky", { x: 160, y: 220 });
  const editor = await addComponent(page, "javascriptEditor", {
    x: 520,
    y: 200,
    code: buildJavascriptSnippet({
      heading: "Runner target",
      paragraph: "Clicking the preview should complete a connection.",
      logText: "runner-target-ready",
    }),
  });

  await page.getByTestId("javascript-editor-run").click();
  const frame = page.frameLocator('[data-testid="javascript-editor-preview"]');
  await expect(frame.getByTestId("js-result")).toHaveText("Runner target");

  const sourceCenter = await getNodePageCenter(page, source.id);
  await page.mouse.click(sourceCenter.x, sourceCenter.y);
  await expect(page.getByTestId("connect-selection")).toBeEnabled();
  await page.getByTestId("connect-selection").click();

  const previewBox = await page.getByTestId("javascript-editor-output-preview").boundingBox();
  await page.mouse.click(previewBox.x + 28, previewBox.y + 28);

  await expect
    .poll(async () => page.evaluate(({ sourceId, targetId }) => (
      window.__APP_TEST_API__.listNodes().some((node) => (
        node.componentType === "connection" &&
        node.summary.sourceNodeId === sourceId &&
        node.summary.targetNodeId === targetId
      ))
    ), { sourceId: source.id, targetId: editor.id }))
    .toBe(true);
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

test("toggles a connection into termdef and cascades deletion on endpoints", async ({ page }) => {
  const a = await addComponent(page, "text", { x: 200, y: 220, text: "term" });
  const b = await addComponent(page, "text", { x: 560, y: 240, text: "def" });

  const connection = await page.evaluate(
    ({ sourceId, targetId }) => window.__APP_TEST_API__.createConnection(sourceId, targetId),
    { sourceId: a.id, targetId: b.id },
  );
  expect(connection?.id).toBeTruthy();

  await expect
    .poll(async () => (await getNode(page, connection.id))?.summary?.connectionKind ?? null)
    .toBe("directed");

  await page.evaluate((connectionId) => (
    window.__APP_TEST_API__.doubleClickConnectionLine(connectionId)
  ), connection.id);

  await expect(page.getByTestId("component-editor-dialog")).toBeVisible();
  await page.getByTestId("component-editor-input-termdefKind").check();
  await page.getByTestId("component-editor-apply").click();

  await expect
    .poll(async () => (await getNode(page, connection.id))?.summary?.connectionKind ?? null)
    .toBe("termdef");

  await page.evaluate((nodeId) => window.__APP_TEST_API__.selectNode(nodeId), a.id);
  await waitForPaint(page);

  const toggled = await getNode(page, connection.id);
  expect(toggled.summary.pointerLength).toBe(0);
  expect(toggled.summary.pointerWidth).toBe(0);
  expect(toggled.summary.dash.length).toBeGreaterThan(0);
  expect(toggled.summary.opacity).toBeCloseTo(0.35, 2);

  await page.evaluate((id) => window.__APP_TEST_API__.deleteNode(id), a.id);
  await expect.poll(async () => Boolean(await getNode(page, b.id))).toBe(false);

  await clearBoard(page);

  const c = await addComponent(page, "text", { x: 240, y: 240, text: "a" });
  const d = await addComponent(page, "text", { x: 620, y: 260, text: "b" });
  const connection2 = await page.evaluate(
    ({ sourceId, targetId }) => window.__APP_TEST_API__.createConnection(sourceId, targetId),
    { sourceId: c.id, targetId: d.id },
  );

  await page.evaluate((connectionId) => (
    window.__APP_TEST_API__.doubleClickConnectionLine(connectionId)
  ), connection2.id);
  await expect(page.getByTestId("component-editor-dialog")).toBeVisible();
  await page.getByTestId("component-editor-input-termdefKind").check();
  await page.getByTestId("component-editor-apply").click();

  await expect
    .poll(async () => (await getNode(page, connection2.id))?.summary?.connectionKind ?? null)
    .toBe("termdef");

  await page.evaluate((id) => window.__APP_TEST_API__.deleteNode(id), connection2.id);
  await expect.poll(async () => Boolean(await getNode(page, c.id))).toBe(true);
  await expect.poll(async () => Boolean(await getNode(page, d.id))).toBe(true);
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

  await page.getByTestId("mode-capsule-present").click();
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
  await page.getByTestId("mode-capsule-present").click();
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

  await page.getByTestId("mode-capsule-present").click();
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
  await page.getByTestId("mode-capsule-present").click();
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

test("runs JavaScript editor snippets and restores code edits through undo/redo", async ({ page }) => {
  const firstCode = buildJavascriptSnippet({
    heading: "First output",
    paragraph: "Initial snippet",
    logText: "first-log",
  });
  const secondCode = buildJavascriptSnippet({
    heading: "Second output",
    paragraph: "Updated snippet",
    logText: "second-log",
  });

  const editor = await addComponent(page, "javascriptEditor", {
    x: 120,
    y: 220,
    title: "Sandbox",
    code: firstCode,
  });

  await expect
    .poll(async () => (await getNode(page, editor.id))?.summary?.hasOverlay ?? false)
    .toBe(true);

  await expect
    .poll(async () => (await getNode(page, editor.id))?.summary?.status ?? "")
    .toBe("Ready");
  await expect
    .poll(async () => (await getNode(page, editor.id))?.summary?.consoleLines ?? 0)
    .toBe(0);

  const frame = page.frameLocator('[data-testid="javascript-editor-preview"]');
  await page.getByTestId("javascript-editor-run").click();
  await expect
    .poll(async () => (await getNode(page, editor.id))?.summary?.status ?? "")
    .toBe("Preview updated");

  await expect
    .poll(async () => (await getNode(page, editor.id))?.summary?.consoleLines ?? 0)
    .toBeGreaterThan(0);

  await expect(frame.getByTestId("js-result")).toHaveText("First output");

  await page.getByTestId("javascript-editor-clear").click();
  await expect
    .poll(async () => (await getNode(page, editor.id))?.summary?.status ?? "")
    .toBe("Preview cleared");
  await page.getByTestId("javascript-editor-run").click();
  await expect
    .poll(async () => (await getNode(page, editor.id))?.summary?.status ?? "")
    .toBe("Preview updated");
  await expect(frame.getByTestId("js-result")).toHaveText("First output");

  await page.evaluate((nodeId) => window.__APP_TEST_API__.openComponentEditor(nodeId), editor.id);
  await expect(page.getByTestId("component-editor-dialog")).toBeVisible();

  await page.getByTestId("component-editor-input-title").fill("Sandbox Updated");
  await page.getByTestId("component-editor-input-code").fill(secondCode);
  await page.getByTestId("component-editor-apply").click();

  await expect
    .poll(async () => (await getNode(page, editor.id))?.summary?.title ?? "")
    .toBe("Sandbox Updated");
  await expect
    .poll(async () => (await getNode(page, editor.id))?.summary?.code ?? "")
    .toBe(secondCode);

  await page.getByTestId("javascript-editor-run").click();
  await expect(frame.getByTestId("js-result")).toHaveText("Second output");

  await page.getByTestId("undo-action").click();
  await expect
    .poll(async () => (await getNode(page, editor.id))?.summary?.title ?? "")
    .toBe("Sandbox");
  await expect
    .poll(async () => (await getNode(page, editor.id))?.summary?.code ?? "")
    .toBe(firstCode);
  await expect(frame.getByTestId("js-result")).toHaveText("First output");

  await page.getByTestId("redo-action").click();
  await expect
    .poll(async () => (await getNode(page, editor.id))?.summary?.title ?? "")
    .toBe("Sandbox Updated");
  await expect
    .poll(async () => (await getNode(page, editor.id))?.summary?.code ?? "")
    .toBe(secondCode);
  await expect(frame.getByTestId("js-result")).toHaveText("Second output");
});

test("keeps the JavaScript editor overlay aligned with arrange interactions", async ({ page }) => {
  const code = buildJavascriptSnippet({
    heading: "Context menu target",
    paragraph: "Preview should keep canvas interactions.",
    logText: "overlay-ready",
  });

  const editor = await addComponent(page, "javascriptEditor", {
    x: 120,
    y: 220,
    title: "Overlay Checks",
    code,
  });

  await expect
    .poll(async () => (await getNode(page, editor.id))?.summary?.status ?? "")
    .toBe("Ready");
  await page.getByTestId("javascript-editor-run").click();
  await expect
    .poll(async () => (await getNode(page, editor.id))?.summary?.status ?? "")
    .toBe("Preview updated");
  await expect
    .poll(async () => (await getNode(page, editor.id))?.summary?.statusTone ?? "")
    .toBe("ready");
  await expect
    .poll(async () => (await getNode(page, editor.id))?.summary?.unreadConsoleTone ?? null)
    .toBe("warning");
  await expect
    .poll(async () => (await getNode(page, editor.id))?.summary?.hasCloseButton ?? false)
    .toBe(true);

  await expect(page.getByTestId("javascript-editor-output-preview")).toBeVisible();
  await expect(page.getByTestId("javascript-editor-output-console")).toBeHidden();

  const overlayBox = await page.getByTestId("javascript-editor-overlay").boundingBox();
  await page.getByTestId("javascript-editor-header").click({ button: "right" });
  await expect.poll(async () => page.evaluate(() => window.__APP_TEST_API__.getContextMenuState())).toEqual(
    expect.objectContaining({
      visible: true,
      labels: expect.arrayContaining(["Edit...", "Connect to..."]),
      pagePoint: expect.any(Object),
    }),
  );
  const headerMenuState = await page.evaluate(() => window.__APP_TEST_API__.getContextMenuState());
  expect(
    headerMenuState.pagePoint.x < overlayBox.x ||
      headerMenuState.pagePoint.x > overlayBox.x + overlayBox.width ||
      headerMenuState.pagePoint.y < overlayBox.y ||
      headerMenuState.pagePoint.y > overlayBox.y + overlayBox.height,
  ).toBe(true);

  const rect = await page.evaluate(() => window.__APP_TEST_API__.getCanvasContainerRect());
  await page.mouse.click(rect.left + rect.width - 48, rect.top + rect.height / 2);
  await expect
    .poll(async () => page.evaluate(() => window.__APP_TEST_API__.getContextMenuState().visible))
    .toBe(false);

  const frame = page.frameLocator('[data-testid="javascript-editor-preview"]');
  await frame.getByTestId("js-result").click({ button: "right" });
  await expect.poll(async () => page.evaluate(() => window.__APP_TEST_API__.getContextMenuState())).toEqual(
    expect.objectContaining({
      visible: true,
      labels: expect.arrayContaining(["Edit...", "Connect to..."]),
      pagePoint: expect.any(Object),
    }),
  );

  await page.mouse.click(rect.left + rect.width - 48, rect.top + rect.height / 2);
  await expect
    .poll(async () => page.evaluate(() => window.__APP_TEST_API__.getContextMenuState().visible))
    .toBe(false);

  await page.getByTestId("javascript-editor-tab-console").click();
  await expect(page.getByTestId("javascript-editor-output-console")).toBeVisible();
  await expect(page.getByTestId("javascript-editor-output-preview")).toBeHidden();
  await expect
    .poll(async () => (await getNode(page, editor.id))?.summary?.activeTab ?? "")
    .toBe("console");
  await expect
    .poll(async () => {
      const node = await getNode(page, editor.id);
      return node ? node.summary.unreadConsoleTone : "missing";
    })
    .toBe(null);

  await page.getByTestId("javascript-editor-run").click();
  await expect
    .poll(async () => (await getNode(page, editor.id))?.summary?.status ?? "")
    .toBe("Preview updated");
  await expect
    .poll(async () => (await getNode(page, editor.id))?.summary?.activeTab ?? "")
    .toBe("console");
  await expect(page.getByTestId("javascript-editor-output-console")).toBeVisible();

  await page.getByTestId("javascript-editor-tab-preview").click();
  await expect(page.getByTestId("javascript-editor-output-preview")).toBeVisible();

  const outputPanel = page.getByTestId("javascript-editor-output-panel");
  const beforeResize = await outputPanel.boundingBox();
  expect(beforeResize?.height ?? 0).toBeGreaterThan(0);

  const splitterBox = await page.getByTestId("javascript-editor-splitter").boundingBox();
  await page.mouse.move(
    splitterBox.x + splitterBox.width / 2,
    splitterBox.y + splitterBox.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(
    splitterBox.x + splitterBox.width / 2,
    splitterBox.y + splitterBox.height / 2 - 40,
    { steps: 8 },
  );
  await page.mouse.up();

  const afterResize = await outputPanel.boundingBox();
  expect(afterResize?.height ?? 0).toBeGreaterThan((beforeResize?.height ?? 0) + 20);
  await expect
    .poll(async () => (await getNode(page, editor.id))?.summary?.outputRatio ?? 0)
    .toBeGreaterThan(0.3);

  await page.getByTestId("javascript-editor-close").click();
  await expect
    .poll(async () => await getNode(page, editor.id))
    .toBe(null);
});

test("keeps the JavaScript editor read-only in presentation mode", async ({ page }) => {
  const editor = await addComponent(page, "javascriptEditor", {
    x: 140,
    y: 240,
    title: "Presentation Safe Runner",
  });

  await expect
    .poll(async () => (await getNode(page, editor.id))?.summary?.hasOverlay ?? false)
    .toBe(true);

  const before = await getNode(page, editor.id);
  const beforeOutputRatio = before.summary.outputRatio;

  await page.evaluate(() => window.__APP_TEST_API__.setMode("presentation"));
  await waitForPaint(page);

  await expect(page.getByTestId("javascript-editor-close")).toBeHidden();

  const headerBox = await page.getByTestId("javascript-editor-header").boundingBox();
  await dragBetweenPagePoints(
    page,
    { x: headerBox.x + headerBox.width / 2, y: headerBox.y + headerBox.height / 2 },
    { x: headerBox.x + headerBox.width / 2 + 120, y: headerBox.y + headerBox.height / 2 + 80 },
  );

  const afterHeaderDrag = await getNode(page, editor.id);
  expect(afterHeaderDrag.bounds.x).toBeCloseTo(before.bounds.x, 1);
  expect(afterHeaderDrag.bounds.y).toBeCloseTo(before.bounds.y, 1);

  const splitterBox = await page.getByTestId("javascript-editor-splitter").boundingBox();
  await dragBetweenPagePoints(
    page,
    { x: splitterBox.x + splitterBox.width / 2, y: splitterBox.y + splitterBox.height / 2 },
    { x: splitterBox.x + splitterBox.width / 2, y: splitterBox.y + splitterBox.height / 2 - 48 },
  );

  const afterSplitterDrag = await getNode(page, editor.id);
  expect(afterSplitterDrag.summary.outputRatio).toBeCloseTo(beforeOutputRatio, 4);

  await page.getByTestId("javascript-editor-header").dblclick();
  await expect(page.getByTestId("component-editor-dialog")).toBeHidden();
});

test("keeps the JavaScript editor behind later overlapping components", async ({ page }) => {
  const editor = await addComponent(page, "javascriptEditor", {
    x: 220,
    y: 220,
    title: "Stacked Runner",
  });

  await expect
    .poll(async () => (await getNode(page, editor.id))?.summary?.hasOverlay ?? false)
    .toBe(true);
  await expect(page.getByTestId("javascript-editor-overlay")).toBeVisible();

  const sticky = await addComponent(page, "sticky", {
    x: 300,
    y: 300,
    text: "Newer component",
    fill: "#171729",
    textColor: "#ffffff",
  });

  const topSticky = await addComponent(page, "sticky", {
    x: 340,
    y: 330,
    text: "Top component",
    fill: "#fffdf8",
    textColor: "#4a3828",
  });

  await expect(page.getByTestId("javascript-editor-overlay")).toBeVisible();
  await expect
    .poll(async () => page.getByTestId("javascript-editor-overlay").evaluate((el) => ({
      clipPath: getComputedStyle(el).clipPath,
      isOccluded: el.classList.contains("is-stack-occluded"),
    })))
    .toMatchObject({
      isOccluded: true,
    });

  const overlapPoint = await getNodePageCenter(page, topSticky.id);
  await expect
    .poll(async () => page.evaluate(({ x, y }) => {
      const element = document.elementFromPoint(x, y);
      return Boolean(element?.closest?.('[data-testid="javascript-editor-overlay"]'));
    }, overlapPoint))
    .toBe(false);

  const headerBox = await page.getByTestId("javascript-editor-header").boundingBox();
  await page.mouse.click(headerBox.x + headerBox.width / 2, headerBox.y + headerBox.height / 2);
  await expect.poll(async () => page.evaluate(() => window.__APP_TEST_API__.getSelectedNodeIds())).toEqual([
    editor.id,
  ]);

  await page.mouse.click(overlapPoint.x, overlapPoint.y);
  await expect.poll(async () => page.evaluate(() => window.__APP_TEST_API__.getSelectedNodeIds())).toEqual([
    topSticky.id,
  ]);

  await page.evaluate(
    ({ id, position }) => window.__APP_TEST_API__.moveNode(id, position),
    { id: sticky.id, position: { x: 980, y: 300 } },
  );
  await page.evaluate(
    ({ id, position }) => window.__APP_TEST_API__.moveNode(id, position),
    { id: topSticky.id, position: { x: 980, y: 500 } },
  );

  await expect(page.getByTestId("javascript-editor-overlay")).toBeVisible();
  await expect
    .poll(async () => page.getByTestId("javascript-editor-overlay").evaluate((el) => ({
      clipPath: getComputedStyle(el).clipPath,
      isOccluded: el.classList.contains("is-stack-occluded"),
    })))
    .toMatchObject({
      clipPath: "none",
      isOccluded: false,
    });
});

test("lets the JavaScript editor participate in catalog drag and activation flows", async ({ page }) => {
  await page.evaluate(() => window.__APP_TEST_API__.ensureCatalogNode());

  const editor = await addComponent(page, "javascriptEditor", {
    x: 120,
    y: 220,
    title: "Cataloged Sandbox",
  });

  const headerBox = await page.getByTestId("javascript-editor-header").boundingBox();
  const start = {
    x: headerBox.x + headerBox.width / 2,
    y: headerBox.y + headerBox.height / 2,
  };
  const catalogPanelBox = await page.getByTestId("catalog-panel-list").boundingBox();
  const end = {
    x: catalogPanelBox.x + Math.min(80, catalogPanelBox.width / 2),
    y: catalogPanelBox.y + 32,
  };

  await dragBetweenPagePoints(page, start, end, 10);

  await expect(page.getByTestId("catalog-panel")).toContainText("Cataloged Sandbox");

  const catalogRow = page.locator('[data-testid^="catalog-item-"]').filter({
    hasText: "Cataloged Sandbox",
  }).first();
  await catalogRow.click();

  await expect.poll(async () => page.evaluate(() => window.__APP_TEST_API__.getSelectedNodeIds())).toEqual([
    editor.id,
  ]);
});

test("keeps marquee selection active across video and javascript editor overlays", async ({ page }) => {
  await page.evaluate(() => window.__APP_TEST_API__.setViewport({
    scale: 0.8,
    position: { x: 0, y: 0 },
  }));

  const video = await addComponent(page, "video", {
    x: 160,
    y: 220,
  });
  const editor = await addComponent(page, "javascriptEditor", {
    x: 620,
    y: 220,
    title: "Marquee Sandbox",
  });

  await expect(page.getByTestId("javascript-editor-overlay")).toBeVisible();

  const canvasRect = await page.evaluate(() => window.__APP_TEST_API__.getCanvasContainerRect());
  const start = {
    x: canvasRect.left + 56,
    y: canvasRect.top + 84,
  };
  const end = {
    x: canvasRect.left + canvasRect.width - 96,
    y: canvasRect.top + canvasRect.height - 96,
  };

  await marqueeBetweenPagePoints(page, start, end, 20);

  await expect
    .poll(async () => page.evaluate(() => (
      [...window.__APP_TEST_API__.getSelectedNodeIds()].sort()
    )))
    .toEqual([editor.id, video.id].sort());
});

test("does not marquee-select a moved video from its previous position", async ({ page }) => {
  await page.evaluate(() => window.__APP_TEST_API__.setViewport({
    scale: 1,
    position: { x: 0, y: 0 },
  }));

  const video = await addComponent(page, "video", {
    x: 180,
    y: 220,
  });

  const beforeMove = await getNode(page, video.id);
  expect(beforeMove?.bounds).toBeTruthy();

  const topbar = page.locator(".video-component__topbar").first();
  const topbarBox = await topbar.boundingBox();
  await page.mouse.move(topbarBox.x + topbarBox.width / 2, topbarBox.y + topbarBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(topbarBox.x + topbarBox.width / 2 + 560, topbarBox.y + topbarBox.height / 2, {
    steps: 12,
  });
  await page.mouse.up();
  await waitForPaint(page);

  const afterMove = await getNode(page, video.id);
  expect(afterMove?.bounds?.x).toBeGreaterThan(
    (beforeMove?.bounds?.x ?? 0) + (beforeMove?.bounds?.width ?? 0) + 120,
  );

  await page.evaluate(() => window.__APP_TEST_API__.selectNodes([]));

  const oldStart = await canvasPointToPage(page, {
    x: beforeMove.bounds.x - 16,
    y: beforeMove.bounds.y - 16,
  });
  const oldEnd = await canvasPointToPage(page, {
    x: beforeMove.bounds.x + beforeMove.bounds.width + 16,
    y: beforeMove.bounds.y + beforeMove.bounds.height + 16,
  });
  await marqueeBetweenPagePoints(page, oldStart, oldEnd, 12);

  await expect
    .poll(async () => page.evaluate(() => window.__APP_TEST_API__.getSelectedNodeIds()))
    .toEqual([]);

  const newStart = await canvasPointToPage(page, {
    x: afterMove.bounds.x - 16,
    y: afterMove.bounds.y - 16,
  });
  const newEnd = await canvasPointToPage(page, {
    x: afterMove.bounds.x + afterMove.bounds.width + 16,
    y: afterMove.bounds.y + afterMove.bounds.height + 16,
  });
  await marqueeBetweenPagePoints(page, newStart, newEnd, 12);

  await expect
    .poll(async () => page.evaluate(() => window.__APP_TEST_API__.getSelectedNodeIds()))
    .toEqual([video.id]);
});

test("does not marquee-select a moved video from its previous position after viewport changes", async ({ page }) => {
  await page.evaluate(() => window.__APP_TEST_API__.setViewport({
    scale: 0.8,
    position: { x: 120, y: 64 },
  }));

  const video = await addComponent(page, "video", {
    x: 220,
    y: 240,
  });

  const beforeMove = await getNode(page, video.id);
  expect(beforeMove?.bounds).toBeTruthy();

  const topbar = page.locator(".video-component__topbar").first();
  const topbarBox = await topbar.boundingBox();
  await page.mouse.move(topbarBox.x + topbarBox.width / 2, topbarBox.y + topbarBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(topbarBox.x + topbarBox.width / 2 + 560, topbarBox.y + topbarBox.height / 2, {
    steps: 12,
  });
  await page.mouse.up();
  await waitForPaint(page);

  const afterMove = await getNode(page, video.id);
  expect(afterMove?.bounds?.x).toBeGreaterThan(
    (beforeMove?.bounds?.x ?? 0) + (beforeMove?.bounds?.width ?? 0) + 120,
  );

  await page.evaluate(() => window.__APP_TEST_API__.selectNodes([]));

  const oldStart = await canvasPointToPage(page, {
    x: beforeMove.bounds.x - 16,
    y: beforeMove.bounds.y - 16,
  });
  const oldEnd = await canvasPointToPage(page, {
    x: beforeMove.bounds.x + beforeMove.bounds.width + 16,
    y: beforeMove.bounds.y + beforeMove.bounds.height + 16,
  });
  await marqueeBetweenPagePoints(page, oldStart, oldEnd, 12);

  await expect
    .poll(async () => page.evaluate(() => window.__APP_TEST_API__.getSelectedNodeIds()))
    .toEqual([]);
});

test("does not marquee-select a moved javascript editor from its previous position", async ({ page }) => {
  await page.evaluate(() => window.__APP_TEST_API__.setViewport({
    scale: 1,
    position: { x: 0, y: 0 },
  }));

  const editor = await addComponent(page, "javascriptEditor", {
    x: 180,
    y: 220,
    title: "Marquee Dragged Editor",
  });

  const beforeMove = await getNode(page, editor.id);
  expect(beforeMove?.bounds).toBeTruthy();

  const headerBox = await page.getByTestId("javascript-editor-header").boundingBox();
  await page.mouse.move(headerBox.x + headerBox.width / 2, headerBox.y + headerBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(headerBox.x + headerBox.width / 2 + 820, headerBox.y + headerBox.height / 2, {
    steps: 12,
  });
  await page.mouse.up();
  await waitForPaint(page);

  const afterMove = await getNode(page, editor.id);
  expect(afterMove?.bounds?.x).toBeGreaterThan(
    (beforeMove?.bounds?.x ?? 0) + (beforeMove?.bounds?.width ?? 0) + 80,
  );

  await page.evaluate(() => window.__APP_TEST_API__.selectNodes([]));

  const oldStart = await canvasPointToPage(page, {
    x: beforeMove.bounds.x - 16,
    y: beforeMove.bounds.y - 16,
  });
  const oldEnd = await canvasPointToPage(page, {
    x: beforeMove.bounds.x + beforeMove.bounds.width + 16,
    y: beforeMove.bounds.y + beforeMove.bounds.height + 16,
  });
  await marqueeBetweenPagePoints(page, oldStart, oldEnd, 12);

  await expect
    .poll(async () => page.evaluate(() => window.__APP_TEST_API__.getSelectedNodeIds()))
    .toEqual([]);
});

test("replaces the current selection when marqueeing a moved component's previous position", async ({ page }) => {
  const video = await addComponent(page, "video", {
    x: 180,
    y: 220,
  });

  const beforeMove = await getNode(page, video.id);
  const topbar = page.locator(".video-component__topbar").first();
  const topbarBox = await topbar.boundingBox();
  await page.mouse.move(topbarBox.x + topbarBox.width / 2, topbarBox.y + topbarBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(topbarBox.x + topbarBox.width / 2 + 560, topbarBox.y + topbarBox.height / 2, {
    steps: 12,
  });
  await page.mouse.up();
  await waitForPaint(page);

  await expect
    .poll(async () => page.evaluate(() => window.__APP_TEST_API__.getSelectedNodeIds()))
    .toEqual([video.id]);

  const oldStart = await canvasPointToPage(page, {
    x: beforeMove.bounds.x - 16,
    y: beforeMove.bounds.y - 16,
  });
  const oldEnd = await canvasPointToPage(page, {
    x: beforeMove.bounds.x + beforeMove.bounds.width + 16,
    y: beforeMove.bounds.y + beforeMove.bounds.height + 16,
  });
  await marqueeBetweenPagePoints(page, oldStart, oldEnd, 12);

  await expect
    .poll(async () => page.evaluate(() => window.__APP_TEST_API__.getSelectedNodeIds()))
    .toEqual([]);
});

test("pans the viewport when dragging empty canvas without shift pressed", async ({ page }) => {
  await page.evaluate(() => window.__APP_TEST_API__.setViewport({
    scale: 1,
    position: { x: 0, y: 0 },
  }));

  const before = await page.evaluate(() => window.__APP_TEST_API__.getViewportState());
  const canvasRect = await page.evaluate(() => window.__APP_TEST_API__.getCanvasContainerRect());
  const start = {
    x: canvasRect.left + canvasRect.width * 0.3,
    y: canvasRect.top + canvasRect.height * 0.3,
  };
  const end = {
    x: start.x + 180,
    y: start.y + 110,
  };

  await dragBetweenPagePoints(page, start, end, 16);

  const expectedPosition = {
    x: before.position.x + (end.x - start.x),
    y: before.position.y + (end.y - start.y),
  };
  await expect
    .poll(async () => {
      const state = await page.evaluate(() => window.__APP_TEST_API__.getViewportState());
      return state.position.x;
    })
    .toBeCloseTo(expectedPosition.x, 4);
  await expect
    .poll(async () => {
      const state = await page.evaluate(() => window.__APP_TEST_API__.getViewportState());
      return state.position.y;
    })
    .toBeCloseTo(expectedPosition.y, 4);

  await expect
    .poll(async () => page.evaluate(() => window.__APP_TEST_API__.getSelectedNodeIds()))
    .toEqual([]);
});

test("captures the JavaScript editor into a page and keeps it aligned when the page moves", async ({ page }) => {
  await page.evaluate(() => window.__APP_TEST_API__.setViewport({
    scale: 0.6,
    position: { x: 0, y: 0 },
  }));

  const pageNode = await addComponent(page, "page", { x: 120, y: 120 });
  const editor = await addComponent(page, "javascriptEditor", {
    x: 220,
    y: 760,
    title: "Embedded Sandbox",
  });

  const headerBox = await page.getByTestId("javascript-editor-header").boundingBox();
  const start = {
    x: headerBox.x + headerBox.width / 2,
    y: headerBox.y + headerBox.height / 2,
  };
  const end = await getNodePageCenter(page, pageNode.id);

  await dragBetweenPagePoints(page, start, end, 12);

  await expect.poll(async () => (await getNode(page, editor.id))?.parentId ?? null).toBe(pageNode.id);

  const beforeMove = await getNode(page, editor.id);
  await page.evaluate(
    ({ id, position }) => window.__APP_TEST_API__.moveNode(id, position),
    {
      id: pageNode.id,
      position: { x: 300, y: 260 },
    },
  );
  await waitForPaint(page);

  const afterMove = await getNode(page, editor.id);
  expect(afterMove.bounds.x - beforeMove.bounds.x).toBeCloseTo(180, 1);
  expect(afterMove.bounds.y - beforeMove.bounds.y).toBeCloseTo(140, 1);
});

test("shows iframe in the palette and creates it through the component editor workflow", async ({ page }) => {
  const firstUrl = buildIframePageUrl({ title: "Initial iframe page" });
  const iframeCard = page.getByTestId("palette-card-iframe");

  await page.getByTestId("components-trigger").click();
  await expect(iframeCard).toBeVisible();
  await expect(iframeCard).toContainText("Iframe");
  await expect(iframeCard).toContainText("https://");

  const iframeId = await createNodeFromPalette(page, "iframe");
  expect(iframeId).toBeTruthy();

  await expect
    .poll(async () => (await getNode(page, iframeId))?.summary?.url ?? null)
    .toBe("");

  await page.evaluate((nodeId) => window.__APP_TEST_API__.openComponentEditor(nodeId), iframeId);
  await expect(page.getByTestId("component-editor-dialog")).toBeVisible();
  await expect(page.getByTestId("component-editor-title")).toHaveText("Iframe");
  await expect(page.getByTestId("component-editor-input-url")).toBeVisible();
  await expect(page.getByTestId("component-editor-cancel")).toBeVisible();
  await expect(page.getByTestId("component-editor-apply")).toBeVisible();

  await page.getByTestId("component-editor-input-url").fill(firstUrl);
  await page.getByTestId("component-editor-cancel").click();
  await expect(page.getByTestId("component-editor-dialog")).toBeHidden();

  await expect
    .poll(async () => (await getNode(page, iframeId))?.summary ?? null)
    .toMatchObject({
      url: "",
      hasOverlay: false,
    });

  await page.evaluate((nodeId) => window.__APP_TEST_API__.openComponentEditor(nodeId), iframeId);
  await expect(page.getByTestId("component-editor-dialog")).toBeVisible();
  await page.getByTestId("component-editor-input-url").fill(firstUrl);
  await page.getByTestId("component-editor-apply").click();
  await expect(page.getByTestId("component-editor-dialog")).toBeHidden();

  await expect
    .poll(async () => (await getNode(page, iframeId))?.summary ?? null)
    .toMatchObject({
      url: firstUrl,
      hasOverlay: true,
      hasTopbar: true,
      hasCloseButton: true,
      frameSrc: firstUrl,
    });

  await expect(page.locator(".iframe-component__overlay")).toBeVisible();
  await expect(page.locator(".iframe-component__topbar")).toBeVisible();
  await expect(page.locator(".iframe-component__url")).toContainText("data:text/html");
  await expect(page.locator(".iframe-component__close")).toBeVisible();
});

test("supports inline iframe URL editing, interaction mode, and closing the iframe", async ({ page }) => {
  const firstUrl = buildIframePageUrl({ title: "Interactive iframe page", clickedText: "first-click" });
  const secondUrl = buildIframePageUrl({ title: "Updated iframe page", clickedText: "updated-click" });
  const iframe = await addComponent(page, "iframe", {
    x: 220,
    y: 220,
    url: firstUrl,
  });

  await expect
    .poll(async () => (await getNode(page, iframe.id))?.summary?.hasOverlay ?? false)
    .toBe(true);

  await expect(page.locator(".iframe-component__url")).toBeVisible();
  await page.locator(".iframe-component__url").dblclick();

  const inlineInput = page.locator(".iframe-component__url-input");
  await expect(inlineInput).toBeVisible();
  await inlineInput.fill(secondUrl);
  await inlineInput.press("Enter");

  await expect
    .poll(async () => (await getNode(page, iframe.id))?.summary ?? null)
    .toMatchObject({
      url: secondUrl,
      frameSrc: secondUrl,
      interactive: false,
      modeLabel: "Interact",
    });

  await page.locator(".iframe-component__mode").click();
  await expect
    .poll(async () => (await getNode(page, iframe.id))?.summary?.interactive ?? false)
    .toBe(true);
  await expect(page.locator(".iframe-component__mode")).toHaveText("Done");

  const frame = page.frameLocator(".iframe-component__frame");
  await frame.getByTestId("iframe-action").click();
  await expect(frame.getByTestId("click-status")).toHaveText("updated-click");

  await page.locator(".iframe-component__mode").click();
  await expect
    .poll(async () => (await getNode(page, iframe.id))?.summary?.interactive ?? true)
    .toBe(false);

  await page.locator(".iframe-component__close").click();
  await expect.poll(async () => await getNode(page, iframe.id)).toBeNull();
  await expect(page.locator(".iframe-component__overlay")).toHaveCount(0);
});

test("keeps iframe draggable and clamps zoom back to the fit-to-view minimum after resize", async ({ page }) => {
  const iframe = await addComponent(page, "iframe", {
    x: 240,
    y: 240,
    url: buildIframePageUrl({ title: "Zoom and drag iframe page" }),
  });

  await expect
    .poll(async () => (await getNode(page, iframe.id))?.summary?.hasOverlay ?? false)
    .toBe(true);

  const original = await getNode(page, iframe.id);
  await page.evaluate(
    ({ id, size }) => window.__APP_TEST_API__.resizeNodeBox(id, size),
    {
      id: iframe.id,
      size: { width: 560, height: 360 },
    },
  );
  await waitForPaint(page);

  await expect
    .poll(async () => {
      const node = await getNode(page, iframe.id);
      return {
        width: node?.bounds?.width ?? 0,
        height: node?.bounds?.height ?? 0,
      };
    })
    .toMatchObject({
      width: expect.any(Number),
      height: expect.any(Number),
    });

  const resized = await getNode(page, iframe.id);
  expect(resized.bounds.width).toBeGreaterThan(original.bounds.width);
  expect(resized.bounds.height).toBeGreaterThan(original.bounds.height);

  const shieldBox = await page.locator(".iframe-component__shield").boundingBox();
  const dragStart = {
    x: shieldBox.x + shieldBox.width / 2,
    y: shieldBox.y + shieldBox.height / 2,
  };
  const dragEnd = {
    x: dragStart.x + 110,
    y: dragStart.y + 70,
  };

  const centerBeforeDrag = await getNodePageCenter(page, iframe.id);
  await dragBetweenPagePoints(page, dragStart, dragEnd);
  const centerAfterDrag = await getNodePageCenter(page, iframe.id);

  expect(centerAfterDrag.x).toBeGreaterThan(centerBeforeDrag.x + 50);
  expect(centerAfterDrag.y).toBeGreaterThan(centerBeforeDrag.y + 30);

  const zoomPointer = {
    x: shieldBox.x + shieldBox.width * 0.82,
    y: shieldBox.y + shieldBox.height * 0.68,
  };
  await page.mouse.move(zoomPointer.x, zoomPointer.y);
  for (let index = 0; index < 6; index += 1) {
    await page.mouse.wheel(0, -120);
  }
  await waitForPaint(page);

  await expect
    .poll(async () => (await getNode(page, iframe.id))?.summary?.zoom ?? 1)
    .toBeGreaterThan(1);

  const zoomed = await getNode(page, iframe.id);
  expect(Math.abs(zoomed.summary.panX) + Math.abs(zoomed.summary.panY)).toBeGreaterThan(0);

  for (let index = 0; index < 20; index += 1) {
    await page.mouse.wheel(0, 120);
  }
  await waitForPaint(page);

  await expect
    .poll(async () => (await getNode(page, iframe.id))?.summary ?? null)
    .toMatchObject({
      zoom: 1,
      panX: 0,
      panY: 0,
      interactive: false,
    });
});

test("embeds attachments inside the component editor for pages in edit mode", async ({ page }) => {
  const pageNode = await addComponent(page, "page", { x: 120, y: 120 });
  await page.evaluate((nodeId) => window.__APP_TEST_API__.openComponentEditor(nodeId), pageNode.id);

  await expect(page.getByTestId("component-editor-dialog")).toBeVisible();
  await expect(page.getByTestId("component-editor-attachments")).toBeVisible();
  await expect(page.getByTestId("component-editor-attachments-body")).toContainText("No attachments yet.");
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

test("creates a real text-range highlight and preserves it through undo redo and document load", async ({ page }) => {
  const text = await addComponent(page, "text", {
    x: 220,
    y: 220,
    width: 260,
    height: 90,
    text: "alpha beta gamma",
    fontSize: 24,
  });

  await expect(page.getByTestId("tool-button-annotate")).toHaveCount(0);
  await page.evaluate(() => window.__APP_TEST_API__.setEditorTool("annotate"));
  await expect.poll(async () => page.evaluate(() => window.__APP_TEST_API__.getEditorTool())).toBe(
    "annotate",
  );

  const [startPoint, endPoint] = await Promise.all([
    page.evaluate((nodeId) => window.__APP_TEST_API__.getTextAnnotationPagePoint(nodeId, 6), text.id),
    page.evaluate((nodeId) => window.__APP_TEST_API__.getTextAnnotationPagePoint(nodeId, 10), text.id),
  ]);

  await dragBetweenPagePoints(page, startPoint, endPoint);

  await expect
    .poll(async () => (await getNode(page, text.id))?.summary?.annotations ?? [])
    .toEqual([
      expect.objectContaining({
        target: "text",
        start: 6,
        end: 10,
      }),
    ]);

  await expect
    .poll(async () => page.evaluate((nodeId) => window.__APP_TEST_API__.getTextAnnotationRects(nodeId), text.id))
    .toHaveLength(1);

  const [secondStartPoint, secondEndPoint] = await Promise.all([
    page.evaluate((nodeId) => window.__APP_TEST_API__.getTextAnnotationPagePoint(nodeId, 8), text.id),
    page.evaluate((nodeId) => window.__APP_TEST_API__.getTextAnnotationPagePoint(nodeId, 14), text.id),
  ]);

  await dragBetweenPagePoints(page, secondStartPoint, secondEndPoint);

  await expect
    .poll(async () => (await getNode(page, text.id))?.summary?.annotations ?? [])
    .toEqual([
      expect.objectContaining({
        target: "text",
        start: 6,
        end: 14,
      }),
    ]);

  await expect
    .poll(async () => page.evaluate((nodeId) => window.__APP_TEST_API__.getTextAnnotationRects(nodeId), text.id))
    .toHaveLength(1);

  await page.getByTestId("undo-action").click();
  await expect
    .poll(async () => (await getNode(page, text.id))?.summary?.annotations ?? [])
    .toEqual([
      expect.objectContaining({
        target: "text",
        start: 6,
        end: 10,
      }),
    ]);

  await page.getByTestId("redo-action").click();
  await expect
    .poll(async () => (await getNode(page, text.id))?.summary?.annotations ?? [])
    .toEqual([
      expect.objectContaining({
        target: "text",
        start: 6,
        end: 14,
      }),
    ]);

  const exported = await page.evaluate(() => window.__APP_TEST_API__.exportDocument());
  await page.evaluate(() => window.__APP_TEST_API__.clearBoard());
  await page.evaluate((snapshot) => window.__APP_TEST_API__.loadDocument(snapshot), exported);
  await waitForPaint(page);

  await expect
    .poll(async () => (await getNode(page, text.id))?.summary?.annotations ?? [])
    .toEqual([
      expect.objectContaining({
        target: "text",
        start: 6,
        end: 14,
      }),
    ]);

  await expect
    .poll(async () => page.evaluate((nodeId) => window.__APP_TEST_API__.getTextAnnotationRects(nodeId), text.id))
    .toHaveLength(1);
});

test("highlights and erases a sticky note text range", async ({ page }) => {
  const sticky = await addComponent(page, "sticky", {
    x: 220,
    y: 220,
    width: 260,
    height: 150,
    text: "sticky beta marker",
    fontSize: 24,
  });

  await page.evaluate(() => window.__APP_TEST_API__.setEditorTool("annotate"));
  await expect.poll(async () => page.evaluate(() => window.__APP_TEST_API__.getEditorTool())).toBe(
    "annotate",
  );

  const [startPoint, endPoint] = await Promise.all([
    page.evaluate((nodeId) => window.__APP_TEST_API__.getTextAnnotationPagePoint(nodeId, 7, {
      targetKey: "sticky-text",
    }), sticky.id),
    page.evaluate((nodeId) => window.__APP_TEST_API__.getTextAnnotationPagePoint(nodeId, 11, {
      targetKey: "sticky-text",
    }), sticky.id),
  ]);

  await dragBetweenPagePoints(page, startPoint, endPoint);

  await expect
    .poll(async () => (await getNode(page, sticky.id))?.summary?.annotations ?? [])
    .toEqual([
      expect.objectContaining({
        target: "sticky-text",
        start: 7,
        end: 11,
      }),
    ]);

  await page.getByTestId("tool-button-eraser").click();
  await expect.poll(async () => page.evaluate(() => window.__APP_TEST_API__.getEditorTool())).toBe(
    "eraser",
  );

  const highlightRect = await page.evaluate((nodeId) => {
    const [rect] = window.__APP_TEST_API__.getTextAnnotationRects(nodeId);
    return rect ?? null;
  }, sticky.id);
  const highlightCenter = await canvasPointToPage(page, {
    x: highlightRect.x + highlightRect.width / 2,
    y: highlightRect.y + highlightRect.height - 3,
  });

  await page.mouse.click(
    highlightCenter.x,
    highlightCenter.y,
  );
  await waitForPaint(page);

  await expect
    .poll(async () => (await getNode(page, sticky.id))?.summary?.annotations?.length ?? 0)
    .toBe(0);
});

test("maps text marking to the correct range after viewport zoom changes", async ({ page }) => {
  const text = await addComponent(page, "text", {
    x: 240,
    y: 220,
    width: 240,
    height: 80,
    text: "zoomed beta marker",
    fontSize: 24,
  });

  await page.evaluate(() => window.__APP_TEST_API__.setViewport({
    scale: 1.8,
    position: { x: -220, y: -170 },
  }));
  await waitForPaint(page);

  await page.evaluate(() => window.__APP_TEST_API__.setEditorTool("annotate"));
  await expect.poll(async () => page.evaluate(() => window.__APP_TEST_API__.getEditorTool())).toBe(
    "annotate",
  );

  const [startPoint, endPoint] = await Promise.all([
    page.evaluate((nodeId) => window.__APP_TEST_API__.getTextAnnotationPagePoint(nodeId, 7), text.id),
    page.evaluate((nodeId) => window.__APP_TEST_API__.getTextAnnotationPagePoint(nodeId, 11), text.id),
  ]);

  await dragBetweenPagePoints(page, startPoint, endPoint);

  await expect
    .poll(async () => (await getNode(page, text.id))?.summary?.annotations ?? [])
    .toEqual([
      expect.objectContaining({
        target: "text",
        start: 7,
        end: 11,
      }),
    ]);
});
test("keeps text annotations attached when a containing page moves", async ({ page }) => {
  const pageNode = await addComponent(page, "page", { x: 120, y: 120 });
  const text = await addComponent(page, "text", {
    x: 180,
    y: 210,
    width: 220,
    height: 80,
    text: "page linked mark",
    fontSize: 24,
  });

  await expect.poll(async () => (await getNode(page, text.id))?.parentId ?? null).toBe(pageNode.id);

  await page.evaluate(() => window.__APP_TEST_API__.setEditorTool("annotate"));
  const [startPoint, endPoint] = await Promise.all([
    page.evaluate((nodeId) => window.__APP_TEST_API__.getTextAnnotationPagePoint(nodeId, 5), text.id),
    page.evaluate((nodeId) => window.__APP_TEST_API__.getTextAnnotationPagePoint(nodeId, 11), text.id),
  ]);
  await dragBetweenPagePoints(page, startPoint, endPoint);

  const beforeRect = await page.evaluate((nodeId) => {
    const [rect] = window.__APP_TEST_API__.getTextAnnotationRects(nodeId);
    return rect ?? null;
  }, text.id);

  await page.evaluate(
    ({ id, position }) => window.__APP_TEST_API__.moveNode(id, position),
    {
      id: pageNode.id,
      position: {
        x: 300,
        y: 230,
      },
    },
  );
  await waitForPaint(page);

  const afterRect = await page.evaluate((nodeId) => {
    const [rect] = window.__APP_TEST_API__.getTextAnnotationRects(nodeId);
    return rect ?? null;
  }, text.id);

  expect(afterRect.x - beforeRect.x).toBeCloseTo(180, 1);
  expect(afterRect.y - beforeRect.y).toBeCloseTo(110, 1);
});

test("edits text inline and resizes the box without scaling the font", async ({ page }) => {
  const defaultText = await addComponent(page, "text", {
    x: 120,
    y: 120,
  });
  expect(defaultText.summary.width).toBeLessThan(150);
  expect(defaultText.summary.height).toBeLessThan(70);

  const text = await addComponent(page, "text", {
    x: 220,
    y: 220,
    width: 160,
    height: 80,
    text: "Short text",
    fontSize: 24,
  });
  const textBounds = (await getNode(page, text.id)).bounds;
  const editPoint = await canvasPointToPage(page, {
    x: textBounds.x + 28,
    y: textBounds.y + 24,
  });

  await page.mouse.dblclick(editPoint.x, editPoint.y);
  const inlineEditor = page.getByTestId("canvas-text-editor");
  await expect(inlineEditor).toBeVisible();
  await expect(page.getByTestId("component-editor-dialog")).toBeHidden();
  await expect(inlineEditor).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  await expect(inlineEditor).toHaveCSS("border-top-style", "dashed");

  const boundsDuringEdit = (await getNode(page, text.id)).bounds;
  await page.mouse.move(editPoint.x, editPoint.y);
  await page.mouse.down();
  await page.mouse.move(editPoint.x + 60, editPoint.y + 28, { steps: 4 });
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

test("edits shape text inline and preserves shape style through resize and document load", async ({ page }) => {
  const shape = await addComponent(page, "shape", {
    x: 220,
    y: 180,
    width: 180,
    height: 110,
    shapeType: "oval",
    fill: "#ecfccb",
    stroke: "#166534",
    strokeWidth: 5,
    fillOpacity: 0.8,
  });
  await page.evaluate(() => window.__APP_TEST_API__.resetHistory());

  const center = await getNodePageCenter(page, shape.id);
  await page.mouse.click(center.x, center.y);

  const inlineEditor = page.getByTestId("canvas-shape-text-editor");
  await expect(inlineEditor).toBeVisible();
  await expect(page.getByTestId("component-editor-dialog")).toBeHidden();

  await inlineEditor.fill("Decision point");
  await inlineEditor.press("Control+Enter");

  await expect
    .poll(async () => (await getNode(page, shape.id))?.summary?.text ?? "")
    .toBe("Decision point");

  await page.evaluate(() => window.__APP_TEST_API__.undo());
  await expect
    .poll(async () => (await getNode(page, shape.id))?.summary?.text ?? null)
    .toBe("");

  await page.evaluate(() => window.__APP_TEST_API__.redo());
  await expect
    .poll(async () => (await getNode(page, shape.id))?.summary?.text ?? "")
    .toBe("Decision point");

  const resized = await page.evaluate(
    ({ id, size }) => window.__APP_TEST_API__.resizeNodeBox(id, size),
    { id: shape.id, size: { width: 260, height: 150 } },
  );

  expect(resized.summary.width).toBeCloseTo(260, 1);
  expect(resized.summary.height).toBeCloseTo(150, 1);
  expect(resized.summary.fontSize).toBe(18);
  expect(resized.summary.scaleX).toBeCloseTo(1, 4);
  expect(resized.summary.scaleY).toBeCloseTo(1, 4);

  const exported = await page.evaluate(() => window.__APP_TEST_API__.exportDocument());
  await page.evaluate(() => window.__APP_TEST_API__.clearBoard());
  await page.evaluate((snapshot) => window.__APP_TEST_API__.loadDocument(snapshot), exported);

  const restored = await getNode(page, shape.id);
  expect(restored.summary).toEqual(expect.objectContaining({
    shapeType: "oval",
    fill: "#ecfccb",
    stroke: "#166534",
    strokeWidth: 5,
    fillOpacity: 0.8,
    opacity: 1,
    text: "Decision point",
  }));
  expect(restored.summary.width).toBeCloseTo(260, 1);
  expect(restored.summary.height).toBeCloseTo(150, 1);
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

test("fits page compare previews from stable page bounds", async ({ page }) => {
  const firstPage = await addComponent(page, "page", {
    x: 120,
    y: 120,
    width: 480,
    height: 270,
    label: "Before",
  });
  const secondPage = await addComponent(page, "page", {
    x: 720,
    y: 120,
    width: 480,
    height: 270,
    label: "After",
  });

  const childText = await addComponent(page, "text", {
    x: 180,
    y: 210,
    width: 180,
    height: 72,
    text: "Captured content",
  });

  await expect.poll(async () => (await getNode(page, childText.id))?.parentId).toBe(firstPage.id);

  await page.evaluate(() => window.__APP_TEST_API__.setMode("presentation"));
  await expect.poll(async () => page.evaluate(() => window.__APP_TEST_API__.getMode())).toBe(
    "presentation",
  );

  await page.evaluate(
    ({ firstId, secondId }) => window.__APP_TEST_API__.openPageCompare([firstId, secondId]),
    { firstId: firstPage.id, secondId: secondPage.id },
  );

  await expect(page.getByTestId("page-compare-overlay")).toBeVisible();
  await expect
    .poll(async () => page.evaluate(() => {
      const state = window.__APP_TEST_API__.getPageCompareState();
      return state?.panes.length === 2 &&
        state.panes.every((pane) => pane.hasSnapshot && pane.image.naturalWidth > 0);
    }))
    .toBe(true);

  const initialState = await page.evaluate(() => window.__APP_TEST_API__.getPageCompareState());
  expect(initialState.panes).toHaveLength(2);

  for (const pane of initialState.panes) {
    expect(pane.snapshot.width).toBeGreaterThanOrEqual(480);
    expect(pane.snapshot.width).toBeLessThanOrEqual(484);
    expect(pane.snapshot.height).toBeGreaterThanOrEqual(270);
    expect(pane.snapshot.height).toBeLessThanOrEqual(274);
    expect(pane.snapshot.pixelRatio).toBeGreaterThanOrEqual(1);
    expect(pane.snapshot.urlLength).toBeGreaterThan(1000);
    expect(pane.image.naturalWidth).toBeGreaterThanOrEqual(pane.snapshot.width);
    expect(pane.image.displayWidth).toBeLessThanOrEqual(pane.viewport.width + 1);
    expect(pane.image.displayHeight).toBeLessThanOrEqual(pane.viewport.height + 1);
    expect(Math.abs(pane.transform.x - (pane.viewport.width - pane.image.displayWidth) / 2))
      .toBeLessThan(2);
    expect(Math.abs(pane.transform.y - (pane.viewport.height - pane.image.displayHeight) / 2))
      .toBeLessThan(2);
  }

  const beforeResizeScale = initialState.panes[0].transform.scale;
  await page.setViewportSize({ width: 1440, height: 900 });
  await waitForPaint(page);

  await expect
    .poll(async () => {
      const state = await page.evaluate(() => window.__APP_TEST_API__.getPageCompareState());
      return state?.panes[0]?.transform.scale ?? 0;
    })
    .toBeGreaterThan(beforeResizeScale);
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

test("moves text into and out of a page ranking box", async ({ page }) => {
  const pageNode = await addComponent(page, "page", { x: 120, y: 120 });
  const textNode = await addComponent(page, "text", {
    x: 180,
    y: 210,
    text: "First ranked idea",
    width: 180,
    height: 80,
  });

  await page.evaluate(() => window.__APP_TEST_API__.setEditorTool("annotate"));
  const [markStart, markEnd] = await Promise.all([
    page.evaluate((nodeId) => window.__APP_TEST_API__.getTextAnnotationPagePoint(nodeId, 6), textNode.id),
    page.evaluate((nodeId) => window.__APP_TEST_API__.getTextAnnotationPagePoint(nodeId, 12), textNode.id),
  ]);
  await dragBetweenPagePoints(page, markStart, markEnd);

  await expect
    .poll(async () => (await getNode(page, textNode.id))?.summary?.annotations ?? [])
    .toEqual([
      expect.objectContaining({
        target: "text",
        start: 6,
        end: 12,
      }),
    ]);

  const rankingBox = await page.evaluate(
    (pageId) => window.__APP_TEST_API__.createRankingBox(pageId),
    pageNode.id,
  );
  expect(rankingBox.componentType).toBe("rankingBox");

  const added = await page.evaluate(
    ({ rankingBoxId, textId }) => window.__APP_TEST_API__.addTextToRankingBox(rankingBoxId, textId),
    { rankingBoxId: rankingBox.id, textId: textNode.id },
  );
  expect(added.item.sourceNodeId).toBe(textNode.id);

  await expect.poll(async () => getNode(page, textNode.id)).toBeNull();
  await expect
    .poll(async () => page.evaluate((nodeId) => window.__APP_TEST_API__.getTextAnnotationRects(nodeId), textNode.id))
    .toHaveLength(0);
  await expect
    .poll(async () => {
      const node = await getNode(page, rankingBox.id);
      return node.summary.items.map((item) => item.textData?.data?.text);
    })
    .toEqual(["First ranked idea"]);

  const secondText = await addComponent(page, "text", {
    x: 180,
    y: 310,
    text: "Second ranked idea",
  });
  await page.evaluate(
    ({ rankingBoxId, textId }) => window.__APP_TEST_API__.addTextToRankingBox(rankingBoxId, textId),
    { rankingBoxId: rankingBox.id, textId: secondText.id },
  );

  await expect
    .poll(async () => {
      const node = await getNode(page, rankingBox.id);
      return node.summary.items.map((item) => ({
        text: item.renderedText,
        fill: item.renderedFill,
        stroke: item.renderedStroke,
      }));
    })
    .toEqual([
      {
        text: "First ranked idea",
        fill: "rgba(255, 253, 248, 0.94)",
        stroke: "rgba(95, 72, 40, 0.18)",
      },
      {
        text: "Second ranked idea",
        fill: "rgba(255, 253, 248, 0.94)",
        stroke: "rgba(95, 72, 40, 0.18)",
      },
    ]);

  const exportedWithRankedText = await page.evaluate(() => window.__APP_TEST_API__.exportDocument());
  await page.evaluate((snapshot) => window.__APP_TEST_API__.loadDocument(snapshot), exportedWithRankedText);
  await waitForPaint(page);

  await expect
    .poll(async () => {
      const ranking = (await page.evaluate(() => window.__APP_TEST_API__.listNodes()))
        .find((node) => node.componentType === "rankingBox");
      return ranking?.summary.items.map((item) => item.renderedText);
    })
    .toEqual(["First ranked idea", "Second ranked idea"]);

  const restoredRankingBox = (await page.evaluate(() => window.__APP_TEST_API__.listNodes()))
    .find((node) => node.componentType === "rankingBox");
  const itemId = restoredRankingBox.summary.items[0].id;
  const movedOut = await page.evaluate(
    ({ rankingBoxId, rankingItemId }) => window.__APP_TEST_API__.moveRankingBoxItemOut(
      rankingBoxId,
      rankingItemId,
      { x: 360, y: 360 },
    ),
    { rankingBoxId: restoredRankingBox.id, rankingItemId: itemId },
  );

  expect(movedOut.textNode.id).toBe(textNode.id);
  expect(movedOut.textNode.parentId).toBe(pageNode.id);
  expect(movedOut.textNode.summary.text).toBe("First ranked idea");
  expect(movedOut.textNode.summary.width).toBeCloseTo(180, 1);
  expect(movedOut.textNode.summary.annotations).toEqual([
    expect.objectContaining({
      target: "text",
      start: 6,
      end: 12,
    }),
  ]);

  await expect
    .poll(async () => page.evaluate((nodeId) => window.__APP_TEST_API__.getTextAnnotationRects(nodeId), textNode.id))
    .toHaveLength(1);

  await expect
    .poll(async () => (await getNode(page, restoredRankingBox.id)).summary.items.map((item) => item.renderedText))
    .toEqual(["Second ranked idea"]);
});

test("moves text into a ranking box across pages", async ({ page }) => {
  const firstPage = await addComponent(page, "page", { x: 120, y: 120 });
  const secondPage = await addComponent(page, "page", { x: 1300, y: 120 });
  const textNode = await addComponent(page, "text", {
    x: 180,
    y: 210,
    text: "Cross page idea",
    width: 200,
    height: 80,
  });

  await expect
    .poll(async () => (await getNode(page, textNode.id))?.parentId ?? null)
    .toBe(firstPage.id);

  const rankingBox = await page.evaluate(
    (pageId) => window.__APP_TEST_API__.createRankingBox(pageId),
    secondPage.id,
  );
  expect(rankingBox.componentType).toBe("rankingBox");

  const added = await page.evaluate(
    ({ rankingBoxId, textId }) => window.__APP_TEST_API__.addTextToRankingBox(rankingBoxId, textId),
    { rankingBoxId: rankingBox.id, textId: textNode.id },
  );
  expect(added.item.sourceNodeId).toBe(textNode.id);

  await expect.poll(async () => getNode(page, textNode.id)).toBeNull();
  await expect
    .poll(async () => (await getNode(page, rankingBox.id)).summary.items.map((item) => item.renderedText))
    .toEqual(["Cross page idea"]);
});

test("keeps ranking items sortable when dragging down without fully leaving the box", async ({ page }) => {
  const pageNode = await addComponent(page, "page", { x: 120, y: 120 });
  const textNode = await addComponent(page, "text", {
    x: 180,
    y: 210,
    text: "Drag sorting should stay inside",
    width: 220,
    height: 80,
  });

  const rankingBox = await page.evaluate(
    (pageId) => window.__APP_TEST_API__.createRankingBox(pageId),
    pageNode.id,
  );
  await page.evaluate(
    ({ rankingBoxId, textId }) => window.__APP_TEST_API__.addTextToRankingBox(rankingBoxId, textId),
    { rankingBoxId: rankingBox.id, textId: textNode.id },
  );

  const rankingSnapshot = await getNode(page, rankingBox.id);
  const boxBounds = rankingSnapshot.bounds;
  const firstItemBounds = rankingSnapshot.summary.items[0].renderedBounds;
  expect(boxBounds).toBeTruthy();
  expect(firstItemBounds).toBeTruthy();

  const startCanvas = {
    x: firstItemBounds.x + firstItemBounds.width / 2,
    y: firstItemBounds.y + firstItemBounds.height - 4,
  };
  const endCanvas = {
    x: startCanvas.x,
    y: boxBounds.y + boxBounds.height + 33,
  };
  const [start, end] = await Promise.all([
    canvasPointToPage(page, startCanvas),
    canvasPointToPage(page, endCanvas),
  ]);

  await dragBetweenPagePoints(page, start, end, 12);

  await expect.poll(async () => getNode(page, textNode.id)).toBeNull();
  await expect
    .poll(async () => (await getNode(page, rankingBox.id)).summary.items.length)
    .toBe(1);
});

test("captures a ranking box into a page by dragging", async ({ page }) => {
  const pageNode = await addComponent(page, "page", { x: 520, y: 120 });
  const rankingBox = await addComponent(page, "rankingBox", { x: 40, y: 220 });

  await expect
    .poll(async () => (await getNode(page, rankingBox.id))?.parentId ?? null)
    .toBeNull();

  const start = await getNodePageCenter(page, rankingBox.id);
  const end = await getNodePageCenter(page, pageNode.id);
  await dragBetweenPagePoints(page, start, end, 10);

  await expect
    .poll(async () => (await getNode(page, rankingBox.id))?.parentId ?? null)
    .toBe(pageNode.id);
});

test("reorders ranking box items in view mode without switching to edit", async ({ page }) => {
  const pageNode = await addComponent(page, "page", { x: 120, y: 120 });
  const firstText = await addComponent(page, "text", {
    x: 180,
    y: 210,
    text: "First view item",
  });
  const secondText = await addComponent(page, "text", {
    x: 180,
    y: 310,
    text: "Second view item",
  });
  const rankingBox = await page.evaluate(
    (pageId) => window.__APP_TEST_API__.createRankingBox(pageId),
    pageNode.id,
  );

  await page.evaluate(
    ({ rankingBoxId, firstTextId, secondTextId }) => {
      window.__APP_TEST_API__.addTextToRankingBox(rankingBoxId, firstTextId);
      window.__APP_TEST_API__.addTextToRankingBox(rankingBoxId, secondTextId);
    },
    {
      rankingBoxId: rankingBox.id,
      firstTextId: firstText.id,
      secondTextId: secondText.id,
    },
  );

  await page.getByTestId("mode-capsule-present").click();
  await expect.poll(async () => page.evaluate(() => window.__APP_TEST_API__.getMode())).toBe(
    "presentation",
  );

  const itemsBefore = (await getNode(page, rankingBox.id)).summary.items;
  await page.evaluate(
    ({ rankingBoxId, itemId }) => window.__APP_TEST_API__.reorderRankingBoxItem(rankingBoxId, itemId, 0),
    {
      rankingBoxId: rankingBox.id,
      itemId: itemsBefore[1].id,
    },
  );

  await expect
    .poll(async () => (await getNode(page, rankingBox.id)).summary.items.map((item) => item.renderedText))
    .toEqual(["Second view item", "First view item"]);
  await expect.poll(async () => page.evaluate(() => window.__APP_TEST_API__.getMode())).toBe(
    "presentation",
  );
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

  await page.getByTestId("brush-type-pencil").click();
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

  await page.getByTestId("brush-type-pencil").click();
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
