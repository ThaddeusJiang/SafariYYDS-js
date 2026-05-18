await Bun.build({
  entrypoints: ["src/index.ts"],
  outdir: "dist",
  target: "node",
  format: "esm",
  external: ["@resvg/resvg-js"],
  minify: false,
  sourcemap: "none",
  banner: "#!/usr/bin/env node"
});
