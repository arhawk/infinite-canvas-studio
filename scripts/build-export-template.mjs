import { copyFileSync, existsSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const tempDir = mkdtempSync(join(tmpdir(), "cs61-export-template-"));
const viteBin = resolve(process.cwd(), "node_modules/vite/bin/vite.js");
const target = resolve(process.cwd(), "dist/__export-template");

try {
  const result = spawnSync(
    process.execPath,
    [viteBin, "build", "--outDir", tempDir, "--emptyOutDir"],
    {
      stdio: "inherit",
      env: {
        ...process.env,
        SINGLE_FILE_EXPORT: "1",
      },
    },
  );

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }

  const source = resolve(tempDir, "index.html");
  if (!existsSync(source)) {
    console.error(`Missing export template source: ${source}`);
    process.exit(1);
  }

  mkdirSync(dirname(target), { recursive: true });
  copyFileSync(source, target);
  console.log(`Synced export template to ${target}`);
} finally {
  rmSync(tempDir, { recursive: true, force: true });
}
