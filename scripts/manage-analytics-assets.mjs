import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";

export const ANALYTICS_ASSET_FILENAMES = Object.freeze([
  "github-overview.svg",
  "github-trophies.svg",
  "contribution-streak.svg",
  "contribution-graph.svg",
  "github-activity-graph.svg",
  "personal-code-contribution.svg",
  "language-spectrum.svg",
  "public-contribution-portfolio.svg",
  "frameworks-platforms.svg",
  "engineering-domains.svg",
  "delivery-collaboration.svg",
  "repository-portfolio.svg",
  "ai-engineering-overview.svg",
  "agentic-workflow-maturity.svg",
  "ai-engineering-capabilities.svg",
  "mcp-tool-integration.svg",
  "context-governance.svg",
  "ai-workflow-activity.svg",
  "ai-engineering-trophies.svg",
  "context-engineering.svg",
  "memory-engineering.svg",
  "ai-harness-engineering.svg",
  "agentic-orchestration.svg"
]);

const SECRET_PATTERN =
  /github_pat_|ghp_|PRIVATE_STATS_TOKEN|Authorization:\s*Bearer/i;

const workspaceDirectory = path.resolve(
  process.env.GITHUB_WORKSPACE?.trim() ||
  process.cwd(),
);

const stagingDirectory = resolveWorkspaceDirectory(
  process.env.ANALYTICS_STAGING_DIRECTORY,
  "generated-analytics",
  "analytics staging directory",
);

const assetDirectory = resolveWorkspaceDirectory(
  process.env.ANALYTICS_ASSET_DIRECTORY,
  "assets",
  "analytics asset directory",
);

/**
 * Resolves a managed directory and prevents destructive operations outside the
 * checked-out repository. The workflow intentionally deletes these directories,
 * so refusing the workspace root, .git, and parent traversal is mandatory.
 */
function resolveWorkspaceDirectory(
  configuredValue,
  fallbackValue,
  label,
) {
  const resolved = path.resolve(
    workspaceDirectory,
    configuredValue?.trim() || fallbackValue,
  );
  const relative = path.relative(
    workspaceDirectory,
    resolved,
  );

  if (
    relative === "" ||
    relative === ".git" ||
    relative.startsWith(`.git${path.sep}`) ||
    relative.startsWith(`..${path.sep}`) ||
    relative === ".." ||
    path.isAbsolute(relative)
  ) {
    throw new Error(
      `Unsafe ${label}: ${resolved}. ` +
      "Managed directories must be inside the workspace and outside .git.",
    );
  }

  return resolved;
}

/**
 * Rejects symlinked managed directories before recursive deletion. This avoids
 * surprising behavior when a repository path has been redirected elsewhere.
 */
