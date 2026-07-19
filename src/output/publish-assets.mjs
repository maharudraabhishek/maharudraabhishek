import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import {
  OPEN_SOURCE_PROJECT_FILENAME_PATTERN,
  OPEN_SOURCE_PROJECT_MANIFEST,
} from "./asset-contract.mjs";

async function hashFile(filePath) {
  try {
    return crypto.createHash("sha256")
      .update(await fs.readFile(filePath))
      .digest("hex");
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}

async function priorProjectFiles(outputDirectory) {
  try {
    const manifest = JSON.parse(await fs.readFile(
      path.join(outputDirectory, OPEN_SOURCE_PROJECT_MANIFEST),
      "utf8",
    ));
    if (manifest?.version !== 1 || !Array.isArray(manifest.projects)) return [];
    return manifest.projects
      .map((project) => String(project?.filename ?? ""))
      .filter((filename) => OPEN_SOURCE_PROJECT_FILENAME_PATTERN.test(filename));
  } catch (error) {
    if (error?.code === "ENOENT" || error instanceof SyntaxError) return [];
    throw error;
  }
}

async function replaceFile(source, destination) {
  const temporary = `${destination}.analytics-${process.pid}.tmp`;
  await fs.copyFile(source, temporary);
  await fs.chmod(temporary, 0o644);
  try {
    await fs.rename(temporary, destination);
  } catch (error) {
    if (error?.code !== "EEXIST" && error?.code !== "EPERM") throw error;
    await fs.rm(destination, { force: true });
    await fs.rename(temporary, destination);
  } finally {
    await fs.rm(temporary, { force: true });
  }
}

/** Publishes only validated files and removes only stale manifest-owned SVGs. */
export async function publishGeneratedAssets({
  stagingDirectory,
  outputDirectory,
  files,
}) {
  await fs.mkdir(outputDirectory, { recursive: true });
  const oldProjectFiles = await priorProjectFiles(outputDirectory);
  const before = new Map();
  for (const filename of new Set([...files, ...oldProjectFiles])) {
    before.set(filename, await hashFile(path.join(outputDirectory, filename)));
  }

  for (const filename of files) {
    await replaceFile(
      path.join(stagingDirectory, filename),
      path.join(outputDirectory, filename),
    );
  }

  const generatedSet = new Set(files);
  for (const filename of oldProjectFiles) {
    if (!generatedSet.has(filename)) {
      await fs.rm(path.join(outputDirectory, filename), { force: true });
    }
  }

  let changed = false;
  for (const filename of new Set([...files, ...oldProjectFiles])) {
    const after = await hashFile(path.join(outputDirectory, filename));
    if (after !== before.get(filename)) changed = true;
  }
  return Object.freeze({ changed, staleFilesRemoved: oldProjectFiles.filter(
    (filename) => !generatedSet.has(filename),
  ).length });
}
