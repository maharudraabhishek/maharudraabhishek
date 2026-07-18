import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

const README_FILE = path.resolve(
  process.env.README_FILE?.trim() || "README.md",
);
const ASSET_DIRECTORY = path.resolve(
  process.env.ANALYTICS_ASSET_DIRECTORY?.trim() || "assets",
);
const username =
  process.env.GITHUB_USERNAME?.trim() || "maharudraabhishek";

const START_MARKER = "<!-- ENGINEERING_ANALYTICS:START -->";
const END_MARKER = "<!-- ENGINEERING_ANALYTICS:END -->";

const CARDS = Object.freeze([
  ["github-overview.svg", "GitHub overview"],
  ["github-trophies.svg", "GitHub engineering trophies"],
  ["contribution-streak.svg", "Contribution streak"],
  ["contribution-graph.svg", "GitHub contribution calendar"],
  [
    "github-activity-graph.svg",
    "GitHub activity graph for the last 12 months",
  ],
  [
    "personal-code-contribution.svg",
    "Personal code contribution by language",
  ],
  [
    "language-spectrum.svg",
    "Engineering language footprint across personal and public contributed projects",
  ],
  [
    "public-contribution-portfolio.svg",
    "Public open-source contribution portfolio",
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

// Includes every filename emitted by current and previous generator versions.
// These references are removed before the single current managed block is added.
const MANAGED_ASSET_FILENAMES = Object.freeze([
  ...new Set([
    ...CARDS.map(([filename]) => filename),
    "github-languages.svg",
    "activity-timeline.svg",
    "engineering-trophies.svg",
    "open-source-stewardship.svg",
  ]),
]);

const MANAGED_EXTERNAL_HOSTS = Object.freeze([
  "github-readme-stats.shion.dev",
  "streak-stats.demolab.com",
  "github-readme-activity-graph.vercel.app",
  "github-profile-trophy.vercel.app",
  "komarev.com/ghpvc",
  "visitcount.itsvg.in",
  `hits.sh/github.com/${username}`,
]);

function normalizeNewlines(value) {
  return String(value).replaceAll("\r\n", "\n").replaceAll("\r", "\n");
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function containsManagedReference(value) {
  const lower = String(value).toLowerCase();

  return (
    MANAGED_ASSET_FILENAMES.some((filename) =>
      lower.includes(filename.toLowerCase()),
    ) ||
    MANAGED_EXTERNAL_HOSTS.some((host) =>
      lower.includes(host.toLowerCase()),
    )
  );
}

function removeAllMarkedBlocks(readme) {
  const markerPattern = new RegExp(
    `${escapeRegExp(START_MARKER)}[\\s\\S]*?${escapeRegExp(END_MARKER)}`,
    "g",
  );
  return readme.replace(markerPattern, "");
}

function removeManagedHtmlBlocks(readme) {
  let result = readme;

  // Previous versions used centered paragraph wrappers for each image.
  result = result.replace(/<p\b[^>]*>[\s\S]*?<\/p>/gi, (block) =>
    containsManagedReference(block) ? "" : block,
  );

  // Also remove standalone linked-image HTML blocks without a paragraph.
  result = result.replace(/<a\b[^>]*>[\s\S]*?<\/a>/gi, (block) =>
    containsManagedReference(block) ? "" : block,
  );

  return result;
}

function removeManagedLines(readme) {
  const lines = readme.split("\n");
  const filtered = [];

  for (const line of lines) {
    const trimmed = line.trim();

    if (containsManagedReference(line)) continue;
    if (/^##\s+📊\s+Engineering Analytics\s*$/i.test(trimmed)) continue;
    if (/^##\s+Engineering Analytics\s*$/i.test(trimmed)) continue;
    if (
      trimmed ===
      "> Personal contribution cards count GitHub-attributed work. Full repository composition is included only for repositories owned by this profile and explicitly declared public stewardship projects."
    ) {
      continue;
    }
    if (
      trimmed ===
      "> Personal contribution cards count GitHub-attributed work. Full public-project composition is shown separately and is not a personal-authorship claim."
    ) {
      continue;
    }

    filtered.push(line);
  }

  return filtered.join("\n");
}

function cleanExistingAnalytics(readme) {
  const normalized = normalizeNewlines(readme);
  const withoutMarkers = removeAllMarkedBlocks(normalized);
  const withoutHtml = removeManagedHtmlBlocks(withoutMarkers);
  const withoutLines = removeManagedLines(withoutHtml);

  return withoutLines
    .replace(/[ \t]+$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
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

function buildProfileViewBadge() {
  const encodedUsername = encodeURIComponent(username);
  const dashboardUrl = `https://hits.sh/github.com/${encodedUsername}/`;
  const badgeUrl =
    `https://hits.sh/github.com/${encodedUsername}.svg` +
    "?view=today-total" +
    "&style=flat-square" +
    "&label=Profile%20views" +
    "&color=0D1117" +
    "&labelColor=30363D" +
    "&logo=github";

  return `<p align="center">
  <a href="${dashboardUrl}">
    <img src="${badgeUrl}" alt="Profile views" />
  </a>
</p>`;
}

function buildAnalyticsBlock(version) {
  const imageBlocks = CARDS.map(
    ([filename, alt]) => `<p align="center">
  <img src="./assets/${filename}?v=${version}" alt="${alt}" />
</p>`,
  ).join("\n\n");

  return `${START_MARKER}
## 📊 Engineering Analytics

> Personal contribution cards count GitHub-attributed work. Full public-project composition is shown separately and is not a personal-authorship claim.

${imageBlocks}

${buildProfileViewBadge()}
${END_MARKER}`;
}

function countOccurrences(value, needle) {
  if (!needle) return 0;
  return value.split(needle).length - 1;
}

function validateSingleManagedBlock(readme) {
  if (countOccurrences(readme, START_MARKER) !== 1) {
    throw new Error("README.md must contain exactly one analytics start marker.");
  }
  if (countOccurrences(readme, END_MARKER) !== 1) {
    throw new Error("README.md must contain exactly one analytics end marker.");
  }

  for (const [filename] of CARDS) {
    if (countOccurrences(readme, filename) !== 1) {
      throw new Error(
        `README.md must reference ${filename} exactly once.`,
      );
    }
  }

  if (countOccurrences(readme, `hits.sh/github.com/${username}`) !== 2) {
    throw new Error(
      "README.md must contain one profile-view badge and one dashboard link.",
    );
  }
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
  const cleanedReadme = cleanExistingAnalytics(readme);
  const analyticsBlock = buildAnalyticsBlock(version);
  const updatedReadme = `${cleanedReadme}${cleanedReadme ? "\n\n" : ""}${analyticsBlock}\n`;

  validateSingleManagedBlock(updatedReadme);
  await fs.writeFile(README_FILE, updatedReadme, "utf8");

  console.log(
    `Replaced all previous analytics references in ${path.relative(process.cwd(), README_FILE)} with analytics version ${version}.`,
  );
}

await main();
