import { describe, expect, it, vi } from "vitest";
import { ComponentRegistry } from "../../../src/core/componentRegistry.js";

vi.mock("../../../src/lib/konva.js", () => {
  class FakeNode {
    constructor(config = {}) {
      this._attrs = {
        rotation: 0,
        scaleX: 1,
        scaleY: 1,
        visible: true,
        opacity: 1,
        ...config,
      };
      this._children = [];
    }

    add(child) {
      this._children.push(child);
      return this;
    }

    findOne(selector) {
      if (typeof selector !== "string" || !selector.startsWith(".")) return null;
      const className = selector.slice(1);
      return this._children.find((child) => (
        child.name().split(" ").includes(className)
      )) ?? null;
    }

    on() {}

    off() {}

    setAttrs(nextAttrs) {
      Object.assign(this._attrs, nextAttrs);
    }

    setAttr(key, value) {
      this._attrs[key] = value;
    }

    getAttr(key) {
      return this._attrs[key];
    }

    name(value) {
      if (value == null) return this._attrs.name ?? "";
      this._attrs.name = value;
      return this;
    }

    id() {
      return this._attrs.id;
    }

    draggable() {
      return this._attrs.draggable ?? false;
    }

    width(value) {
      if (value == null) return this._attrs.width ?? 0;
      this._attrs.width = value;
      return this;
    }

    height(value) {
      if (value == null) return this._attrs.height ?? 0;
      this._attrs.height = value;
      return this;
    }

    x(value) {
      if (value == null) return this._attrs.x ?? 0;
      this._attrs.x = value;
      return this;
    }

    y(value) {
      if (value == null) return this._attrs.y ?? 0;
      this._attrs.y = value;
      return this;
    }

    position(nextPosition) {
      if (!nextPosition) {
        return { x: this.x(), y: this.y() };
      }
      this.x(nextPosition.x);
      this.y(nextPosition.y);
      return this;
    }

    rotation(value) {
      if (value == null) return this._attrs.rotation;
      this._attrs.rotation = value;
      return this;
    }

    scaleX(value) {
      if (value == null) return this._attrs.scaleX;
      this._attrs.scaleX = value;
      return this;
    }

    scaleY(value) {
      if (value == null) return this._attrs.scaleY;
      this._attrs.scaleY = value;
      return this;
    }

    visible(value) {
      if (value == null) return this._attrs.visible;
      this._attrs.visible = value;
      return this;
    }

    opacity(value) {
      if (value == null) return this._attrs.opacity;
      this._attrs.opacity = value;
      return this;
    }

    points(value) {
      if (value == null) return this._attrs.points ?? [];
      this._attrs.points = value;
      return this;
    }

    text(value) {
      if (value == null) return this._attrs.text ?? "";
      this._attrs.text = value;
      return this;
    }

    getLayer() {
      return { batchDraw() {} };
    }

    getStage() {
      return null;
    }
  }

  class FakeGroup extends FakeNode {}
  class FakeRect extends FakeNode {}
  class FakeLine extends FakeNode {}
  class FakeText extends FakeNode {}

  return {
    Konva: {
      Group: FakeGroup,
      Rect: FakeRect,
      Line: FakeLine,
      Text: FakeText,
    },
  };
});

import { IframeComponent } from "../../../src/component/iframe.js";

function makeApp() {
  return {
    events: { emit: vi.fn() },
    on: vi.fn(() => () => {}),
    off: vi.fn(),
    mainLayer: { batchDraw: vi.fn() },
    getPlugin: vi.fn(() => null),
    stageApi: { getScale: () => 1 },
  };
}

describe("IframeComponent", () => {
  it("registers in the palette with iframe editor metadata", () => {
    const registry = new ComponentRegistry();
    const component = new IframeComponent(makeApp());

    registry.register(component);

    expect(registry.paletteItems()).toContainEqual({
      type: "iframe",
      label: "Iframe",
      description: "Embed a webpage in a small viewport",
    });

    const editor = component.getEditorDefinition({
      getAttr: () => "https://example.com",
    });

    expect(editor.title).toBe("Iframe");
    expect(editor.fields).toHaveLength(1);
    expect(editor.fields[0].id).toBe("url");
    expect(editor.fields[0].placeholder).toBe("https://example.com");
    expect(editor.fields[0].read({
      getAttr: () => "https://example.com",
    })).toBe("https://example.com");
  });

  it("creates iframe nodes with normalized URLs and default viewport state", async () => {
    const component = new IframeComponent(makeApp());
    const node = await component.createNode({
      x: 24,
      y: 48,
      url: "example.com/docs",
    });

    expect(node.getAttr("iframeUrl")).toBe("https://example.com/docs");
    expect(node.getAttr("iframeZoom")).toBe(1);
    expect(node.getAttr("iframePanX")).toBe(0);
    expect(node.getAttr("iframePanY")).toBe(0);

    expect(component.serializeNode(node)).toMatchObject({
      url: "https://example.com/docs",
      zoom: 1,
      panX: 0,
      panY: 0,
      width: 420,
      height: 280,
    });
  });

  it("updates iframe URLs through the editor field writer", async () => {
    const component = new IframeComponent(makeApp());
    const node = await component.createNode({ x: 0, y: 0 });
    const [urlField] = component.editorFields();

    await urlField.write(node, "openai.com/research");

    expect(node.getAttr("iframeUrl")).toBe("https://openai.com/research");
    expect(component.serializeNode(node).url).toBe("https://openai.com/research");
  });

  it("clamps restored zoom and size to iframe minimums", async () => {
    const component = new IframeComponent(makeApp());
    const node = await component.createNode({ x: 0, y: 0 });

    await component.applySerializedData(node, {
      url: "docs.example.com",
      zoom: 0.25,
      panX: 80,
      panY: -30,
      width: 140,
      height: 120,
    });

    expect(component.serializeNode(node)).toMatchObject({
      url: "https://docs.example.com",
      zoom: 1,
      panX: 80,
      panY: -30,
      width: 220,
      height: 160,
    });
    expect(node.getAttr("iframeInteractive")).toBe(false);
  });
});
