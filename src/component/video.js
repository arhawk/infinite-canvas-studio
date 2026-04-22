import { BaseComponent, FileEditorField } from "../core/baseClasses.js";
import { Konva } from "../lib/konva.js";

const DEFAULT_WIDTH = 320;
const DEFAULT_HEIGHT = 200;

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error ?? new Error("Failed to read video file."));
    reader.readAsDataURL(file);
  });
}

export class VideoComponent extends BaseComponent {
  static type = "video";
  static label = "Local Video";
  static description = "Play a local video file";

  getEditorTitle() { return "Local Video"; }

  editorFields() {
    return [
      new FileEditorField({
        id: "video",
        label: "Change Video",
        description: "Select a video file (mp4, webm, ogg)",
        input: { accept: "video/*" },
        getValue: () => null,
        setValue: async (node, file) => {
          if (file instanceof File) {
            const src = await readFileAsDataUrl(file);
            await this.updateNode(node, src);
          }
        },
      }),
    ];
  }

  async createNode({ x, y, src = null }) {
    const group = new Konva.Group({
      x, y,
      width: DEFAULT_WIDTH,
      height: DEFAULT_HEIGHT,
      draggable: true,
      name: "video-container",
    });

    group.add(new Konva.Rect({
      width: DEFAULT_WIDTH, height: DEFAULT_HEIGHT,
      fill: "#1a1a2e", cornerRadius: 12,
      stroke: "#dcc7b1", strokeWidth: 2,
      name: "video-bg",
    }));

    group.add(new Konva.Text({
      x: 0, y: 0,
      width: DEFAULT_WIDTH, height: DEFAULT_HEIGHT,
      text: "Double-click to\nupload video",
      fontSize: 15, fontFamily: "sans-serif",
      fill: "#a68b6d", align: "center", verticalAlign: "middle",
      name: "video-placeholder",
    }));

    group.setAttr("videoSrc", src);
    return group;
  }

  // Called by BaseComponent.create() AFTER node attrs are set,
  // but BEFORE mainLayer.add — we defer overlay to node:added
  onCreated(node) {
    const src = node.getAttr("videoSrc");
    const handler = ({ node: addedNode }) => {
      if (addedNode === node) {
        this.app.events.off("node:added", handler);
        if (src) this.#mountOverlay(node, src);
      }
    };
    this.app.events.on("node:added", handler);
  }

  #removeOverlay(group) {
    const oldId = group.getAttr("_overlayId");
    if (oldId) {
      document.getElementById(oldId)?.remove();
      group.setAttr("_overlayId", null);
    }
    group.off("dragmove.video transform.video absoluteTransformChange.video");
  }

  #mountOverlay(group, src) {
    this.#removeOverlay(group);

    const stage = group.getStage();
    if (!stage) return;

    const stageContainer = stage.container();
    const overlayId = `video-overlay-${group._id}`;

    const overlay = document.createElement("div");
    overlay.id = overlayId;
    overlay.style.cssText = [
      "position:absolute",
      "pointer-events:auto",
      "border-radius:12px",
      "overflow:hidden",
      "background:#000",
      "z-index:10",
    ].join(";");

    const videoEl = document.createElement("video");
    videoEl.src = src;
    videoEl.controls = true;
    videoEl.style.cssText = "width:100%;height:100%;display:block;object-fit:contain;";
    overlay.appendChild(videoEl);

    stageContainer.style.position = "relative";
    stageContainer.appendChild(overlay);
    group.setAttr("_overlayId", overlayId);

    const syncPos = () => {
      const s = group.getStage();
      if (!s) return;
      const abs = group.getAbsolutePosition();
      const sx = s.scaleX();
      const sy = s.scaleY();
      overlay.style.left   = `${abs.x}px`;
      overlay.style.top    = `${abs.y}px`;
      overlay.style.width  = `${group.width()  * sx}px`;
      overlay.style.height = `${group.height() * sy}px`;
    };

    syncPos();
    group.on("dragmove.video transform.video absoluteTransformChange.video", syncPos);
    stage.on(
      `xChange.v${group._id} yChange.v${group._id} scaleXChange.v${group._id} scaleYChange.v${group._id}`,
      syncPos
    );
  }

  async updateNode(node, src) {
    node.setAttr("videoSrc", src);
    const ph = node.findOne(".video-placeholder");
    if (ph) ph.text(src ? "" : "Double-click to\nupload video");
    if (src) {
      this.#mountOverlay(node, src);
    } else {
      this.#removeOverlay(node);
    }
    node.getLayer()?.batchDraw();
  }

  serializeNode(node) {
    return { src: node.getAttr("videoSrc") ?? null };
  }

  async applySerializedData(node, data = {}) {
    const src = data.src ?? null;
    node.setAttr("videoSrc", src);
    if (src) {
      this.#mountOverlay(node, src);
    }
  }
}
