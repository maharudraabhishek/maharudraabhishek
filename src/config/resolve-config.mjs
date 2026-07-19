import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { ConfigurationError } from "../shared/errors.mjs";
import { resolveWorkspacePath } from "../shared/paths.mjs";

// Keep caller config loading native at runtime. Bundlers cannot know an
// untrusted workspace-relative module path at build time.
const importCallerConfig = new Function(
  "specifier",
  "return import(specifier);",
);

export const DEFAULTS = Object.freeze({
  outputDirectory: "assets/github-analytics",
  readmePath: "README.md",
  includePrivate: false,
  updateReadme: true,
  insertReadmeMarkers: false,
  attribution: true,
  strictMode: true,
});

const GITHUB_USERNAME_PATTERN =
  /^(?!-)(?!.*--)[A-Za-z0-9-]{1,39}(?<!-)$/;

function plainObject(value, label, { optional = false } = {}) {
  if (optional && value === undefined) return {};
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ConfigurationError(`${label} must be an object.`);
  }
  return value;
}

export function normalizeUsername(value, label = "github-username") {
  const username = String(value ?? "").trim();
  if (!username) throw new ConfigurationError(`${label} is required.`);
  if (!GITHUB_USERNAME_PATTERN.test(username)) {
    throw new ConfigurationError(`${label} must be a valid GitHub username.`);
  }
  return username;
}

export function normalizeAliases(value, primaryUsername) {
  const aliases = value === undefined
    ? []
    : Array.isArray(value)
      ? value
      : String(value).split(",");
  const seen = new Set([primaryUsername.toLowerCase()]);
  const normalized = [];

  for (const [index, rawAlias] of aliases.entries()) {
    const trimmed = String(rawAlias ?? "").trim();
    if (!trimmed) continue;
    const alias = normalizeUsername(trimmed, `aliases[${index}]`);
    const key = alias.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    normalized.push(alias);
  }
  return Object.freeze(normalized);
}

export function parseBoolean(value, label, fallback) {
  if (value === undefined || value === null || value === "") return fallback;
  if (value === true || value === "true") return true;
  if (value === false || value === "false") return false;
  throw new ConfigurationError(`${label} must be exactly 'true' or 'false'.`);
}

