import { defineConfig } from "vite";
import { resolve } from "path";

export default defineConfig({
  build: {
    lib: {
      entry: resolve(__dirname, "src/index.ts"),
      name: "BigraphViz",
      formats: ["iife"],
      fileName: () => "bigraph-viz2.iife.min.js",
    },
    cssCodeSplit: false,
    cssMinify: true,
    minify: "terser",
    outDir: "dist",
    emptyOutDir: false,
    sourcemap: false,
  },
});
