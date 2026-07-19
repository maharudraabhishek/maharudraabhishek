import fs from "node:fs/promises";
import path from "node:path";
import ncc from "@vercel/ncc";

const repositoryRoot = path.resolve(import.meta.dirname, "..");
const outputDirectory = path.resolve(
  process.argv[2] || path.join(repositoryRoot, "dist"),
);
const entry = path.join(repositoryRoot, "src/action/index.mjs");

if (outputDirectory === repositoryRoot) {
  throw new Error("Action build output cannot be the repository root.");
}

const { code, assets } = await ncc(entry, {
  minify: true,
  sourceMap: false,
  sourceMapRegister: false,
});

await fs.rm(outputDirectory, { recursive: true, force: true });
await fs.mkdir(outputDirectory, { recursive: true });
await fs.writeFile(path.join(outputDirectory, "index.js"), code, "utf8");
for (const [filename, asset] of Object.entries(assets)) {
  const destination = path.join(outputDirectory, filename);
  await fs.mkdir(path.dirname(destination), { recursive: true });
  await fs.writeFile(destination, asset.source);
}
console.log(`Built Action bundle: ${path.relative(repositoryRoot, outputDirectory)}/index.js`);
