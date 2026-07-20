import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import {
  README_MARKERS,
  updateReadmeAnalytics,
} from "../src/output/update-readme.mjs";
import { createAssetSet, removeWorkspace, temporaryWorkspace } from "./helpers.mjs";

async function fixture(t, readme) {
  const workspace = await temporaryWorkspace();
  t.after(() => removeWorkspace(workspace));
  const assets = path.join(workspace, "assets");
  const readmePath = path.join(workspace, "README.md");
  await createAssetSet(assets);
  await fs.writeFile(readmePath, readme, "utf8");
  return { assets, readmePath };
}

test("one standard marker pair is replaced without changing outside content", async (t) => {
  const original = `α before\n${README_MARKERS.standard.start}\nold\n${README_MARKERS.standard.end}\n后 after\n`;
  const { assets, readmePath } = await fixture(t, original);
  const result = await updateReadmeAnalytics({
    readmePath, outputDirectory: assets, username: "octocat", attribution: false,
  });
  const updated = await fs.readFile(readmePath, "utf8");
  assert.equal(result.changed, true);
  assert.equal(updated.startsWith("α before\n"), true);
  assert.equal(updated.endsWith("\n后 after\n"), true);
  assert.match(updated, /github-overview\.svg/);
});

test("legacy owner markers are reused", async (t) => {
  const { assets, readmePath } = await fixture(
    t,
    `${README_MARKERS.legacy.start}\n\n${README_MARKERS.legacy.end}\n`,
  );
  const result = await updateReadmeAnalytics({
    readmePath, outputDirectory: assets, username: "octocat", attribution: false,
  });
  assert.equal(result.markerStyle, "legacy");
});

test("a configured analytics heading is retained in the managed block", async (t) => {
  const { assets, readmePath } = await fixture(
    t,
    `${README_MARKERS.standard.start}\nold\n${README_MARKERS.standard.end}\n`,
  );
  await updateReadmeAnalytics({
    readmePath,
    outputDirectory: assets,
    username: "octocat",
    attribution: false,
    analyticsHeading: "## Realtime engineering analytics",
  });
  const updated = await fs.readFile(readmePath, "utf8");
  assert.match(updated, /## Realtime engineering analytics/);
});

test("missing markers fail by default and insert deterministically when enabled", async (t) => {
  const { assets, readmePath } = await fixture(t, "# Profile\n");
  await assert.rejects(updateReadmeAnalytics({
    readmePath, outputDirectory: assets, username: "octocat",
  }), /markers are missing/);
  const result = await updateReadmeAnalytics({
    readmePath,
    outputDirectory: assets,
    username: "octocat",
    insertMarkers: true,
  });
  assert.equal(result.changed, true);
  const updated = await fs.readFile(readmePath, "utf8");
  assert.equal(updated.startsWith("# Profile\n\n"), true);
  assert.equal((updated.match(/github-engineering-analytics:start/g) ?? []).length, 1);
});

test("incomplete, reversed, duplicate, and conflicting markers fail safely", async (t) => {
  const cases = [
    README_MARKERS.standard.start,
    README_MARKERS.standard.end,
    `${README_MARKERS.standard.end}\n${README_MARKERS.standard.start}`,
    `${README_MARKERS.standard.start}${README_MARKERS.standard.end}${README_MARKERS.standard.start}${README_MARKERS.standard.end}`,
    `${README_MARKERS.standard.start}${README_MARKERS.standard.end}${README_MARKERS.legacy.start}${README_MARKERS.legacy.end}`,
  ];
  for (const value of cases) {
    const { assets, readmePath } = await fixture(t, value);
    await assert.rejects(updateReadmeAnalytics({
      readmePath, outputDirectory: assets, username: "octocat",
    }), /marker|end marker/iu);
  }
});

test("CRLF, Unicode, empty blocks, and large outside content are preserved", async (t) => {
  const prefix = `# Unicode 🚀\r\n${"x".repeat(100_000)}\r\n`;
  const suffix = "\r\n尾部\r\n";
  const { assets, readmePath } = await fixture(
    t,
    `${prefix}${README_MARKERS.standard.start}\r\n${README_MARKERS.standard.end}${suffix}`,
  );
  await updateReadmeAnalytics({
    readmePath, outputDirectory: assets, username: "octocat", attribution: false,
  });
  const updated = await fs.readFile(readmePath, "utf8");
  assert.equal(updated.startsWith(prefix), true);
  assert.equal(updated.endsWith(suffix), true);
  assert.equal(/(^|[^\r])\n/.test(updated), false);
});

test("a second identical update performs no write", async (t) => {
  const { assets, readmePath } = await fixture(
    t,
    `${README_MARKERS.standard.start}\nold\n${README_MARKERS.standard.end}\n`,
  );
  await updateReadmeAnalytics({
    readmePath, outputDirectory: assets, username: "octocat", attribution: false,
  });
  const before = (await fs.stat(readmePath)).mtimeMs;
  const result = await updateReadmeAnalytics({
    readmePath, outputDirectory: assets, username: "octocat", attribution: false,
  });
  assert.equal(result.changed, false);
  assert.equal((await fs.stat(readmePath)).mtimeMs, before);
});

test("attribution can be enabled or disabled", async (t) => {
  for (const attribution of [true, false]) {
    const { assets, readmePath } = await fixture(
      t,
      `${README_MARKERS.standard.start}\nold\n${README_MARKERS.standard.end}\n`,
    );
    await updateReadmeAnalytics({
      readmePath, outputDirectory: assets, username: "octocat", attribution,
    });
    const updated = await fs.readFile(readmePath, "utf8");
    assert.equal(updated.includes("Generated with"), attribution);
  }
});
