import fs from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";

const repositoryRoot = path.resolve(import.meta.dirname, "..");
const temporaryRoot = await fs.mkdtemp(path.join(repositoryRoot, ".action-dist-"));
const rebuiltDirectory = path.join(temporaryRoot, "dist");

try {
  const result = spawnSync(
    process.execPath,
    [path.join(repositoryRoot, "scripts/build-action.mjs"), rebuiltDirectory],
    { cwd: repositoryRoot, encoding: "utf8" },
  );
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || "Action rebuild failed.");
  }
  const [committed, rebuilt] = await Promise.all([
    fs.readFile(path.join(repositoryRoot, "dist/index.js")),
    fs.readFile(path.join(rebuiltDirectory, "index.js")),
  ]);
  if (!committed.equals(rebuilt)) {
    throw new Error("dist/index.js is out of date. Run pnpm build and commit it.");
  }
  console.log("Committed dist/index.js matches a clean deterministic rebuild.");
} finally {
  await fs.rm(temporaryRoot, { recursive: true, force: true });
}
