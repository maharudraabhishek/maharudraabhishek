import * as actionsCore from "@actions/core";
import { runAnalytics } from "../core/run-analytics.mjs";
import { safeErrorMessage } from "../shared/errors.mjs";

const INPUT_NAMES = Object.freeze({
  githubUsername: "github-username",
  aliases: "aliases",
  configPath: "config-path",
  includePrivate: "include-private",
  outputDirectory: "output-directory",
  readmePath: "readme-path",
  updateReadme: "update-readme",
  insertReadmeMarkers: "insert-readme-markers",
  attribution: "attribution",
  strictMode: "strict-mode",
});

export function readActionInputs(core) {
  return Object.fromEntries(
    Object.entries(INPUT_NAMES).map(([key, name]) => [key, core.getInput(name)]),
  );
}

export function publishActionOutputs(core, result) {
  core.setOutput("generated-files", JSON.stringify(result.generatedFiles));
  core.setOutput("generated-card-count", String(result.generatedCardCount));
  core.setOutput("repositories-analyzed", String(result.repositoriesAnalyzed));
  core.setOutput("repositories-skipped", String(result.repositoriesSkipped));
  core.setOutput("readme-updated", String(result.readmeUpdated));
  core.setOutput("changes-detected", String(result.changesDetected));
  core.setOutput("output-directory", result.outputDirectory);
  core.setOutput("readme-path", result.readmePath);
}

export async function runAction({
  core = actionsCore,
  environment = process.env,
  analyticsRunner = runAnalytics,
} = {}) {
  const inputs = readActionInputs(core);
  const publicToken = environment.GITHUB_TOKEN ?? "";
  const privateToken = environment.PRIVATE_STATS_TOKEN ?? "";
  if (publicToken) core.setSecret(publicToken);
  if (privateToken) core.setSecret(privateToken);
  let groupOpen = false;

  try {
    core.startGroup("Generate GitHub engineering analytics");
    groupOpen = true;
    const result = await analyticsRunner({
      ...inputs,
      workspace: environment.GITHUB_WORKSPACE,
      environment,
      githubToken: publicToken,
      privateToken,
      logger: {
        log: (message) => core.info(String(message)),
        warn: (message) => core.warning(String(message)),
      },
    });
    core.endGroup();
    groupOpen = false;

    for (const warning of result.warnings) core.warning(warning);
    publishActionOutputs(core, result);
    await core.summary
      .addHeading("GitHub Engineering Analytics")
      .addTable([
        [{ data: "Result", header: true }, { data: "Value", header: true }],
        ["Generated cards", String(result.generatedCardCount)],
        ["Repositories analyzed", String(result.repositoriesAnalyzed)],
        ["Repositories skipped", String(result.repositoriesSkipped)],
        ["README updated", result.readmeUpdated ? "Yes" : "No"],
        ["Changes detected", result.changesDetected ? "Yes" : "No"],
      ])
      .write();
    return result;
  } catch (error) {
    if (groupOpen) core.endGroup();
    const message = safeErrorMessage(error, [publicToken, privateToken]);
    core.setFailed(`${error?.code ? `${error.code}: ` : ""}${message}`);
    return null;
  }
}
