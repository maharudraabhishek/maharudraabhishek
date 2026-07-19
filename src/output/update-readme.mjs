import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { ReadmeUpdateError } from "../shared/errors.mjs";
import { toPosixPath } from "../shared/paths.mjs";
import { readProjectManifest } from "./validate-assets.mjs";

export const README_MARKERS = Object.freeze({
  standard: Object.freeze({
    start: "<!-- github-engineering-analytics:start -->",
    end: "<!-- github-engineering-analytics:end -->",
  }),
  legacy: Object.freeze({
    start: "<!-- ENGINEERING_ANALYTICS:START -->",
    end: "<!-- ENGINEERING_ANALYTICS:END -->",
  }),
});

const CARD = Object.freeze({
  overview: ["github-overview.svg", "GitHub overview"],
  streak: ["contribution-streak.svg", "Contribution streak"],
  trophies: ["github-trophies.svg", "GitHub engineering trophies"],
  languages: ["language-spectrum.svg", "Engineering language footprint across personal and verified public projects"],
  personal: ["personal-code-contribution.svg", "Personal code contribution by language"],
  frameworks: ["frameworks-platforms.svg", "Framework and platform contribution impact"],
  delivery: ["delivery-collaboration.svg", "Delivery and collaboration analytics"],
  portfolio: ["repository-portfolio.svg", "Repository portfolio analytics"],
  domains: ["engineering-domains.svg", "Derived engineering domains"],
  activity: ["github-activity-graph.svg", "GitHub activity graph for the last 12 months"],
  calendar: ["contribution-graph.svg", "GitHub contribution calendar"],
  aiOverview: ["ai-engineering-overview.svg", "AI engineering overview"],
  aiTrophies: ["ai-engineering-trophies.svg", "AI engineering trophies"],
  maturity: ["agentic-workflow-maturity.svg", "Agentic workflow maturity"],
  capabilities: ["ai-engineering-capabilities.svg", "AI engineering capabilities"],
  mcp: ["mcp-tool-integration.svg", "MCP and tool integration"],
  aiActivity: ["ai-workflow-activity.svg", "AI workflow activity"],
  governance: ["context-governance.svg", "Context engineering and governance"],
  context: ["context-engineering.svg", "Compact context engineering analytics"],
  memory: ["memory-engineering.svg", "Compact memory engineering analytics"],
  harness: ["ai-harness-engineering.svg", "Compact AI harness engineering analytics"],
  orchestration: ["agentic-orchestration.svg", "Compact agentic orchestration analytics"],
});

