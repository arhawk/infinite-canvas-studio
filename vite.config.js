import { defineConfig } from "vite";

function inlineSingleFileBuild() {
  return {
    name: "inline-single-file-build",
    enforce: "post",
    generateBundle(_, bundle) {
      const htmlAsset = Object.values(bundle).find(
        (entry) => entry.type === "asset" && entry.fileName.endsWith(".html"),
      );

      if (!htmlAsset) {
        return;
      }

      let html = String(htmlAsset.source);

      html = html.replace(/<link rel="modulepreload"[^>]*>/g, "");

      for (const [fileName, entry] of Object.entries(bundle)) {
        if (entry.type === "asset" && fileName.endsWith(".css")) {
          const escapedCss = String(entry.source).replace(/<\/style>/gi, "<\\/style>");
          const hrefPattern = new RegExp(
            `<link rel="stylesheet"[^>]*href="(?:\\./)?${escapeRegExp(fileName)}"[^>]*>`,
            "g",
          );
          html = html.replace(hrefPattern, `<style>${escapedCss}</style>`);
          delete bundle[fileName];
        }

        if (entry.type === "chunk" && entry.isEntry) {
          const escapedJs = entry.code.replace(/<\/script>/gi, "<\\/script>");
          const srcPattern = new RegExp(
            `<script type="module"[^>]*src="(?:\\./)?${escapeRegExp(fileName)}"[^>]*><\\/script>`,
            "g",
          );
          html = html.replace(srcPattern, `<script type="module">${escapedJs}</script>`);
          delete bundle[fileName];
        }
      }

      htmlAsset.source = html;
    },
  };
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export default defineConfig(() => {
  const isSingleFileExport = process.env.SINGLE_FILE_EXPORT === "1";

  return {
    base: isSingleFileExport ? "./" : undefined,
    define: {
      __SINGLE_FILE_EXPORT__: JSON.stringify(isSingleFileExport),
    },
    plugins: isSingleFileExport ? [inlineSingleFileBuild()] : [],
    server: {
      port: 3000,
      strictPort: true,
    },
    preview: {
      port: 3000,
      strictPort: true,
    },
    build: isSingleFileExport
      ? {
          cssCodeSplit: false,
          modulePreload: false,
          assetsInlineLimit: () => true,
        }
      : undefined,
  };
});
