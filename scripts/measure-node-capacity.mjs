import { chromium } from "@playwright/test";

const targetUrl = process.env.CAPACITY_URL ?? "http://127.0.0.1:3000/";
const maxNodes = Number.parseInt(process.env.CAPACITY_MAX_NODES ?? "8000", 10);
const batchSize = Number.parseInt(process.env.CAPACITY_BATCH_SIZE ?? "250", 10);
const frameCount = Number.parseInt(process.env.CAPACITY_FRAME_COUNT ?? "90", 10);
const p95LimitMs = Number.parseFloat(process.env.CAPACITY_P95_LIMIT_MS ?? "50");
const longFrameLimitMs = Number.parseFloat(process.env.CAPACITY_LONG_FRAME_MS ?? "80");

function percentile(values, ratio) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * ratio) - 1));
  return sorted[index];
}

function summarizeIntervals(intervals) {
  const avg = intervals.reduce((total, value) => total + value, 0) / Math.max(1, intervals.length);
  return {
    avg,
    p95: percentile(intervals, 0.95),
    max: Math.max(0, ...intervals),
    longFrames: intervals.filter((value) => value >= longFrameLimitMs).length,
  };
}

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 1,
});

try {
  await page.goto(targetUrl, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => Boolean(window.__APP_TEST_API__), null, { timeout: 30_000 });

  await page.evaluate(() => {
    window.__APP_TEST_API__.clearBoard();
    window.__APP_TEST_API__.setMode?.("edit");
    window.__APP_TEST_API__.setEditorTool?.("arrange");
    window.__APP_TEST_API__.setViewport({ scale: 0.75, position: { x: 80, y: 60 } });
  });

  const results = [];
  let lastGood = 0;

  for (let count = 0; count < maxNodes; count += batchSize) {
    const startIndex = count;
    const endIndex = Math.min(maxNodes, count + batchSize);
    const added = endIndex - startIndex;

    const addMs = await page.evaluate(async ({ startIndex, added }) => {
      const startedAt = performance.now();
      const columns = 80;
      const gapX = 170;
      const gapY = 115;
      for (let offset = 0; offset < added; offset += 1) {
        const index = startIndex + offset;
        await window.__APP_TEST_API__.addComponent("sticky", {
          x: (index % columns) * gapX,
          y: Math.floor(index / columns) * gapY,
          text: `Node ${index + 1}`,
        });
      }
      window.__APP_TEST_API__.resetHistory?.();
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      return performance.now() - startedAt;
    }, { startIndex, added });

    const measurement = await page.evaluate(async ({ frameCount }) => {
      const intervals = [];
      let last = performance.now();
      for (let frame = 0; frame < frameCount; frame += 1) {
        await new Promise((resolve) => requestAnimationFrame(resolve));
        const now = performance.now();
        intervals.push(now - last);
        last = now;
        window.__APP_TEST_API__.setViewport({
          scale: 0.75,
          position: {
            x: 80 - frame * 3,
            y: 60 - frame * 2,
          },
        });
      }
      await new Promise((resolve) => requestAnimationFrame(resolve));
      return {
        nodeCount: window.__APP_TEST_API__.listNodes().length,
        intervals,
      };
    }, { frameCount });

    const summary = summarizeIntervals(measurement.intervals);
    const row = {
      nodes: measurement.nodeCount,
      addMs,
      avgFrameMs: summary.avg,
      p95FrameMs: summary.p95,
      maxFrameMs: summary.max,
      longFrames: summary.longFrames,
      pass: summary.p95 <= p95LimitMs && summary.longFrames === 0,
    };
    results.push(row);
    globalThis.__latestCapacityResults = {
      targetUrl,
      componentType: "sticky",
      batchSize,
      frameCount,
      p95LimitMs,
      longFrameLimitMs,
      lastGood: row.pass ? row.nodes : lastGood,
      firstFail: row.pass ? null : row,
      results,
    };

    console.log(
      [
        `${row.nodes} nodes`,
        `add ${row.addMs.toFixed(0)}ms`,
        `avg ${row.avgFrameMs.toFixed(1)}ms`,
        `p95 ${row.p95FrameMs.toFixed(1)}ms`,
        `max ${row.maxFrameMs.toFixed(1)}ms`,
        `long ${row.longFrames}`,
        row.pass ? "PASS" : "STOP",
      ].join(" | "),
    );

    if (!row.pass) break;
    lastGood = row.nodes;
  }

  console.log(JSON.stringify({
    targetUrl,
    componentType: "sticky",
    batchSize,
    frameCount,
    p95LimitMs,
    longFrameLimitMs,
    lastGood,
    firstFail: results.find((row) => !row.pass) ?? null,
    results,
  }, null, 2));
} catch (error) {
  if (globalThis.__latestCapacityResults) {
    console.log("PARTIAL_RESULT");
    console.log(JSON.stringify(globalThis.__latestCapacityResults, null, 2));
  }
  throw error;
} finally {
  await browser.close();
}
