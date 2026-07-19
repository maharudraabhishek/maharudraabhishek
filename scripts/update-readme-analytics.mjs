import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import {
  loadAnalyticsConfig,
} from "./github-analytics-config.mjs";

const README_FILE = path.resolve(
  process.env.README_FILE?.trim() || "README.md",
);
const ASSET_DIRECTORY = path.resolve(
  process.env.ANALYTICS_ASSET_DIRECTORY?.trim() || "assets",
);

const { profileUsername: username } =
  await loadAnalyticsConfig();

const START_MARKER =
  "<!-- ENGINEERING_ANALYTICS:START -->";
const END_MARKER =
  "<!-- ENGINEERING_ANALYTICS:END -->";
const OPEN_SOURCE_PROJECT_MANIFEST = "open-source-projects.json";

const CARDS = Object.freeze([
  ["github-overview.svg", "GitHub overview"],
  ["contribution-streak.svg", "Contribution streak"],
  ["github-trophies.svg", "GitHub engineering trophies"],
  ["language-spectrum.svg", "Engineering language footprint across personal and verified public projects"],
  ["personal-code-contribution.svg", "Personal code contribution by language"],
  ["frameworks-platforms.svg", "Framework and platform contribution impact"],
  ["delivery-collaboration.svg", "Delivery and collaboration analytics"],
  ["repository-portfolio.svg", "Repository portfolio analytics"],
  ["engineering-domains.svg", "Derived engineering domains"],
  ["github-activity-graph.svg", "GitHub activity graph for the last 12 months"],
  ["contribution-graph.svg", "GitHub contribution calendar"],
  ["ai-engineering-overview.svg", "AI engineering overview"],
  ["ai-engineering-trophies.svg", "AI engineering trophies"],
  ["agentic-workflow-maturity.svg", "Agentic workflow maturity"],
  ["ai-engineering-capabilities.svg", "AI engineering capabilities"],
  ["mcp-tool-integration.svg", "MCP and tool integration"],
  ["ai-workflow-activity.svg", "AI workflow activity"],
  ["context-governance.svg", "Context engineering and governance"],
  ["context-engineering.svg", "Compact context engineering analytics"],
  ["memory-engineering.svg", "Compact memory engineering analytics"],
  ["ai-harness-engineering.svg", "Compact AI harness engineering analytics"],
  ["agentic-orchestration.svg", "Compact agentic orchestration analytics"]
]);

