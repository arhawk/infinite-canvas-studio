import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function readSource(relativePath) {
  return readFileSync(resolve(process.cwd(), relativePath), "utf8");
}

describe("compatibility removal guard", () => {
  it("does not reintroduce container component registration", () => {
    const mainSource = readSource("src/main.js");
    expect(mainSource).not.toContain("ContainerComponent");
  });

  it("keeps page restore logic free of legacy opacity migration", () => {
    const pageSource = readSource("src/component/page.js");
    expect(pageSource).not.toContain("legacyOpacity");
    expect(pageSource).not.toContain("migratedOpacity");
  });

  it("keeps connection style logic free of lineOpacity compatibility fields", () => {
    const connectionSource = readSource("src/component/connection.js");
    expect(connectionSource).not.toContain("connectionLineOpacity");
    expect(connectionSource).not.toContain("lineOpacity");
  });

  it("keeps document import free of legacy termDefinition migrations", () => {
    const serializerSource = readSource("src/document/serializer.js");
    expect(serializerSource).not.toContain("termDefinition");
    expect(serializerSource).not.toContain("migrateLegacyTermDefLinks");
  });
});
