import { describe, expect, it, vi } from "vitest";
import { installKonvaMock } from "../helpers/konvaMock.js";
import { PageComponent } from "../../../src/component/page.js";

installKonvaMock(vi);

function createAppStub() {
  return {
    setSelectableIndex: () => {},
    stageApi: {
      getScreenSize: () => ({ width: 1280, height: 720 }),
    },
  };
}

describe("PageComponent", () => {
  it("uses fillOpacity for page fill without reducing node opacity", async () => {
    const component = new PageComponent(createAppStub());
    const node = await component.create({
      x: 0,
      y: 0,
      fill: "#336699",
      fillOpacity: 0.5,
    });

    const snapshot = component.serialize(node);
    expect(snapshot.data.fill).toBe("#336699");
    expect(snapshot.data.fillOpacity).toBe(0.5);
    expect(node.opacity()).toBe(1);
    expect(node.findOne(".container-label")?.fill()).toBe("#ab4f28");
    expect(node.findOne(".container-bg")?.fill()).toContain("0.5");
  });

  it("migrates legacy node opacity into page fillOpacity on restore", async () => {
    const component = new PageComponent(createAppStub());
    const restored = await component.restore({
      id: "page-legacy-1",
      type: "page",
      x: 0,
      y: 0,
      opacity: 0.4,
      data: {
        width: 960,
        height: 540,
        label: "Legacy",
        fill: "#fffdf8",
      },
    });

    expect(restored.opacity()).toBe(1);
    expect(restored.getAttr("pageFillOpacity")).toBe(0.4);
    expect(restored.findOne(".container-bg")?.fill()).toContain("0.4");
  });
});
