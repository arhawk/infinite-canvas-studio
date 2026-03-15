import { cp, mkdir, rm, writeFile } from "node:fs/promises";

await rm("dist", { recursive: true, force: true });
await mkdir("dist/src", { recursive: true });
await cp("index.html", "dist/index.html");
await cp("styles.css", "dist/styles.css");
await cp("src", "dist/src", { recursive: true });
await writeFile("dist/.nojekyll", "");

console.log("Static build written to ./dist");