const MANAGED_ASSET_FILENAMES = Object.freeze([
  ...new Set([
    ...CARDS.map(([filename]) => filename),
    "public-contribution-portfolio.svg",
    "github-languages.svg",
    "activity-timeline.svg",
    "engineering-trophies.svg",
    "open-source-stewardship.svg",
    "prompt-engineering.svg",
    "rag-retrieval-engineering.svg",
    "ai-evaluation-observability.svg",
    "ai-governance-safety.svg"
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

const CARD = Object.freeze({
  overview: Object.freeze(["github-overview.svg", "GitHub overview"]),
  streak: Object.freeze(["contribution-streak.svg", "Contribution streak"]),
  github_trophies: Object.freeze(["github-trophies.svg", "GitHub engineering trophies"]),
  languages: Object.freeze(["language-spectrum.svg", "Engineering language footprint across personal and verified public projects"]),
  personal_code: Object.freeze(["personal-code-contribution.svg", "Personal code contribution by language"]),
  frameworks: Object.freeze(["frameworks-platforms.svg", "Framework and platform contribution impact"]),
  delivery: Object.freeze(["delivery-collaboration.svg", "Delivery and collaboration analytics"]),
  portfolio: Object.freeze(["repository-portfolio.svg", "Repository portfolio analytics"]),
  domains: Object.freeze(["engineering-domains.svg", "Derived engineering domains"]),
  activity_graph: Object.freeze(["github-activity-graph.svg", "GitHub activity graph for the last 12 months"]),
  contribution_calendar: Object.freeze(["contribution-graph.svg", "GitHub contribution calendar"]),
  ai_overview: Object.freeze(["ai-engineering-overview.svg", "AI engineering overview"]),
  ai_trophies: Object.freeze(["ai-engineering-trophies.svg", "AI engineering trophies"]),
  ai_maturity: Object.freeze(["agentic-workflow-maturity.svg", "Agentic workflow maturity"]),
  ai_capabilities: Object.freeze(["ai-engineering-capabilities.svg", "AI engineering capabilities"]),
  mcp: Object.freeze(["mcp-tool-integration.svg", "MCP and tool integration"]),
  ai_activity: Object.freeze(["ai-workflow-activity.svg", "AI workflow activity"]),
  context_governance: Object.freeze(["context-governance.svg", "Context engineering and governance"]),
  context: Object.freeze(["context-engineering.svg", "Compact context engineering analytics"]),
  memory: Object.freeze(["memory-engineering.svg", "Compact memory engineering analytics"]),
  harness: Object.freeze(["ai-harness-engineering.svg", "Compact AI harness engineering analytics"]),
  orchestration: Object.freeze(["agentic-orchestration.svg", "Compact agentic orchestration analytics"]),
});

function normalizeNewlines(value) {
  return String(value)
    .replaceAll("\r\n", "\n")
    .replaceAll("\r", "\n");
}

function escapeRegExp(value) {
  return String(value)
    .replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function containsManagedReference(value) {
  const lower = String(value).toLowerCase();

  return (
    MANAGED_ASSET_FILENAMES.some((filename) =>
      lower.includes(filename.toLowerCase())
    ) ||
    lower.includes("open-source-project-") ||
    MANAGED_EXTERNAL_HOSTS.some((host) =>
      lower.includes(host.toLowerCase())
    )
  );
}

function removeAllMarkedBlocks(readme) {
  const markerPattern = new RegExp(
    `${escapeRegExp(START_MARKER)}[\\s\\S]*?` +
      escapeRegExp(END_MARKER),
    "g",
  );

  return readme.replace(markerPattern, "");
}

function removeManagedHtmlBlocks(readme) {
  let result = readme;

  // Remove complete managed blocks before individual lines. This prevents
  // stale two-column tables and compact-card tables from leaving empty cells.
  result = result.replace(
    /<table\b[^>]*>[\s\S]*?<\/table>/gi,
    (block) => containsManagedReference(block) ? "" : block,
  );
  result = result.replace(
    /<p\b[^>]*>[\s\S]*?<\/p>/gi,
    (block) => containsManagedReference(block) ? "" : block,
  );
  result = result.replace(
    /<a\b[^>]*>[\s\S]*?<\/a>/gi,
    (block) => containsManagedReference(block) ? "" : block,
  );

  return result;
}

function removeManagedLines(readme) {
  return readme
    .split("\n")
    .filter((line) => {
      const trimmed = line.trim();

      if (containsManagedReference(line)) return false;

      if (
        /^##\s+📊\s+(Engineering|GitHub) Analytics\s*$/i
          .test(trimmed)
      ) return false;

      if (
        /^##\s+(Engineering|GitHub) Analytics\s*$/i
          .test(trimmed)
      ) return false;

      if (
        /^###\s+🤖\s+AI Engineering Analytics\s*$/i
          .test(trimmed)
      ) return false;

      if (
        /^###\s+AI Engineering Analytics\s*$/i
          .test(trimmed)
      ) return false;

      if (
        /^####\s+Specialized AI Engineering\s*$/i
          .test(trimmed)
      ) return false;

      if (
        /^###\s+📈\s+Additional Graph Stats\s*$/i
          .test(trimmed)
      ) return false;

      if (
        /^###\s+Additional Graph Stats\s*$/i
          .test(trimmed)
      ) return false;

      if (
        /^###\s+🌐\s+Open[- ]Source Contributions\s*$/i
          .test(trimmed)
      ) return false;

      if (
        /^###\s+Open[- ]Source Contributions\s*$/i
          .test(trimmed)
      ) return false;

      if (
        /^###\s+👁️?\s+Profile Views\s*$/i
          .test(trimmed)
      ) return false;

      if (
        /^###\s+Profile Views\s*$/i
          .test(trimmed)
      ) return false;

      if (
        /^> Personal contribution cards count GitHub-attributed work\./
          .test(trimmed)
      ) return false;

      if (
        /^> AI analytics are evidence-based/
          .test(trimmed)
      ) return false;

      if (
        /^> Focused cards report context, memory, harness and orchestration/
          .test(trimmed)
      ) return false;

      if (
        /^> (?:✅ Verified open-source contributions: )?Public project cards separate full project composition/
          .test(trimmed)
      ) return false;

      return true;
    })
    .join("\n");
}

function cleanExistingAnalytics(readme) {
  return removeManagedLines(
    removeManagedHtmlBlocks(
      removeAllMarkedBlocks(
        normalizeNewlines(readme),
      ),
    ),
  )
    .replace(/[ \t]+$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

async function loadOpenSourceProjects() {
  const manifestPath = path.join(ASSET_DIRECTORY, OPEN_SOURCE_PROJECT_MANIFEST);
  const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8"));
  if (manifest?.version !== 1 || !Array.isArray(manifest.projects)) {
    throw new Error(`${manifestPath} must use open-source project manifest version 1.`);
  }
  const filenames = new Set();
  const names = new Set();
  for (const project of manifest.projects) {
    const fullName = String(project?.fullName ?? "");
    const filename = String(project?.filename ?? "");
    if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(fullName) ||
        !/^open-source-project-[a-z0-9._-]+-[0-9a-f]{8}\.svg$/.test(filename) ||
        project?.url !== `https://github.com/${fullName}` ||
        !["owned-open-source", "verified-contribution"].includes(project?.relationship) ||
        (project?.relationship === "owned-open-source" &&
          !/^[A-Za-z0-9.+-]+$/.test(String(project?.licenseSpdx ?? ""))) ||
        filenames.has(filename) || names.has(fullName.toLowerCase())) {
      throw new Error(`Invalid or duplicate project entry in ${manifestPath}: ${fullName || "unknown"}`);
    }
    filenames.add(filename);
    names.add(fullName.toLowerCase());
  }
  return manifest.projects;
}

async function validateAndHashAssets(openSourceProjects) {
  const hash = crypto.createHash("sha256");

  const filenames = [
    ...CARDS.map(([filename]) => filename),
    ...openSourceProjects.map((project) => project.filename),
    OPEN_SOURCE_PROJECT_MANIFEST,
  ];
  for (const filename of filenames) {
    const assetPath = path.join(
      ASSET_DIRECTORY,
      filename,
    );
    const content = await fs.readFile(assetPath);

    if (!content.length) {
      throw new Error(`${assetPath} is empty.`);
    }

    if (filename.endsWith(".svg") && !content.toString("utf8").includes("<svg")) {
      throw new Error(
        `${assetPath} is not a valid SVG document.`,
      );
    }

    hash.update(filename);
    hash.update("\0");
    hash.update(content);
    hash.update("\0");
  }

  return hash.digest("hex").slice(0, 16);
}

function fullWidthCard(card, version) {
  const [filename, alt] = card;

  return `<p align="center">
  <img src="./assets/${filename}?v=${version}" alt="${alt}" width="100%" />
</p>`;
}

/**
 * Centers a naturally sized SVG on its own row.
 *
 * GitHub applies max-width constraints on narrow screens, so the card remains
 * responsive without being stretched to the full README width on desktop.
 */
function naturalWidthCard(card, version, width) {
  const [filename, alt] = card;

  return `<p align="center">
  <img src="./assets/${filename}?v=${version}" alt="${alt}" width="${width}" />
</p>`;
}

function twoColumnRow(leftCard, rightCard, version) {
  const [leftFilename, leftAlt] = leftCard;
  const [rightFilename, rightAlt] = rightCard;

  return `<table width="100%">
  <tr>
    <td width="50%" align="center" valign="top">
      <img src="./assets/${leftFilename}?v=${version}" alt="${leftAlt}" width="100%" />
    </td>
    <td width="50%" align="center" valign="top">
      <img src="./assets/${rightFilename}?v=${version}" alt="${rightAlt}" width="100%" />
    </td>
  </tr>
</table>`;
}

function compactSpecializedGrid(version) {
  const cards = [
    CARD.context,
    CARD.memory,
    CARD.harness,
    CARD.orchestration,
  ];

  const rows = [];

  for (let index = 0; index < cards.length; index += 2) {
    const cells = cards
      .slice(index, index + 2)
      .map(([filename, alt]) =>
        `    <td width="50%" align="center" valign="top">
      <img src="./assets/${filename}?v=${version}" alt="${alt}" width="100%" />
    </td>`
      );

    rows.push(
      `  <tr>
${cells.join("\n")}
  </tr>`,
    );
  }

  return `<table width="100%">
${rows.join("\n")}
</table>`;
}

function openSourceProjectCards(projects, version) {
  if (projects.length === 0) {
    return `<p align="center"><em>No qualifying open-source projects were returned by the current GitHub analytics run.</em></p>`;
  }

  return projects.map((project) => {
    const fullName = escapeHtml(project.fullName);
    const url = escapeHtml(project.url);
    const filename = escapeHtml(project.filename);
    const relationship = project.relationship === "owned-open-source"
      ? "Owned open-source project"
      : "✅ Verified open-source contribution";
    const alt = escapeHtml(`${project.fullName} — ${relationship}`);
    return `<p align="center">
  <a href="${url}"><strong>${fullName} ↗</strong></a><br />
  <sub>${relationship}</sub>
</p>
<p align="center">
  <img src="./assets/${filename}?v=${version}" alt="${alt}" width="100%" />
</p>`;
  }).join("\n\n");
}

function profileViewBadge() {
  const encodedUsername =
    encodeURIComponent(username);

  return `<p align="center">
  <a href="https://hits.sh/github.com/${encodedUsername}/">
    <img src="https://hits.sh/github.com/${encodedUsername}.svg?view=today-total&style=flat-square&label=Profile%20views&color=0D1117&labelColor=30363D&logo=github" alt="Profile views" />
  </a>
</p>`;
}

/**
 * Builds the single managed README block in its approved presentation order.
 *
 * GitHub Overview and Contribution Streak intentionally occupy independent
 * full-width rows; all other card arrangements remain unchanged.
 */
function buildAnalyticsBlock(version, openSourceProjects) {
  return `${START_MARKER}
## 📊 GitHub Analytics

> Personal contribution cards count GitHub-attributed work. Full public-project composition is shown separately and is not a personal-authorship claim.

${naturalWidthCard(CARD.overview, version, 720)}

${naturalWidthCard(CARD.streak, version, 720)}

${fullWidthCard(CARD.github_trophies, version)}

${fullWidthCard(CARD.languages, version)}

${fullWidthCard(CARD.personal_code, version)}

${fullWidthCard(CARD.frameworks, version)}

${twoColumnRow(CARD.delivery, CARD.portfolio, version)}

${fullWidthCard(CARD.domains, version)}

### 🤖 AI Engineering Analytics

> AI analytics are evidence-based repository configuration and workflow signals. They do not estimate how much code was generated by AI.

${fullWidthCard(CARD.ai_overview, version)}

${fullWidthCard(CARD.ai_trophies, version)}

${fullWidthCard(CARD.ai_maturity, version)}

${fullWidthCard(CARD.ai_capabilities, version)}

${fullWidthCard(CARD.mcp, version)}

${fullWidthCard(CARD.ai_activity, version)}

#### Specialized AI Engineering

> Focused cards report context, memory, harness and orchestration evidence without replacing the broader AI dashboard.

${compactSpecializedGrid(version)}

${fullWidthCard(CARD.context_governance, version)}

### 📈 Additional Graph Stats

${fullWidthCard(CARD.activity_graph, version)}

${fullWidthCard(CARD.contribution_calendar, version)}

### 🌐 Open-Source Contributions

> ✅ Verified open-source contributions: Public project cards separate full project composition from verified personal commits, pull requests, reviews and approvals.

${openSourceProjectCards(openSourceProjects, version)}

### 👁️ Profile Views

${profileViewBadge()}
${END_MARKER}`;
}

function countOccurrences(value, needle) {
  return needle
    ? value.split(needle).length - 1
    : 0;
}

function validateSingleManagedBlock(readme, openSourceProjects) {
  if (
    countOccurrences(readme, START_MARKER) !== 1 ||
    countOccurrences(readme, END_MARKER) !== 1
  ) {
    throw new Error(
      "README.md must contain exactly one managed analytics block.",
    );
  }

  const requiredHeadings = [
    "## 📊 GitHub Analytics",
    "### 🤖 AI Engineering Analytics",
    "#### Specialized AI Engineering",
    "### 📈 Additional Graph Stats",
    "### 🌐 Open-Source Contributions",
    "### 👁️ Profile Views",
  ];

  for (const heading of requiredHeadings) {
    if (countOccurrences(readme, heading) !== 1) {
      throw new Error(
        `README.md must contain exactly one '${heading}' heading.`,
      );
    }
  }

  for (const [filename] of CARDS) {
    if (countOccurrences(readme, filename) !== 1) {
      throw new Error(
        `README.md must reference ${filename} exactly once.`,
      );
    }
  }

  for (const project of openSourceProjects) {
    if (countOccurrences(readme, project.filename) !== 1) {
      throw new Error(`README.md must reference ${project.filename} exactly once.`);
    }
    if (countOccurrences(readme, `href="${project.url}"`) !== 1) {
      throw new Error(`README.md must link ${project.fullName} exactly once.`);
    }
  }

  if (
    countOccurrences(
      readme,
      `hits.sh/github.com/${username}`,
    ) !== 2
  ) {
    throw new Error(
      "README.md must contain one profile-view badge and one dashboard link.",
    );
  }
}

async function main() {
  let readme;

  try {
    readme = await fs.readFile(
      README_FILE,
      "utf8",
    );
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
    readme = "";
  }

  const openSourceProjects = await loadOpenSourceProjects();
  const version = await validateAndHashAssets(openSourceProjects);
  const existing = cleanExistingAnalytics(readme);
  const block = buildAnalyticsBlock(version, openSourceProjects);
  const updated =
    `${existing}${existing ? "\n\n" : ""}${block}\n`;

  validateSingleManagedBlock(updated, openSourceProjects);

  await fs.writeFile(
    README_FILE,
    updated,
    "utf8",
  );

  console.log(
    `Replaced GitHub Analytics block in ` +
    `${path.relative(process.cwd(), README_FILE)} ` +
    `with version ${version}.`,
  );
}

await main();
