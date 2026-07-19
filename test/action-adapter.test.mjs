import assert from "node:assert/strict";
import test from "node:test";
import { runAction } from "../src/action/main.mjs";
import fs from "node:fs/promises";
import path from "node:path";

function fakeCore(inputs = {}) {
  const outputs = new Map();
  const failures = [];
  const summary = {
    addHeading() { return this; },
    addTable() { return this; },
    async write() {},
  };
  return {
    outputs,
    failures,
    summary,
    getInput: (name) => inputs[name] ?? "",
    setOutput: (name, value) => outputs.set(name, value),
    setFailed: (message) => failures.push(message),
    setSecret() {},
    startGroup() {},
    endGroup() {},
    info() {},
    warning() {},
  };
}

test("Action maps inputs and publishes deterministic outputs", async () => {
  const core = fakeCore({ "github-username": "octocat", "include-private": "false" });
  let received;
  await runAction({
    core,
    environment: { GITHUB_TOKEN: "public", GITHUB_WORKSPACE: "/workspace" },
    analyticsRunner: async (options) => {
      received = options;
      return {
        generatedFiles: ["assets/a.svg"],
        generatedCardCount: 1,
        repositoriesAnalyzed: 2,
        repositoriesSkipped: 3,
        readmeUpdated: true,
        changesDetected: true,
        warnings: [],
        outputDirectory: "assets",
        readmePath: "README.md",
      };
    },
  });
  assert.equal(received.githubUsername, "octocat");
  assert.equal(received.githubToken, "public");
  assert.equal(core.outputs.get("generated-files"), '["assets/a.svg"]');
  assert.equal(core.outputs.get("repositories-skipped"), "3");
  assert.equal(core.outputs.get("output-directory"), "assets");
  assert.deepEqual(core.failures, []);
});

test("Action failures use setFailed and redact tokens", async () => {
  const core = fakeCore();
  const token = "github_pat_sensitive_value";
  const result = await runAction({
    core,
    environment: { GITHUB_TOKEN: token },
    analyticsRunner: async () => {
      throw new Error(`Bad credentials: ${token}`);
    },
  });
  assert.equal(result, null);
  assert.equal(core.failures.length, 1);
  assert.equal(core.failures[0].includes(token), false);
});

test("Action and shared core contain no git process invocation", async () => {
  const root = path.resolve(import.meta.dirname, "..");
  const source = await Promise.all([
    "src/action/main.mjs",
    "src/core/run-analytics.mjs",
  ].map((file) => fs.readFile(path.join(root, file), "utf8")));
  assert.doesNotMatch(source.join("\n"), /child_process|\bgit\s+(?:add|commit|push)\b/iu);
});
