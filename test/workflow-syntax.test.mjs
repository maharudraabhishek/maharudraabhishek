import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { parseDocument } from "yaml";

const root = path.resolve(import.meta.dirname, "..");
const workflowFiles = [
  ".github/workflows/continuous-integration.yml",
  ".github/workflows/generate-analytics.yml",
  ".github/workflows/update-engineering-analytics.yml",
  "examples/public-only.yml",
  "examples/public-and-private.yml",
  "examples/direct-action-usage.yml",
  "action.yml",
];

test("workflow, example, and Action YAML parses", async () => {
  for (const file of workflowFiles) {
    const document = parseDocument(await fs.readFile(path.join(root, file), "utf8"));
    assert.deepEqual(
      document.errors,
      [],
      `${file}: ${document.errors.map((error) => error.message).join("; ")}`,
    );
  }
});

test("production third-party Actions use full commit SHAs", async () => {
  for (const file of workflowFiles.filter((item) => item.startsWith(".github/workflows/"))) {
    const content = await fs.readFile(path.join(root, file), "utf8");
    for (const match of content.matchAll(/^\s*uses:\s*([^\s#]+)(?:\s*#.*)?$/gmu)) {
      const reference = match[1];
      if (reference === "./" || reference.startsWith("maharudraabhishek/")) continue;
      assert.match(reference, /@[0-9a-f]{40}$/u, `${file}: ${reference}`);
    }
  }
});

test("CI stays read-only and reusable workflow names its private secret", async () => {
  const ci = await fs.readFile(
    path.join(root, ".github/workflows/continuous-integration.yml"),
    "utf8",
  );
  assert.match(ci, /permissions:\s*\n\s+contents: read/u);
  assert.doesNotMatch(ci, /pull_request_target/u);
  assert.doesNotMatch(ci, /PRIVATE_STATS_TOKEN/u);

  const reusable = await fs.readFile(
    path.join(root, ".github/workflows/generate-analytics.yml"),
    "utf8",
  );
  assert.match(reusable, /private-stats-token:/u);
  assert.doesNotMatch(reusable, /secrets:\s*inherit/u);
  assert.doesNotMatch(reusable, /git add\s+\./u);
});
