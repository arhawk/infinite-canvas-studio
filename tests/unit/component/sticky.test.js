import { describe, expect, it, vi } from "vitest";
import { installKonvaMock } from "../helpers/konvaMock.js";

installKonvaMock(vi);
import {
  DEFAULT_STICKY_FILL,
  DEFAULT_STICKY_FILL_OPACITY,
  StickyComponent,
  getStickyData,
} from "../../../src/component/sticky.js";

function createAppStub() {
  return {
    setSelectableIndex: () => {},
  };
}

describe("StickyComponent", () => {
  it("roundtrips fill and fillOpacity through serialize/restore", async () => {
    const component = new StickyComponent(createAppStub());
    const node = await component.create({
      x: 10,
      y: 20,
      fill: "#bbf7d0",
      fillOpacity: 0.5,
      text: "A",
    });

    const snapshot = component.serialize(node);
    const restored = await component.restore(snapshot);
    const restoredData = getStickyData(restored);

    expect(snapshot.data.fill).toBe("#bbf7d0");
    expect(snapshot.data.fillOpacity).toBe(0.5);
    expect(restoredData.fill).toBe("#bbf7d0");
    expect(restoredData.fillOpacity).toBe(0.5);
    expect(restored.findOne(".sticky-bg")?.fill()).toContain("0.5");
  });

  it("renders transparent and opaque fills from fillOpacity", async () => {
    const component = new StickyComponent(createAppStub());
    const node = await component.create({ x: 0, y: 0, fill: DEFAULT_STICKY_FILL });

    await component.applySerializedData(node, { fill: "#ff0000", fillOpacity: 0 });
    expect(node.findOne(".sticky-bg")?.fill()).toContain("0)");

    await component.applySerializedData(node, { fill: "#00ff00", fillOpacity: 1 });
    expect(node.findOne(".sticky-bg")?.fill()).toBe("#00ff00");

    const data = getStickyData(node);
    expect(data.fillOpacity).toBe(DEFAULT_STICKY_FILL_OPACITY);
  });
});
