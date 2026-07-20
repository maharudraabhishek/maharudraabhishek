import fs from "node:fs/promises";
import path from "node:path";
import { resolveAnalyticsConfig } from "../config/resolve-config.mjs";
import { selectGitHubTokens } from "../github/authentication.mjs";
import { publishGeneratedAssets } from "../output/publish-assets.mjs";
import { updateReadmeAnalytics } from "../output/update-readme.mjs";
import { validateGeneratedAssets } from "../output/validate-assets.mjs";
import {
  AnalyticsError,
  AuthenticationError,
  AuthorizationError,
  GenerationError,
  GitHubApiError,
  RateLimitError,
  RepositoryDiscoveryError,
  RetryableNetworkError,
  safeErrorMessage,
} from "../shared/errors.mjs";
import { toPosixPath } from "../shared/paths.mjs";
import {
  clearRuntimeContext,
  setRuntimeContext,
} from "./runtime-context.mjs";
import {
  generateAnalytics,
  resetAnalyticsRuntime,
} from "../../scripts/generate-engineering-analytics.mjs";

function classifyFailure(error, secrets) {
  if (error instanceof AnalyticsError) return error;
  const message = safeErrorMessage(error, secrets);
  const status = Number(error?.status);
  if (status === 401 || /bad credentials|authentication|token belongs/iu.test(message)) {
    return new AuthenticationError(message, { cause: error });
  }
  if (status === 429 || (status === 403 && /rate limit|abuse/iu.test(message))) {
    return new RateLimitError(message, { cause: error });
  }
  if (status === 403 || status === 404 || /permission|not accessible/iu.test(message)) {
    return new AuthorizationError(message, { cause: error });
  }
  if ([502, 503, 504].includes(status) || /network|ECONNRESET|timeout/iu.test(message)) {
    return new RetryableNetworkError(message, { cause: error });
  }
  if (status || error?.name === "GitHubHttpError") {
    return new GitHubApiError(message, { cause: error });
  }
  if (/discover|repository listing|contribution search/iu.test(message)) {
    return new RepositoryDiscoveryError(message, { cause: error });
  }
  return new GenerationError(message, { cause: error });
}

/**
 * Coordinates the existing analytics engine through validated reusable
 * configuration, isolated staging, safe publication, and marker-only README
 * replacement. It never invokes git.
 */
export async function runAnalytics(options = {}) {
  const workspace = path.resolve(
    options.workspace || process.env.GITHUB_WORKSPACE || process.cwd(),
  );
  const configuration = await resolveAnalyticsConfig({
    workspace,
    inputs: options,
    environment: options.environment || process.env,
    defaultConfigPath: options.defaultConfigPath || "",
  });
  const tokens = selectGitHubTokens({
    includePrivate: configuration.includePrivate,
    githubToken: options.githubToken,
    privateToken: options.privateToken,
  });
  const secrets = [tokens.publicToken, tokens.privateToken].filter(Boolean);
  const logger = options.logger ?? console;
  const temporaryDirectory = await fs.mkdtemp(
    path.join(workspace, ".github-analytics-run-"),
  );

  logger.log(`Configured profile identity: ${configuration.profileUsername}`);
  logger.log(`Configured aliases: ${configuration.publicContributorAliases.length}`);
  logger.log(`Analytics mode: ${configuration.includePrivate ? "private" : "public"}`);

  try {
    setRuntimeContext({
      analyticsConfig: configuration,
      includePrivate: configuration.includePrivate,
      outputDirectory: temporaryDirectory,
      publicToken: tokens.publicToken,
      privateToken: tokens.privateToken,
      strictMode: configuration.strictMode,
    });
    const engineResult = await generateAnalytics();
    const validated = await validateGeneratedAssets(temporaryDirectory, {
      secrets,
      location: "Generated staging",
    });
    const publication = await publishGeneratedAssets({
      stagingDirectory: temporaryDirectory,
      outputDirectory: configuration.outputDirectory.absolute,
      files: validated.files,
    });
    await validateGeneratedAssets(configuration.outputDirectory.absolute, {
      secrets,
      location: "Published analytics output",
    });

    let readmeUpdated = false;
    if (configuration.updateReadme) {
      const readmeResult = await updateReadmeAnalytics({
        readmePath: configuration.readmePath.absolute,
        outputDirectory: configuration.outputDirectory.absolute,
        username: configuration.profileUsername,
        insertMarkers: configuration.insertReadmeMarkers,
        attribution: configuration.attribution,
      });
      readmeUpdated = readmeResult.changed;
    }

    const generatedFiles = validated.files.map((filename) =>
      toPosixPath(path.join(configuration.outputDirectory.relative, filename))
    ).sort();
    const warnings = [...(engineResult.warnings ?? [])];
    const changesDetected = publication.changed || readmeUpdated;
    logger.log(`Repositories analyzed: ${engineResult.repositoriesAnalyzed}`);
    logger.log(`Repositories skipped: ${engineResult.repositoriesSkipped}`);
    logger.log(`Generated cards: ${engineResult.generatedCardCount}`);
    logger.log(`README updated: ${readmeUpdated ? "yes" : "no"}`);
    logger.log(`Changes detected: ${changesDetected ? "yes" : "no"}`);

    return Object.freeze({
      generatedFiles: Object.freeze(generatedFiles),
      generatedCardCount: engineResult.generatedCardCount,
      repositoriesAnalyzed: engineResult.repositoriesAnalyzed,
      repositoriesSkipped: engineResult.repositoriesSkipped,
      readmeUpdated,
      changesDetected,
      warnings: Object.freeze(warnings),
      outputDirectory: configuration.outputDirectory.relative,
      readmePath: configuration.readmePath.relative,
    });
  } catch (error) {
    throw classifyFailure(error, secrets);
  } finally {
    resetAnalyticsRuntime();
    clearRuntimeContext();
    await fs.rm(temporaryDirectory, { recursive: true, force: true });
  }
}
