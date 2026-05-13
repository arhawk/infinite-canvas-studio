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

async function getConnectionCurvePagePoint(page, connectionId, t = 0.5) {
  return page.evaluate(({ id, sampleT }) => {
    const node = window.__APP_TEST_API__.getNode(id);
    const points = node?.summary?.points ?? [];
    if (points.length !== 8) return null;

    const cubicPoint = (value, p0, p1, p2, p3) => {
      const mt = 1 - value;
      return (mt ** 3) * p0 + 3 * (mt ** 2) * value * p1 + 3 * mt * (value ** 2) * p2 + (value ** 3) * p3;
    };

    const canvasPoint = {
      x: cubicPoint(sampleT, points[0], points[2], points[4], points[6]),
      y: cubicPoint(sampleT, points[1], points[3], points[5], points[7]),
    };

    return window.__APP_TEST_API__.canvasToPagePoint(canvasPoint);
  }, { id: connectionId, sampleT: t });
}

async function listCatalogItems(page) {
  return page.evaluate(() => window.__APP_TEST_API__.listCatalogItems());
}

async function countMinimapWarningPixels(page) {
  return page.evaluate(() => {
    const canvas = document.querySelector('[data-testid="minimap"] canvas');
    const context = canvas?.getContext?.("2d");
    if (!canvas || !context) return 0;

    const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
    let count = 0;
    for (let index = 0; index < data.length; index += 4) {
      const red = data[index];
      const green = data[index + 1];
      const blue = data[index + 2];
      const alpha = data[index + 3];
      if (red > 220 && green > 170 && blue < 90 && alpha > 120) {
        count += 1;
      }
    }
    return count;
  });
}

async function getMinimapLaserAlignment(page, nodeId) {
  return page.evaluate((id) => {
    const node = window.__APP_TEST_API__.getNode(id);
    const viewport = window.__APP_TEST_API__.getViewportState().viewport;
    const canvas = document.querySelector('[data-testid="minimap"] canvas');
    const wrapper = canvas?.parentElement ?? null;
    const laser = wrapper?.querySelector(".minimap__laser") ?? null;
    if (!node?.bounds || !canvas || !wrapper || !laser) return null;

    const canvasRect = canvas.getBoundingClientRect();
    const wrapperRect = wrapper.getBoundingClientRect();
    const laserX = parseFloat(laser.style.left) - (canvasRect.left - wrapperRect.left);
    const laserY = parseFloat(laser.style.top) - (canvasRect.top - wrapperRect.top);
    const paddedNode = {
      x: node.bounds.x - 80,
      y: node.bounds.y - 80,
      width: node.bounds.width + 160,
      height: node.bounds.height + 160,
    };
    const bounds = {
      x: Math.min(paddedNode.x, viewport.x),
      y: Math.min(paddedNode.y, viewport.y),
      width: Math.max(paddedNode.x + paddedNode.width, viewport.x + viewport.width)
        - Math.min(paddedNode.x, viewport.x),
      height: Math.max(paddedNode.y + paddedNode.height, viewport.y + viewport.height)
        - Math.min(paddedNode.y, viewport.y),
    };
    const minimapScale = Math.min(canvas.width / bounds.width, canvas.height / bounds.height);
    const offsetX = (canvas.width - bounds.width * minimapScale) / 2;
    const offsetY = (canvas.height - bounds.height * minimapScale) / 2;
    const nodeCenter = {
      x: node.bounds.x + node.bounds.width / 2,
      y: node.bounds.y + node.bounds.height / 2,
    };
    const canvasX = (nodeCenter.x - bounds.x) * minimapScale + offsetX;
    const canvasY = (nodeCenter.y - bounds.y) * minimapScale + offsetY;
    const expectedX = (canvasX / canvas.width) * canvasRect.width;
    const expectedY = (canvasY / canvas.height) * canvasRect.height;

    return {
      dx: Math.abs(laserX - expectedX),
      dy: Math.abs(laserY - expectedY),
    };
  }, nodeId);
}

async function getMinimapShapeInkSummary(page, nodeId) {
  return page.evaluate((id) => {
    const node = window.__APP_TEST_API__.getNode(id);
    const viewport = window.__APP_TEST_API__.getViewportState().viewport;
    const canvas = document.querySelector('[data-testid="minimap"] canvas');
    const context = canvas?.getContext?.("2d");
    if (!node?.bounds || !canvas || !context) return null;

    const paddedNode = {
      x: node.bounds.x - 80,
      y: node.bounds.y - 80,
      width: node.bounds.width + 160,
      height: node.bounds.height + 160,
    };
    const bounds = {
      x: Math.min(paddedNode.x, viewport.x),
      y: Math.min(paddedNode.y, viewport.y),
      width: Math.max(paddedNode.x + paddedNode.width, viewport.x + viewport.width)
        - Math.min(paddedNode.x, viewport.x),
      height: Math.max(paddedNode.y + paddedNode.height, viewport.y + viewport.height)
        - Math.min(paddedNode.y, viewport.y),
    };
    const scale = Math.min(canvas.width / bounds.width, canvas.height / bounds.height);
    const offsetX = (canvas.width - bounds.width * scale) / 2;
    const offsetY = (canvas.height - bounds.height * scale) / 2;
    const miniRect = {
      x: (node.bounds.x - bounds.x) * scale + offsetX,
      y: (node.bounds.y - bounds.y) * scale + offsetY,
      width: node.bounds.width * scale,
      height: node.bounds.height * scale,
    };

    const countInk = (x, y, width, height) => {
      const sampleX = Math.max(0, Math.floor(x));
      const sampleY = Math.max(0, Math.floor(y));
      const sampleW = Math.max(1, Math.min(canvas.width - sampleX, Math.ceil(width)));
      const sampleH = Math.max(1, Math.min(canvas.height - sampleY, Math.ceil(height)));
      const { data } = context.getImageData(sampleX, sampleY, sampleW, sampleH);
      let count = 0;
      for (let index = 3; index < data.length; index += 4) {
        if (data[index] > 40) count += 1;
      }
      return count;
    };

    const sample = 5;
    const inset = 2;
    const cornerInk = [
      countInk(miniRect.x + inset, miniRect.y + inset, sample, sample),
      countInk(miniRect.x + miniRect.width - sample - inset, miniRect.y + inset, sample, sample),
      countInk(miniRect.x + inset, miniRect.y + miniRect.height - sample - inset, sample, sample),
      countInk(
        miniRect.x + miniRect.width - sample - inset,
        miniRect.y + miniRect.height - sample - inset,
        sample,
        sample,
      ),
    ].reduce((total, count) => total + count, 0);
    const centerInk = countInk(
      miniRect.x + miniRect.width / 2 - sample / 2,
      miniRect.y + miniRect.height / 2 - sample / 2,
      sample,
      sample,
    );

    return { cornerInk, centerInk, miniRect };
  }, nodeId);
}

function getUnionBounds(nodes = []) {
  const bounds = nodes.map((node) => node.bounds).filter(Boolean);
  if (!bounds.length) return null;

  const minX = Math.min(...bounds.map((box) => box.x));
  const minY = Math.min(...bounds.map((box) => box.y));
  const maxX = Math.max(...bounds.map((box) => box.x + box.width));
  const maxY = Math.max(...bounds.map((box) => box.y + box.height));
  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY,
  };
}

