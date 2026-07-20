import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadAnalyticsConfig } from "./github-analytics-config.mjs";
import { updateReadmeAnalytics } from "../src/output/update-readme.mjs";

/** Owner-compatible CLI wrapper around the reusable marker-safe updater. */
export async function main() {
  const config = await loadAnalyticsConfig();
  const result = await updateReadmeAnalytics({
    readmePath: path.resolve(process.env.README_FILE?.trim() || "README.md"),
    outputDirectory: path.resolve(
      process.env.ANALYTICS_ASSET_DIRECTORY?.trim() || "assets",
    ),
    username: config.profileUsername,
    insertMarkers: false,
    // Preserve the owner's existing profile presentation exactly.
    attribution: false,
    analyticsHeading: config.readmeHeading,
  });
  console.log(`README analytics block updated: ${result.changed ? "yes" : "no"}.`);
  return result;
}

const isDirectExecution = process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectExecution) await main();
