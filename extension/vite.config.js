import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { viteStaticCopy } from "vite-plugin-static-copy";
import { resolve } from "node:path";

// Chrome loads the extension from a chrome-extension://<id>/ root, so every
// asset reference must be relative, not absolute ("/assets/..."), or the
// popup/options pages will fail to load their JS/CSS once packaged.
export default defineConfig({
  root: ".",
  base: "./",
  plugins: [
    react(),
    viteStaticCopy({
      targets: [
        { src: "manifest.json", dest: "." },
        { src: "src/background.js", dest: "." },
        { src: "public/icons", dest: "." },
      ],
    }),
  ],
  build: {
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        popup: resolve(__dirname, "popup.html"),
        options: resolve(__dirname, "options.html"),
      },
    },
  },
});