async function assertNotSymlink(directoryPath) {
  try {
    const statistics = await fs.lstat(directoryPath);

    if (statistics.isSymbolicLink()) {
      throw new Error(
        `Refusing to manage symlinked directory: ${directoryPath}`,
      );
    }
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
}

/**
 * Deletes and recreates one managed directory as an empty directory.
 */
async function recreateEmptyDirectory(directoryPath) {
  await assertNotSymlink(directoryPath);
  await fs.rm(directoryPath, {
    recursive: true,
    force: true,
  });
  await fs.mkdir(directoryPath, {
    recursive: true,
  });

  const entries = await fs.readdir(directoryPath);

  if (entries.length !== 0) {
    throw new Error(
      `Expected an empty directory after reset: ${directoryPath}`,
    );
  }
}

/**
 * Resets both generated-asset directories at workflow start.
 *
 * The entire assets directory is treated as generated output. Existing SVGs,
 * stale legacy cards, and any unrelated files under assets are removed before
 * GitHub API collection or SVG generation begins.
 */
async function resetDirectories() {
  if (stagingDirectory === assetDirectory) {
    throw new Error(
      "Analytics staging and asset directories must be different.",
    );
  }

  await recreateEmptyDirectory(assetDirectory);
  await recreateEmptyDirectory(stagingDirectory);

  console.log(
    `Reset generated asset directory: ${
      path.relative(workspaceDirectory, assetDirectory)
    }`,
  );
  console.log(
    `Reset staging directory: ${
      path.relative(workspaceDirectory, stagingDirectory)
    }`,
  );
}

/**
 * Validates one generated SVG before it is eligible for publication.
 */
async function validateSvgFile(directoryPath, filename) {
  const filePath = path.join(
    directoryPath,
    filename,
  );
  const statistics = await fs.stat(filePath);

  if (!statistics.isFile() || statistics.size <= 0) {
    throw new Error(
      `${filePath} is missing, empty, or not a regular file.`,
    );
  }

  const content = await fs.readFile(
    filePath,
    "utf8",
  );

  if (!content.includes("<svg")) {
    throw new Error(
      `${filePath} does not contain SVG markup.`,
    );
  }

  if (SECRET_PATTERN.test(content)) {
    throw new Error(
      `Potential secret material was found in ${filePath}.`,
    );
  }
}

/**
 * Requires a directory to contain exactly the current generated-card contract.
 *
 * Exact-set validation prevents stale files from surviving a workflow run and
 * prevents unreviewed files from being published accidentally.
 */
async function validateExactAssetSet(directoryPath) {
  await assertNotSymlink(directoryPath);

  const entries = await fs.readdir(
    directoryPath,
    {
      withFileTypes: true,
    },
  );

  const actualFiles = entries
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .sort();

  const unexpectedEntries = entries
    .filter((entry) => !entry.isFile())
    .map((entry) => entry.name);

  if (unexpectedEntries.length > 0) {
    throw new Error(
      `Unexpected non-file entries in ${directoryPath}: ` +
      unexpectedEntries.join(", "),
    );
  }

  const expectedFiles = [
    ...ANALYTICS_ASSET_FILENAMES,
  ].sort();

  const missingFiles = expectedFiles.filter(
    (filename) => !actualFiles.includes(filename),
  );
  const unexpectedFiles = actualFiles.filter(
    (filename) => !expectedFiles.includes(filename),
  );

  if (
    missingFiles.length > 0 ||
    unexpectedFiles.length > 0
  ) {
    throw new Error(
      [
        `Generated asset contract mismatch in ${directoryPath}.`,
        missingFiles.length > 0
          ? `Missing: ${missingFiles.join(", ")}`
          : "",
        unexpectedFiles.length > 0
          ? `Unexpected: ${unexpectedFiles.join(", ")}`
          : "",
      ]
        .filter(Boolean)
        .join(" "),
    );
  }

  for (const filename of ANALYTICS_ASSET_FILENAMES) {
    await validateSvgFile(
      directoryPath,
      filename,
    );
  }
}

/**
 * Publishes the validated staging set through a clean directory replacement.
 *
 * Files are copied into a sibling temporary directory first. Only after that
 * complete directory passes the same exact-set validation is the old assets
 * directory removed and the temporary directory renamed into place.
 */
async function publishAssets() {
  await validateExactAssetSet(
    stagingDirectory,
  );

  const temporaryDirectory = path.join(
    path.dirname(assetDirectory),
    `.analytics-assets-publish-${process.pid}-${Date.now()}`,
  );

  await assertNotSymlink(temporaryDirectory);
  await fs.rm(temporaryDirectory, {
    recursive: true,
    force: true,
  });
  await fs.mkdir(temporaryDirectory, {
    recursive: true,
  });

  try {
    for (
      const filename
      of ANALYTICS_ASSET_FILENAMES
    ) {
      const sourcePath = path.join(
        stagingDirectory,
        filename,
      );
      const destinationPath = path.join(
        temporaryDirectory,
        filename,
      );

      await fs.copyFile(
        sourcePath,
        destinationPath,
      );
      await fs.chmod(
        destinationPath,
        0o644,
      );
    }

    await validateExactAssetSet(
      temporaryDirectory,
    );

    await assertNotSymlink(assetDirectory);
    await fs.rm(assetDirectory, {
      recursive: true,
      force: true,
    });
    await fs.rename(
      temporaryDirectory,
      assetDirectory,
    );

    await validateExactAssetSet(
      assetDirectory,
    );
  } finally {
    await fs.rm(temporaryDirectory, {
      recursive: true,
      force: true,
    });
  }

  console.log(
    `Published ${
      ANALYTICS_ASSET_FILENAMES.length
    } freshly generated SVG assets to ${
      path.relative(
        workspaceDirectory,
        assetDirectory,
      )
    }.`,
  );
}

function printAssetFilenames() {
  process.stdout.write(
    `${ANALYTICS_ASSET_FILENAMES.join("\n")}\n`,
  );
}

function printUsage() {
  console.error(
    [
      "Usage:",
      "  node scripts/manage-analytics-assets.mjs reset",
      "  node scripts/manage-analytics-assets.mjs validate-staging",
      "  node scripts/manage-analytics-assets.mjs validate-assets",
      "  node scripts/manage-analytics-assets.mjs publish",
      "  node scripts/manage-analytics-assets.mjs list",
    ].join("\n"),
  );
}

async function main() {
  const command = process.argv[2];

  switch (command) {
    case "reset":
      await resetDirectories();
      break;

    case "validate-staging":
      await validateExactAssetSet(
        stagingDirectory,
      );
      console.log(
        "Generated staging assets passed exact-set and SVG safety validation.",
      );
      break;

    case "validate-assets":
      await validateExactAssetSet(
        assetDirectory,
      );
      console.log(
        "Published assets passed exact-set and SVG safety validation.",
      );
      break;

    case "publish":
      await publishAssets();
      break;

    case "list":
      printAssetFilenames();
      break;

    default:
      printUsage();
      process.exitCode = 2;
  }
}

await main();
