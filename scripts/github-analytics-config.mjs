import fs from "node:fs/promises";
import path from "node:path";
import {
  fileURLToPath,
  pathToFileURL,
} from "node:url";

const DEFAULT_CONFIG_FILE =
  ".github/github-analytics.config.mjs";

// GitHub usernames are 1-39 characters and may contain letters,
// numbers, and single hyphens that are not at either end.
const GITHUB_USERNAME_PATTERN =
  /^(?!-)(?!.*--)[A-Za-z0-9-]{1,39}(?<!-)$/;

function isPlainObject(value) {
  return Boolean(
    value &&
    typeof value === "object" &&
    !Array.isArray(value),
  );
}

function requiredObject(value, label) {
  if (!isPlainObject(value)) {
    throw new Error(`${label} must be an object.`);
  }
  return value;
}

function normalizeUsername(value, label) {
  const username = String(value ?? "").trim();

  if (!username) {
    throw new Error(`${label} is required.`);
  }

  if (!GITHUB_USERNAME_PATTERN.test(username)) {
    throw new Error(
      `${label} must be a valid GitHub username.`,
    );
  }

  return username;
}

function normalizeAliases(value, primaryUsername) {
  if (value === undefined) return [];

  if (!Array.isArray(value)) {
    throw new Error(
      "publicContributions.aliases must be an array.",
    );
  }

  const primary = primaryUsername.toLowerCase();
  const aliases = [];
  const seen = new Set([primary]);

  for (const [index, rawAlias] of value.entries()) {
    const alias = normalizeUsername(
      rawAlias,
      `publicContributions.aliases[${index}]`,
    );
    const key = alias.toLowerCase();

    if (seen.has(key)) continue;

    seen.add(key);
    aliases.push(alias);
  }

  return aliases;
}

function normalizeRepositoryName(value, label) {
  const repository = String(value ?? "").trim();
  const parts = repository.split("/");

  if (
    parts.length !== 2 ||
    parts.some((part) => !part.trim())
  ) {
    throw new Error(
      `${label} must use the "owner/repository" format.`,
    );
  }

  return `${parts[0].trim()}/${parts[1].trim()}`;
}

function normalizeExcludedRepositories(
  repositoriesConfig,
  profileUsername,
) {
  const rawExclude = repositoriesConfig.exclude ?? [];

  if (!Array.isArray(rawExclude)) {
    throw new Error(
      "repositories.exclude must be an array.",
    );
  }

  const excludeProfileRepository =
    repositoriesConfig.excludeProfileRepository !== false;

  const excluded = new Map();

  for (const [index, rawRepository] of rawExclude.entries()) {
    const repository = normalizeRepositoryName(
      rawRepository,
      `repositories.exclude[${index}]`,
    );
    excluded.set(repository.toLowerCase(), repository);
  }

  if (excludeProfileRepository) {
    const profileRepository =
      `${profileUsername}/${profileUsername}`;
    excluded.set(
      profileRepository.toLowerCase(),
      profileRepository,
    );
  }

  return [...excluded.values()];
}

/**
 * Loads and validates the single user-editable analytics config.
 *
 * Scripts call this function instead of reading profile names from
 * workflow environment variables. This keeps identity configuration
 * centralized and prevents the YAML and generators from becoming
 * profile-specific.
 */
export async function loadAnalyticsConfig(
  configPath =
    process.env.ANALYTICS_CONFIG_FILE?.trim() ||
    DEFAULT_CONFIG_FILE,
) {
  const absolutePath = path.resolve(configPath);

  try {
    await fs.access(absolutePath);
  } catch {
    throw new Error(
      `GitHub Analytics config not found: ${absolutePath}`,
    );
  }

  const configUrl = pathToFileURL(absolutePath);
  const imported = await import(configUrl.href);
  const root = requiredObject(
    imported.default,
    "Default analytics config export",
  );

  const profile = requiredObject(
    root.profile,
    "profile",
  );
  const profileUsername = normalizeUsername(
    profile.username,
    "profile.username",
  );

  const publicContributions = requiredObject(
    root.publicContributions ?? {},
    "publicContributions",
  );
  const publicContributorAliases = normalizeAliases(
    publicContributions.aliases,
    profileUsername,
  );

  const repositories = requiredObject(
    root.repositories ?? {},
    "repositories",
  );
  const excludedRepositories =
    normalizeExcludedRepositories(
      repositories,
      profileUsername,
    );

  return Object.freeze({
    configPath: absolutePath,
    profileUsername,
    publicContributorAliases: Object.freeze(
      publicContributorAliases,
    ),
    publicContributorIdentities: Object.freeze([
      profileUsername,
      ...publicContributorAliases,
    ]),
    excludedRepositories: Object.freeze(
      excludedRepositories,
    ),
  });
}

async function runCli() {
  const command = process.argv[2] || "--validate";
  const config = await loadAnalyticsConfig();

  switch (command) {
    case "--validate":
      console.log(
        [
          `Validated ${path.relative(process.cwd(), config.configPath)}`,
          `Profile: ${config.profileUsername}`,
          `Public identities: ${config.publicContributorIdentities.join(", ")}`,
          `Excluded repositories: ${config.excludedRepositories.length}`,
        ].join("\n"),
      );
      return;

    case "--print-profile-username":
      process.stdout.write(config.profileUsername);
      return;

    case "--print-public-identities":
      process.stdout.write(
        config.publicContributorIdentities.join(","),
      );
      return;

    default:
      throw new Error(
        `Unknown command '${command}'. Supported commands: ` +
        "--validate, --print-profile-username, " +
        "--print-public-identities.",
      );
  }
}

const isDirectExecution =
  process.argv[1] &&
  path.resolve(process.argv[1]) ===
    fileURLToPath(import.meta.url);

if (isDirectExecution) {
  await runCli();
}
