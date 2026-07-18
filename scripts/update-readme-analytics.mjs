import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

const README_FILE = path.resolve(process.env.README_FILE?.trim() || "README.md");
const ASSET_DIRECTORY = path.resolve(process.env.ANALYTICS_ASSET_DIRECTORY?.trim() || "assets");
const username = process.env.GITHUB_USERNAME?.trim() || "maharudraabhishek";

const START_MARKER = "<!-- ENGINEERING_ANALYTICS:START -->";
const END_MARKER = "<!-- ENGINEERING_ANALYTICS:END -->";

const GITHUB_CARDS = Object.freeze([
  ["github-overview.svg", "GitHub overview"],
  ["github-trophies.svg", "GitHub engineering trophies"],
  ["contribution-streak.svg", "Contribution streak"],
  ["contribution-graph.svg", "GitHub contribution calendar"],
  ["github-activity-graph.svg", "GitHub activity graph for the last 12 months"],
  ["personal-code-contribution.svg", "Personal code contribution by language"],
  ["language-spectrum.svg", "Engineering language footprint across personal and public contributed projects"],
  ["public-contribution-portfolio.svg", "Public open-source contribution portfolio"],
  ["frameworks-platforms.svg", "Framework and platform contribution impact"],
  ["engineering-domains.svg", "Derived engineering domains"],
  ["delivery-collaboration.svg", "Delivery and collaboration analytics"],
  ["repository-portfolio.svg", "Repository portfolio analytics"],
]);

const AI_CARDS = Object.freeze([
  ["ai-engineering-overview.svg", "AI engineering overview"],
  ["agentic-workflow-maturity.svg", "Agentic workflow maturity"],
  ["ai-engineering-capabilities.svg", "AI engineering capabilities"],
  ["mcp-tool-integration.svg", "MCP and tool integration"],
  ["context-governance.svg", "Context engineering and governance"],
  ["ai-workflow-activity.svg", "AI workflow activity"],
  ["ai-engineering-trophies.svg", "AI engineering trophies"],
]);

const CARDS = Object.freeze([...GITHUB_CARDS, ...AI_CARDS]);
const MANAGED_ASSET_FILENAMES = Object.freeze([...new Set([
  ...CARDS.map(([filename]) => filename),
  "github-languages.svg",
  "activity-timeline.svg",
  "engineering-trophies.svg",
  "open-source-stewardship.svg",
])]);
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
  return MANAGED_ASSET_FILENAMES.some((filename) => lower.includes(filename.toLowerCase())) ||
    MANAGED_EXTERNAL_HOSTS.some((host) => lower.includes(host.toLowerCase()));
}
function removeAllMarkedBlocks(readme) {
  const markerPattern = new RegExp(`${escapeRegExp(START_MARKER)}[\\s\\S]*?${escapeRegExp(END_MARKER)}`, "g");
  return readme.replace(markerPattern, "");
}
function removeManagedHtmlBlocks(readme) {
  let result = readme;
  result = result.replace(/<p\b[^>]*>[\s\S]*?<\/p>/gi, (block) => containsManagedReference(block) ? "" : block);
  result = result.replace(/<a\b[^>]*>[\s\S]*?<\/a>/gi, (block) => containsManagedReference(block) ? "" : block);
  return result;
}
function removeManagedLines(readme) {
  return readme.split("\n").filter((line) => {
    const trimmed = line.trim();
    if (containsManagedReference(line)) return false;
    if (/^##\s+📊\s+(Engineering|GitHub) Analytics\s*$/i.test(trimmed)) return false;
    if (/^##\s+(Engineering|GitHub) Analytics\s*$/i.test(trimmed)) return false;
    if (/^###\s+🤖\s+AI Engineering Analytics\s*$/i.test(trimmed)) return false;
    if (/^###\s+AI Engineering Analytics\s*$/i.test(trimmed)) return false;
    if (/^> Personal contribution cards count GitHub-attributed work\./.test(trimmed)) return false;
    if (/^> AI analytics are evidence-based/.test(trimmed)) return false;
    return true;
  }).join("\n");
}
function cleanExistingAnalytics(readme) {
  return removeManagedLines(removeManagedHtmlBlocks(removeAllMarkedBlocks(normalizeNewlines(readme))))
    .replace(/[ \t]+$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
async function validateAndHashAssets() {
  const hash = crypto.createHash("sha256");
  for (const [filename] of CARDS) {
    const assetPath = path.join(ASSET_DIRECTORY, filename);
    const content = await fs.readFile(assetPath);
    if (!content.length) throw new Error(`${assetPath} is empty.`);
    if (!content.toString("utf8").includes("<svg")) throw new Error(`${assetPath} is not a valid SVG document.`);
    hash.update(filename); hash.update("\0"); hash.update(content); hash.update("\0");
  }
  return hash.digest("hex").slice(0, 16);
}
function imageBlocks(cards, version) {
  return cards.map(([filename, alt]) => `<p align="center">\n  <img src="./assets/${filename}?v=${version}" alt="${alt}" />\n</p>`).join("\n\n");
}
function profileViewBadge() {
  const encodedUsername = encodeURIComponent(username);
  return `<p align="center">\n  <a href="https://hits.sh/github.com/${encodedUsername}/">\n    <img src="https://hits.sh/github.com/${encodedUsername}.svg?view=today-total&style=flat-square&label=Profile%20views&color=0D1117&labelColor=30363D&logo=github" alt="Profile views" />\n  </a>\n</p>`;
}
function buildAnalyticsBlock(version) {
  return `${START_MARKER}
## 📊 GitHub Analytics

> Personal contribution cards count GitHub-attributed work. Full public-project composition is shown separately and is not a personal-authorship claim.

${imageBlocks(GITHUB_CARDS, version)}

### 🤖 AI Engineering Analytics

> AI analytics are evidence-based repository configuration and workflow signals. They do not estimate how much code was generated by AI.

${imageBlocks(AI_CARDS, version)}

${profileViewBadge()}
${END_MARKER}`;
}
function countOccurrences(value, needle) { return needle ? value.split(needle).length - 1 : 0; }
function validateSingleManagedBlock(readme) {
  if (countOccurrences(readme, START_MARKER) !== 1 || countOccurrences(readme, END_MARKER) !== 1) {
    throw new Error("README.md must contain exactly one managed analytics block.");
  }
  if (countOccurrences(readme, "## 📊 GitHub Analytics") !== 1) throw new Error("README.md must contain exactly one GitHub Analytics heading.");
  for (const [filename] of CARDS) {
    if (countOccurrences(readme, filename) !== 1) throw new Error(`README.md must reference ${filename} exactly once.`);
  }
  if (countOccurrences(readme, `hits.sh/github.com/${username}`) !== 2) throw new Error("README.md must contain one profile-view badge and one dashboard link.");
}
async function main() {
  let readme;
  try { readme = await fs.readFile(README_FILE, "utf8"); }
  catch (error) { if (error?.code !== "ENOENT") throw error; readme = ""; }
  const version = await validateAndHashAssets();
  const existing = cleanExistingAnalytics(readme);
  const block = buildAnalyticsBlock(version);
  const updated = `${existing}${existing ? "\n\n" : ""}${block}\n`;
  validateSingleManagedBlock(updated);
  await fs.writeFile(README_FILE, updated, "utf8");
  console.log(`Replaced GitHub Analytics block in ${path.relative(process.cwd(), README_FILE)} with version ${version}.`);
}
await main();
