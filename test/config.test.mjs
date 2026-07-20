import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import {
  normalizeAliases,
  normalizeAnalyticsHeading,
  parseBoolean,
  resolveAnalyticsConfig,
} from "../src/config/resolve-config.mjs";
import { loadAnalyticsConfig } from "../scripts/github-analytics-config.mjs";
import { removeWorkspace, temporaryWorkspace } from "./helpers.mjs";

test("automatic username, defaults, and profile exclusion", async (t) => {
  const workspace = await temporaryWorkspace();
  t.after(() => removeWorkspace(workspace));
  const config = await resolveAnalyticsConfig({
    workspace,
    environment: { GITHUB_REPOSITORY_OWNER: "octocat" },
  });
  assert.equal(config.profileUsername, "octocat");
  assert.equal(config.outputDirectory.relative, "assets/github-analytics");
  assert.equal(config.readmePath.relative, "README.md");
  assert.equal(config.readmeHeading, "## 📊 GitHub Analytics");
  assert.deepEqual(config.excludedRepositories, ["octocat/octocat"]);
});

test("explicit input overrides caller config and owner environment", async (t) => {
  const workspace = await temporaryWorkspace();
  t.after(() => removeWorkspace(workspace));
  await fs.writeFile(path.join(workspace, "analytics.config.mjs"), `export default {
    profile: { username: "configured" },
    publicContributions: { aliases: ["old-one"] },
    output: { directory: "configured-assets" },
    readme: { analyticsHeading: "### Configured analytics" }
  };`);
  const config = await resolveAnalyticsConfig({
    workspace,
    inputs: {
      configPath: "analytics.config.mjs",
      githubUsername: "explicit-user",
      aliases: "First, first, EXPLICIT-USER, second",
      outputDirectory: "chosen-assets",
    },
    environment: { GITHUB_REPOSITORY_OWNER: "environment-user" },
  });
  assert.equal(config.profileUsername, "explicit-user");
  assert.deepEqual(config.publicContributorAliases, ["First", "second"]);
  assert.equal(config.outputDirectory.relative, "chosen-assets");
  assert.equal(config.readmeHeading, "### Configured analytics");
});

test("aliases trim, deduplicate case-insensitively, and exclude primary", () => {
  assert.deepEqual(
    normalizeAliases([" Old ", "", "old", "PRIMARY", "New"], "primary"),
    ["Old", "New"],
  );
});

test("boolean values are strict", () => {
  assert.equal(parseBoolean("true", "flag", false), true);
  assert.equal(parseBoolean("false", "flag", true), false);
  assert.throws(() => parseBoolean("yes", "flag", false), /exactly/);
  assert.throws(() => parseBoolean("TRUE", "flag", false), /exactly/);
});

test("analytics headings are single Markdown headings", () => {
  assert.equal(normalizeAnalyticsHeading("## Engineering analytics"), "## Engineering analytics");
  assert.throws(() => normalizeAnalyticsHeading("Analytics"), /Markdown heading/);
  assert.throws(() => normalizeAnalyticsHeading("## One\n## Two"), /single Markdown heading/);
});

test("missing username fails early", async (t) => {
  const workspace = await temporaryWorkspace();
  t.after(() => removeWorkspace(workspace));
  await assert.rejects(
    resolveAnalyticsConfig({ workspace, environment: {} }),
    /github-username is required/,
  );
});

test("missing and invalid config files fail", async (t) => {
  const workspace = await temporaryWorkspace();
  t.after(() => removeWorkspace(workspace));
  await assert.rejects(
    resolveAnalyticsConfig({
      workspace,
      inputs: { configPath: "missing.mjs" },
      environment: { GITHUB_REPOSITORY_OWNER: "octocat" },
    }),
    /Config file not found/,
  );
  await fs.writeFile(path.join(workspace, "invalid.mjs"), "export default [];\n");
  await assert.rejects(
    resolveAnalyticsConfig({
      workspace,
      inputs: { configPath: "invalid.mjs" },
      environment: { GITHUB_REPOSITORY_OWNER: "octocat" },
    }),
    /Default config export must be an object/,
  );
});

test("unsafe output and README paths fail", async (t) => {
  const workspace = await temporaryWorkspace();
  t.after(() => removeWorkspace(workspace));
  const environment = { GITHUB_REPOSITORY_OWNER: "octocat" };
  await assert.rejects(
    resolveAnalyticsConfig({
      workspace,
      inputs: { outputDirectory: "../escape" },
      environment,
    }),
    /inside the GitHub workspace/,
  );
  await assert.rejects(
    resolveAnalyticsConfig({
      workspace,
      inputs: { readmePath: ".github/workflows/README.md" },
      environment,
    }),
    /protected/,
  );
  await assert.rejects(
    resolveAnalyticsConfig({
      workspace,
      inputs: { outputDirectory: "src/generated" },
      environment,
    }),
    /protected/,
  );
  await assert.rejects(
    resolveAnalyticsConfig({
      workspace,
      inputs: { readmePath: "package.json" },
      environment,
    }),
    /\.md or \.markdown/,
  );
});

test("owner personal config remains compatible", async () => {
  const config = await loadAnalyticsConfig(".github/github-analytics.config.mjs");
  assert.equal(config.profileUsername, "maharudraabhishek");
  assert.deepEqual(config.publicContributorAliases, ["abkumar"]);
  assert.equal(config.readmeHeading, "## 📊 GitHub Realtime Engineering Analytics");
});
