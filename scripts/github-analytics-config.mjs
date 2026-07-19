import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  resolveAnalyticsConfig,
} from "../src/config/resolve-config.mjs";

const DEFAULT_CONFIG_FILE = ".github/github-analytics.config.mjs";

/**
 * Compatibility loader for the owner CLI scripts. Reusable callers use the
 * same resolver without implicitly importing this repository's personal file.
 */
export async function loadAnalyticsConfig(
  configPath =
    process.env.ANALYTICS_CONFIG_FILE?.trim() ||
    DEFAULT_CONFIG_FILE,
) {
  return resolveAnalyticsConfig({
    workspace: process.env.GITHUB_WORKSPACE?.trim() || process.cwd(),
    inputs: { configPath },
    environment: process.env,
  });
}

async function runCli() {
  const command = process.argv[2] || "--validate";
  const config = await loadAnalyticsConfig();

  switch (command) {
    case "--validate":
      console.log([
        `Validated ${config.configPath.relative}`,
        `Profile: ${config.profileUsername}`,
        `Public contribution identities: ${config.globalPublicContributorIdentities.join(", ")}`,
        `Excluded repositories: ${config.excludedRepositories.length}`,
      ].join("\n"));
      return;
    case "--print-profile-username":
      process.stdout.write(config.profileUsername);
      return;
    case "--print-public-identities":
      process.stdout.write(config.publicContributorIdentities.join(","));
      return;
    default:
      throw new Error(
        `Unknown command '${command}'. Supported commands: --validate, ` +
        "--print-profile-username, --print-public-identities.",
      );
  }
}

const isDirectExecution = process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url) &&
  path.basename(process.argv[1]) === "github-analytics-config.mjs";

if (isDirectExecution) {
  runCli().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
