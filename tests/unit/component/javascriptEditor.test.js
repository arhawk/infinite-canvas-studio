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

    scale(nextValue) {
      if (!nextValue) {
        return { x: this.scaleX(), y: this.scaleY() };
      }
      this.scaleX(nextValue.x);
      this.scaleY(nextValue.y);
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

import { JavaScriptEditorComponent } from "../../../src/component/javascriptEditor.js";

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

describe("JavaScriptEditorComponent", () => {
  it("registers in the palette with editor metadata", () => {
    const registry = new ComponentRegistry();
    const component = new JavaScriptEditorComponent(makeApp());

    registry.register(component);

    expect(registry.paletteItems()).toContainEqual({
      type: "javascriptEditor",
      label: "JS Code Runner",
      description: "Write JavaScript and run it in an isolated preview",
    });

    const editor = component.getEditorDefinition({
      getAttr: (key) => (
        key === "javascriptEditorTitle"
          ? "Snippet"
          : "console.log('test');"
      ),
    });

    expect(editor.title).toBe("JS Code Runner");
    expect(editor.fields).toHaveLength(2);
    expect(editor.fields.map((field) => field.id)).toEqual(["title", "code"]);
  });

  it("creates nodes with stored title, code, and dimensions", async () => {
    const component = new JavaScriptEditorComponent(makeApp());
    const node = await component.createNode({
      x: 24,
      y: 48,
      title: "Demo Runner",
      code: "console.log('ready');",
    });

    expect(node.getAttr("javascriptEditorTitle")).toBe("Demo Runner");
    expect(node.getAttr("javascriptEditorCode")).toBe("console.log('ready');");
    expect(node.findOne(".javascript-editor-static-editor")).toBeTruthy();
    expect(node.findOne(".javascript-editor-static-output")).toBeTruthy();
    expect(node.findOne(".javascript-editor-placeholder")).toBeNull();

    expect(component.serializeNode(node)).toMatchObject({
      title: "Demo Runner",
      code: "console.log('ready');",
      width: 544,
      height: 420,
      outputRatio: 0.34,
    });
  });

  it("updates title and code through editor field writers", async () => {
    const component = new JavaScriptEditorComponent(makeApp());
    const node = await component.createNode({ x: 0, y: 0 });
    const [titleField, codeField] = component.editorFields();

    await titleField.write(node, "JS Sandbox");
    await codeField.write(node, "");

    expect(node.getAttr("javascriptEditorTitle")).toBe("JS Sandbox");
    expect(node.getAttr("javascriptEditorCode")).toBe("");
  });

  it("starts with a guided hello world snippet by default", async () => {
    const component = new JavaScriptEditorComponent(makeApp());
    const node = await component.createNode({ x: 0, y: 0 });

    expect(node.getAttr("javascriptEditorCode")).toBe(
      [
        "// Write JavaScript here, press Run or Ctrl+Enter to execute.",
        "",
        'root.innerHTML = "<h2>Hello World</h2>";',
        'console.log("Hello World");',
      ].join("\n"),
    );
  });

  it("clamps restored size and keeps empty snippets intact", async () => {
    const component = new JavaScriptEditorComponent(makeApp());
    const node = await component.createNode({ x: 0, y: 0 });

    await component.applySerializedData(node, {
      title: "Restored Runner",
      code: "",
      width: 140,
      height: 120,
      outputRatio: 0.9,
    });

    expect(component.serializeNode(node)).toMatchObject({
      title: "Restored Runner",
      code: "",
      width: 360,
      height: 280,
      outputRatio: 0.65,
    });
  });
});
