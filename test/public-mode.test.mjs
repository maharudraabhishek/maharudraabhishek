import assert from "node:assert/strict";
import test from "node:test";
import { repositoryPortfolioPrivateMetric } from "../scripts/generate-engineering-analytics.mjs";

test("public mode reports private repository data as inaccessible, not zero", () => {
  assert.deepEqual(
    repositoryPortfolioPrivateMetric(0, false),
    { value: "N/A", label: "Private repositories (not accessible)" },
  );
});

test("private mode preserves verified numeric private repository counts", () => {
  assert.deepEqual(
    repositoryPortfolioPrivateMetric(0, true),
    { value: "0", label: "Private repositories" },
  );
  assert.deepEqual(
    repositoryPortfolioPrivateMetric(12, true),
    { value: "12", label: "Private repositories" },
  );
});
