import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

const README_FILE = path.resolve(
  process.env.README_FILE?.trim() || "README.md",
);
const ASSET_DIRECTORY = path.resolve(
  process.env.ANALYTICS_ASSET_DIRECTORY?.trim() || "assets",
);

const START_MARKER = "<!-- ENGINEERING_ANALYTICS:START -->";
const END_MARKER = "<!-- ENGINEERING_ANALYTICS:END -->";

const CARDS = Object.freeze([
  ["github-overview.svg", "GitHub overview"],
  ["github-trophies.svg", "Custom GitHub engineering trophies"],
  ["contribution-streak.svg", "Contribution streak"],
  ["contribution-graph.svg", "GitHub contribution calendar"],
  ["github-activity-graph.svg", "GitHub activity area graph for the last 12 months"],
  [
    "personal-code-contribution.svg",
    "Personal code contribution by language",
  ],
  [
    "language-spectrum.svg",
    "Engineering language footprint across personal and stewarded projects",
  ],
  [
    "open-source-stewardship.svg",
    "Open-source stewardship and full public-project composition",
  ],
  [
    "frameworks-platforms.svg",
    "Framework and platform contribution impact",
  ],
  ["engineering-domains.svg", "Derived engineering domains"],
  [
    "delivery-collaboration.svg",
    "Delivery and collaboration analytics",
  ],
  ["repository-portfolio.svg", "Repository portfolio analytics"],
]);

const LEGACY_WIDGET_HOSTS = Object.freeze([
  "github-readme-stats.shion.dev",
  "streak-stats.demolab.com",
  "github-readme-activity-graph.vercel.app",
  "github-profile-trophy.vercel.app",
]);

function normalizeNewlines(value) {
  return String(value).replaceAll("\r\n", "\n").replaceAll("\r", "\n");
}

function removeLegacyWidgetLines(readme) {
  const lines = normalizeNewlines(readme).split("\n");
  const filtered = lines.filter(
    (line) =>
      !LEGACY_WIDGET_HOSTS.some((host) =>
        line.toLowerCase().includes(host.toLowerCase()),
      ),
  );

  // Avoid leaving large blank gaps where the old external widgets were.
  return filtered.join("\n").replace(/\n{4,}/g, "\n\n\n");
}

async function validateAndHashAssets() {
  const hash = crypto.createHash("sha256");

  for (const [filename] of CARDS) {
    const assetPath = path.join(ASSET_DIRECTORY, filename);
    const content = await fs.readFile(assetPath);

    if (content.length === 0) {
      throw new Error(`${assetPath} is empty.`);
    }

    const text = content.toString("utf8");
    if (!text.includes("<svg")) {
      throw new Error(`${assetPath} is not a valid SVG document.`);
    }

    hash.update(filename);
    hash.update("\0");
    hash.update(content);
    hash.update("\0");
  }

  return hash.digest("hex").slice(0, 16);
}

function buildAnalyticsBlock(version) {
  const imageBlocks = CARDS.map(
    ([filename, alt]) => `<p align="center">
  <img src="./assets/${filename}?v=${version}" alt="${alt}" />
</p>`,
  ).join("\n\n");

  return `${START_MARKER}
## 📊 Engineering Analytics

> Personal contribution cards count GitHub-attributed work. Full repository composition is included only for repositories owned by this profile and explicitly declared public stewardship projects.

${imageBlocks}
${END_MARKER}`;
}

function replaceOrAppendBlock(readme, block) {
  const startIndex = readme.indexOf(START_MARKER);
  const endIndex = readme.indexOf(END_MARKER);

  if ((startIndex >= 0) !== (endIndex >= 0)) {
    throw new Error(
      "README.md contains only one engineering-analytics marker. Add both markers or remove the incomplete marker before rerunning.",
    );
  }

  if (startIndex >= 0 && endIndex < startIndex) {
    throw new Error(
      "README.md engineering-analytics markers are in the wrong order.",
    );
  }

  if (startIndex >= 0) {
    const afterEnd = endIndex + END_MARKER.length;
    return `${readme.slice(0, startIndex).trimEnd()}\n\n${block}\n\n${readme
      .slice(afterEnd)
      .trimStart()}`.trimEnd() + "\n";
  }

  const existing = readme.trimEnd();
  return `${existing}${existing ? "\n\n" : ""}${block}\n`;
}

async function main() {
  let readme;

  try {
    readme = await fs.readFile(README_FILE, "utf8");
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
    readme = "";
  }

  const version = await validateAndHashAssets();
  const cleanedReadme = removeLegacyWidgetLines(readme);
  const analyticsBlock = buildAnalyticsBlock(version);
  const updatedReadme = replaceOrAppendBlock(
    cleanedReadme,
    analyticsBlock,
  );

  await fs.writeFile(README_FILE, updatedReadme, "utf8");

  console.log(
    `Updated ${path.relative(process.cwd(), README_FILE)} with analytics version ${version}.`,
  );
}

await main();
