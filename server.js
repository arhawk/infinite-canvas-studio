import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";

const root = process.cwd();
const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
};

function resolvePath(pathname) {
  const cleanPath = pathname === "/" ? "/index.html" : pathname;
  const safePath = normalize(cleanPath).replace(/^(\.\.[/\\])+/, "");
  return join(root, safePath);
}

Bun.serve({
  port: 3000,
  async fetch(request) {
    const url = new URL(request.url);

    if (url.pathname === "/health") {
      return Response.json({ ok: true });
    }

    const filePath = resolvePath(url.pathname);
    if (!existsSync(filePath)) {
      return new Response("Not found", { status: 404 });
    }

    const data = await readFile(filePath);
    const ext = extname(filePath);

    return new Response(data, {
      headers: {
        "content-type": mimeTypes[ext] ?? "application/octet-stream",
      },
    });
  },
});

console.log("Mind map canvas is running at http://localhost:3000");
