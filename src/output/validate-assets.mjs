import fs from "node:fs/promises";
import path from "node:path";
import {
  ANALYTICS_ASSET_FILENAMES,
  LOCKED_SUMMARY_CARD_MARKERS,
  OPEN_SOURCE_PROJECT_FILENAME_PATTERN,
  OPEN_SOURCE_PROJECT_MANIFEST,
} from "./asset-contract.mjs";
import { SvgValidationError } from "../shared/errors.mjs";

const MAX_SVG_BYTES = 2_000_000;
const CONTROL_CHARACTERS = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;
const ERROR_PAYLOAD = /<html\b|<!doctype\s+html|"message"\s*:\s*"|\b(?:Error|Exception):[^<\n]+\n\s+at\s/iu;
const UNRESOLVED_PLACEHOLDER = /\{\{[^{}]+\}\}|\$\{[^{}]+\}|<%=?[\s\S]*?%>/u;

function potentialSecret(content, secrets) {
  if (/github_pat_|gh[oprsu]_|Authorization:\s*Bearer|PRIVATE_STATS_TOKEN/iu.test(content)) {
    return true;
  }
  return secrets.some((secret) => secret && content.includes(secret));
}

export async function readProjectManifest(directory, { secrets = [] } = {}) {
  const manifestPath = path.join(directory, OPEN_SOURCE_PROJECT_MANIFEST);
  let manifest;
  try {
    const content = await fs.readFile(manifestPath, "utf8");
    if (Buffer.byteLength(content, "utf8") > MAX_SVG_BYTES) {
      throw new Error("manifest exceeds the 2 MB safety limit");
    }
    if (potentialSecret(content, secrets)) {
      throw new Error("manifest contains potential secret material");
    }
    manifest = JSON.parse(content);
  } catch (error) {
    throw new SvgValidationError(
      `${OPEN_SOURCE_PROJECT_MANIFEST} is missing or invalid JSON: ${error.message}`,
      { cause: error },
    );
  }
  if (manifest?.version !== 1 || !Array.isArray(manifest.projects)) {
    throw new SvgValidationError(
      `${OPEN_SOURCE_PROJECT_MANIFEST} must use manifest version 1.`,
    );
  }

  const names = new Set();
  const filenames = new Set();
  for (const project of manifest.projects) {
    const fullName = String(project?.fullName ?? "");
    const filename = String(project?.filename ?? "");
    if (!/^[^/\s]+\/[^/\s]+$/.test(fullName) ||
        !OPEN_SOURCE_PROJECT_FILENAME_PATTERN.test(filename) ||
        project?.url !== `https://github.com/${fullName}` ||
        !["owned-open-source", "verified-contribution"].includes(project?.relationship) ||
        names.has(fullName.toLowerCase()) || filenames.has(filename)) {
      throw new SvgValidationError(
        `Invalid or duplicate project entry in ${OPEN_SOURCE_PROJECT_MANIFEST}.`,
      );
    }
    names.add(fullName.toLowerCase());
    filenames.add(filename);
  }
  return Object.freeze({
    ...manifest,
    projects: Object.freeze(manifest.projects.map((item) => Object.freeze({ ...item }))),
  });
}

export async function validateSvg(filePath, { filename, secrets = [] } = {}) {
  let stats;
  try {
    stats = await fs.stat(filePath);
  } catch (error) {
    throw new SvgValidationError(`${filename} is missing.`, { cause: error });
  }
  if (!stats.isFile() || stats.size === 0) {
    throw new SvgValidationError(`${filename} is empty or not a regular file.`);
  }
  if (stats.size > MAX_SVG_BYTES) {
    throw new SvgValidationError(`${filename} exceeds the 2 MB safety limit.`);
  }

  const content = await fs.readFile(filePath, "utf8");
  const start = content.trimStart();
  if (!/^(?:<\?xml[^>]*>\s*)?<svg\b/iu.test(start)) {
    throw new SvgValidationError(`${filename} does not begin with an SVG root element.`);
  }
  if (!/<\/svg>\s*$/iu.test(start)) {
    throw new SvgValidationError(`${filename} does not end with a closing SVG element.`);
  }
  const openingTag = start.match(/<svg\b[^>]*>/iu)?.[0] ?? "";
  if (!/\bviewBox\s*=|(?:\bwidth\s*=.*\bheight\s*=|\bheight\s*=.*\bwidth\s*=)/iu.test(openingTag)) {
    throw new SvgValidationError(`${filename} has neither a viewBox nor width and height.`);
  }
  if (CONTROL_CHARACTERS.test(content)) {
    throw new SvgValidationError(`${filename} contains invalid XML control characters.`);
  }
  if (ERROR_PAYLOAD.test(content)) {
    throw new SvgValidationError(`${filename} contains an HTML, JSON, or exception payload.`);
  }
  if (UNRESOLVED_PLACEHOLDER.test(content)) {
    throw new SvgValidationError(`${filename} contains an unresolved template placeholder.`);
  }
  if (potentialSecret(content, secrets)) {
    throw new SvgValidationError(`${filename} contains potential secret material.`);
  }

  const missingMarkers = (LOCKED_SUMMARY_CARD_MARKERS[filename] ?? [])
    .filter((marker) => !content.includes(marker));
  if (missingMarkers.length) {
    throw new SvgValidationError(
      `${filename} violates the locked card contract: ${missingMarkers.join(", ")}`,
    );
  }
}

/** Requires staging to contain exactly the fixed cards and manifest projects. */
export async function validateGeneratedAssets(directory, { secrets = [] } = {}) {
  const manifest = await readProjectManifest(directory, { secrets });
  const expected = [
    ...ANALYTICS_ASSET_FILENAMES,
    ...manifest.projects.map((project) => project.filename),
    OPEN_SOURCE_PROJECT_MANIFEST,
  ].sort();
  const entries = await fs.readdir(directory, { withFileTypes: true });
  if (entries.some((entry) => !entry.isFile())) {
    throw new SvgValidationError("Generated staging contains a non-file entry.");
  }
  const actual = entries.map((entry) => entry.name).sort();
  const missing = expected.filter((name) => !actual.includes(name));
  const unexpected = actual.filter((name) => !expected.includes(name));
  if (missing.length || unexpected.length) {
    throw new SvgValidationError(
      `Generated asset set mismatch.${missing.length ? ` Missing: ${missing.join(", ")}.` : ""}` +
      `${unexpected.length ? ` Unexpected: ${unexpected.join(", ")}.` : ""}`,
    );
  }
  for (const filename of expected.filter((name) => name.endsWith(".svg"))) {
    await validateSvg(path.join(directory, filename), { filename, secrets });
  }
  return Object.freeze({ manifest, files: Object.freeze(expected) });
}
