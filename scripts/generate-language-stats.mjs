import fs from "node:fs/promises";
import path from "node:path";

const token = process.env.PRIVATE_STATS_TOKEN;

if (!token) {
  throw new Error("PRIVATE_STATS_TOKEN is not configured.");
}

const headers = {
  Accept: "application/vnd.github+json",
  Authorization: `Bearer ${token}`,
  "X-GitHub-Api-Version": "2022-11-28",
  "User-Agent": "maharudraabhishek-private-stats",
};

async function githubRequest(url) {
  const response = await fetch(url, { headers });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(
      `GitHub API request failed: ${response.status} ${body}`,
    );
  }

  return response.json();
}

async function fetchAllRepositories() {
  const repositories = [];

  for (let page = 1; ; page += 1) {
    const result = await githubRequest(
      `https://api.github.com/user/repos` +
        `?visibility=all&affiliation=owner,collaborator,organization_member` +
        `&per_page=100&page=${page}`,
    );

    repositories.push(...result);

    if (result.length < 100) {
      break;
    }
  }

  return repositories;
}

async function calculateLanguages(repositories) {
  const totals = new Map();

  for (const repository of repositories) {
    // Avoid duplicated or inactive code from distorting the totals.
    if (repository.fork || repository.archived || repository.disabled) {
      continue;
    }

    const languages = await githubRequest(repository.languages_url);

    for (const [language, bytes] of Object.entries(languages)) {
      totals.set(language, (totals.get(language) ?? 0) + bytes);
    }
  }

  return [...totals.entries()]
    .sort(([, firstBytes], [, secondBytes]) => secondBytes - firstBytes)
    .slice(0, 8);
}

function escapeXml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function generateSvg(languages) {
  const totalBytes = languages.reduce((sum, [, bytes]) => sum + bytes, 0);
  const width = 520;
  const rowHeight = 38;
  const height = 80 + languages.length * rowHeight;

  const rows = languages
    .map(([language, bytes], index) => {
      const percentage = totalBytes === 0 ? 0 : (bytes / totalBytes) * 100;
      const y = 72 + index * rowHeight;
      const barWidth = Math.max(2, (percentage / 100) * 300);

      return `
        <text x="28" y="${y}" class="language">${escapeXml(language)}</text>
        <text x="490" y="${y}" text-anchor="end" class="percentage">
          ${percentage.toFixed(1)}%
        </text>
        <rect x="160" y="${y - 13}" width="300" height="9" rx="4.5"
              class="track"/>
        <rect x="160" y="${y - 13}" width="${barWidth.toFixed(2)}"
              height="9" rx="4.5" class="bar"/>
      `;
    })
    .join("");

  return `
<svg
  xmlns="http://www.w3.org/2000/svg"
  width="${width}"
  height="${height}"
  viewBox="0 0 ${width} ${height}"
  role="img"
  aria-label="Most used GitHub languages across selected public and private repositories"
>
  <style>
    .card {
      fill: #0d1117;
      stroke: #30363d;
      stroke-width: 1;
    }

    .title {
      fill: #70a5fd;
      font: 600 18px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }

    .subtitle,
    .percentage {
      fill: #8b949e;
      font: 400 12px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }

    .language {
      fill: #f0f6fc;
      font: 500 13px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }

    .track {
      fill: #21262d;
    }

    .bar {
      fill: #58a6ff;
    }
  </style>

  <rect class="card" x="0.5" y="0.5"
        width="${width - 1}" height="${height - 1}" rx="10"/>

  <text x="28" y="31" class="title">Most Used Languages</text>
  <text x="28" y="51" class="subtitle">
    Selected public + private repositories
  </text>

  ${rows}
</svg>
`.trim();
}

const repositories = await fetchAllRepositories();
const languages = await calculateLanguages(repositories);
const outputDirectory = path.resolve("assets");
const outputPath = path.join(outputDirectory, "github-languages.svg");

await fs.mkdir(outputDirectory, { recursive: true });
await fs.writeFile(outputPath, generateSvg(languages), "utf8");

console.log(
  `Generated ${outputPath} from ${repositories.length} accessible repositories.`,
);
