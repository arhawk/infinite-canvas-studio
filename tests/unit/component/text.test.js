import { describe, expect, it, vi } from "vitest";
import { installKonvaMock } from "../helpers/konvaMock.js";

installKonvaMock(vi);
import { TextComponent } from "../../../src/component/text.js";

function createAppStub(defaultPresetId = "body") {
  return {
    setSelectableIndex: () => {},
    getPlugin: (pluginId) => (
      pluginId === "text-style-toolbar"
        ? {
            getDefaultPresetId: () => defaultPresetId,
          }
        : null
    ),
  };
}

describe("TextComponent", () => {
  it("uses the active text style preset for newly created text nodes", async () => {
    const component = new TextComponent(createAppStub("title"));
    const node = await component.create({
      x: 20,
      y: 30,
      text: "Heading",
    });

    expect(node.fontSize()).toBe(36);
    expect(node.fontStyle()).toBe("700");
    expect(node.fill()).toBe("#1d1b16");
    expect(node.getAttr("textStylePreset")).toBe("title");
  });

  it("roundtrips font style and preset metadata through serialize and restore", async () => {
    const component = new TextComponent(createAppStub());
    const node = await component.create({
      x: 10,
      y: 15,
      text: "Side note",
      textStylePreset: "note",
    });

    const snapshot = component.serialize(node);
    const restored = await component.restore(snapshot);

    expect(snapshot.data).toMatchObject({
      textStylePreset: "note",
      fontSize: 18,
      fontStyle: "400",
      fill: "#8a8175",
    });
    expect(restored.fontSize()).toBe(18);
    expect(restored.fontStyle()).toBe("400");
    expect(restored.fill()).toBe("#8a8175");
    expect(restored.getAttr("textStylePreset")).toBe("note");
  });
});
