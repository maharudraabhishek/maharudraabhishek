import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { publishGeneratedAssets } from "../src/output/publish-assets.mjs";
import {
  validateGeneratedAssets,
  validateSvg,
} from "../src/output/validate-assets.mjs";
import { createAssetSet, removeWorkspace, temporaryWorkspace, validSvg } from "./helpers.mjs";

test("valid exact generated set passes", async (t) => {
  const workspace = await temporaryWorkspace();
  t.after(() => removeWorkspace(workspace));
  await createAssetSet(workspace);
  const result = await validateGeneratedAssets(workspace);
  assert.equal(result.files.length, 23);
});

test("generated output rejects legacy placeholders", async (t) => {
  const workspace = await temporaryWorkspace();
  t.after(() => removeWorkspace(workspace));
  await createAssetSet(workspace);
  await fs.writeFile(path.join(workspace, ".gitkeep"), "placeholder");

  await assert.rejects(
    validateGeneratedAssets(workspace),
    /Generated asset set mismatch\. Unexpected: \.gitkeep\./,
  );
});

test("asset directories reject nested entries with a location-specific error", async (t) => {
  const workspace = await temporaryWorkspace();
  t.after(() => removeWorkspace(workspace));
  await createAssetSet(workspace);
  await fs.mkdir(path.join(workspace, "nested"));

  await assert.rejects(
    validateGeneratedAssets(workspace, { location: "Published analytics output" }),
    /Published analytics output contains a non-file entry/,
  );
});

test("invalid SVG payloads fail", async (t) => {
  const workspace = await temporaryWorkspace();
  t.after(() => removeWorkspace(workspace));
  const cases = [
    ["empty.svg", "", /empty/],
    ["html.svg", "<!doctype html><html>Error</html>", /SVG root/],
    ["json.svg", '{"message":"Bad credentials"}', /SVG root/],
    ["missing-viewbox.svg", "<svg><title>x</title></svg>", /viewBox/],
    ["unclosed.svg", "<svg viewBox=\"0 0 1 1\"><title>x</title>", /closing SVG/],
    ["placeholder.svg", validSvg("{{ unresolved }}"), /placeholder/],
    ["control.svg", validSvg("\u0001"), /control/],
  ];
  for (const [filename, content, pattern] of cases) {
    const filePath = path.join(workspace, filename);
    await fs.writeFile(filePath, content);
    await assert.rejects(validateSvg(filePath, { filename }), pattern);
  }
});

test("manifest secret material is rejected", async (t) => {
  const workspace = await temporaryWorkspace();
  t.after(() => removeWorkspace(workspace));
  await createAssetSet(workspace);
  const secret = "caller-private-secret";
  await fs.writeFile(
    path.join(workspace, "open-source-projects.json"),
    JSON.stringify({ version: 1, projects: [], note: secret }),
  );
  await assert.rejects(
    validateGeneratedAssets(workspace, { secrets: [secret] }),
    (error) => /secret material/.test(error.message) && !error.message.includes(secret),
  );
});

test("supplied secrets are detected without exposing them", async (t) => {
  const workspace = await temporaryWorkspace();
  t.after(() => removeWorkspace(workspace));
  const secret = "custom-test-secret";
  const filePath = path.join(workspace, "secret.svg");
  await fs.writeFile(filePath, validSvg(secret));
  await assert.rejects(
    validateSvg(filePath, { filename: "secret.svg", secrets: [secret] }),
    (error) => !error.message.includes(secret) && /secret material/.test(error.message),
  );
});

test("publisher replaces every stale output entry with the validated asset set", async (t) => {
  const workspace = await temporaryWorkspace();
  t.after(() => removeWorkspace(workspace));
  const staging = path.join(workspace, "staging");
  const output = path.join(workspace, "output");
  const oldProject = {
    fullName: "example/old",
    url: "https://github.com/example/old",
    filename: "open-source-project-example-old-12345678.svg",
    relationship: "verified-contribution",
  };
  await createAssetSet(output, [oldProject]);
  await fs.writeFile(path.join(output, ".gitkeep"), "legacy placeholder");
  await fs.writeFile(path.join(output, "user-file.txt"), "preserve");
  await fs.mkdir(path.join(output, "nested"));
  await createAssetSet(staging);
  const validated = await validateGeneratedAssets(staging);
  const result = await publishGeneratedAssets({
    stagingDirectory: staging,
    outputDirectory: output,
    files: validated.files,
  });
  assert.equal(result.staleFilesRemoved, 1);
  assert.equal(result.removedEntries, 4);
  await assert.rejects(fs.access(path.join(output, oldProject.filename)));
  await assert.rejects(fs.access(path.join(output, ".gitkeep")));
  await assert.rejects(fs.access(path.join(output, "user-file.txt")));
  await assert.rejects(fs.access(path.join(output, "nested")));
  await validateGeneratedAssets(output, { location: "Published analytics output" });
});

test("publisher preserves existing output when staging cannot be copied", async (t) => {
  const workspace = await temporaryWorkspace();
  t.after(() => removeWorkspace(workspace));
  const staging = path.join(workspace, "staging");
  const output = path.join(workspace, "output");
  await createAssetSet(staging);
  await createAssetSet(output);
  await fs.writeFile(path.join(output, "user-file.txt"), "preserve");

  await assert.rejects(
    publishGeneratedAssets({
      stagingDirectory: staging,
      outputDirectory: output,
      files: ["github-overview.svg", "missing.svg"],
    }),
    /Validated staging asset is missing or unsafe: missing\.svg/,
  );
  assert.equal(await fs.readFile(path.join(output, "user-file.txt"), "utf8"), "preserve");
});
