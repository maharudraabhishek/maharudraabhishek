import assert from "node:assert/strict";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "..");

for (const [name, flag, expected] of [
  ["summary renderer contract", "--self-test-summary-cards", "Summary card self-test passed"],
  ["repository discovery and data pipeline contract", "--self-test-data-pipeline", "Data pipeline self-test passed"],
]) {
  test(name, () => {
    const result = spawnSync(
      process.execPath,
      ["scripts/generate-engineering-analytics.mjs", flag],
      { cwd: root, encoding: "utf8" },
    );
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, new RegExp(expected));
  });
}
