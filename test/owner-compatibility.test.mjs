import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { updateReadmeAnalytics } from "../src/output/update-readme.mjs";
import { removeWorkspace, temporaryWorkspace } from "./helpers.mjs";

test("owner legacy analytics presentation remains structurally equivalent", async (t) => {
  const repositoryRoot = path.resolve(import.meta.dirname, "..");
  const workspace = await temporaryWorkspace("owner-compatibility-");
  t.after(() => removeWorkspace(workspace));
  await fs.cp(path.join(repositoryRoot, "assets"), path.join(workspace, "assets"), {
    recursive: true,
  });
  const sourceReadme = await fs.readFile(path.join(repositoryRoot, "README.md"), "utf8");
  const readmePath = path.join(workspace, "README.md");
  await fs.writeFile(readmePath, sourceReadme);

  const result = await updateReadmeAnalytics({
    readmePath,
    outputDirectory: path.join(workspace, "assets"),
    username: "maharudraabhishek",
    attribution: false,
  });
  const updated = await fs.readFile(readmePath, "utf8");
  const startMarker = "<!-- ENGINEERING_ANALYTICS:START -->";
  const endMarker = "<!-- ENGINEERING_ANALYTICS:END -->";
  const sourcePrefix = sourceReadme.slice(0, sourceReadme.indexOf(startMarker));
  const updatedPrefix = updated.slice(0, updated.indexOf(startMarker));
  const sourceSuffix = sourceReadme.slice(
    sourceReadme.indexOf(endMarker) + endMarker.length,
  );
  const updatedSuffix = updated.slice(updated.indexOf(endMarker) + endMarker.length);
  const sourceInner = sourceReadme.slice(
    sourceReadme.indexOf(startMarker) + startMarker.length,
    sourceReadme.indexOf(endMarker),
  ).replaceAll("\r\n", "\n");
  const updatedInner = updated.slice(
    updated.indexOf(startMarker) + startMarker.length,
    updated.indexOf(endMarker),
  ).replaceAll("\r\n", "\n");
  assert.equal(sourcePrefix, updatedPrefix);
  assert.equal(sourceSuffix, updatedSuffix);
  assert.equal(
    sourceInner.replaceAll(/\?v=[0-9a-f]{16}/g, "?v=VERSION"),
    updatedInner.replaceAll(/\?v=[0-9a-f]{16}/g, "?v=VERSION"),
  );
  assert.equal(typeof result.changed, "boolean");
});