function occurrences(value, needle) {
  return value.split(needle).length - 1;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function fullWidth(card, version, prefix) {
  return `<p align="center">
  <img src="${prefix}/${card[0]}?v=${version}" alt="${card[1]}" width="100%" />
</p>`;
}

function naturalWidth(card, version, prefix) {
  return `<p align="center">
  <img src="${prefix}/${card[0]}?v=${version}" alt="${card[1]}" width="720" />
</p>`;
}

function twoColumn(left, right, version, prefix) {
  return `<table width="100%">
  <tr>
    <td width="50%" align="center" valign="top">
      <img src="${prefix}/${left[0]}?v=${version}" alt="${left[1]}" width="100%" />
    </td>
    <td width="50%" align="center" valign="top">
      <img src="${prefix}/${right[0]}?v=${version}" alt="${right[1]}" width="100%" />
    </td>
  </tr>
</table>`;
}

function compactGrid(version, prefix) {
  return `<table width="100%">
  <tr>
    <td width="50%" align="center" valign="top">
      <img src="${prefix}/${CARD.context[0]}?v=${version}" alt="${CARD.context[1]}" width="100%" />
    </td>
    <td width="50%" align="center" valign="top">
      <img src="${prefix}/${CARD.memory[0]}?v=${version}" alt="${CARD.memory[1]}" width="100%" />
    </td>
  </tr>
  <tr>
    <td width="50%" align="center" valign="top">
      <img src="${prefix}/${CARD.harness[0]}?v=${version}" alt="${CARD.harness[1]}" width="100%" />
    </td>
    <td width="50%" align="center" valign="top">
      <img src="${prefix}/${CARD.orchestration[0]}?v=${version}" alt="${CARD.orchestration[1]}" width="100%" />
    </td>
  </tr>
</table>`;
}

function projectCards(projects, version, prefix) {
  if (!projects.length) {
    return "<p align=\"center\"><em>No qualifying open-source projects were returned by the current GitHub analytics run.</em></p>";
  }
  return projects.map((project) => {
    const fullName = escapeHtml(project.fullName);
    const relationship = project.relationship === "owned-open-source"
      ? "Owned open-source project"
      : "✅ Verified open-source contribution";
    return `<p align="center">
  <a href="${escapeHtml(project.url)}"><strong>${fullName} ↗</strong></a><br />
  <sub>${relationship}</sub>
</p>
<p align="center">
  <img src="${prefix}/${escapeHtml(project.filename)}?v=${version}" alt="${fullName} — ${relationship}" width="100%" />
</p>`;
  }).join("\n\n");
}

function attributionMarkdown(enabled) {
  if (!enabled) return "";
  return `

<sub>
Generated with
<a href="https://github.com/maharudraabhishek/maharudraabhishek">
GitHub Engineering Analytics
</a>
— ⭐ Star the project if it helped you.
</sub>`;
}

export function buildAnalyticsMarkdown({
  username,
  version,
  assetPrefix,
  projects,
  attribution,
}) {
  const encodedUsername = encodeURIComponent(username);
  return `## 📊 GitHub Analytics

> Personal contribution cards count GitHub-attributed work. Full public-project composition is shown separately and is not a personal-authorship claim.

${naturalWidth(CARD.overview, version, assetPrefix)}

${naturalWidth(CARD.streak, version, assetPrefix)}

${fullWidth(CARD.trophies, version, assetPrefix)}

${fullWidth(CARD.languages, version, assetPrefix)}

${fullWidth(CARD.personal, version, assetPrefix)}

${fullWidth(CARD.frameworks, version, assetPrefix)}

${twoColumn(CARD.delivery, CARD.portfolio, version, assetPrefix)}

${fullWidth(CARD.domains, version, assetPrefix)}

### 🤖 AI Engineering Analytics

> AI analytics are evidence-based repository configuration and workflow signals. They do not estimate how much code was generated by AI.

${fullWidth(CARD.aiOverview, version, assetPrefix)}

${fullWidth(CARD.aiTrophies, version, assetPrefix)}

${fullWidth(CARD.maturity, version, assetPrefix)}

${fullWidth(CARD.capabilities, version, assetPrefix)}

${fullWidth(CARD.mcp, version, assetPrefix)}

${fullWidth(CARD.aiActivity, version, assetPrefix)}

#### Specialized AI Engineering

> Focused cards report context, memory, harness and orchestration evidence without replacing the broader AI dashboard.

${compactGrid(version, assetPrefix)}

${fullWidth(CARD.governance, version, assetPrefix)}

### 📈 Additional Graph Stats

${fullWidth(CARD.activity, version, assetPrefix)}

${fullWidth(CARD.calendar, version, assetPrefix)}

### 🌐 Open-Source Contributions

> ✅ Verified open-source contributions: Public project cards separate full project composition from verified personal commits, pull requests, reviews and approvals.

${projectCards(projects, version, assetPrefix)}

### 👁️ Profile Views

<p align="center">
  <a href="https://hits.sh/github.com/${encodedUsername}/">
    <img src="https://hits.sh/github.com/${encodedUsername}.svg?view=today-total&style=flat-square&label=Profile%20views&color=0D1117&labelColor=30363D&logo=github" alt="Profile views" />
  </a>
</p>${attributionMarkdown(attribution)}`;
}

async function assetVersion(outputDirectory, projects) {
  const hash = crypto.createHash("sha256");
  const files = [
    ...Object.values(CARD).map(([filename]) => filename),
    ...projects.map((project) => project.filename),
    "open-source-projects.json",
  ];
  for (const filename of files) {
    hash.update(filename);
    hash.update("\0");
    hash.update(await fs.readFile(path.join(outputDirectory, filename)));
    hash.update("\0");
  }
  return hash.digest("hex").slice(0, 16);
}

function selectedMarkerPair(readme) {
  const styles = Object.values(README_MARKERS).map((markers) => ({
    markers,
    starts: occurrences(readme, markers.start),
    ends: occurrences(readme, markers.end),
  }));
  const present = styles.filter((style) => style.starts || style.ends);
  if (!present.length) return null;
  if (present.length !== 1 || present[0].starts !== 1 || present[0].ends !== 1) {
    throw new ReadmeUpdateError(
      "README analytics markers are incomplete, duplicated, or conflicting. Keep exactly one supported marker pair.",
    );
  }
  const chosen = present[0].markers;
  if (readme.indexOf(chosen.start) > readme.indexOf(chosen.end)) {
    throw new ReadmeUpdateError("README analytics end marker appears before its start marker.");
  }
  return chosen;
}

async function atomicWrite(filePath, content) {
  const temporary = `${filePath}.analytics-${process.pid}.tmp`;
  await fs.writeFile(temporary, content, "utf8");
  try {
    await fs.rename(temporary, filePath);
  } catch (error) {
    if (error?.code !== "EEXIST" && error?.code !== "EPERM") throw error;
    await fs.rm(filePath, { force: true });
    await fs.rename(temporary, filePath);
  } finally {
    await fs.rm(temporary, { force: true });
  }
}

/** Replaces only the marker-bounded block and preserves every outside byte. */
export async function updateReadmeAnalytics({
  readmePath,
  outputDirectory,
  username,
  insertMarkers = false,
  attribution = true,
}) {
  let readme;
  try {
    readme = await fs.readFile(readmePath, "utf8");
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
    readme = "";
  }
  const lineEnding = readme.includes("\r\n") ? "\r\n" : "\n";
  const manifest = await readProjectManifest(outputDirectory);
  const version = await assetVersion(outputDirectory, manifest.projects);
  let assetPrefix = toPosixPath(path.relative(
    path.dirname(readmePath),
    outputDirectory,
  ));
  if (!assetPrefix.startsWith(".")) assetPrefix = `./${assetPrefix}`;
  const markdown = buildAnalyticsMarkdown({
    username,
    version,
    assetPrefix,
    projects: manifest.projects,
    attribution,
  }).replaceAll("\n", lineEnding);

  let markers = selectedMarkerPair(readme);
  let updated;
  if (!markers) {
    if (!insertMarkers) {
      throw new ReadmeUpdateError(
        "README analytics markers are missing. Add the documented marker pair or set insert-readme-markers=true once.",
      );
    }
    markers = README_MARKERS.standard;
    const separator = readme.length === 0
      ? ""
      : readme.endsWith(lineEnding)
        ? lineEnding
        : `${lineEnding}${lineEnding}`;
    updated = `${readme}${separator}${markers.start}${lineEnding}${markdown}${lineEnding}${markers.end}${lineEnding}`;
  } else {
    const startIndex = readme.indexOf(markers.start);
    const endIndex = readme.indexOf(markers.end, startIndex + markers.start.length);
    const existingManagedContent = readme
      .slice(startIndex + markers.start.length, endIndex)
      .replaceAll("\r\n", "\n")
      .replace(/^\n|\n$/g, "");
    const normalizedMarkdown = markdown.replaceAll("\r\n", "\n");
    if (existingManagedContent === normalizedMarkdown) {
      return Object.freeze({
        changed: false,
        markerStyle: markers === README_MARKERS.legacy ? "legacy" : "standard",
      });
    }
    updated = readme.slice(0, startIndex) +
      `${markers.start}${lineEnding}${markdown}${lineEnding}${markers.end}` +
      readme.slice(endIndex + markers.end.length);
  }

  const changed = updated !== readme;
  if (changed) await atomicWrite(readmePath, updated);
  return Object.freeze({ changed, markerStyle:
    markers === README_MARKERS.legacy ? "legacy" : "standard" });
}