function normalizeRepository(value, label) {
  const repository = String(value ?? "").trim();
  const parts = repository.split("/");
  if (parts.length !== 2 || parts.some((part) => !part.trim())) {
    throw new ConfigurationError(`${label} must use owner/repository format.`);
  }
  const owner = normalizeUsername(parts[0], `${label} owner`);
  const name = parts[1].trim();
  if (/[/\\?#\u0000-\u001f]/.test(name)) {
    throw new ConfigurationError(`${label} contains an invalid repository name.`);
  }
  return `${owner}/${name}`;
}

async function loadOptionalConfig(workspace, configPath) {
  if (!String(configPath ?? "").trim()) return { root: {}, path: null };
  const safePath = await resolveWorkspacePath({
    workspace,
    value: configPath,
    label: "config-path",
    kind: "file",
  });
  try {
    await fs.access(safePath.absolute);
  } catch (error) {
    if (error?.code === "ENOENT") {
      throw new ConfigurationError(`Config file not found: ${safePath.relative}`);
    }
    throw error;
  }

  let imported;
  try {
    imported = await importCallerConfig(
      `${pathToFileURL(safePath.absolute).href}?analytics_config=1`,
    );
  } catch (error) {
    throw new ConfigurationError(
      `Could not load config file ${safePath.relative}: ${error.message}`,
      { cause: error },
    );
  }
  return {
    root: plainObject(imported.default, "Default config export"),
    path: safePath,
  };
}

/** Resolves explicit inputs, optional caller config, owner context, and defaults. */
export async function resolveAnalyticsConfig({
  workspace,
  inputs = {},
  environment = process.env,
  defaultConfigPath = "",
} = {}) {
  const requestedConfigPath = String(inputs.configPath ?? "").trim() ||
    String(defaultConfigPath ?? "").trim();
  const { root, path: configPath } = await loadOptionalConfig(
    workspace,
    requestedConfigPath,
  );
  const profile = plainObject(root.profile, "profile", { optional: true });
  const contributions = plainObject(
    root.publicContributions,
    "publicContributions",
    { optional: true },
  );
  const repositories = plainObject(
    root.repositories,
    "repositories",
    { optional: true },
  );
  const output = plainObject(root.output, "output", { optional: true });

  const username = normalizeUsername(
    String(inputs.githubUsername ?? "").trim() ||
      profile.username ||
      environment.GITHUB_REPOSITORY_OWNER,
  );
  const aliasesInput = String(inputs.aliases ?? "").trim();
  const aliases = normalizeAliases(
    aliasesInput ? inputs.aliases : contributions.aliases,
    username,
  );

  const rawExclude = repositories.exclude ?? [];
  if (!Array.isArray(rawExclude)) {
    throw new ConfigurationError("repositories.exclude must be an array.");
  }
  const exclusions = new Map();
  for (const [index, value] of rawExclude.entries()) {
    const normalized = normalizeRepository(value, `repositories.exclude[${index}]`);
    exclusions.set(normalized.toLowerCase(), normalized);
  }
  if (repositories.excludeProfileRepository !== false) {
    exclusions.set(`${username}/${username}`.toLowerCase(), `${username}/${username}`);
  }

  const outputDirectory = await resolveWorkspacePath({
    workspace,
    value: String(inputs.outputDirectory ?? "").trim() || output.directory,
    fallback: DEFAULTS.outputDirectory,
    label: "output-directory",
    kind: "directory",
    writable: true,
  });
  const readmePath = await resolveWorkspacePath({
    workspace,
    value: String(inputs.readmePath ?? "").trim() || output.readmePath,
    fallback: DEFAULTS.readmePath,
    label: "readme-path",
    kind: "file",
    writable: true,
  });
  if (!/\.(?:md|markdown)$/iu.test(readmePath.relative)) {
    throw new ConfigurationError("readme-path must end in .md or .markdown.");
  }
  if (outputDirectory.comparisonKey === readmePath.comparisonKey) {
    throw new ConfigurationError("output-directory and readme-path must differ.");
  }
  const readmeInsideOutput = path.relative(
    outputDirectory.absolute,
    readmePath.absolute,
  );
  if (
    readmeInsideOutput !== "" &&
    readmeInsideOutput !== ".." &&
    !readmeInsideOutput.startsWith(`..${path.sep}`) &&
    !path.isAbsolute(readmeInsideOutput)
  ) {
    throw new ConfigurationError("readme-path cannot be inside output-directory.");
  }

  const identities = Object.freeze([username, ...aliases]);
  const contributorProfiles = Object.freeze(identities.map((login, index) =>
    Object.freeze({
      login,
      discoverGlobally: true,
      repositories: Object.freeze([]),
      primary: index === 0,
    })
  ));

  return Object.freeze({
    workspace,
    configPath,
    profileUsername: username,
    publicContributorProfiles: contributorProfiles,
    publicContributorAliases: aliases,
    publicContributorIdentities: identities,
    globalPublicContributorIdentities: identities,
    excludedRepositories: Object.freeze([...exclusions.values()]),
    outputDirectory,
    readmePath,
    includePrivate: parseBoolean(
      inputs.includePrivate,
      "include-private",
      DEFAULTS.includePrivate,
    ),
    updateReadme: parseBoolean(
      inputs.updateReadme,
      "update-readme",
      DEFAULTS.updateReadme,
    ),
    insertReadmeMarkers: parseBoolean(
      inputs.insertReadmeMarkers,
      "insert-readme-markers",
      DEFAULTS.insertReadmeMarkers,
    ),
    attribution: parseBoolean(
      inputs.attribution,
      "attribution",
      DEFAULTS.attribution,
    ),
    strictMode: parseBoolean(
      inputs.strictMode,
      "strict-mode",
      DEFAULTS.strictMode,
    ),
  });
}