function getBoundsCenter(bounds) {
  return {
    x: bounds.x + bounds.width / 2,
    y: bounds.y + bounds.height / 2,
  };
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

async function setInputValue(page, testId, value) {
  await page.getByTestId(testId).evaluate((input, nextValue) => {
    input.value = nextValue;
    input.dispatchEvent(new Event("input", { bubbles: true }));
  }, value);
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

test("does not auto-select the hidden catalog data node", async ({ page }) => {
  await expect(page.evaluate(() => window.__APP_TEST_API__.ensureCatalogNode())).resolves.toBe(true);

  await expect
    .poll(async () => page.evaluate(() => window.__APP_TEST_API__.getSelectedNodeIds()))
    .toEqual([]);
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
  await expect(page.getByTestId("attachments-panel")).toHaveCount(0);
});

test("reorders component layers and preserves them through undo and document roundtrip", async ({ page }) => {
  const first = await addComponent(page, "sticky", { x: 180, y: 180 });
  const second = await addComponent(page, "sticky", { x: 360, y: 180 });
  const third = await addComponent(page, "sticky", { x: 540, y: 180 });

  await page.evaluate((nodeId) => window.__APP_TEST_API__.selectNode(nodeId), first.id);
  await waitForPaint(page);

  await expect(page.getByTestId("sticky-panel")).toBeVisible();
  await expect(page.getByTestId("sticky-connect")).toBeVisible();
  await expect(page.getByTestId("sticky-connect")).toBeEnabled();
  await expect(page.getByTestId("sticky-layer-menu")).toBeVisible();

  await page.getByTestId("sticky-layer-menu").click();
  const layerButtonBox = await page.getByTestId("sticky-layer-menu").boundingBox();
  const layerMenuBox = await page.locator(".toolbar__sticky-layer-popover").boundingBox();
  expect(layerMenuBox?.height ?? 999).toBeLessThan(80);
  expect(layerMenuBox.x).toBeGreaterThanOrEqual(layerButtonBox.x + layerButtonBox.width - 1);
  expect(Math.abs(layerMenuBox.y - layerButtonBox.y)).toBeLessThan(4);
  await expect(page.getByTestId("sticky-layer-bring-forward")).toBeEnabled();
  await expect(page.getByTestId("sticky-layer-send-backward")).toBeDisabled();

  await page.getByTestId("sticky-layer-bring-forward").click();
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

  await page.getByTestId("sticky-layer-menu").click();
  await expect(page.getByTestId("sticky-layer-send-backward")).toBeEnabled();
  await page.getByTestId("sticky-layer-send-backward").click();
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

test("edits image sources from the floating toolbar", async ({ page }) => {
  const image = await addComponent(page, "image", { x: 180, y: 160 });
  const center = await getNodePageCenter(page, image.id);

  await page.evaluate((nodeId) => window.__APP_TEST_API__.selectNode(nodeId), image.id);
  await waitForPaint(page);

  await expect(page.getByTestId("image-panel")).toBeVisible();
  await expect(page.getByTestId("image-upload")).toBeVisible();
  await expect(page.getByTestId("image-upload").locator("svg")).toBeVisible();
  await expect(page.getByTestId("image-connect")).toBeVisible();
  await expect(page.getByTestId("image-layer-menu")).toBeVisible();
  await page.mouse.dblclick(center.x, center.y);

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="80" height="48">
    <rect width="80" height="48" fill="#38bdf8"/>
    <circle cx="52" cy="24" r="14" fill="#f97316"/>
  </svg>`;
  await page.getByTestId("image-upload-input").setInputFiles({
    name: "toolbar-image.svg",
    mimeType: "image/svg+xml",
    buffer: Buffer.from(svg),
  });

  await expect.poll(async () => (await getNode(page, image.id)).summary).toEqual(
    expect.objectContaining({
      hasImageNode: true,
      hasPlaceholder: false,
    }),
  );
  const uploaded = await getNode(page, image.id);
  expect(uploaded.summary.srcLength).toBeGreaterThan(100);

  await page.evaluate(() => window.__APP_TEST_API__.undo());
  await expect.poll(async () => (await getNode(page, image.id)).summary).toEqual(
    expect.objectContaining({
      hasImageNode: false,
      hasPlaceholder: true,
      srcLength: 0,
    }),
  );

  await page.evaluate(() => window.__APP_TEST_API__.redo());
  await expect.poll(async () => (await getNode(page, image.id)).summary).toEqual(
    expect.objectContaining({
      hasImageNode: true,
      hasPlaceholder: false,
    }),
  );

  const exported = await page.evaluate(() => window.__APP_TEST_API__.exportDocument());
  await page.evaluate(() => window.__APP_TEST_API__.clearBoard());
  await page.evaluate((snapshot) => window.__APP_TEST_API__.loadDocument(snapshot), exported);

  const restored = await getNode(page, image.id);
  expect(restored.summary.hasImageNode).toBe(true);
  expect(restored.summary.hasPlaceholder).toBe(false);
  expect(restored.summary.srcLength).toBeGreaterThan(100);
});

test("opens image layer actions from the floating toolbar and right click", async ({ page }) => {
  const image = await addComponent(page, "image", { x: 180, y: 160 });
  const sticky = await addComponent(page, "sticky", { x: 480, y: 190 });
  const center = await getNodePageCenter(page, image.id);

  await page.evaluate((nodeId) => window.__APP_TEST_API__.selectNode(nodeId), image.id);
  await waitForPaint(page);

  await expect(page.getByTestId("image-panel")).toBeVisible();
  await expect.poll(async () => getNodeOrder(page, [image.id, sticky.id]))
    .toEqual([image.id, sticky.id]);

  await page.getByTestId("image-layer-menu").click();
  const layerButtonBox = await page.getByTestId("image-layer-menu").boundingBox();
  const layerMenuBox = await page.locator(".toolbar__image-layer-popover").boundingBox();
  expect(layerMenuBox?.height ?? 999).toBeLessThan(80);
  expect(layerMenuBox.x).toBeGreaterThanOrEqual(layerButtonBox.x + layerButtonBox.width - 1);
  expect(Math.abs(layerMenuBox.y - layerButtonBox.y)).toBeLessThan(4);
  await expect(page.locator(".toolbar__image-layer-popover")).toHaveCSS("pointer-events", "auto");
  await expect(page.getByTestId("image-layer-bring-forward")).toBeEnabled();
  await page.getByTestId("image-layer-menu").click();
  await expect(page.locator(".toolbar__image-layer-popover")).toHaveCSS("pointer-events", "none");

  await page.mouse.click(center.x, center.y, { button: "right" });
  await expect(page.locator(".toolbar__image-layer-popover")).toHaveCSS("pointer-events", "auto");
  await expect(page.getByText("Edit...")).toHaveCount(0);

  await page.getByTestId("image-layer-bring-forward").click();
  await expect.poll(async () => getNodeOrder(page, [image.id, sticky.id]))
    .toEqual([sticky.id, image.id]);
});

test("edits video sources from the floating toolbar and opens layer actions", async ({ page }) => {
  const video = await addComponent(page, "video", { x: 180, y: 180 });
  const sticky = await addComponent(page, "sticky", { x: 520, y: 210 });
  const center = await getNodePageCenter(page, video.id);

  await page.evaluate((nodeId) => window.__APP_TEST_API__.selectNode(nodeId), video.id);
  await waitForPaint(page);

  await expect(page.getByTestId("video-panel")).toBeVisible();
  await expect(page.getByTestId("video-upload")).toBeVisible();
  await expect(page.getByTestId("video-upload").locator("svg")).toBeVisible();
  await expect(page.getByTestId("video-connect")).toBeVisible();
  await expect(page.getByTestId("video-layer-menu")).toBeVisible();
  await expect.poll(async () => (await getNode(page, video.id)).summary).toEqual(
    expect.objectContaining({
      hasOverlay: true,
      hasVideoElement: false,
      hasPlaceholder: true,
      hasTopbarActions: false,
      placeholderText: "Use toolbar to upload video",
      srcLength: 0,
    }),
  );
  await page.mouse.dblclick(center.x, center.y);

  await page.getByTestId("video-upload-input").setInputFiles({
    name: "toolbar-video.mp4",
    mimeType: "video/mp4",
    buffer: Buffer.from("codex-video-toolbar"),
  });

  await expect.poll(async () => (await getNode(page, video.id)).summary).toEqual(
    expect.objectContaining({
      hasVideoElement: true,
      hasPlaceholder: false,
    }),
  );
  const uploaded = await getNode(page, video.id);
  expect(uploaded.summary.srcLength).toBeGreaterThan(24);

  await page.evaluate(() => window.__APP_TEST_API__.undo());
  await expect.poll(async () => (await getNode(page, video.id)).summary).toEqual(
    expect.objectContaining({
      hasVideoElement: false,
      hasPlaceholder: true,
      srcLength: 0,
    }),
  );

  await page.evaluate(() => window.__APP_TEST_API__.redo());
  await expect.poll(async () => (await getNode(page, video.id)).summary).toEqual(
    expect.objectContaining({
      hasVideoElement: true,
      hasPlaceholder: false,
    }),
  );

  const exported = await page.evaluate(() => window.__APP_TEST_API__.exportDocument());
  await page.evaluate(() => window.__APP_TEST_API__.clearBoard());
  await page.evaluate((snapshot) => window.__APP_TEST_API__.loadDocument(snapshot), exported);

  const restored = await getNode(page, video.id);
  expect(restored.summary.hasVideoElement).toBe(true);
  expect(restored.summary.hasPlaceholder).toBe(false);
  expect(restored.summary.srcLength).toBeGreaterThan(24);

  await page.evaluate((nodeId) => window.__APP_TEST_API__.selectNode(nodeId), video.id);
  await expect(page.getByTestId("video-panel")).toBeVisible();
  await expect.poll(async () => getNodeOrder(page, [video.id, sticky.id]))
    .toEqual([video.id, sticky.id]);

  await page.getByTestId("video-layer-menu").click();
  const layerButtonBox = await page.getByTestId("video-layer-menu").boundingBox();
  const layerMenuBox = await page.locator(".toolbar__video-layer-popover").boundingBox();
  expect(layerMenuBox?.height ?? 999).toBeLessThan(80);
  expect(layerMenuBox.x).toBeGreaterThanOrEqual(layerButtonBox.x + layerButtonBox.width - 1);
  expect(Math.abs(layerMenuBox.y - layerButtonBox.y)).toBeLessThan(4);
  await expect(page.getByTestId("video-layer-bring-forward")).toBeEnabled();
  await page.getByTestId("video-layer-menu").click();
  await expect(page.locator(".toolbar__video-layer-popover")).toHaveCSS("pointer-events", "none");

  const restoredCenter = await getNodePageCenter(page, video.id);
  await page.mouse.click(restoredCenter.x, restoredCenter.y, { button: "right" });
  await expect(page.locator(".toolbar__video-layer-popover")).toHaveCSS("pointer-events", "auto");
  await expect(page.getByText("Edit...")).toHaveCount(0);

  await page.getByTestId("video-layer-bring-forward").click();
  await expect.poll(async () => getNodeOrder(page, [video.id, sticky.id]))
    .toEqual([sticky.id, video.id]);
});

test("does not create an image component when image paste targets an input", async ({ page }) => {
  const editor = await addComponent(page, "javascriptEditor", {
    x: 120,
    y: 220,
    title: "Paste Guard",
  });

  await page.evaluate((nodeId) => window.__APP_TEST_API__.selectNode(nodeId), editor.id);
  await expect(page.getByTestId("javascript-editor-panel")).toBeVisible();

  const beforeImageCount = await page.evaluate(() => (
    window.__APP_TEST_API__.listNodes().filter((node) => node.componentType === "image").length
  ));

  await page.evaluate(() => {
    const input = document.createElement("input");
    input.dataset.testid = "paste-target-input";
    input.style.position = "fixed";
    input.style.left = "12px";
    input.style.top = "12px";
    document.body.append(input);
  });

  await dispatchClipboardImagePaste(page, {
    targetSelector: '[data-testid="paste-target-input"]',
    label: "Ignored paste",
  });

  await expect
    .poll(async () => page.evaluate(() => (
      window.__APP_TEST_API__.listNodes().filter((node) => node.componentType === "image").length
    )))
    .toBe(beforeImageCount);
});

test("shows JavaScript editor actions in the floating toolbar", async ({ page }) => {
  const editor = await addComponent(page, "javascriptEditor", {
    x: 160,
    y: 220,
    title: "Toolbar Runner",
  });
  const sticky = await addComponent(page, "sticky", {
    x: 220,
    y: 260,
    text: "Layer reference",
  });

  await page.evaluate((nodeId) => window.__APP_TEST_API__.selectNode(nodeId), editor.id);
  await waitForPaint(page);

  await expect(page.getByTestId("javascript-editor-panel")).toBeVisible();
  await expect(page.getByTestId("javascript-editor-toolbar-title")).toHaveCount(0);
  await expect(page.getByTestId("javascript-editor-connect")).toBeVisible();
  await expect(page.getByTestId("javascript-editor-layer-menu")).toBeVisible();
  const center = await getNodePageCenter(page, editor.id);
  await page.mouse.dblclick(center.x, center.y);

  await page.getByTestId("javascript-editor-layer-menu").click();
  const layerButtonBox = await page.getByTestId("javascript-editor-layer-menu").boundingBox();
  const layerMenuBox = await page.locator(".toolbar__javascript-editor-layer-popover").boundingBox();
  expect(layerMenuBox?.height ?? 999).toBeLessThan(80);
  expect(layerMenuBox.x).toBeGreaterThanOrEqual(layerButtonBox.x + layerButtonBox.width - 1);
  expect(Math.abs(layerMenuBox.y - layerButtonBox.y)).toBeLessThan(4);
  await expect(page.getByTestId("javascript-editor-layer-bring-forward")).toBeEnabled();
  await expect(page.getByTestId("javascript-editor-layer-send-backward")).toBeDisabled();
  await page.getByTestId("javascript-editor-layer-menu").click();
  await expect(page.locator(".toolbar__javascript-editor-layer-popover")).toHaveCSS(
    "pointer-events",
    "none",
  );

  await page.mouse.click(center.x, center.y, { button: "right" });
  await expect(page.locator(".toolbar__javascript-editor-layer-popover")).toHaveCSS(
    "pointer-events",
    "auto",
  );
  await expect(page.getByText("Edit...")).toHaveCount(0);

  await page.getByTestId("javascript-editor-layer-bring-forward").click();
  await expect.poll(async () => getNodeOrder(page, [editor.id, sticky.id]))
    .toEqual([sticky.id, editor.id]);
});

test("creates a connection and updates it when a node moves", async ({ page }) => {
  const source = await addComponent(page, "sticky", { x: 180, y: 180 });
  const target = await addComponent(page, "sticky", { x: 560, y: 220 });

  const createdConnection = await page.evaluate(
    ({ sourceId, targetId }) => window.__APP_TEST_API__.createConnection(sourceId, targetId),
    { sourceId: source.id, targetId: target.id },
  );
  expect(createdConnection).not.toBeNull();

  await expect
    .poll(async () => {
      const nodes = await page.evaluate(() => window.__APP_TEST_API__.listNodes());
      return nodes.filter((node) => node.componentType === "connection").length;
    })
    .toBe(1);

  expect(createdConnection.summary.sourceNodeId).toBe(source.id);
  expect(createdConnection.summary.targetNodeId).toBe(target.id);
  expect(createdConnection.summary.points.length).toBe(8);

  const duplicateConnection = await page.evaluate(
    ({ sourceId, targetId }) => window.__APP_TEST_API__.createConnection(sourceId, targetId),
    { sourceId: source.id, targetId: target.id },
  );
  expect(duplicateConnection.id).toBe(createdConnection.id);

  const reverseConnection = await page.evaluate(
    ({ sourceId, targetId }) => window.__APP_TEST_API__.createConnection(sourceId, targetId),
    { sourceId: target.id, targetId: source.id },
  );
  expect(reverseConnection.id).toBe(createdConnection.id);

  await expect
    .poll(async () => {
      const nodes = await page.evaluate(() => window.__APP_TEST_API__.listNodes());
      return nodes.filter((node) => node.componentType === "connection").length;
    })
    .toBe(1);

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

test("starts connections from shape, button, and sticky floating toolbar buttons", async ({ page }) => {
  const shape = await addComponent(page, "shape", {
    x: 180,
    y: 180,
    width: 160,
    height: 110,
  });
  const sticky = await addComponent(page, "sticky", { x: 560, y: 220 });

  await page.evaluate((nodeId) => window.__APP_TEST_API__.selectNode(nodeId), shape.id);
  await expect(page.getByTestId("shape-connect")).toBeVisible();
  await expect(page.getByTestId("shape-connect")).toBeEnabled();
  await page.getByTestId("shape-connect").click();
  const stickyCenter = await getNodePageCenter(page, sticky.id);
  await page.mouse.click(stickyCenter.x, stickyCenter.y);

  await expect
    .poll(async () => {
      const nodes = await page.evaluate(() => window.__APP_TEST_API__.listNodes());
      return nodes.some((node) => (
        node.componentType === "connection" &&
        node.summary.sourceNodeId === shape.id &&
        node.summary.targetNodeId === sticky.id
      ));
    })
    .toBe(true);

  await clearBoard(page);
  const stickySource = await addComponent(page, "sticky", { x: 180, y: 180 });
  const shapeTarget = await addComponent(page, "shape", {
    x: 560,
    y: 220,
    width: 160,
    height: 110,
  });

  await page.evaluate((nodeId) => window.__APP_TEST_API__.selectNode(nodeId), stickySource.id);
  await expect(page.getByTestId("sticky-connect")).toBeVisible();
  await expect(page.getByTestId("sticky-connect")).toBeEnabled();
  await page.getByTestId("sticky-connect").click();
  const shapeTargetCenter = await getNodePageCenter(page, shapeTarget.id);
  await page.mouse.click(shapeTargetCenter.x, shapeTargetCenter.y);

  await expect
    .poll(async () => {
      const nodes = await page.evaluate(() => window.__APP_TEST_API__.listNodes());
      return nodes.some((node) => (
        node.componentType === "connection" &&
        node.summary.sourceNodeId === stickySource.id &&
        node.summary.targetNodeId === shapeTarget.id
      ));
    })
    .toBe(true);

  await clearBoard(page);
  const buttonSource = await addComponent(page, "button", { x: 180, y: 180, label: "Go" });
  const stickyTarget = await addComponent(page, "sticky", { x: 560, y: 220 });

  await page.evaluate((nodeId) => window.__APP_TEST_API__.selectNode(nodeId), buttonSource.id);
  await expect(page.getByTestId("button-connect")).toBeVisible();
  await expect(page.getByTestId("button-connect")).toBeEnabled();
  await page.getByTestId("button-connect").click();
  const stickyTargetCenter = await getNodePageCenter(page, stickyTarget.id);
  await page.mouse.click(stickyTargetCenter.x, stickyTargetCenter.y);

  await expect
    .poll(async () => {
      const nodes = await page.evaluate(() => window.__APP_TEST_API__.listNodes());
      return nodes.some((node) => (
        node.componentType === "connection" &&
        node.summary.sourceNodeId === buttonSource.id &&
        node.summary.targetNodeId === stickyTarget.id &&
        node.summary.hiddenUntilEndpointSelected === true
      ));
    })
    .toBe(true);
});

test("edits connection lines from the floating toolbar and right click", async ({ page }) => {
  const source = await addComponent(page, "sticky", { x: 180, y: 180 });
  const target = await addComponent(page, "sticky", { x: 560, y: 220 });
  const connection = await page.evaluate(
    ({ sourceId, targetId }) => window.__APP_TEST_API__.createConnection(sourceId, targetId),
    { sourceId: source.id, targetId: target.id },
  );

  await page.evaluate((nodeId) => window.__APP_TEST_API__.selectNode(nodeId), connection.id);
  await expect(page.getByTestId("connection-panel")).toBeVisible();
  await expect(page.getByTestId("connection-stroke-color")).toHaveValue("#d7612f");
  await expect(page.getByTestId("connection-stroke-width")).toHaveValue("3");
  await expect(page.getByTestId("connection-pointer-length")).toHaveValue("10");
  await expect(page.getByTestId("connection-pointer-width")).toHaveValue("10");
  await expect(page.getByTestId("connection-reverse-direction")).toBeEnabled();
  await page.evaluate((connectionId) => (
    window.__APP_TEST_API__.doubleClickConnectionLine(connectionId)
  ), connection.id);

  await page.evaluate(() => window.__APP_TEST_API__.resetHistory());
  await page.getByTestId("connection-reverse-direction").click();
  await expect
    .poll(async () => (await getNode(page, connection.id))?.summary ?? {})
    .toEqual(expect.objectContaining({
      sourceNodeId: target.id,
      targetNodeId: source.id,
    }));

  await page.evaluate(() => window.__APP_TEST_API__.undo());
  await expect
    .poll(async () => (await getNode(page, connection.id))?.summary ?? {})
    .toEqual(expect.objectContaining({
      sourceNodeId: source.id,
      targetNodeId: target.id,
    }));
  await page.evaluate(() => window.__APP_TEST_API__.redo());
  await expect
    .poll(async () => (await getNode(page, connection.id))?.summary ?? {})
    .toEqual(expect.objectContaining({
      sourceNodeId: target.id,
      targetNodeId: source.id,
    }));

  await setInputValue(page, "connection-stroke-color", "#166534");
  await expect
    .poll(async () => (await getNode(page, connection.id))?.summary?.stroke ?? null)
    .toBe("#166534");

  await page.evaluate(() => window.__APP_TEST_API__.undo());
  await expect
    .poll(async () => (await getNode(page, connection.id))?.summary?.stroke ?? null)
    .toBe("#d7612f");
  await page.evaluate(() => window.__APP_TEST_API__.redo());
  await expect
    .poll(async () => (await getNode(page, connection.id))?.summary?.stroke ?? null)
    .toBe("#166534");

  await setInputValue(page, "connection-stroke-width", "5");
  await setInputValue(page, "connection-pointer-length", "24");
  await setInputValue(page, "connection-pointer-width", "18");
  await expect
    .poll(async () => (await getNode(page, connection.id))?.summary ?? {})
    .toEqual(expect.objectContaining({
      sourceNodeId: target.id,
      targetNodeId: source.id,
      stroke: "#166534",
      strokeWidth: 5,
      pointerLength: 24,
      pointerWidth: 18,
    }));

  const curvePoint = await getConnectionCurvePagePoint(page, connection.id);
  expect(curvePoint).not.toBeNull();
  await page.evaluate(() => {
    window.__connectionContextMenuPrevented = null;
    document.addEventListener("contextmenu", (event) => {
      window.setTimeout(() => {
        window.__connectionContextMenuPrevented = event.defaultPrevented;
      }, 0);
    }, { capture: true, once: true });
  });
  await page.mouse.click(curvePoint.x, curvePoint.y, { button: "right" });
  await expect.poll(async () => page.evaluate(() => window.__connectionContextMenuPrevented)).toBe(true);
  await expect(page.getByTestId("connection-panel")).toBeVisible();
  await expect.poll(async () => page.evaluate(() => window.__APP_TEST_API__.getSelectedNodeIds()))
    .toEqual([connection.id]);
  await expect
    .poll(async () => page.evaluate(() => window.__APP_TEST_API__.getContextMenuState().visible))
    .toBe(false);
  await expect(page.getByTestId("connection-layer-menu")).toHaveCount(0);

  await page.getByTestId("connection-hidden-toggle").click();
  await expect
    .poll(async () => (await getNode(page, connection.id))?.summary?.hiddenUntilEndpointSelected ?? false)
    .toBe(true);

  const exported = await page.evaluate(() => window.__APP_TEST_API__.exportDocument());
  await page.evaluate(() => window.__APP_TEST_API__.clearBoard());
  await page.evaluate((snapshot) => window.__APP_TEST_API__.loadDocument(snapshot), exported);
  await expect
    .poll(async () => (await getNode(page, connection.id))?.summary ?? {})
    .toEqual(expect.objectContaining({
      stroke: "#166534",
      strokeWidth: 5,
      pointerLength: 24,
      pointerWidth: 18,
      hiddenUntilEndpointSelected: true,
    }));
});

test("marks unlinked pages with a minimap warning", async ({ page }) => {
  const jumpButton = page.getByTestId("minimap-unlinked-page-next");
  await expect(jumpButton).toBeHidden();

  const firstPage = await addComponent(page, "page", { x: 120, y: 140 });
  await waitForPaint(page);
  await expect.poll(async () => countMinimapWarningPixels(page)).toBeGreaterThan(12);
  await expect(jumpButton).toBeVisible();
  await expect(jumpButton).toHaveCSS("animation-name", "minimap-unlinked-page-button-pulse");

  const secondPage = await addComponent(page, "page", { x: 1220, y: 140 });
  await page.evaluate(
    ({ sourceId, targetId }) => window.__APP_TEST_API__.createConnection(sourceId, targetId),
    { sourceId: firstPage.id, targetId: secondPage.id },
  );
  await waitForPaint(page);

  await expect.poll(async () => countMinimapWarningPixels(page)).toBe(0);
  await expect(jumpButton).toBeHidden();
});

test("treats pages connected to non-page components as linked in the minimap", async ({ page }) => {
  const jumpButton = page.getByTestId("minimap-unlinked-page-next");
  const pageNode = await addComponent(page, "page", { x: 120, y: 140 });
  await waitForPaint(page);
  await expect.poll(async () => countMinimapWarningPixels(page)).toBeGreaterThan(12);
  await expect(jumpButton).toBeVisible();

  const sticky = await addComponent(page, "sticky", { x: 920, y: 180 });
  await page.evaluate(
    ({ sourceId, targetId }) => window.__APP_TEST_API__.createConnection(sourceId, targetId),
    { sourceId: sticky.id, targetId: pageNode.id },
  );
  await waitForPaint(page);

  await expect.poll(async () => countMinimapWarningPixels(page)).toBe(0);
  await expect(jumpButton).toBeHidden();
});

test("cycles through unlinked pages from the minimap", async ({ page }) => {
  const firstUnlinked = await addComponent(page, "page", { x: 120, y: 140 });
  const linkedSource = await addComponent(page, "page", { x: 1120, y: 140 });
  const linkedTarget = await addComponent(page, "page", { x: 1680, y: 140 });
  const secondUnlinked = await addComponent(page, "page", { x: 120, y: 980 });

  await page.evaluate(
    ({ sourceId, targetId }) => window.__APP_TEST_API__.createConnection(sourceId, targetId),
    { sourceId: linkedSource.id, targetId: linkedTarget.id },
  );
  await page.evaluate(() => window.__APP_TEST_API__.selectNodes([]));
  await waitForPaint(page);

  const jumpButton = page.getByTestId("minimap-unlinked-page-next");
  await expect(jumpButton).toBeVisible();
  await expect(jumpButton).toBeEnabled();

  await jumpButton.click();
  await expect.poll(async () => page.evaluate(() => window.__APP_TEST_API__.getSelectedNodeIds()))
    .toEqual([firstUnlinked.id]);
  await expect
    .poll(async () => {
      const [viewport, node] = await Promise.all([
        page.evaluate(() => window.__APP_TEST_API__.getViewportState()),
        getNode(page, firstUnlinked.id),
      ]);
      const center = getBoundsCenter(node.bounds);
      return Math.hypot(viewport.center.x - center.x, viewport.center.y - center.y);
    })
    .toBeLessThan(5);

  await jumpButton.click();
  await expect.poll(async () => page.evaluate(() => window.__APP_TEST_API__.getSelectedNodeIds()))
    .toEqual([secondUnlinked.id]);
  await expect
    .poll(async () => {
      const [viewport, node] = await Promise.all([
        page.evaluate(() => window.__APP_TEST_API__.getViewportState()),
        getNode(page, secondUnlinked.id),
      ]);
      const center = getBoundsCenter(node.bounds);
      return Math.hypot(viewport.center.x - center.x, viewport.center.y - center.y);
    })
    .toBeLessThan(5);
});

test("positions the minimap selection laser on the rendered canvas", async ({ page }) => {
  const selectedPage = await addComponent(page, "page", { x: 1280, y: 820 });

  await page.evaluate(() => {
    const canvas = document.querySelector('[data-testid="minimap"] canvas');
    canvas.style.width = "90px";
  });
  await page.evaluate((nodeId) => window.__APP_TEST_API__.selectNode(nodeId), selectedPage.id);
  await waitForPaint(page);

  const alignment = await getMinimapLaserAlignment(page, selectedPage.id);
  expect(alignment).not.toBeNull();
  expect(alignment.dx).toBeLessThan(0.75);
  expect(alignment.dy).toBeLessThan(0.75);
});

test("renders shape components with their actual shape in the minimap", async ({ page }) => {
  const shape = await addComponent(page, "shape", {
    x: 2400,
    y: 1800,
    width: 800,
    height: 800,
    shapeType: "rhombus",
  });
  await waitForPaint(page);

  const inkSummary = await getMinimapShapeInkSummary(page, shape.id);
  expect(inkSummary).not.toBeNull();
  expect(inkSummary.centerInk).toBeGreaterThan(12);
  expect(inkSummary.cornerInk).toBeLessThan(inkSummary.centerInk);
});

test("pastes copied components into the current viewport", async ({ page }) => {
  const source = await addComponent(page, "sticky", { x: 160, y: 180 });
  await page.evaluate((sourceId) => window.__APP_TEST_API__.selectNode(sourceId), source.id);
  const payload = await page.evaluate(() => window.__APP_TEST_API__.createClipboardPayload());

  const viewport = await page.evaluate(() => window.__APP_TEST_API__.setViewport({
    scale: 0.75,
    position: { x: -2400, y: -1600 },
  }));

  const pasted = await page.evaluate((clipboardPayload) => (
    window.__APP_TEST_API__.pasteClipboardPayload(clipboardPayload)
  ), payload);

  expect(pasted).toHaveLength(1);
  const pastedCenter = getBoundsCenter(pasted[0].bounds);
  expect(Math.abs(pastedCenter.x - viewport.center.x)).toBeLessThan(80);
  expect(Math.abs(pastedCenter.y - viewport.center.y)).toBeLessThan(80);
});

test("creates a connected next page from the page floating toolbar", async ({ page }) => {
  const source = await addComponent(page, "page", { x: 120, y: 140 });
  await page.evaluate((nodeId) => window.__APP_TEST_API__.selectNode(nodeId), source.id);
  await waitForPaint(page);

  await expect(page.getByTestId("page-create-next")).toBeVisible();
  await page.getByTestId("page-create-next").click();
  await waitForPaint(page);

  const nodes = await page.evaluate(() => window.__APP_TEST_API__.listNodes());
  const pages = nodes.filter((node) => node.componentType === "page");
  const connections = nodes.filter((node) => node.componentType === "connection");
  const nextPage = pages.find((node) => node.id !== source.id);

  expect(pages).toHaveLength(2);
  expect(connections).toHaveLength(1);
  expect(nextPage).toBeTruthy();
  expect(nextPage.bounds.x).toBeGreaterThan(source.bounds.x + source.bounds.width);
  expect(Math.abs(nextPage.bounds.y - source.bounds.y)).toBeLessThan(1);

  const connection = connections[0];
  expect(connection.summary.sourceNodeId).toBe(source.id);
  expect(connection.summary.targetNodeId).toBe(nextPage.id);
  expect(connection.summary.points.length).toBe(8);
  expect(new Set([
    connection.summary.points[1],
    connection.summary.points[3],
    connection.summary.points[5],
    connection.summary.points[7],
  ]).size).toBe(1);
  expect(
    connections.some((entry) => entry.summary.sourceNodeId === nextPage.id),
  ).toBe(false);
});

test("copies connections along with their selected endpoints", async ({ page }) => {
  const source = await addComponent(page, "sticky", { x: 180, y: 180 });
  const target = await addComponent(page, "sticky", { x: 520, y: 220 });

  await page.evaluate(
    ({ sourceId, targetId }) => window.__APP_TEST_API__.createConnection(sourceId, targetId),
    { sourceId: source.id, targetId: target.id },
  );

  await expect
    .poll(async () => page.evaluate(({ sourceId, targetId }) => (
      window.__APP_TEST_API__.listNodes().find((node) => (
        node.componentType === "connection" &&
        node.summary.sourceNodeId === sourceId &&
        node.summary.targetNodeId === targetId
      )) ?? null
    ), { sourceId: source.id, targetId: target.id }))
    .not.toBeNull();

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

  const viewport = await page.evaluate(() => window.__APP_TEST_API__.getViewportState());
  const pastedBounds = getUnionBounds(pastedNodes);
  const pastedCenter = getBoundsCenter(pastedBounds);
  expect(Math.abs(pastedCenter.x - viewport.center.x)).toBeLessThan(80);
  expect(Math.abs(pastedCenter.y - viewport.center.y)).toBeLessThan(80);
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
  await page.evaluate((sourceId) => window.__APP_TEST_API__.startConnection(sourceId), source.id);

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

  await page.evaluate((nodeId) => window.__APP_TEST_API__.selectNode(nodeId), connection.id);
  await expect(page.getByTestId("connection-panel")).toBeVisible();
  await page.getByTestId("connection-hidden-toggle").click();

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

  const pulsingCurvePoint = await getConnectionCurvePagePoint(page, connection.id);
  await page.mouse.click(pulsingCurvePoint.x, pulsingCurvePoint.y);
  await expect.poll(async () => page.evaluate(() => window.__APP_TEST_API__.getSelectedNodeIds()))
    .toEqual([connection.id]);

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

  await page.evaluate((nodeId) => window.__APP_TEST_API__.selectNode(nodeId), connection.id);
  await expect(page.getByTestId("connection-panel")).toBeVisible();
  await page.getByTestId("connection-hidden-toggle").click();

  await page.evaluate((nodeId) => window.__APP_TEST_API__.selectNode(nodeId), other.id);
  await expect
    .poll(async () => (await getNode(page, connection.id))?.summary?.opacity ?? null)
    .toBe(0);

  await page.evaluate((nodeId) => window.__APP_TEST_API__.selectNode(nodeId), other.id);
  await expect.poll(async () => page.evaluate(() => window.__APP_TEST_API__.getSelectedNodeIds())).toEqual([
    other.id,
  ]);

  const connectionCurvePoint = await getConnectionCurvePagePoint(page, connection.id);

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

  await page.evaluate((nodeId) => window.__APP_TEST_API__.selectNode(nodeId), connection.id);
  await expect(page.getByTestId("connection-panel")).toBeVisible();
  await page.getByTestId("connection-termdef-toggle").click();

  await expect
    .poll(async () => (await getNode(page, connection.id))?.summary?.connectionKind ?? null)
    .toBe("termdef");
  await expect(page.getByTestId("connection-reverse-direction")).toBeDisabled();

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

  await page.evaluate((nodeId) => window.__APP_TEST_API__.selectNode(nodeId), connection2.id);
  await expect(page.getByTestId("connection-panel")).toBeVisible();
  await page.getByTestId("connection-termdef-toggle").click();

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

  expect(button.summary.shapeType).toBe("rounded");
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

test("button shape changes persist and keep jump navigation working", async ({ page }) => {
  const button = await addComponent(page, "button", { x: 180, y: 180, label: "Go" });
  const target = await addComponent(page, "sticky", { x: 1120, y: 180, text: "Target" });

  await page.evaluate(
    ({ sourceId, targetId }) => window.__APP_TEST_API__.createConnection(sourceId, targetId),
    { sourceId: button.id, targetId: target.id },
  );

  await page.evaluate((nodeId) => window.__APP_TEST_API__.selectNode(nodeId), button.id);
  await expect(page.getByTestId("button-controls")).toBeVisible();

  await expect(page.getByTestId("button-type-rounded")).toHaveAttribute("aria-pressed", "true");
  await page.getByTestId("button-type-rhombus").click();
  await expect
    .poll(async () => (await getNode(page, button.id))?.summary?.shapeType ?? null)
    .toBe("rhombus");

  const exported = await page.evaluate(() => window.__APP_TEST_API__.exportDocument());
  await page.evaluate(() => window.__APP_TEST_API__.clearBoard());
  await page.evaluate((snapshot) => window.__APP_TEST_API__.loadDocument(snapshot), exported);

  await expect
    .poll(async () => (await getNode(page, button.id))?.summary?.shapeType ?? null)
    .toBe("rhombus");

  const expectedFocus = await page.evaluate(
    (nodeId) => window.__APP_TEST_API__.getComputedFocus(nodeId),
    target.id,
  );

  await page.evaluate((nodeId) => window.__APP_TEST_API__.centerOnNode(nodeId, { duration: 0 }), button.id);
  await page.evaluate((nodeId) => window.__APP_TEST_API__.activateButton(nodeId), button.id);

  await expect
    .poll(async () => {
      const viewport = await page.evaluate(() => window.__APP_TEST_API__.getViewportState());
      return Math.abs(viewport.center.x - expectedFocus.center.x);
    })
    .toBeLessThan(4);
});

test("selected button exposes live shape controls", async ({ page }) => {
  const button = await addComponent(page, "button", { x: 520, y: 220, label: "Go" });
  const sticky = await addComponent(page, "sticky", { x: 760, y: 240 });

  await page.evaluate((nodeId) => window.__APP_TEST_API__.selectNode(nodeId), button.id);

  await expect(page.getByTestId("button-controls")).toBeVisible();
  await waitForPaint(page);
  await expect(page.getByTestId("shape-panel")).toBeHidden();
  await expect(page.getByTestId("button-connect")).toBeVisible();
  await expect(page.getByTestId("button-connect")).toBeEnabled();
  await expect(page.getByTestId("button-layer-menu")).toBeVisible();
  await expect(page.getByTestId("button-type-rounded")).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("button-font-size")).toHaveValue("16");
  await expect(page.getByTestId("button-text-color")).toHaveValue("#5b3b12");
  await expect(page.getByTestId("button-fill-color")).toHaveValue("#f7e7c6");
  await expect(page.getByTestId("button-opacity")).toHaveValue("1");
  await expect(page.getByTestId("button-stroke-color")).toHaveValue("#b9782f");
  await expect(page.getByTestId("button-stroke-width")).toHaveValue("2");
  await expect(page.getByTestId("button-opacity-value")).toHaveText("100%");
  await expect(page.getByTestId("button-style-text-color")).toHaveAttribute("title", "Text color");
  await expect(page.getByTestId("button-style-fill")).toHaveAttribute("title", "Fill color");
  await expect(page.getByTestId("button-style-border")).toHaveAttribute("title", "Border color");
  await expect(page.getByTestId("button-text-color")).toHaveAttribute("title", "Text color");
  await expect(page.getByTestId("button-fill-color")).toHaveAttribute("title", "Fill color");
  await expect(page.getByTestId("button-opacity")).toHaveAttribute("title", "Opacity: 100%");
  await expect(page.getByTestId("button-stroke-color")).toHaveAttribute("title", "Border color");
  await expect(page.getByTestId("button-stroke-width")).toHaveAttribute("title", "Thickness: 2");
  await expect(page.locator("#button-controls .toolbar__button-style-tool")).toHaveCount(6);
  await expect(page.getByTestId("button-style-font-size")).toBeVisible();
  await expect(page.getByTestId("button-style-text-color")).toBeVisible();
  await expect(page.getByTestId("button-style-fill")).toBeVisible();
  await expect(page.getByTestId("button-style-border")).toBeVisible();
  await expect(page.getByTestId("button-style-text-color").locator(".toolbar__button-text-icon")).toHaveText("A");
  await expect(page.getByTestId("button-style-fill").locator(".toolbar__button-fill-icon")).toHaveCount(1);
  await expect(page.getByTestId("button-style-border").locator(".toolbar__button-border-icon")).toHaveCount(1);
  await page.getByTestId("button-style-font-size").click();
  await expect(page.getByTestId("button-font-size")).toBeVisible();
  await page.getByTestId("button-style-fill").click();
  await expect(page.getByTestId("button-opacity")).toBeVisible();
  await expect(page.locator("#button-fill-swatches .toolbar__button-color-swatch")).toHaveCount(9);
  await expect(page.locator("#button-fill-swatches .toolbar__button-custom-trigger")).toHaveCount(1);
  await page.getByTestId("button-style-border").click();
  await expect(page.getByTestId("button-stroke-width")).toBeVisible();
  await expect(page.locator("#button-border-swatches .toolbar__button-color-swatch")).toHaveCount(9);
  await expect(page.locator("#button-border-swatches .toolbar__button-custom-trigger")).toHaveCount(1);
  await page.getByTestId("button-style-text-color").click();
  await expect(page.locator("#button-text-swatches .toolbar__button-color-swatch")).toHaveCount(8);
  await expect(page.locator("#button-text-swatches .toolbar__button-custom-trigger")).toHaveCount(1);
  await page.getByTestId("button-layer-menu").click();
  const layerButtonBox = await page.getByTestId("button-layer-menu").boundingBox();
  const layerMenuBox = await page.locator(".toolbar__button-layer-popover").boundingBox();
  expect(layerMenuBox?.height ?? 999).toBeLessThan(80);
  expect(layerMenuBox.x).toBeGreaterThanOrEqual(layerButtonBox.x + layerButtonBox.width - 1);
  expect(Math.abs(layerMenuBox.y - layerButtonBox.y)).toBeLessThan(4);
  await expect(page.getByTestId("button-layer-bring-forward")).toBeEnabled();
  await expect(page.getByTestId("button-layer-send-backward")).toBeDisabled();
  await page.getByTestId("button-layer-menu").click();
  await expect(page.locator(".toolbar__button-layer-popover")).toHaveCSS("pointer-events", "none");

  const buttonSnapshot = await getNode(page, button.id);
  const buttonTopCenter = await canvasPointToPage(page, {
    x: buttonSnapshot.bounds.x + buttonSnapshot.bounds.width / 2,
    y: buttonSnapshot.bounds.y,
  });
  const panelBox = await page.getByTestId("button-controls").boundingBox();
  expect(panelBox).toBeTruthy();
  expect(panelBox.y + panelBox.height).toBeLessThanOrEqual(buttonTopCenter.y - 18);
  expect(Math.abs(panelBox.x + panelBox.width / 2 - buttonTopCenter.x)).toBeLessThan(24);

  await page.evaluate(() => window.__APP_TEST_API__.resetHistory());
  await page.getByTestId("button-type-triangle").click();
  await setInputValue(page, "button-fill-color", "#dbeafe");
  await expect
    .poll(async () => (await getNode(page, button.id))?.summary?.fill ?? null)
    .toBe("#dbeafe");

  await page.evaluate(() => window.__APP_TEST_API__.undo());
  await expect
    .poll(async () => (await getNode(page, button.id))?.summary?.fill ?? null)
    .toBe("#f7e7c6");

  await page.evaluate(() => window.__APP_TEST_API__.redo());
  await expect
    .poll(async () => (await getNode(page, button.id))?.summary?.fill ?? null)
    .toBe("#dbeafe");

  await setInputValue(page, "button-font-size", "24");
  await setInputValue(page, "button-text-color", "#ffffff");
  await setInputValue(page, "button-opacity", "0.4");
  await setInputValue(page, "button-stroke-color", "#111827");
  await setInputValue(page, "button-stroke-width", "6");
  await expect(page.getByTestId("button-opacity-value")).toHaveText("40%");
  await expect(page.locator('#button-fill-swatches .toolbar__button-color-swatch[data-color="#dbeafe"]')).toHaveCount(1);
  await expect(page.locator('#button-border-swatches .toolbar__button-color-swatch[data-color="#111827"]')).toHaveCount(1);

  await expect
    .poll(async () => (await getNode(page, button.id))?.summary ?? null)
    .toEqual(expect.objectContaining({
      shapeType: "triangle",
      fill: "#dbeafe",
      fillOpacity: 0.4,
      stroke: "#111827",
      strokeWidth: 6,
      textColor: "#ffffff",
      fontSize: 24,
    }));

  await page.getByTestId("button-layer-menu").click();
  await page.getByTestId("button-layer-bring-forward").click();
  await expect.poll(async () => getNodeOrder(page, [button.id, sticky.id]))
    .toEqual([sticky.id, button.id]);

  const exported = await page.evaluate(() => window.__APP_TEST_API__.exportDocument());
  await page.evaluate(() => window.__APP_TEST_API__.clearBoard());
  await page.evaluate((snapshot) => window.__APP_TEST_API__.loadDocument(snapshot), exported);

  await expect
    .poll(async () => (await getNode(page, button.id))?.summary ?? null)
    .toEqual(expect.objectContaining({
      shapeType: "triangle",
      fill: "#dbeafe",
      fillOpacity: 0.4,
      stroke: "#111827",
      strokeWidth: 6,
      textColor: "#ffffff",
      fontSize: 24,
    }));
});

test("selected button toolbar follows its page parent while the page moves", async ({ page }) => {
  const pageNode = await addComponent(page, "page", { x: 160, y: 160, label: "Flow" });
  const button = await addComponent(page, "button", { x: 260, y: 280, label: "Go" });

  await page.evaluate((nodeId) => window.__APP_TEST_API__.selectNode(nodeId), button.id);
  await expect(page.getByTestId("button-controls")).toBeVisible();
  await waitForPaint(page);

  await page.evaluate(
    ({ id, position }) => window.__APP_TEST_API__.moveNode(id, position),
    { id: pageNode.id, position: { x: 300, y: 220 } },
  );
  await waitForPaint(page);

  const buttonSnapshot = await getNode(page, button.id);
  expect(buttonSnapshot.parentId).toBe(pageNode.id);

  const buttonTopCenter = await canvasPointToPage(page, {
    x: buttonSnapshot.bounds.x + buttonSnapshot.bounds.width / 2,
    y: buttonSnapshot.bounds.y,
  });
  const panelBox = await page.getByTestId("button-controls").boundingBox();
  expect(panelBox).toBeTruthy();
  expect(panelBox.y + panelBox.height).toBeLessThanOrEqual(buttonTopCenter.y - 18);
  expect(Math.abs(panelBox.x + panelBox.width / 2 - buttonTopCenter.x)).toBeLessThan(24);
});

test("selected unconnected button starts a target connection by default", async ({ page }) => {
  const button = await addComponent(page, "button", { x: 180, y: 180, label: "Go" });
  const target = await addComponent(page, "sticky", { x: 560, y: 220, text: "Target" });
  const targetCenter = await getNodePageCenter(page, target.id);

  await page.evaluate((nodeId) => window.__APP_TEST_API__.selectNode(nodeId), button.id);
  await waitForPaint(page);

  await page.mouse.move(targetCenter.x, targetCenter.y);
  await page.mouse.click(targetCenter.x, targetCenter.y);

  await expect
    .poll(async () => page.evaluate(({ sourceId, targetId }) => (
      window.__APP_TEST_API__.listNodes().some((node) => (
        node.componentType === "connection" &&
        node.summary.sourceNodeId === sourceId &&
        node.summary.targetNodeId === targetId &&
        node.summary.hiddenUntilEndpointSelected === true
      ))
    ), { sourceId: button.id, targetId: target.id }))
    .toBe(true);
});

test("selected button click edits its label inline", async ({ page }) => {
  const button = await addComponent(page, "button", { x: 220, y: 180, label: "Go" });
  const center = await getNodePageCenter(page, button.id);

  await page.evaluate((nodeId) => window.__APP_TEST_API__.selectNode(nodeId), button.id);

  await expect(page.getByTestId("button-controls")).toBeVisible();
  await expect(page.getByTestId("canvas-button-text-editor")).toHaveCount(0);

  await page.mouse.dblclick(center.x, center.y);
  const editor = page.getByTestId("canvas-button-text-editor");
  await expect(editor).toBeVisible();
  const editorBox = await editor.boundingBox();
  expect(editorBox).toBeTruthy();
  expect(editorBox.width).toBeLessThan(100);
  expect(editorBox.height).toBeLessThan(40);

  await editor.fill("Launch");
  await page.mouse.click(center.x + 220, center.y + 120);

  await expect(editor).toHaveCount(0);
  await expect
    .poll(async () => (await getNode(page, button.id))?.summary?.label ?? "")
    .toBe("Launch");

  await page.getByTestId("undo-action").click();
  await expect
    .poll(async () => (await getNode(page, button.id))?.summary?.label ?? "")
    .toBe("Go");

  await page.getByTestId("redo-action").click();
  await expect
    .poll(async () => (await getNode(page, button.id))?.summary?.label ?? "")
    .toBe("Launch");

  await page.evaluate(() => {
    window.__buttonContextMenuPrevented = null;
    document.addEventListener("contextmenu", (event) => {
      window.setTimeout(() => {
        window.__buttonContextMenuPrevented = event.defaultPrevented;
      }, 0);
    }, { capture: true, once: true });
  });
  await page.mouse.click(center.x, center.y, { button: "right" });
  await expect.poll(async () => page.evaluate(() => window.__buttonContextMenuPrevented)).toBe(true);
  await expect.poll(async () => (
    page.locator(".toolbar__button-layer-tool").evaluate((element) => element.matches(":focus-within"))
  )).toBe(true);
  await expect(page.getByText("Edit...")).toHaveCount(0);
  await expect(page.getByTestId("button-layer-bring-forward")).toBeDisabled();
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
  await expect(page.getByTestId("save-focus")).toHaveCount(0);
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
  const source = await addComponent(page, "page", { x: 180, y: 180, label: "Source" });
  const target = await addComponent(page, "page", { x: 1800, y: 180, label: "Target" });

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

test("shows presentation navigation buttons for nearby connected pages", async ({ page }) => {
  const source = await addComponent(page, "page", { x: 0, y: 120, label: "Source" });
  const target = await addComponent(page, "page", { x: 1000, y: 120, label: "Target" });

  await page.evaluate(
    ({ sourceId, targetId }) => window.__APP_TEST_API__.createConnection(sourceId, targetId),
    { sourceId: source.id, targetId: target.id },
  );

  await page.getByTestId("mode-capsule-present").click();
  await expect.poll(async () => page.evaluate(() => window.__APP_TEST_API__.getMode())).toBe(
    "presentation",
  );
  await page.waitForTimeout(450);

  const viewport = await page.evaluate((nodeId) => (
    window.__APP_TEST_API__.centerOnNode(nodeId, { duration: 0, scale: 0.5 }) &&
      window.__APP_TEST_API__.getViewportState()
  ), source.id);
  const targetFocus = await page.evaluate(
    (nodeId) => window.__APP_TEST_API__.getComputedFocus(nodeId),
    target.id,
  );
  expect(targetFocus.center.x).toBeGreaterThan(viewport.viewport.x);
  expect(targetFocus.center.x).toBeLessThan(viewport.viewport.x + viewport.viewport.width);
  expect(targetFocus.center.y).toBeGreaterThan(viewport.viewport.y);
  expect(targetFocus.center.y).toBeLessThan(viewport.viewport.y + viewport.viewport.height);
  await waitForPaint(page);

  await expect
    .poll(async () => page.evaluate(() => window.__APP_TEST_API__.getNavigationButtons().length))
    .toBeGreaterThan(0);

  await page.evaluate(() => window.__APP_TEST_API__.clickNavigationButton(0));

  await expect
    .poll(async () => {
      const current = await page.evaluate(() => window.__APP_TEST_API__.getViewportState());
      return Math.abs(current.center.x - targetFocus.center.x);
    })
    .toBeLessThan(4);
});

test("navigates connected pages with arrow keys using direction first and distance second", async ({ page }) => {
  const source = await addComponent(page, "page", { x: 1200, y: 1200, label: "Source" });
  const rightTarget = await addComponent(page, "page", { x: 2400, y: 1200, label: "Right" });
  const diagonalTarget = await addComponent(page, "page", { x: 1980, y: 760, label: "Diagonal" });
  const nearUpTarget = await addComponent(page, "page", { x: 1200, y: 260, label: "Near Up" });
  const farUpTarget = await addComponent(page, "page", { x: 1200, y: -760, label: "Far Up" });

  await page.evaluate(
    async ({ sourceId, rightId, diagonalId, nearUpId, farUpId }) => {
      await window.__APP_TEST_API__.createConnection(sourceId, rightId);
      await window.__APP_TEST_API__.createConnection(sourceId, diagonalId);
      await window.__APP_TEST_API__.createConnection(sourceId, nearUpId);
      await window.__APP_TEST_API__.createConnection(sourceId, farUpId);
    },
    {
      sourceId: source.id,
      rightId: rightTarget.id,
      diagonalId: diagonalTarget.id,
      nearUpId: nearUpTarget.id,
      farUpId: farUpTarget.id,
    },
  );

  await page.evaluate((nodeId) => window.__APP_TEST_API__.centerOnNode(nodeId, { duration: 0 }), source.id);
  await page.getByTestId("mode-capsule-present").click();
  await expect.poll(async () => page.evaluate(() => window.__APP_TEST_API__.getMode())).toBe(
    "presentation",
  );
  await page.waitForTimeout(450);

  await expect.poll(async () => (
    page.evaluate(() => window.__APP_TEST_API__.getCurrentPresentationPageId())
  )).toBe(source.id);

  await expect.poll(async () => (
    page.evaluate(() => window.__APP_TEST_API__.getDirectionalPageNavigationTargetId("right"))
  )).toBe(rightTarget.id);

  await page.keyboard.press("ArrowRight");

  const expectedRightFocus = await page.evaluate(
    (nodeId) => window.__APP_TEST_API__.getComputedFocus(nodeId),
    rightTarget.id,
  );
  await expect
    .poll(async () => {
      const current = await page.evaluate(() => window.__APP_TEST_API__.getViewportState());
      return Math.abs(current.center.x - expectedRightFocus.center.x);
    })
    .toBeLessThan(4);
  await expect
    .poll(async () => {
      const current = await page.evaluate(() => window.__APP_TEST_API__.getViewportState());
      return Math.abs(current.center.y - expectedRightFocus.center.y);
    })
    .toBeLessThan(4);

  await page.evaluate((nodeId) => window.__APP_TEST_API__.centerOnNode(nodeId, { duration: 0 }), source.id);
  await waitForPaint(page);

  await expect.poll(async () => (
    page.evaluate(() => window.__APP_TEST_API__.getDirectionalPageNavigationTargetId("up"))
  )).toBe(nearUpTarget.id);

  await page.keyboard.press("ArrowUp");

  const expectedUpFocus = await page.evaluate(
    (nodeId) => window.__APP_TEST_API__.getComputedFocus(nodeId),
    nearUpTarget.id,
  );
  await expect
    .poll(async () => {
      const current = await page.evaluate(() => window.__APP_TEST_API__.getViewportState());
      return Math.abs(current.center.x - expectedUpFocus.center.x);
    })
    .toBeLessThan(4);
  await expect
    .poll(async () => {
      const current = await page.evaluate(() => window.__APP_TEST_API__.getViewportState());
      return Math.abs(current.center.y - expectedUpFocus.center.y);
    })
    .toBeLessThan(4);
});

test("does not show presentation navigation buttons for visible page targets or non-page connections", async ({ page }) => {
  const sticky = await addComponent(page, "sticky", { x: 80, y: 80 });
  const pageNode = await addComponent(page, "page", { x: 460, y: 120, label: "Page" });
  const firstPage = await addComponent(page, "page", { x: 1560, y: 120, label: "First Page" });
  const secondPage = await addComponent(page, "page", { x: 2600, y: 120, label: "Second Page" });

  await page.evaluate(
    async ({ stickyId, pageId, firstPageId, secondPageId }) => {
      await window.__APP_TEST_API__.createConnection(stickyId, pageId);
      await window.__APP_TEST_API__.createConnection(firstPageId, secondPageId);
    },
    {
      stickyId: sticky.id,
      pageId: pageNode.id,
      firstPageId: firstPage.id,
      secondPageId: secondPage.id,
    },
  );

  await page.evaluate((viewport) => window.__APP_TEST_API__.setViewport(viewport), {
    scale: 0.35,
    position: { x: 0, y: 80 },
  });
  await page.getByTestId("mode-capsule-present").click();
  await expect.poll(async () => page.evaluate(() => window.__APP_TEST_API__.getMode())).toBe(
    "presentation",
  );
  await page.waitForTimeout(450);

  await expect
    .poll(async () => page.evaluate(() => window.__APP_TEST_API__.getNavigationButtons().length))
    .toBe(0);
});

test("does not show presentation navigation buttons for hidden connections", async ({ page }) => {
  const source = await addComponent(page, "page", { x: 180, y: 180, label: "Source" });
  const target = await addComponent(page, "page", { x: 1800, y: 180, label: "Target" });

  const connection = await page.evaluate(
    ({ sourceId, targetId }) => window.__APP_TEST_API__.createConnection(sourceId, targetId),
    { sourceId: source.id, targetId: target.id },
  );

  await page.evaluate((nodeId) => window.__APP_TEST_API__.selectNode(nodeId), connection.id);
  await expect(page.getByTestId("connection-panel")).toBeVisible();
  await page.getByTestId("connection-hidden-toggle").click();

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

test("edits sticky notes from the floating toolbar and inline text editor", async ({ page }) => {
  const sticky = await addComponent(page, "sticky", { x: 220, y: 220 });
  await page.evaluate(
    (nodeId) => window.__APP_TEST_API__.resizeNodeBox(nodeId, { width: 360, height: 260 }),
    sticky.id,
  );
  const center = await getNodePageCenter(page, sticky.id);

  await page.evaluate((nodeId) => window.__APP_TEST_API__.selectNode(nodeId), sticky.id);
  await page.evaluate(() => window.__APP_TEST_API__.resetHistory());
  await waitForPaint(page);

  await expect(page.getByTestId("sticky-panel")).toBeVisible();
  await expect(page.getByTestId("sticky-font-size")).toHaveValue("20");
  await expect(page.getByTestId("sticky-fill-color")).toHaveValue("#ffe082");
  await expect(page.getByTestId("sticky-opacity")).toHaveValue("1");
  await expect(page.getByTestId("sticky-opacity-value")).toHaveText("100%");
  await expect(page.getByTestId("sticky-text-color")).toHaveValue("#47361c");
  await page.getByTestId("sticky-style-fill").click();
  await expect(page.locator("#sticky-fill-swatches .toolbar__button-color-swatch")).toHaveCount(9);
  await expect(page.locator("#sticky-fill-swatches .toolbar__button-custom-trigger")).toHaveCount(1);
  const fillPopoverLeft = await page.locator(
    "#sticky-fill-style-trigger + .toolbar__button-style-popover",
  ).evaluate((element) => Math.round(element.getBoundingClientRect().left));
  await page.getByTestId("sticky-style-text-color").click();
  const switchedPopoverState = await page.evaluate(() => {
    const fillPopover = document.querySelector(
      "#sticky-fill-style-trigger + .toolbar__button-style-popover",
    );
    const textPopover = document.querySelector(
      "#sticky-text-style-trigger + .toolbar__button-style-popover",
    );
    return {
      fillOpacity: getComputedStyle(fillPopover).opacity,
      fillPointerEvents: getComputedStyle(fillPopover).pointerEvents,
      textLeft: Math.round(textPopover.getBoundingClientRect().left),
      textActive: document.activeElement?.id === "sticky-text-style-trigger",
    };
  });
  expect(switchedPopoverState).toEqual(expect.objectContaining({
    fillOpacity: "0",
    fillPointerEvents: "none",
    textActive: true,
  }));
  expect(Math.abs(switchedPopoverState.textLeft - fillPopoverLeft)).toBeLessThanOrEqual(360);
  await expect(page.locator("#sticky-text-swatches .toolbar__button-color-swatch")).toHaveCount(8);
  await expect(page.locator("#sticky-text-swatches .toolbar__button-custom-trigger")).toHaveCount(1);
  const layerBox = await page.getByTestId("sticky-layer-menu").boundingBox();
  await page.mouse.move(layerBox.x + layerBox.width / 2, layerBox.y + layerBox.height / 2);
  await page.mouse.down();
  const layerSwitchState = await page.evaluate(() => {
    const textPopover = document.querySelector(
      "#sticky-text-style-trigger + .toolbar__button-style-popover",
    );
    const layerTrigger = document.querySelector("#sticky-layer-menu-trigger");
    const layerPopover = document.querySelector(".toolbar__sticky-layer-popover");
    const triggerRect = layerTrigger.getBoundingClientRect();
    const layerRect = layerPopover.getBoundingClientRect();
    return {
      textOpacity: getComputedStyle(textPopover).opacity,
      textPointerEvents: getComputedStyle(textPopover).pointerEvents,
      layerOpacity: getComputedStyle(layerPopover).opacity,
      layerActive: document.activeElement?.id === "sticky-layer-menu-trigger",
      layerLeft: Math.round(layerRect.left),
      triggerRight: Math.round(triggerRect.right),
    };
  });
  expect(layerSwitchState).toEqual(expect.objectContaining({
    textOpacity: "0",
    textPointerEvents: "none",
    layerOpacity: "1",
    layerActive: true,
  }));
  expect(layerSwitchState.layerLeft).toBeGreaterThanOrEqual(layerSwitchState.triggerRight);
  await page.mouse.up();

  await page.getByTestId("sticky-font-size").evaluate((input) => {
    input.value = "30";
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await page.getByTestId("sticky-fill-color").evaluate((input) => {
    input.value = "#bbf7d0";
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await page.getByTestId("sticky-opacity").evaluate((input) => {
    input.value = "0.5";
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await page.getByTestId("sticky-text-color").evaluate((input) => {
    input.value = "#14532d";
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });

  await expect
    .poll(async () => (await getNode(page, sticky.id))?.summary ?? {})
    .toEqual(expect.objectContaining({
      fill: "#bbf7d0",
      fillOpacity: 0.5,
      textColor: "#14532d",
      fontSize: 30,
    }));

  await page.evaluate(() => {
    window.__APP_TEST_API__.undo();
    window.__APP_TEST_API__.undo();
    window.__APP_TEST_API__.undo();
    window.__APP_TEST_API__.undo();
  });
  await expect
    .poll(async () => (await getNode(page, sticky.id))?.summary ?? {})
    .toEqual(expect.objectContaining({
      fill: "#ffe082",
      fillOpacity: 1,
      textColor: "#47361c",
      fontSize: 20,
    }));

  await page.evaluate(() => {
    window.__APP_TEST_API__.redo();
    window.__APP_TEST_API__.redo();
    window.__APP_TEST_API__.redo();
    window.__APP_TEST_API__.redo();
  });
  await expect
    .poll(async () => (await getNode(page, sticky.id))?.summary ?? {})
    .toEqual(expect.objectContaining({
      fill: "#bbf7d0",
      fillOpacity: 0.5,
      textColor: "#14532d",
      fontSize: 30,
    }));

  await page.mouse.dblclick(center.x, center.y);
  await expect(page.getByTestId("canvas-text-editor")).toBeVisible();
  await page.getByTestId("canvas-text-editor").fill("Updated from Playwright");
  await page.getByTestId("canvas-text-editor").press("Control+Enter");
  await expect
    .poll(async () => (await getNode(page, sticky.id))?.summary?.text ?? "")
    .toBe("Updated from Playwright");


  await page.evaluate(() => {
    window.__stickyContextMenuPrevented = null;
    document.addEventListener("contextmenu", (event) => {
      window.setTimeout(() => {
        window.__stickyContextMenuPrevented = event.defaultPrevented;
      }, 0);
    }, { capture: true, once: true });
  });
  await page.mouse.click(center.x, center.y, { button: "right" });
  await expect.poll(async () => page.evaluate(() => window.__stickyContextMenuPrevented)).toBe(true);
  await expect.poll(async () => (
    page.locator(".toolbar__sticky-layer-tool").evaluate((element) => element.matches(":focus-within"))
  )).toBe(true);
  await expect(page.getByTestId("sticky-layer-bring-forward")).toBeDisabled();

  const exported = await page.evaluate(() => window.__APP_TEST_API__.exportDocument());
  await page.evaluate(() => window.__APP_TEST_API__.clearBoard());
  await page.evaluate((snapshot) => window.__APP_TEST_API__.loadDocument(snapshot), exported);

  await expect
    .poll(async () => (await getNode(page, sticky.id))?.summary ?? {})
    .toEqual(expect.objectContaining({
      text: "Updated from Playwright",
      fill: "#bbf7d0",
      textColor: "#14532d",
      fontSize: 30,
    }));
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

  await expect
    .poll(async () => (await getNode(page, editor.id))?.summary?.title ?? "")
    .toBe("Sandbox");

  await page.evaluate(
    ({ nodeId, code: nextCode }) => window.__APP_TEST_API__.setJavaScriptEditorCode(nodeId, nextCode),
    { nodeId: editor.id, code: secondCode },
  );
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
    .toBe("Sandbox");
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

  await page.getByTestId("javascript-editor-header").click({ button: "right" });
  await expect(page.locator(".toolbar__javascript-editor-layer-popover")).toHaveCSS(
    "pointer-events",
    "auto",
  );
  await expect(page.getByText("Edit...")).toHaveCount(0);

  const rect = await page.evaluate(() => window.__APP_TEST_API__.getCanvasContainerRect());
  await page.mouse.click(rect.left + rect.width - 48, rect.top + rect.height / 2);
  await expect
    .poll(async () => page.locator(".toolbar__javascript-editor-layer-tool").evaluate((element) => (
      element.matches(":focus-within")
    )))
    .toBe(false);

  const frame = page.frameLocator('[data-testid="javascript-editor-preview"]');
  await frame.getByTestId("js-result").click({ button: "right" });
  await expect(page.locator(".toolbar__javascript-editor-layer-popover")).toHaveCSS(
    "pointer-events",
    "auto",
  );

  await page.mouse.click(rect.left + rect.width - 48, rect.top + rect.height / 2);
  await expect
    .poll(async () => page.locator(".toolbar__javascript-editor-layer-tool").evaluate((element) => (
      element.matches(":focus-within")
    )))
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
  await page.mouse.click(headerBox.x + 24, headerBox.y + headerBox.height / 2);
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

test("shows iframe actions in the embedded header bar without reopening the modal editor", async ({ page }) => {
  const iframeUrl = buildIframePageUrl({ title: "Toolbar iframe" });
  const iframe = await addComponent(page, "iframe", {
    x: 420,
    y: 220,
    url: iframeUrl,
  });
  const center = await getNodePageCenter(page, iframe.id);

  await page.evaluate((nodeId) => window.__APP_TEST_API__.selectNode(nodeId), iframe.id);
  await waitForPaint(page);

  await expect(page.getByTestId("iframe-header-bar")).toBeVisible();
  await expect(page.getByTestId("iframe-url-input")).toHaveValue(iframeUrl);
  await expect(page.getByTestId("iframe-url-apply")).toHaveCount(0);
  await expect(page.getByTestId("iframe-interact")).toBeVisible();
  await expect(page.getByTestId("iframe-connect")).toBeVisible();
  await expect(page.getByTestId("iframe-layer-menu")).toBeVisible();
  const headerLayout = await page.locator(".iframe-component__overlay").evaluate((overlay) => {
    const header = overlay.querySelector(".iframe-component__topbar");
    const input = overlay.querySelector("[data-testid='iframe-url-input']");
    const interact = overlay.querySelector("[data-testid='iframe-interact']");
    const link = overlay.querySelector("[data-testid='iframe-connect']");
    const menu = overlay.querySelector("[data-testid='iframe-layer-menu']");
    const toBox = (element) => {
      const rect = element?.getBoundingClientRect?.();
      return rect
        ? {
          left: rect.left,
          right: rect.right,
          top: rect.top,
          bottom: rect.bottom,
          width: rect.width,
        }
        : null;
    };

    return {
      header: toBox(header),
      input: toBox(input),
      interact: toBox(interact),
      link: toBox(link),
      menu: toBox(menu),
    };
  });
  expect(headerLayout.input.width).toBeGreaterThan(120);
  expect(headerLayout.input.left).toBeGreaterThanOrEqual(headerLayout.header.left - 1);
  expect(headerLayout.input.right).toBeLessThanOrEqual(headerLayout.header.right + 1);
  expect(headerLayout.interact.top).toBeGreaterThanOrEqual(headerLayout.header.top - 1);
  expect(headerLayout.interact.bottom).toBeLessThanOrEqual(headerLayout.header.bottom + 2);
  expect(headerLayout.link.top).toBeGreaterThanOrEqual(headerLayout.header.top - 1);
  expect(headerLayout.link.bottom).toBeLessThanOrEqual(headerLayout.header.bottom + 2);
  expect(headerLayout.menu.top).toBeGreaterThanOrEqual(headerLayout.header.top - 1);
  expect(headerLayout.menu.bottom).toBeLessThanOrEqual(headerLayout.header.bottom + 2);
  await expect.poll(async () => (await getNode(page, iframe.id))?.summary ?? null).toMatchObject({
    hasOverlay: true,
    hasShield: true,
    shieldHidden: false,
    framePointerEvents: "none",
  });
  await page.mouse.dblclick(center.x, center.y);
  await expect(page.getByText("Edit...")).toHaveCount(0);
});

test("edits iframe URL from the embedded header bar and preserves it through undo, reload, and present mode", async ({ page }) => {
  const firstUrl = buildIframePageUrl({ title: "Initial iframe page", clickedText: "first-click" });
  const secondUrl = buildIframePageUrl({ title: "Updated iframe page", clickedText: "updated-click" });
  const iframe = await addComponent(page, "iframe", { x: 240, y: 180 });
  const iframeId = iframe.id;

  await page.evaluate((nodeId) => window.__APP_TEST_API__.selectNode(nodeId), iframeId);
  await expect(page.getByTestId("iframe-header-bar")).toBeVisible();
  await expect.poll(async () => (await getNode(page, iframeId))?.summary?.url ?? null).toBe("");
  await expect(page.getByTestId("iframe-url-input")).toHaveValue("");
  await expect(page.getByTestId("iframe-url-apply")).toHaveCount(0);
  await page.getByTestId("iframe-url-input").focus();
  await setInputValue(page, "iframe-url-input", firstUrl);
  await page.getByTestId("iframe-url-input").press("Enter");

  await expect.poll(async () => (await getNode(page, iframeId))?.summary ?? null).toMatchObject({
    url: firstUrl,
    hasOverlay: true,
    hasShield: true,
    shieldHidden: false,
    framePointerEvents: "none",
    frameSrc: firstUrl,
  });

  await page.evaluate(() => window.__APP_TEST_API__.undo());
  await expect.poll(async () => (await getNode(page, iframeId))?.summary ?? null).toMatchObject({
    url: "",
    hasOverlay: true,
    frameSrc: "about:blank",
  });

  await page.evaluate(() => window.__APP_TEST_API__.redo());
  await expect.poll(async () => (await getNode(page, iframeId))?.summary?.url ?? null).toBe(firstUrl);
  await expect(page.getByTestId("iframe-url-input")).toHaveValue(firstUrl);
  await expect(page.getByTestId("iframe-interact")).toBeVisible();

  await page.getByTestId("iframe-connect").click();
  await expect
    .poll(async () => page.evaluate(() => window.__APP_TEST_API__.getActiveConnectionSourceId()))
    .toBe(iframeId);

  await page.getByTestId("iframe-layer-menu").click();
  await expect(page.getByTestId("iframe-layer-bring-forward")).toBeVisible();
  await expect(page.getByTestId("iframe-layer-send-backward")).toBeVisible();
  await expect(page.getByTestId("iframe-layer-edit")).toHaveCount(0);
  const menuTriggerBox = await page.getByTestId("iframe-layer-menu").boundingBox();
  const layerMenuBox = await page.locator(".toolbar__iframe-layer-popover").boundingBox();
  expect(menuTriggerBox).toBeTruthy();
  expect(layerMenuBox).toBeTruthy();
  expect(Math.abs((layerMenuBox?.x ?? 0) - (menuTriggerBox?.x ?? 0))).toBeLessThan(180);
  expect(Math.abs((layerMenuBox?.y ?? 0) - ((menuTriggerBox?.y ?? 0) + (menuTriggerBox?.height ?? 0)))).toBeLessThan(120);
  await page.getByTestId("iframe-layer-menu").click();
  await expect(page.locator(".toolbar__iframe-layer-popover")).toHaveCSS("pointer-events", "none");
  await setInputValue(page, "iframe-url-input", "openai.com/iframe-updated");
  await page.getByTestId("iframe-url-input").press("Enter");
  const normalizedSecondUrl = "https://openai.com/iframe-updated";
  await expect.poll(async () => (await getNode(page, iframeId))?.summary?.url ?? null).toBe(normalizedSecondUrl);
  await expect(page.getByTestId("iframe-url-input")).toHaveValue(normalizedSecondUrl);

  await setInputValue(page, "iframe-url-input", secondUrl);
  await page.getByTestId("iframe-url-input").press("Enter");
  await expect.poll(async () => (await getNode(page, iframeId))?.summary?.url ?? null).toBe(secondUrl);
  await expect(page.getByTestId("iframe-url-input")).toHaveValue(secondUrl);

  await page.getByTestId("iframe-interact").click();
  await expect.poll(async () => (await getNode(page, iframeId))?.summary ?? null).toMatchObject({
    interactive: true,
    shieldHidden: true,
    framePointerEvents: "auto",
  });

  let frame = page.frameLocator(".iframe-component__frame");
  await frame.getByTestId("iframe-action").click();
  await expect(frame.getByTestId("click-status")).toHaveText("updated-click");

  await page.getByTestId("iframe-interact").click();
  await expect.poll(async () => (await getNode(page, iframeId))?.summary ?? null).toMatchObject({
    interactive: false,
    shieldHidden: false,
    framePointerEvents: "none",
  });

  const exported = await page.evaluate(() => window.__APP_TEST_API__.exportDocument());
  await page.evaluate(() => window.__APP_TEST_API__.clearBoard());
  await page.evaluate((snapshot) => window.__APP_TEST_API__.loadDocument(snapshot), exported);
  await expect.poll(async () => (await getNode(page, iframeId))?.summary?.url ?? null).toBe(secondUrl);
  await page.evaluate((nodeId) => window.__APP_TEST_API__.selectNode(nodeId), iframeId);
  await expect(page.getByTestId("iframe-url-input")).toHaveValue(secondUrl);

  const centerAfterReload = await getNodePageCenter(page, iframeId);
  await page.mouse.click(centerAfterReload.x, centerAfterReload.y, { button: "right" });
  await expect(page.locator(".toolbar__iframe-layer-popover")).toHaveCSS("pointer-events", "auto");
  await expect(page.getByTestId("iframe-layer-bring-forward")).toBeVisible();
  await expect(page.getByTestId("iframe-layer-send-backward")).toBeVisible();
  await expect(page.getByTestId("iframe-layer-edit")).toHaveCount(0);

  await page.evaluate(() => window.__APP_TEST_API__.setMode("presentation"));
  await expect(page.getByTestId("iframe-header-bar")).toBeHidden();
  await expect.poll(async () => (await getNode(page, iframeId))?.summary ?? null).toMatchObject({
    interactive: true,
    shieldHidden: true,
    framePointerEvents: "auto",
  });

  frame = page.frameLocator(".iframe-component__frame");
  await frame.getByTestId("iframe-action").click();
  await expect(frame.getByTestId("click-status")).toHaveText("updated-click");

  await page.evaluate(() => window.__APP_TEST_API__.setMode("edit"));
  await page.evaluate((nodeId) => window.__APP_TEST_API__.selectNode(nodeId), iframeId);
  await expect.poll(async () => (await getNode(page, iframeId))?.summary ?? null).toMatchObject({
    interactive: false,
    shieldHidden: false,
    framePointerEvents: "none",
  });
});

test("keeps iframe chrome corners consistent and reorders layers from the iframe menu", async ({ page }) => {
  const iframe = await addComponent(page, "iframe", {
    x: 260,
    y: 180,
    url: buildIframePageUrl({ title: "Layered iframe" }),
  });
  const sticky = await addComponent(page, "sticky", {
    x: 320,
    y: 240,
  });

  await page.evaluate((nodeId) => window.__APP_TEST_API__.selectNode(nodeId), iframe.id);
  await expect(page.getByTestId("iframe-header-bar")).toBeVisible();

  const chrome = await page.locator(".iframe-component__overlay").evaluate((overlay) => {
    const topbar = overlay.querySelector(".iframe-component__topbar");
    const body = overlay.querySelector(".iframe-component__body");
    const viewport = overlay.querySelector(".iframe-component__viewport");
    const overlayStyle = getComputedStyle(overlay);
    const topbarStyle = topbar ? getComputedStyle(topbar) : null;
    const bodyStyle = body ? getComputedStyle(body) : null;
    const viewportStyle = viewport ? getComputedStyle(viewport) : null;

    return {
      overlay: {
        overflow: overlayStyle.overflow,
        topLeft: overlayStyle.borderTopLeftRadius,
        topRight: overlayStyle.borderTopRightRadius,
        bottomLeft: overlayStyle.borderBottomLeftRadius,
        bottomRight: overlayStyle.borderBottomRightRadius,
      },
      topbar: topbarStyle ? {
        topLeft: topbarStyle.borderTopLeftRadius,
        topRight: topbarStyle.borderTopRightRadius,
      } : null,
      body: bodyStyle ? {
        overflow: bodyStyle.overflow,
        bottomLeft: bodyStyle.borderBottomLeftRadius,
        bottomRight: bodyStyle.borderBottomRightRadius,
      } : null,
      viewport: viewportStyle ? {
        overflow: viewportStyle.overflow,
      } : null,
    };
  });

  expect(chrome).toEqual({
    overlay: {
      overflow: "hidden",
      topLeft: "18px",
      topRight: "18px",
      bottomLeft: "18px",
      bottomRight: "18px",
    },
    topbar: {
      topLeft: "18px",
      topRight: "18px",
    },
    body: {
      overflow: "hidden",
      bottomLeft: "18px",
      bottomRight: "18px",
    },
    viewport: {
      overflow: "hidden",
    },
  });

  await expect.poll(async () => getNodeOrder(page, [iframe.id, sticky.id])).toEqual([
    iframe.id,
    sticky.id,
  ]);
  const initialOverlayZIndex = Number((await getNode(page, iframe.id))?.summary?.overlayZIndex ?? 0);

  await page.getByTestId("iframe-layer-menu").click();
  await expect(page.getByTestId("iframe-layer-bring-forward")).toBeEnabled();
  await expect(page.getByTestId("iframe-layer-send-backward")).toBeDisabled();
  await page.getByTestId("iframe-layer-bring-forward").click();
  await expect.poll(async () => getNodeOrder(page, [iframe.id, sticky.id])).toEqual([
    sticky.id,
    iframe.id,
  ]);
  await expect.poll(async () => Number((await getNode(page, iframe.id))?.summary?.overlayZIndex ?? 0))
    .toBeGreaterThan(initialOverlayZIndex);

  await page.getByTestId("iframe-layer-menu").click();
  await expect(page.getByTestId("iframe-layer-send-backward")).toBeEnabled();
  await page.getByTestId("iframe-layer-send-backward").click();
  await expect.poll(async () => getNodeOrder(page, [iframe.id, sticky.id])).toEqual([
    iframe.id,
    sticky.id,
  ]);

  await page.evaluate(() => window.__APP_TEST_API__.undo());
  await expect.poll(async () => getNodeOrder(page, [iframe.id, sticky.id])).toEqual([
    sticky.id,
    iframe.id,
  ]);

  await page.evaluate(() => window.__APP_TEST_API__.redo());
  await expect.poll(async () => getNodeOrder(page, [iframe.id, sticky.id])).toEqual([
    iframe.id,
    sticky.id,
  ]);
});

test("zooms the canvas around the pointer, clamps minimum scale, and preserves viewport through document reload", async ({ page }) => {
  const sticky = await addComponent(page, "sticky", {
    x: 220,
    y: 180,
  });
  const iframe = await addComponent(page, "iframe", {
    x: 520,
    y: 260,
    url: buildIframePageUrl({ title: "Viewport restore iframe" }),
  });

  await page.evaluate(() => window.__APP_TEST_API__.setViewport({
    scale: 1,
    position: { x: 0, y: 0 },
  }));
  await waitForPaint(page);

  const stickyBefore = await getNode(page, sticky.id);
  const iframeBefore = await getNode(page, iframe.id);
  const canvasRect = await page.evaluate(() => window.__APP_TEST_API__.getCanvasContainerRect());
  const pointer = {
    x: canvasRect.left + 140,
    y: canvasRect.top + 140,
  };
  const canvasPointAtPointer = async () => page.evaluate(({ x, y }) => {
    const rect = window.__APP_TEST_API__.getCanvasContainerRect();
    const viewport = window.__APP_TEST_API__.getViewportState();
    return {
      x: (x - rect.left - viewport.position.x) / viewport.scale,
      y: (y - rect.top - viewport.position.y) / viewport.scale,
    };
  }, pointer);
  const pointerCanvasBefore = await canvasPointAtPointer();

  await page.mouse.move(pointer.x, pointer.y);
  for (let index = 0; index < 5; index += 1) {
    await page.mouse.wheel(0, -120);
  }
  await waitForPaint(page);

  const zoomedViewport = await page.evaluate(() => window.__APP_TEST_API__.getViewportState());
  const pointerCanvasAfterZoom = await canvasPointAtPointer();
  expect(zoomedViewport.scale).toBeGreaterThan(1);
  expect(pointerCanvasAfterZoom.x).toBeCloseTo(pointerCanvasBefore.x, 3);
  expect(pointerCanvasAfterZoom.y).toBeCloseTo(pointerCanvasBefore.y, 3);
  expect((await getNode(page, iframe.id)).bounds).toEqual(iframeBefore.bounds);
  expect((await getNode(page, sticky.id)).bounds).toEqual(stickyBefore.bounds);

  await page.mouse.move(pointer.x, pointer.y);
  for (let index = 0; index < 120; index += 1) {
    await page.mouse.wheel(0, 120);
  }
  await waitForPaint(page);

  const clampedViewport = await page.evaluate(() => window.__APP_TEST_API__.getViewportState());
  expect(clampedViewport.scale).toBeCloseTo(0.1, 6);
  expect(clampedViewport.scale).toBeGreaterThanOrEqual(0.1);
  expect((await getNode(page, sticky.id)).bounds).toEqual(stickyBefore.bounds);
  expect((await getNode(page, iframe.id)).bounds).toEqual(iframeBefore.bounds);

  const exported = await page.evaluate(() => window.__APP_TEST_API__.exportDocument());
  const viewportBeforeReload = await page.evaluate(() => window.__APP_TEST_API__.getViewportState());
  await page.evaluate(() => window.__APP_TEST_API__.clearBoard());
  await page.evaluate((snapshot) => window.__APP_TEST_API__.loadDocument(snapshot), exported);
  await waitForPaint(page);

  const restoredViewport = await page.evaluate(() => window.__APP_TEST_API__.getViewportState());
  expect(restoredViewport.scale).toBeCloseTo(viewportBeforeReload.scale, 6);
  expect(restoredViewport.position.x).toBeCloseTo(viewportBeforeReload.position.x, 3);
  expect(restoredViewport.position.y).toBeCloseTo(viewportBeforeReload.position.y, 3);
  expect((await getNode(page, sticky.id)).bounds).toEqual(stickyBefore.bounds);
  expect((await getNode(page, iframe.id)).bounds).toEqual(iframeBefore.bounds);
});

test("keeps iframe action buttons from triggering drag and still allows dragging from the shield", async ({ page }) => {
  const iframe = await addComponent(page, "iframe", {
    x: 280,
    y: 220,
    url: buildIframePageUrl({ title: "Iframe controls" }),
  });
  await page.evaluate((nodeId) => window.__APP_TEST_API__.selectNode(nodeId), iframe.id);
  await waitForPaint(page);

  const before = await getNode(page, iframe.id);

  await page.getByTestId("iframe-connect").click();
  await expect
    .poll(async () => page.evaluate(() => window.__APP_TEST_API__.getActiveConnectionSourceId()))
    .toBe(iframe.id);
  expect((await getNode(page, iframe.id)).bounds).toEqual(before.bounds);

  await page.getByTestId("iframe-layer-menu").click();
  await expect(page.locator(".toolbar__iframe-layer-popover")).toHaveCSS("pointer-events", "auto");
  expect((await getNode(page, iframe.id)).bounds).toEqual(before.bounds);
  await page.getByTestId("iframe-layer-menu").click();

  await page.getByTestId("iframe-interact").click();
  await expect.poll(async () => (await getNode(page, iframe.id))?.summary ?? null).toMatchObject({
    interactive: true,
    framePointerEvents: "auto",
  });
  await expect(page.getByTestId("iframe-url-input")).not.toBeFocused();
  expect((await getNode(page, iframe.id)).bounds).toEqual(before.bounds);

  await page.getByTestId("iframe-interact").click();
  await expect.poll(async () => (await getNode(page, iframe.id))?.summary?.interactive ?? true).toBe(false);

  const shieldBox = await page.locator(".iframe-component__shield").boundingBox();
  const start = {
    x: shieldBox.x + shieldBox.width / 2,
    y: shieldBox.y + shieldBox.height / 2,
  };
  const end = {
    x: start.x + 90,
    y: start.y + 60,
  };
  await dragBetweenPagePoints(page, start, end);

  const afterDrag = await getNode(page, iframe.id);
  expect(afterDrag.bounds.x).toBeGreaterThan(before.bounds.x + 50);
  expect(afterDrag.bounds.y).toBeGreaterThan(before.bounds.y + 30);
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

test("edits page from floating toolbar and shows attachment menu", async ({ page }) => {
  const pageNode = await addComponent(page, "page", {
    x: 120,
    y: 120,
    label: "Old Label",
    fill: "#fffdf8",
    labelColor: "#ab4f28",
    headerLineStroke: "rgba(171, 79, 40, 0.12)",
  });
  const center = await getNodePageCenter(page, pageNode.id);
  const initialSummary = (await getNode(page, pageNode.id))?.summary ?? {};
  const originalStroke = initialSummary.stroke ?? "#c9b393";

  await page.evaluate((nodeId) => window.__APP_TEST_API__.selectNode(nodeId), pageNode.id);
  await expect(page.getByTestId("page-panel")).toBeVisible();
  await expect(page.getByTestId("page-create-next")).toBeVisible();
  await expect(page.locator('[data-testid="page-create-next"] svg')).toHaveCount(1);
  await page.mouse.dblclick(center.x, center.y);
  await expect(page.getByTestId("canvas-text-editor")).toBeVisible();
  await page.getByTestId("canvas-text-editor").fill("New Label");
  await page.getByTestId("canvas-text-editor").press("Control+Enter");
  await expect(page.getByTestId("canvas-text-editor")).toHaveCount(0);
  await expect.poll(async () => (await getNode(page, pageNode.id))?.summary?.label ?? "").toBe("New Label");

  await page.getByTestId("page-layer-menu").click();
  await expect(page.getByTestId("page-layer-bring-forward")).toBeVisible();

  await page.getByTestId("page-create-next").click();
  await expect
    .poll(async () => {
      const nodes = await page.evaluate(() => window.__APP_TEST_API__.listNodes());
      const pages = nodes.filter((node) => node.componentType === "page");
      const connections = nodes.filter((node) => node.componentType === "connection");
      const nextPage = pages.find((node) => node.id !== pageNode.id) ?? null;
      const nextConnection = connections.find((node) => (
        node.summary?.sourceNodeId === pageNode.id &&
        node.summary?.targetNodeId === nextPage?.id
      )) ?? null;
      return {
        pageCount: pages.length,
        connectionCount: connections.length,
        sourceBounds: pages.find((node) => node.id === pageNode.id)?.bounds ?? null,
        nextBounds: nextPage?.bounds ?? null,
        hasDirectedConnection: Boolean(nextConnection),
      };
    })
    .toEqual(expect.objectContaining({
      pageCount: 2,
      connectionCount: 1,
      sourceBounds: expect.any(Object),
      nextBounds: expect.any(Object),
      hasDirectedConnection: true,
    }));
  const createNextLayout = await page.evaluate((sourceId) => {
    const nodes = window.__APP_TEST_API__.listNodes();
    const pages = nodes.filter((node) => node.componentType === "page");
    const source = pages.find((node) => node.id === sourceId) ?? null;
    const nextPage = pages.find((node) => node.id !== sourceId) ?? null;
    return {
      sourceBounds: source?.bounds ?? null,
      nextBounds: nextPage?.bounds ?? null,
    };
  }, pageNode.id);
  expect(createNextLayout.sourceBounds).toBeTruthy();
  expect(createNextLayout.nextBounds).toBeTruthy();
  expect(createNextLayout.nextBounds.x).toBeGreaterThan(
    createNextLayout.sourceBounds.x + createNextLayout.sourceBounds.width,
  );
  expect(Math.abs(createNextLayout.nextBounds.y - createNextLayout.sourceBounds.y)).toBeLessThan(1);

  await page.mouse.click(center.x, center.y, { button: "right" });
  await expect(page.getByText("Edit...")).toHaveCount(0);
  await expect(page.locator(".toolbar__page-layer-popover")).toHaveCSS("pointer-events", "auto");

  await page.getByTestId("page-style-text-color").click();
  await expect(page.locator("#page-text-swatches")).toHaveClass(/toolbar__button-color-grid/);
  await expect(page.locator("#page-text-swatches")).toHaveCSS("display", "grid");
  await expect(page.locator("#page-text-swatches")).toHaveCSS("grid-template-columns", /^(\S+\s+){4}\S+$/);
  await expect(page.locator("#page-text-swatches")).not.toHaveCSS("column-gap", "0px");
  await expect(page.locator("#page-text-swatches")).not.toHaveCSS("row-gap", "0px");
  await expect(page.locator("#page-text-swatches .toolbar__button-color-swatch")).toHaveCount(8);
  await expect(page.locator("#page-text-swatches .toolbar__button-custom-trigger")).toHaveCount(1);
  await page.getByTestId("page-text-color").fill("#336699");
  await expect.poll(async () => (await getNode(page, pageNode.id))?.summary ?? null).toEqual(
    expect.objectContaining({
      label: "New Label",
      stroke: "rgba(51, 102, 153, 0.45)",
    }),
  );

  await page.evaluate(() => window.__APP_TEST_API__.undo());
  await expect.poll(async () => (await getNode(page, pageNode.id))?.summary ?? null).toEqual(
    expect.objectContaining({
      stroke: originalStroke,
    }),
  );

  await page.evaluate(() => window.__APP_TEST_API__.redo());
  await expect.poll(async () => (await getNode(page, pageNode.id))?.summary ?? null).toEqual(
    expect.objectContaining({
      stroke: "rgba(51, 102, 153, 0.45)",
    }),
  );
  await page.getByTestId("page-style-fill").click();
  await expect(page.locator("#page-fill-swatches")).toHaveClass(/toolbar__button-color-grid/);
  await expect(page.locator("#page-fill-swatches")).toHaveCSS("display", "grid");
  await expect(page.locator("#page-fill-swatches")).toHaveCSS("grid-template-columns", /^(\S+\s+){4}\S+$/);
  await expect(page.locator("#page-fill-swatches")).not.toHaveCSS("column-gap", "0px");
  await expect(page.locator("#page-fill-swatches")).not.toHaveCSS("row-gap", "0px");
  await expect(page.locator("#page-fill-swatches .toolbar__button-color-swatch")).toHaveCount(9);
  await expect(page.locator("#page-fill-swatches .toolbar__button-custom-trigger")).toHaveCount(1);
  await expect(page.locator("[data-testid='page-attachment-menu'] svg.lucide-folder-open")).toHaveCount(1);

  await page.getByTestId("page-attachment-menu").click();
  await expect(page.locator("[data-page-attachment-action]")).toHaveCount(3);
  await expect(page.getByTestId("page-attachment-directory-action")).toHaveText("Choose Folder");
  await expect(page.getByTestId("page-attachment-add-file")).toBeVisible();
  await expect(page.getByTestId("page-attachment-add-url")).toBeVisible();
  await page.evaluate((nodeId) => {
    window.__APP_TEST_API__.setNodeAttachments(nodeId, {
      directory: { handleKey: "dir-handle", name: "DemoFolder" },
      entries: [],
    });
  }, pageNode.id);
  await page.getByTestId("page-attachment-menu").click();
  await expect(page.locator("[data-page-attachment-action]")).toHaveCount(3);
  await expect(page.getByTestId("page-attachment-directory-action")).toHaveText("Disconnect");
  await expect(page.getByTestId("page-attachment-add-file")).toBeVisible();
  await expect(page.getByTestId("page-attachment-add-url")).toBeVisible();
  await page.getByTestId("page-attachment-directory-action").click();
  await expect(page.getByTestId("page-attachment-directory-action")).toHaveText("Choose Folder");
  await expect(page.getByTestId("page-attachment-add-file")).toBeVisible();
  await expect(page.getByTestId("page-attachment-add-url")).toBeVisible();
  await page.evaluate((nodeId) => {
    window.__APP_TEST_API__.setNodeAttachments(nodeId, {
      directory: { handleKey: "dir-handle", name: "DemoFolder" },
      entries: [
        {
          kind: "local-file",
          sourceKind: "directory",
          label: "outline.md",
          path: "projects/demo/outline.md",
          size: 2048,
        },
        {
          kind: "url",
          sourceKind: "url",
          label: "Project Docs",
          url: "https://example.com/docs",
        },
      ],
    });
  }, pageNode.id);
  await page.getByTestId("page-attachment-menu").click();
  await expect(page.getByText("outline.md · 2.0 KB")).toBeVisible();
  await expect(page.getByText("Project Docs")).toBeVisible();
  await expect(page.getByTestId("page-attachment-delete")).toHaveCount(2);
  await page.getByTestId("page-attachment-delete").first().click();
  await expect(page.getByTestId("page-attachment-status")).toHaveText("Attachment removed.");
  await expect(page.getByTestId("page-attachment-list")).not.toContainText("outline.md");
  await expect(page.getByTestId("page-attachment-list")).toContainText("Project Docs");
  await page.getByTestId("page-attachment-menu").click();
  await page.getByTestId("page-attachment-delete").first().click();
  await expect(page.getByTestId("page-attachment-list")).toContainText("No attachments yet.");
  await expect(page.getByTestId("page-attachment-list")).not.toContainText("projects/demo/outline.md");
  await expect(page.getByTestId("page-attachment-list")).not.toContainText("https://example.com/docs");

  await page.evaluate((nodeId) => {
    window.__APP_TEST_API__.setNodeAttachments(nodeId, {
      directory: { handleKey: "dir-handle", name: "DemoFolder" },
      entries: [],
    });
  }, pageNode.id);
  await page.getByTestId("page-attachment-menu").click();
  await expect(page.locator("[data-page-attachment-action]")).toHaveCount(3);
  await expect(page.getByTestId("page-attachment-directory-action")).toHaveText("Disconnect");

  page.once("dialog", (dialog) => dialog.accept("https://example.com/doc"));
  await page.getByTestId("page-attachment-add-url").click();

  await page.getByTestId("page-attachment-file-input").setInputFiles({
    name: "notes.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("hello attachment"),
  });

  await expect.poll(async () => {
    const current = await getNode(page, pageNode.id);
    return current?.attachments?.entries?.length ?? 0;
  }).toBeGreaterThanOrEqual(2);

  const roundtrip = await page.evaluate(() => window.__APP_TEST_API__.exportDocument());
  await page.evaluate(() => window.__APP_TEST_API__.clearBoard());
  await page.evaluate((snapshot) => window.__APP_TEST_API__.loadDocument(snapshot), roundtrip);
  await expect.poll(async () => (await getNode(page, pageNode.id))?.summary ?? null).toEqual(
    expect.objectContaining({
      label: "New Label",
      stroke: "rgba(51, 102, 153, 0.45)",
    }),
  );
  await expect.poll(async () => {
    const restored = await getNode(page, pageNode.id);
    return restored?.attachments?.entries?.map((entry) => entry.label) ?? [];
  }).toEqual(expect.arrayContaining(["example.com", "notes.txt"]));
  await expect.poll(async () => {
    const restored = await getNode(page, pageNode.id);
    return restored?.attachments?.entries?.map((entry) => entry.label) ?? [];
  }).not.toEqual(expect.arrayContaining(["outline.md", "Project Docs"]));
});

test("edits text blocks from the floating toolbar and inline text editor", async ({ page }) => {
  const text = await addComponent(page, "text", {
    x: 220,
    y: 220,
    text: "Editor check",
    fontSize: 24,
  });
  const center = await getNodePageCenter(page, text.id);

  await page.evaluate((nodeId) => window.__APP_TEST_API__.selectNode(nodeId), text.id);
  await page.evaluate(() => window.__APP_TEST_API__.resetHistory());
  await waitForPaint(page);

  await expect(page.getByTestId("text-panel")).toBeVisible();
  await expect(page.getByTestId("text-font-size")).toHaveValue("24");
  await expect(page.getByTestId("text-color")).toHaveValue("#1d1b16");
  await expect(page.getByTestId("text-connect")).toBeVisible();
  await expect(page.getByTestId("text-layer-menu")).toBeVisible();
  await page.getByTestId("text-style-color").click();
  await expect(page.locator("#text-color-swatches .toolbar__button-color-swatch")).toHaveCount(8);
  await expect(page.locator("#text-color-swatches .toolbar__button-custom-trigger")).toHaveCount(1);

  await page.getByTestId("text-font-size").evaluate((input) => {
    input.value = "5";
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await page.getByTestId("text-color").evaluate((input) => {
    input.value = "#14532d";
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });

  await expect
    .poll(async () => (await getNode(page, text.id))?.summary ?? {})
    .toEqual(expect.objectContaining({
      fontSize: 12,
      fill: "#14532d",
    }));

  await page.evaluate(() => {
    window.__APP_TEST_API__.undo();
    window.__APP_TEST_API__.undo();
  });
  await expect
    .poll(async () => (await getNode(page, text.id))?.summary ?? {})
    .toEqual(expect.objectContaining({
      fontSize: 24,
      fill: "#1d1b16",
    }));

  await page.evaluate(() => {
    window.__APP_TEST_API__.redo();
    window.__APP_TEST_API__.redo();
  });
  await expect
    .poll(async () => (await getNode(page, text.id))?.summary ?? {})
    .toEqual(expect.objectContaining({
      fontSize: 12,
      fill: "#14532d",
    }));

  await page.mouse.dblclick(center.x, center.y);
  await expect(page.getByTestId("canvas-text-editor")).toBeVisible();
  await page.getByTestId("canvas-text-editor").fill("Updated text block");
  await page.getByTestId("canvas-text-editor").press("Control+Enter");
  await expect
    .poll(async () => (await getNode(page, text.id))?.summary?.text ?? "")
    .toBe("Updated text block");

  await page.evaluate(() => {
    window.__textContextMenuPrevented = null;
    document.addEventListener("contextmenu", (event) => {
      window.setTimeout(() => {
        window.__textContextMenuPrevented = event.defaultPrevented;
      }, 0);
    }, { capture: true, once: true });
  });
  await page.mouse.click(center.x, center.y, { button: "right" });
  await expect.poll(async () => page.evaluate(() => window.__textContextMenuPrevented)).toBe(true);
  await expect.poll(async () => (
    page.locator(".toolbar__text-layer-tool").evaluate((element) => element.matches(":focus-within"))
  )).toBe(true);
  await expect(page.getByText("Edit...")).toHaveCount(0);

  const exported = await page.evaluate(() => window.__APP_TEST_API__.exportDocument());
  await page.evaluate(() => window.__APP_TEST_API__.clearBoard());
  await page.evaluate((snapshot) => window.__APP_TEST_API__.loadDocument(snapshot), exported);

  await expect
    .poll(async () => (await getNode(page, text.id))?.summary ?? {})
    .toEqual(expect.objectContaining({
      text: "Updated text block",
      fontSize: 12,
      fill: "#14532d",
    }));
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

test("saves sticky inline editing when zooming on another canvas area", async ({ page }) => {
  const sticky = await addComponent(page, "sticky", {
    x: 220,
    y: 220,
    width: 180,
    height: 130,
    text: "Zoom me",
  });
  const center = await getNodePageCenter(page, sticky.id);

  await page.mouse.dblclick(center.x, center.y);
  const inlineEditor = page.getByTestId("canvas-text-editor");
  await expect(inlineEditor).toBeVisible();
  await inlineEditor.fill("Saved from blank canvas zoom");

  const beforeScale = await page.evaluate(() => window.__APP_TEST_API__.getViewportState().scale);
  await page.mouse.move(center.x + 360, center.y - 180);
  await page.mouse.wheel(0, -320);

  await expect(inlineEditor).toHaveCount(0);
  await expect
    .poll(async () => page.evaluate(() => window.__APP_TEST_API__.getViewportState().scale))
    .toBeGreaterThan(beforeScale);
  await expect
    .poll(async () => (await getNode(page, sticky.id))?.summary?.text ?? "")
    .toBe("Saved from blank canvas zoom");
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
  await page.evaluate((nodeId) => window.__APP_TEST_API__.selectNode(nodeId), shape.id);
  await waitForPaint(page);
  await page.getByTestId("tool-button-shape").click();

  const center = await getNodePageCenter(page, shape.id);
  await page.mouse.dblclick(center.x, center.y);

  const inlineEditor = page.getByTestId("canvas-shape-text-editor");
  await expect(inlineEditor).toBeVisible();

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

test("reorders a selected shape from the floating toolbar layer menu", async ({ page }) => {
  const backShape = await addComponent(page, "shape", {
    x: 180,
    y: 170,
    width: 160,
    height: 110,
    fill: "#dbeafe",
  });
  const frontShape = await addComponent(page, "shape", {
    x: 230,
    y: 210,
    width: 160,
    height: 110,
    fill: "#fee2e2",
  });

  await page.evaluate((nodeId) => window.__APP_TEST_API__.selectNode(nodeId), backShape.id);
  await waitForPaint(page);

  await expect(page.getByTestId("shape-panel")).toBeVisible();
  await expect(page.getByTestId("shape-layer-menu")).toBeVisible();
  await expect(page.getByTestId("shape-layer-menu").locator("svg")).toBeVisible();
  await expect.poll(async () => getNodeOrder(page, [backShape.id, frontShape.id]))
    .toEqual([backShape.id, frontShape.id]);

  await page.getByTestId("shape-layer-menu").click();
  const layerButtonBox = await page.getByTestId("shape-layer-menu").boundingBox();
  const shapeLayerMenu = page.getByRole("menu", { name: "Shape layer order" });
  const layerMenuBox = await shapeLayerMenu.boundingBox();
  expect(layerMenuBox?.height ?? 999).toBeLessThan(80);
  expect(layerMenuBox.x).toBeGreaterThanOrEqual(layerButtonBox.x + layerButtonBox.width - 1);
  expect(Math.abs(layerMenuBox.y - layerButtonBox.y)).toBeLessThan(4);
  await page.getByTestId("shape-layer-menu").click();
  await expect.poll(async () => (
    page.getByTestId("shape-layer-menu").evaluate((element) => element.closest(".toolbar__shape-layer-tool").matches(":focus-within"))
  )).toBe(false);
  await expect(shapeLayerMenu).toHaveCSS("pointer-events", "none");

  await page.getByTestId("shape-layer-menu").click();
  await expect(page.getByTestId("shape-layer-bring-forward")).toBeEnabled();
  await page.getByTestId("shape-layer-bring-forward").click();

  await expect.poll(async () => getNodeOrder(page, [backShape.id, frontShape.id]))
    .toEqual([frontShape.id, backShape.id]);

  await page.getByTestId("shape-layer-menu").click();
  await expect(page.getByTestId("shape-layer-bring-forward")).toBeDisabled();
  await expect(page.getByTestId("shape-layer-send-backward")).toBeEnabled();
});

test("keeps shape inline text editing and exposes toolbar connection and layer actions", async ({ page }) => {
  const shape = await addComponent(page, "shape", {
    x: 220,
    y: 180,
    width: 180,
    height: 110,
    text: "Toolbar styles",
  });
  await addComponent(page, "shape", {
    x: 460,
    y: 180,
    width: 160,
    height: 100,
  });
  const center = await getNodePageCenter(page, shape.id);

  await page.mouse.dblclick(center.x, center.y);
  await expect(page.getByTestId("canvas-shape-text-editor")).toBeVisible();
  await page.getByTestId("canvas-shape-text-editor").press("Escape");
  await expect(page.getByTestId("canvas-shape-text-editor")).toBeHidden();

  await page.evaluate((nodeId) => {
    window.__APP_TEST_API__.setEditorTool("arrange");
    window.__APP_TEST_API__.selectNode(nodeId);
  }, shape.id);
  await waitForPaint(page);

  await expect(page.getByTestId("shape-panel")).toBeVisible();
  await expect(page.getByTestId("shape-connect")).toBeVisible();
  await expect(page.getByTestId("shape-connect")).toBeEnabled();
  await expect(page.getByTestId("shape-connect").locator("svg")).toBeVisible();
  await expect(page.getByTestId("shape-layer-menu")).toBeVisible();
  await expect(page.getByTestId("shape-layer-menu").locator("svg")).toBeVisible();

  await page.getByTestId("shape-layer-menu").click();
  const layerButtonBox = await page.getByTestId("shape-layer-menu").boundingBox();
  const shapeLayerMenu = page.getByRole("menu", { name: "Shape layer order" });
  const layerMenuBox = await shapeLayerMenu.boundingBox();
  expect(layerMenuBox?.height ?? 999).toBeLessThan(80);
  expect(layerMenuBox.x).toBeGreaterThanOrEqual(layerButtonBox.x + layerButtonBox.width - 1);
  expect(Math.abs(layerMenuBox.y - layerButtonBox.y)).toBeLessThan(4);
  await expect(shapeLayerMenu).toHaveCSS("pointer-events", "auto");
  await expect(page.getByTestId("shape-layer-bring-forward")).toBeEnabled();
  await expect(page.getByTestId("shape-layer-send-backward")).toBeDisabled();
});

test("resizes pages and deletes them with the keyboard", async ({ page }) => {
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

  expect(resized.summary.width).toBeGreaterThan(before.summary.width + 100);
  expect(resized.summary.height).toBeGreaterThan(before.summary.height + 60);
  expect(resized.summary.scaleX).toBeCloseTo(1, 4);
  expect(resized.summary.scaleY).toBeCloseTo(1, 4);

  await page.keyboard.press("Delete");
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

  await expect(page.getByTestId("document-status-toast")).toHaveText("JSON loaded");
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

  await expect(page.getByTestId("document-status-toast")).toHaveText("JSON loaded");
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

test("loads embedded snapshot from html file and shows html success toast", async ({ page }) => {
  await addComponent(page, "sticky", { x: 240, y: 240 });
  const exported = await page.evaluate(() => window.__APP_TEST_API__.exportDocument());
  const html = `<!doctype html><html><head><title>Snapshot</title></head><body><script id="app-snapshot" type="application/json">${JSON.stringify(exported)}</script></body></html>`;

  await page.evaluate(() => window.__APP_TEST_API__.clearBoard());
  await expect
    .poll(async () => (await page.evaluate(() => window.__APP_TEST_API__.listNodes())).length)
    .toBe(0);

  await page.getByTestId("load-document-input").setInputFiles({
    name: "mind-map.html",
    mimeType: "text/html",
    buffer: Buffer.from(html),
  });

  await expect(page.getByTestId("document-status-toast")).toHaveText("HTML loaded");
  await expect
    .poll(async () => (await page.evaluate(() => window.__APP_TEST_API__.listNodes())).length)
    .toBe(1);
});

test("edits ranking box titles inline and styles from the floating toolbar", async ({ page }) => {
  const rankingBox = await addComponent(page, "rankingBox", { x: 180, y: 160 });
  const titleCenter = await page.evaluate(
    (nodeId) => window.__APP_TEST_API__.getRankingBoxTitlePageCenter(nodeId),
    rankingBox.id,
  );
  const initialSummary = (await getNode(page, rankingBox.id))?.summary;
  const longTitle = "Priority Order for Semester Project Evaluation and Milestone Tracking";

  await page.evaluate((nodeId) => window.__APP_TEST_API__.selectNode(nodeId), rankingBox.id);
  await waitForPaint(page);

  await expect(page.getByTestId("ranking-box-panel")).toBeVisible();
  await expect(page.getByTestId("ranking-box-connect")).toHaveCount(0);
  await expect(page.getByTestId("ranking-box-layer-menu")).toBeVisible();
  await page.mouse.dblclick(titleCenter.x, titleCenter.y);
  const inlineEditor = page.getByTestId("canvas-text-editor");
  await expect(inlineEditor).toBeVisible();
  await inlineEditor.fill(longTitle);
  const editorMetrics = await inlineEditor.evaluate((element) => ({
    clientHeight: element.clientHeight,
    scrollHeight: element.scrollHeight,
    value: element.value,
  }));
  expect(editorMetrics.value).toBe(longTitle);
  expect(editorMetrics.clientHeight + 1).toBeGreaterThanOrEqual(editorMetrics.scrollHeight);
  await inlineEditor.press("Control+Enter");
  await expect(inlineEditor).toHaveCount(0);

  await page.getByTestId("ranking-box-style-font-size").click();
  await page.getByTestId("ranking-box-font-size").evaluate((input) => {
    input.value = "28";
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });

  await page.getByTestId("ranking-box-style-title-color").click();
  await page.getByTestId("ranking-box-title-color").evaluate((input) => {
    input.value = "#2b4f8c";
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });

  await page.getByTestId("ranking-box-style-theme").click();
  await page.getByTestId("ranking-box-theme-color").evaluate((input) => {
    input.value = "#d97706";
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });

  await expect
    .poll(async () => (await getNode(page, rankingBox.id))?.summary)
    .toMatchObject({
      label: longTitle,
      titleFontSize: 28,
      titleColor: "#2b4f8c",
      themeColor: "#d97706",
      renderedTitleFontSize: 28,
      renderedTitleColor: "#2b4f8c",
      renderedThemeStroke: "#d97706",
      renderedTitleWrap: "none",
      renderedTitleEllipsis: true,
    });
  const styledSummary = (await getNode(page, rankingBox.id))?.summary;
  expect(styledSummary?.renderedHeaderHeight).toBeGreaterThan(initialSummary?.renderedHeaderHeight ?? 0);
  expect(styledSummary?.headerBounds?.height ?? 0).toBeGreaterThan(initialSummary?.headerBounds?.height ?? 0);

  await page.evaluate(() => window.__APP_TEST_API__.undo());
  await expect
    .poll(async () => (await getNode(page, rankingBox.id))?.summary?.themeColor)
    .toBe("#8a6f47");

  await page.evaluate(() => window.__APP_TEST_API__.redo());
  await expect
    .poll(async () => (await getNode(page, rankingBox.id))?.summary)
    .toMatchObject({
      label: longTitle,
      titleFontSize: 28,
      titleColor: "#2b4f8c",
      themeColor: "#d97706",
      renderedThemeStroke: "#d97706",
      renderedTitleWrap: "none",
      renderedTitleEllipsis: true,
    });

  const exported = await page.evaluate(() => window.__APP_TEST_API__.exportDocument());
  await page.evaluate(() => window.__APP_TEST_API__.clearBoard());
  await page.evaluate((snapshot) => window.__APP_TEST_API__.loadDocument(snapshot), exported);

  await expect
    .poll(async () => (await getNode(page, rankingBox.id))?.summary)
    .toMatchObject({
      label: longTitle,
      titleFontSize: 28,
      titleColor: "#2b4f8c",
      themeColor: "#d97706",
      renderedTitleFontSize: 28,
      renderedTitleColor: "#2b4f8c",
      renderedThemeStroke: "#d97706",
      renderedTitleWrap: "none",
      renderedTitleEllipsis: true,
    });
});

test("opens ranking box layer actions from the floating toolbar and right click", async ({ page }) => {
  const rankingBox = await addComponent(page, "rankingBox", { x: 180, y: 160 });
  const sticky = await addComponent(page, "sticky", { x: 460, y: 190 });
  const center = await getNodePageCenter(page, rankingBox.id);

  await page.evaluate((nodeId) => window.__APP_TEST_API__.selectNode(nodeId), rankingBox.id);
  await waitForPaint(page);

  await expect(page.getByTestId("ranking-box-panel")).toBeVisible();
  await expect(page.getByTestId("ranking-box-connect")).toHaveCount(0);
  await expect.poll(async () => getNodeOrder(page, [rankingBox.id, sticky.id]))
    .toEqual([rankingBox.id, sticky.id]);

  await page.getByTestId("ranking-box-layer-menu").click();
  const layerButtonBox = await page.getByTestId("ranking-box-layer-menu").boundingBox();
  const layerMenuBox = await page.locator(".toolbar__ranking-box-layer-popover").boundingBox();
  expect(layerMenuBox?.height ?? 999).toBeLessThan(80);
  expect(layerMenuBox.x).toBeGreaterThanOrEqual(layerButtonBox.x + layerButtonBox.width - 1);
  expect(Math.abs(layerMenuBox.y - layerButtonBox.y)).toBeLessThan(4);
  await expect(page.getByTestId("ranking-box-layer-bring-forward")).toBeEnabled();
  await expect(page.getByTestId("ranking-box-layer-send-backward")).toBeDisabled();
  await page.getByTestId("ranking-box-layer-menu").click();
  await expect(page.locator(".toolbar__ranking-box-layer-popover")).toHaveCSS(
    "pointer-events",
    "none",
  );

  await page.evaluate(
    (nodeId) => window.__APP_TEST_API__.openRankingBoxLayerMenu(nodeId),
    rankingBox.id,
  );
  await expect(page.locator(".toolbar__ranking-box-layer-popover")).toHaveCSS(
    "pointer-events",
    "auto",
  );
  await expect(page.getByText("Edit...")).toHaveCount(0);

  await page.getByTestId("ranking-box-layer-bring-forward").click();
  await expect.poll(async () => getNodeOrder(page, [rankingBox.id, sticky.id]))
    .toEqual([sticky.id, rankingBox.id]);
});

test("keeps the ranking box floating panel aligned when its parent page moves", async ({ page }) => {
  const pageNode = await addComponent(page, "page", { x: 320, y: 120 });
  const rankingBox = await page.evaluate(
    (pageId) => window.__APP_TEST_API__.createRankingBox(pageId),
    pageNode.id,
  );

  await page.evaluate((nodeId) => window.__APP_TEST_API__.selectNode(nodeId), rankingBox.id);
  await waitForPaint(page);

  const panel = page.getByTestId("ranking-box-panel");
  await expect(panel).toBeVisible();
  const rankingBefore = await getNode(page, rankingBox.id);
  const before = await panel.boundingBox();
  expect(before).not.toBeNull();

  await page.evaluate(
    ({ id, position }) => window.__APP_TEST_API__.moveNode(id, position),
    { id: pageNode.id, position: { x: -120, y: 120 } },
  );
  await waitForPaint(page);

  const rankingAfter = await getNode(page, rankingBox.id);
  const after = await panel.boundingBox();
  expect(after).not.toBeNull();
  expect(Math.abs((rankingAfter?.bounds?.x ?? 0) - (rankingBefore?.bounds?.x ?? 0))).toBeGreaterThan(100);
  expect(Math.abs((after?.x ?? 0) - (before?.x ?? 0))).toBeGreaterThan(20);
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
      return {
        themeStroke: node.summary.renderedThemeStroke,
        items: node.summary.items.map((item) => ({
          text: item.renderedText,
          stroke: item.renderedStroke,
        })),
      };
    })
    .toEqual({
      themeStroke: "#8a6f47",
      items: [
        {
          text: "First ranked idea",
          stroke: "rgba(95, 72, 40, 0.18)",
        },
        {
          text: "Second ranked idea",
          stroke: "rgba(95, 72, 40, 0.18)",
        },
      ],
    });

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

test("keeps pen preset settings separate for each brush tool", async ({ page }) => {
  await page.getByTestId("tool-button-pen").click();
  await page.getByTestId("pen-preset-0").click();

  await page.getByTestId("pen-r-input").fill("255");
  await page.getByTestId("pen-g-input").fill("0");
  await page.getByTestId("pen-b-input").fill("0");
  await page.getByTestId("pen-preset-width").fill("6");
  await drawStroke(page);

  await page.getByTestId("tool-button-pen").click();
  await page.getByTestId("brush-type-pencil").click();
  await page.getByTestId("pen-preset-0").click();
  await expect(page.getByTestId("pen-r-input")).toHaveValue("74");
  await expect(page.getByTestId("pen-g-input")).toHaveValue("74");
  await expect(page.getByTestId("pen-b-input")).toHaveValue("74");
  await expect(page.getByTestId("pen-preset-width")).toHaveValue("3");

  await page.getByTestId("pen-r-input").fill("18");
  await page.getByTestId("pen-g-input").fill("52");
  await page.getByTestId("pen-b-input").fill("86");
  await page.getByTestId("pen-preset-width").fill("2");
  await drawStroke(page, { xRatio: 0.38, yRatio: 0.55, dx: 70, dy: 24 });

  await page.getByTestId("tool-button-pen").click();
  await page.getByTestId("pen-preset-0").click();
  await expect(page.getByTestId("pen-r-input")).toHaveValue("255");
  await expect(page.getByTestId("pen-g-input")).toHaveValue("0");
  await expect(page.getByTestId("pen-b-input")).toHaveValue("0");
  await expect(page.getByTestId("pen-preset-width")).toHaveValue("6");

  await page.getByTestId("brush-type-pencil").click();
  await page.getByTestId("pen-preset-0").click();
  await expect(page.getByTestId("pen-r-input")).toHaveValue("18");
  await expect(page.getByTestId("pen-g-input")).toHaveValue("52");
  await expect(page.getByTestId("pen-b-input")).toHaveValue("86");
  await expect(page.getByTestId("pen-preset-width")).toHaveValue("2");
});

test("closes the pen dropdown and shows the eraser popup when eraser becomes active", async ({ page }) => {
  await page.getByTestId("tool-button-pen").click();
  await expect(page.getByTestId("pen-dropdown")).toBeVisible();

  await page.getByTestId("tool-button-eraser").click();
  await expect(page.getByTestId("pen-dropdown")).toBeHidden();
  await expect(page.getByTestId("eraser-controls")).toBeVisible();
});
