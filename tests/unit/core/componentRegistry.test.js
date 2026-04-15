import { describe, expect, it } from "vitest";
import { BaseComponent } from "../../../src/core/baseClasses.js";
import { ComponentRegistry } from "../../../src/core/componentRegistry.js";

class LegacyContainerComponent extends BaseComponent {
  static type = "container";
  static label = "Container";
  static description = "Legacy container";
  static palette = false;
}

class PageComponent extends LegacyContainerComponent {
  static type = "page";
  static label = "Page";
  static description = "Page";
  static palette = true;
}

class TextComponent extends BaseComponent {
  static type = "text";
  static label = "Text";
  static description = "Text";
}

describe("ComponentRegistry", () => {
  it("keeps legacy containers out of the palette while leaving pages available", () => {
    const registry = new ComponentRegistry();

    registry.register(new LegacyContainerComponent({}));
    registry.register(new PageComponent({}));
    registry.register(new TextComponent({}));

    expect(registry.paletteItems()).toEqual([
      {
        type: "page",
        label: "Page",
        description: "Page",
      },
      {
        type: "text",
        label: "Text",
        description: "Text",
      },
    ]);
  });
});
