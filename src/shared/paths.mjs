import fs from "node:fs/promises";
import path from "node:path";
import { FileSystemSafetyError } from "./errors.mjs";

const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/;
const PROTECTED_OUTPUT_PREFIXES = Object.freeze([
  ".git",
  ".github/workflows",
  "src",
  "scripts",
  "dist",
]);

function canonicalForComparison(value) {
  const resolved = path.resolve(value);
  return process.platform === "win32" ? resolved.toLowerCase() : resolved;
}

function isInside(parent, candidate) {
  const relative = path.relative(parent, candidate);
  return relative === "" || (
    relative !== ".." &&
    !relative.startsWith(`..${path.sep}`) &&
    !path.isAbsolute(relative)
  );
}

async function nearestExistingAncestor(candidate) {
  let current = candidate;
  while (true) {
    try {
      await fs.lstat(current);
      return current;
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
      const parent = path.dirname(current);
      if (parent === current) throw error;
      current = parent;
    }
  }
}

/**
 * Resolves an untrusted caller path and rejects workspace and symlink escapes.
 * Existing symlink targets must remain inside the real workspace.
 */
export async function resolveWorkspacePath({
  workspace,
  value,
  fallback,
  label,
  kind = "file",
  writable = false,
}) {
  const raw = String(value ?? fallback ?? "").trim();
  if (!raw) throw new FileSystemSafetyError(`${label} is required.`);
  if (CONTROL_CHARACTERS.test(raw)) {
    throw new FileSystemSafetyError(`${label} contains control characters.`);
  }

  const workspacePath = path.resolve(workspace);
  const realWorkspace = await fs.realpath(workspacePath);
  const resolved = path.resolve(workspacePath, raw);
  if (!isInside(workspacePath, resolved) || resolved === workspacePath) {
    throw new FileSystemSafetyError(
      `${label} must resolve inside the GitHub workspace and not to its root.`,
    );
  }

  const relative = path.relative(workspacePath, resolved)
    .split(path.sep)
    .join("/");
  const normalizedRelative = process.platform === "win32"
    ? relative.toLowerCase()
    : relative;

  if (writable) {
    const blocked = PROTECTED_OUTPUT_PREFIXES.some(
      (prefix) =>
        normalizedRelative === prefix ||
        normalizedRelative.startsWith(`${prefix}/`),
    );
    if (blocked || normalizedRelative === "action.yml") {
      throw new FileSystemSafetyError(
        `${label} cannot target protected source, workflow, Action, or Git metadata.`,
      );
    }
  }

  const existingAncestor = await nearestExistingAncestor(resolved);
  const realAncestor = await fs.realpath(existingAncestor);
  if (!isInside(realWorkspace, realAncestor)) {
    throw new FileSystemSafetyError(
      `${label} escapes the workspace through a symbolic link.`,
    );
  }

  try {
    const stats = await fs.lstat(resolved);
    if (stats.isSymbolicLink()) {
      throw new FileSystemSafetyError(`${label} cannot be a symbolic link.`);
    }
    if (kind === "directory" && !stats.isDirectory()) {
      throw new FileSystemSafetyError(`${label} must be a directory.`);
    }
    if (kind === "file" && !stats.isFile()) {
      throw new FileSystemSafetyError(`${label} must be a regular file.`);
    }
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }

  return Object.freeze({
    absolute: resolved,
    relative,
    comparisonKey: canonicalForComparison(resolved),
  });
}

export function toPosixPath(value) {
  return String(value).split(path.sep).join("/");
}
