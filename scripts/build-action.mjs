import fs from "node:fs/promises";
import path from "node:path";
import { build } from "esbuild";

const repositoryRoot = path.resolve(import.meta.dirname, "..");
const outputDirectory = path.resolve(
  process.argv[2] || path.join(repositoryRoot, "dist"),
);
if (outputDirectory === repositoryRoot) {
  throw new Error("Action build output cannot be the repository root.");
}

await fs.rm(outputDirectory, { recursive: true, force: true });
await fs.mkdir(outputDirectory, { recursive: true });
await build({
  absWorkingDir: repositoryRoot,
  entryPoints: ["./src/action/index.mjs"],
  outfile: path.join(outputDirectory, "index.js"),
  bundle: true,
  platform: "node",
  target: "node24",
  format: "esm",
  minify: true,
  sourcemap: false,
  legalComments: "none",
  charset: "utf8",
  banner: {
    js: 'import { createRequire as __createRequire } from "node:module"; const require = __createRequire(import.meta.url);',
  },
});
console.log(`Built Action bundle: ${path.relative(repositoryRoot, outputDirectory)}/index.js`);
