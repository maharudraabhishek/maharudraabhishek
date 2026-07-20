import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import {
  OPEN_SOURCE_PROJECT_FILENAME_PATTERN,
} from "./asset-contract.mjs";
import { FileSystemSafetyError } from "../shared/errors.mjs";
import { validateGeneratedAssets } from "./validate-assets.mjs";

async function hashRegularFile(filePath) {
  try {
    const stats = await fs.lstat(filePath);
    if (!stats.isFile() || stats.isSymbolicLink()) return null;
    return crypto.createHash("sha256")
      .update(await fs.readFile(filePath))
      .digest("hex");
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}

function normalizeManagedFilenames(files) {
  if (!Array.isArray(files) || files.length === 0) {
    throw new FileSystemSafetyError(
      "Analytics publication requires at least one validated filename.",
    );
  }

  const filenames = files.map((file) => String(file ?? ""));
  const invalid = filenames.some((filename) =>
    !filename || filename !== path.basename(filename) || filename === "." || filename === "..",
  );
  if (invalid || new Set(filenames).size !== filenames.length) {
    throw new FileSystemSafetyError(
      "Analytics publication received an unsafe or duplicate filename.",
    );
  }
  return filenames.sort();
}

function sameFilenames(left, right) {
  return left.length === right.length && left.every(
    (filename, index) => filename === right[index],
  );
}

async function inspectExistingOutput(outputDirectory, filenames) {
  let statistics;
  try {
    statistics = await fs.lstat(outputDirectory);
  } catch (error) {
    if (error?.code === "ENOENT") {
      return Object.freeze({
        exists: false,
        fingerprints: new Map(filenames.map((filename) => [filename, null])),
        unexpectedEntries: Object.freeze([]),
      });
    }
    throw error;
  }

  if (!statistics.isDirectory() || statistics.isSymbolicLink()) {
    throw new FileSystemSafetyError(
      "Analytics output directory must be a non-symlinked directory.",
    );
  }

  const expected = new Set(filenames);
  const entries = await fs.readdir(outputDirectory, { withFileTypes: true });
  const entriesByName = new Map(entries.map((entry) => [entry.name, entry]));
  const unexpectedEntries = entries
    .filter((entry) =>
      !expected.has(entry.name) || !entry.isFile() || entry.isSymbolicLink(),
    )
    .map((entry) => Object.freeze({
      name: entry.name,
      isFile: entry.isFile() && !entry.isSymbolicLink(),
    }));
  const fingerprints = new Map();
  for (const filename of filenames) {
    const entry = entriesByName.get(filename);
    fingerprints.set(
      filename,
      entry?.isFile() && !entry.isSymbolicLink()
        ? await hashRegularFile(path.join(outputDirectory, filename))
        : null,
    );
  }

  return Object.freeze({
    exists: true,
    fingerprints,
    unexpectedEntries: Object.freeze(unexpectedEntries),
  });
}

async function copyValidatedFile(source, destination, filename) {
  const sourceFingerprint = await hashRegularFile(source);
  if (!sourceFingerprint) {
    throw new FileSystemSafetyError(
      `Validated staging asset is missing or unsafe: ${filename}.`,
    );
  }
  await fs.copyFile(source, destination);
  await fs.chmod(destination, 0o644);
  return sourceFingerprint;
}

async function createReplacementDirectory({ stagingDirectory, outputDirectory, filenames }) {
  const parentDirectory = path.dirname(outputDirectory);
  const outputBasename = path.basename(outputDirectory);
  await fs.mkdir(parentDirectory, { recursive: true });
  const replacementDirectory = await fs.mkdtemp(
    path.join(parentDirectory, `.${outputBasename}.analytics-publish-`),
  );
  const fingerprints = new Map();

  try {
    for (const filename of filenames) {
      fingerprints.set(
        filename,
        await copyValidatedFile(
          path.join(stagingDirectory, filename),
          path.join(replacementDirectory, filename),
          filename,
        ),
      );
    }
    return Object.freeze({ replacementDirectory, fingerprints });
  } catch (error) {
    await fs.rm(replacementDirectory, { recursive: true, force: true });
    throw error;
  }
}

/**
 * Replaces the Action-owned output directory only after the complete validated
 * replacement exists. If the final directory switch fails, the previous output
 * is restored before the failure is surfaced.
 */
async function replaceOutputDirectory({ outputDirectory, replacementDirectory, outputExists }) {
  if (!outputExists) {
    await fs.rename(replacementDirectory, outputDirectory);
    return;
  }

  const parentDirectory = path.dirname(outputDirectory);
  const outputBasename = path.basename(outputDirectory);
  const backupDirectory = await fs.mkdtemp(
    path.join(parentDirectory, `.${outputBasename}.analytics-backup-`),
  );
  await fs.rmdir(backupDirectory);

  let previousOutputMoved = false;
  let replacementPublished = false;
  try {
    await fs.rename(outputDirectory, backupDirectory);
    previousOutputMoved = true;
    await fs.rename(replacementDirectory, outputDirectory);
    replacementPublished = true;
  } catch (error) {
    if (previousOutputMoved && !replacementPublished) {
      try {
        await fs.rename(backupDirectory, outputDirectory);
      } catch (rollbackError) {
        throw new FileSystemSafetyError(
          "Analytics output publication failed and the previous output could not be restored.",
          { cause: new AggregateError([error, rollbackError]) },
        );
      }
    }
    throw error;
  }

  await fs.rm(backupDirectory, { recursive: true, force: true });
}

/**
 * Publishes a complete, validated asset map through a sibling replacement
 * directory. The configured output directory is Action-owned: stale files,
 * legacy placeholders, and nested entries cannot survive publication.
 */
export async function publishGeneratedAssets({
  stagingDirectory,
  outputDirectory,
  files,
  secrets = [],
}) {
  const filenames = normalizeManagedFilenames(files);
  const existingOutput = await inspectExistingOutput(outputDirectory, filenames);
  const replacement = await createReplacementDirectory({
    stagingDirectory,
    outputDirectory,
    filenames,
  });

  try {
    const replacementValidation = await validateGeneratedAssets(
      replacement.replacementDirectory,
      { secrets, location: "Publication replacement" },
    );
    if (!sameFilenames(filenames, replacementValidation.files)) {
      throw new FileSystemSafetyError(
        "Publication replacement does not match the validated asset map.",
      );
    }
    await replaceOutputDirectory({
      outputDirectory,
      replacementDirectory: replacement.replacementDirectory,
      outputExists: existingOutput.exists,
    });
  } finally {
    await fs.rm(replacement.replacementDirectory, { recursive: true, force: true });
  }

  const changed = existingOutput.unexpectedEntries.length > 0 || filenames.some(
    (filename) => existingOutput.fingerprints.get(filename) !== replacement.fingerprints.get(filename),
  );
  const staleFilesRemoved = existingOutput.unexpectedEntries.filter(
    (entry) => entry.isFile && OPEN_SOURCE_PROJECT_FILENAME_PATTERN.test(entry.name),
  ).length;
  return Object.freeze({
    changed,
    staleFilesRemoved,
    removedEntries: existingOutput.unexpectedEntries.length,
  });
}
