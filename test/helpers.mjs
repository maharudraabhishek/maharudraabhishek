import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { ANALYTICS_ASSET_FILENAMES } from "../src/output/asset-contract.mjs";

export async function temporaryWorkspace(prefix = "analytics-test-") {
  return fs.mkdtemp(path.join(os.tmpdir(), prefix));
}

export async function removeWorkspace(workspace) {
  await fs.rm(workspace, { recursive: true, force: true });
}

export function validSvg(extra = "") {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 50"><title>Test</title>${extra}</svg>`;
}

export async function createAssetSet(directory, projects = []) {
  await fs.mkdir(directory, { recursive: true });
  for (const filename of ANALYTICS_ASSET_FILENAMES) {
    let markers = "";
    if (filename === "github-overview.svg") {
      markers = '<g width="720" height="360" viewBox="0 0 720 360" id="overview-flow">ENGINEERING QUALITY</g>';
    } else if (filename === "contribution-streak.svg") {
      markers = '<g width="720" height="360" viewBox="0 0 720 360" id="streak-ring">DAY STREAK</g>';
    }
    await fs.writeFile(path.join(directory, filename), validSvg(markers));
  }
  for (const project of projects) {
    await fs.writeFile(path.join(directory, project.filename), validSvg(project.fullName));
  }
  await fs.writeFile(
    path.join(directory, "open-source-projects.json"),
    `${JSON.stringify({ version: 1, projects }, null, 2)}\n`,
  );
}
