import fs from "node:fs/promises";
import path from "node:path";
import {
  aiEvidencePriority,
  buildAiEngineeringCards,
  isAiEvidenceCandidatePath,
  isAiEvidencePath,
} from "./ai-engineering-analytics.mjs";
import {
  loadAnalyticsConfig,
} from "./github-analytics-config.mjs";

const API_VERSION = "2022-11-28";
const GRAPHQL_ENDPOINT = "https://api.github.com/graphql";
const REST_ENDPOINT = "https://api.github.com";
const MAX_TRANSIENT_RETRY_DELAY_MS = 60_000;
const MAX_RATE_LIMIT_WAIT_MS = 15 * 60_000;
const REQUEST_RETRIES = 4;
const MAX_CONTENT_BYTES = 1_000_000;

const summaryCardSelfTest = process.argv.includes(
  "--self-test-summary-cards",
);
const dataPipelineSelfTest = process.argv.includes(
  "--self-test-data-pipeline",
);
const offlineSelfTest = summaryCardSelfTest || dataPipelineSelfTest;
const token = offlineSelfTest
  ? "offline-summary-card-self-test"
  : requiredEnvironment("PRIVATE_STATS_TOKEN");

// Identity settings are loaded from the single user-editable config file.
// The generator contains no profile-specific username or public alias.
const analyticsConfig = await loadAnalyticsConfig();
const username = analyticsConfig.profileUsername;
const contributorProfiles =
  analyticsConfig.publicContributorProfiles;
const contributorIdentities =
  analyticsConfig.publicContributorIdentities;
const globalContributorIdentities =
  analyticsConfig.globalPublicContributorIdentities;

// Use the workflow's built-in GitHub App installation token for public
// organization repositories. This avoids organization-specific PAT policies
// while preserving an authenticated public-API rate limit.
const publicGithubToken =
  process.env.PUBLIC_GITHUB_TOKEN?.trim() ?? "";

const config = Object.freeze({
  outputDirectory: path.resolve(
    process.env.OUTPUT_DIRECTORY?.trim() || "assets",
  ),
  maxRepositories: integerEnvironment("MAX_REPOSITORIES", 500, {
    min: 0,
    max: 5_000,
  }),
  repositoryConcurrency: integerEnvironment("REPOSITORY_CONCURRENCY", 4, {
    min: 1,
    max: 10,
  }),
  manifestConcurrency: integerEnvironment("MANIFEST_CONCURRENCY", 2, {
    min: 1,
    max: 5,
  }),
  maxManifestFilesPerRepository: integerEnvironment(
    "MAX_MANIFEST_FILES_PER_REPOSITORY",
    40,
    { min: 1, max: 100 },
  ),
  includeArchivedRepositories: booleanEnvironment(
    "INCLUDE_ARCHIVED_REPOSITORIES",
    true,
  ),
  includeForkedRepositories: booleanEnvironment(
    "INCLUDE_FORKED_REPOSITORIES",
    false,
  ),
  minimumScanSuccessRatio: numberEnvironment(
    "MIN_SCAN_SUCCESS_RATIO",
    1,
    { min: 0, max: 1 },
  ),
  affiliations:
    process.env.REPOSITORY_AFFILIATIONS?.trim() ||
    "owner,collaborator,organization_member",
  // Repository exclusions declared in the shared config are the source
  // of truth. EXCLUDE_REPOSITORIES remains an optional runtime extension for
  // advanced callers, but the reusable workflow does not set user names here.
  excludedRepositories: new Set([
    ...analyticsConfig.excludedRepositories.map(
      (repository) => repository.toLowerCase(),
    ),
    ...parseCsv(process.env.EXCLUDE_REPOSITORIES),
  ]),
  debugPrivateRepositories: booleanEnvironment(
    "DEBUG_PRIVATE_REPOSITORIES",
    false,
  ),
  codeActivityYears: integerEnvironment("CODE_ACTIVITY_YEARS", 10, {
    min: 1,
    max: 20,
  }),
  maxCommitsPerRepository: integerEnvironment(
    "MAX_COMMITS_PER_REPOSITORY",
    250,
    { min: 1, max: 1_000 },
  ),
  maxAnalyzedCommits: integerEnvironment(
    "MAX_ANALYZED_COMMITS",
    2_500,
    { min: 1, max: 4_000 },
  ),
  commitListConcurrency: integerEnvironment(
    "COMMIT_LIST_CONCURRENCY",
    2,
    { min: 1, max: 5 },
  ),
  commitDetailConcurrency: integerEnvironment(
    "COMMIT_DETAIL_CONCURRENCY",
    3,
    { min: 1, max: 6 },
  ),
  maxPublicContributedRepositories: integerEnvironment(
    "MAX_PUBLIC_CONTRIBUTED_REPOSITORIES",
    100,
    { min: 0, max: 500 },
  ),
  maxPullRequestsPerPublicRepository: integerEnvironment(
    "MAX_PULL_REQUESTS_PER_PUBLIC_REPOSITORY",
    2000,
    { min: 1, max: 10000 },
  ),
  pullRequestReviewConcurrency: integerEnvironment(
    "PULL_REQUEST_REVIEW_CONCURRENCY",
    4,
    { min: 1, max: 10 },
  ),
});

const REST_HEADERS = Object.freeze({
  Accept: "application/vnd.github+json",
  Authorization: `Bearer ${token}`,
  "X-GitHub-Api-Version": API_VERSION,
  "User-Agent": `${username}-private-readme-analytics`,
});

const PUBLIC_REST_HEADERS = Object.freeze({
  Accept: "application/vnd.github+json",
  ...(publicGithubToken
    ? { Authorization: `Bearer ${publicGithubToken}` }
    : {}),
  "X-GitHub-Api-Version": API_VERSION,
  "User-Agent": `${username}-public-readme-analytics`,
});

const ANONYMOUS_REST_HEADERS = Object.freeze({
  Accept: "application/vnd.github+json",
  "X-GitHub-Api-Version": API_VERSION,
  "User-Agent": `${username}-public-readme-analytics`,
});

const PUBLIC_RAW_HEADERS = Object.freeze({
  Accept: "text/plain",
  "User-Agent": `${username}-public-readme-analytics`,
});

const REPOSITORY_SCOPE = Object.freeze({
  PERSONAL: "personal",
  PUBLIC_CONTRIBUTED: "public-contributed",
});

const THEME = Object.freeze({
  background: "#0D1117",
  border: "#30363D",
  title: "#58A6FF",
  text: "#F0F6FC",
  muted: "#8B949E",
  track: "#21262D",
  blue: "#58A6FF",
  green: "#3FB950",
  purple: "#A371F7",
  orange: "#F0883E",
  yellow: "#D29922",
  red: "#F85149",
  pink: "#DB61A2",
  cyan: "#39C5CF",
});

const LANGUAGE_COLORS = Object.freeze({
  Astro: "#FF5A03",
  Assembly: "#6E4C13",
  Batchfile: "#C1F12E",
  C: "#555555",
  "C#": "#178600",
  "C++": "#F34B7D",
  Clojure: "#DB5855",
  CMake: "#DA3434",
  CoffeeScript: "#244776",
  CSS: "#563D7C",
  Dart: "#00B4AB",
  Dockerfile: "#384D54",
  Elixir: "#6E4A7E",
  Erlang: "#B83998",
  Go: "#00ADD8",
  Groovy: "#4298B8",
  Haskell: "#5E5086",
  HCL: "#844FBA",
  HTML: "#E34C26",
  Java: "#B07219",
  JavaScript: "#F1E05A",
  "Jupyter Notebook": "#DA5B0B",
  Julia: "#A270BA",
  Kotlin: "#A97BFF",
  Lua: "#000080",
  Makefile: "#427819",
  MATLAB: "#E16737",
  Markdown: "#083FA1",
  MDX: "#FCB32C",
  Nix: "#7E7EFF",
  "Objective-C": "#438EFF",
  "Objective-C++": "#6866FB",
  Perl: "#0298C3",
  PHP: "#4F5D95",
  PowerShell: "#012456",
  Python: "#3572A5",
  R: "#198CE7",
  Ruby: "#701516",
  Rust: "#DEA584",
  Scala: "#C22D40",
  SCSS: "#C6538C",
  Shell: "#89E051",
  SQL: "#E38C00",
  Solidity: "#AA6746",
  Svelte: "#FF3E00",
  Swift: "#F05138",
  TeX: "#3D6117",
  TypeScript: "#3178C6",
  Vue: "#41B883",
  YAML: "#CB171E",
  Zig: "#EC915C",
});

const TECHNOLOGY_COLORS = Object.freeze({
  Android: "#3DDC84",
  AWS: "#FF9900",
  DigitalOcean: "#0080FF",
  Docker: "#2496ED",
  Express: "#F0F6FC",
  Firebase: "#FFCA28",
  Flutter: "#02569B",
  GraphQL: "#E10098",
  "HERE SDK": "#00AFAA",
  iOS: "#A2AAAD",
  gRPC: "#244C5A",
  Hilt: "#A97BFF",
  "GitHub Actions": "#2088FF",
  "Google Cloud": "#4285F4",
  "Jetpack Compose": "#4285F4",
  Koin: "#EF2D5E",
  Ktor: "#7F52FF",
  LangChain: "#1C3C3C",
  MongoDB: "#47A248",
  "Next.js": "#F0F6FC",
  "Node.js": "#339933",
  OpenAI: "#10A37F",
  PostgreSQL: "#4169E1",
  PyTorch: "#EE4C2C",
  React: "#61DAFB",
  "React Native": "#61DAFB",
  "React Query": "#FF4154",
  Redux: "#764ABC",
  Retrofit: "#48B983",
  Room: "#3DDC84",
  "Spring Boot": "#6DB33F",
  Strapi: "#4945FF",
  Supabase: "#3ECF8E",
  TailwindCSS: "#38BDF8",
  TensorFlow: "#FF6F00",
  Vite: "#646CFF",
});

const ICONS = Object.freeze({
  star: `<path d="M8 1.2l2.05 4.15 4.58.67-3.31 3.23.78 4.56L8 11.65l-4.1 2.16.78-4.56L1.37 6.02l4.58-.67L8 1.2z"/>`,
  commit: `<circle cx="8" cy="8" r="2.5"/><path d="M0 8h5.5M10.5 8H16"/>`,
  pull: `<circle cx="4" cy="3" r="2"/><circle cx="12" cy="13" r="2"/><path d="M4 5v6a2 2 0 0 0 2 2h4M10 3h2a2 2 0 0 1 2 2v4M12 7l2 2 2-2"/>`,
  issue: `<circle cx="8" cy="8" r="6"/><path d="M8 4.5v4M8 11.5h.01"/>`,
  repo: `<path d="M2 2.5A1.5 1.5 0 0 1 3.5 1H14v12H4a2 2 0 0 0-2 2V2.5z"/><path d="M4 13h10M5 4h6"/>`,
  flame: `<path d="M8.2 1.2c.8 2.9-.6 4.1-1.5 5.2-.8 1-.7 2.2.2 2.8-.1-1.4.8-2.1 1.7-3 .8 1.3 2.5 2.5 2.5 4.8A3.1 3.1 0 0 1 8 14.2 4.7 4.7 0 0 1 3.3 9.5c0-3.2 2.1-5.5 4.9-8.3z"/>`,
  activity: `<path d="M1 8h3l2-5 4 10 2-5h3"/>`,
  code: `<path d="M6 3L1 8l5 5M10 3l5 5-5 5"/>`,
  package: `<path d="M8 1l6 3.2v7.6L8 15l-6-3.2V4.2L8 1zM2.3 4.4L8 7.5l5.7-3.1M8 7.5V15"/>`,
  layers: `<path d="M8 1l7 4-7 4-7-4 7-4zM1 8l7 4 7-4M1 11l7 4 7-4"/>`,
  rocket: `<path d="M9.5 2.2c2.1-1.2 4.1-1.2 4.3-1 .2.2.2 2.2-1 4.3l-3.5 5-3.8-3.8 4-4.5zM5.5 6.7L2 7.3 1 10l3.1.2M9.3 10.5L8.7 14 6 15l-.2-3.1M10.5 5.5h.01"/>`,
  lock: `<rect x="3" y="7" width="10" height="8" rx="2"/><path d="M5 7V5a3 3 0 0 1 6 0v2"/>`,
  unlock: `<rect x="3" y="7" width="10" height="8" rx="2"/><path d="M11 7V5a3 3 0 0 0-5.8-1"/>`,
  test: `<path d="M5 1h6M6 1v4l-4 7a2 2 0 0 0 1.7 3h8.6A2 2 0 0 0 14 12l-4-7V1M4.5 10h7"/>`,
  workflow: `<circle cx="3" cy="3" r="2"/><circle cx="13" cy="3" r="2"/><circle cx="8" cy="13" r="2"/><path d="M5 3h6M4 5l3 6M12 5l-3 6"/>`,
  docs: `<path d="M3 1h7l3 3v11H3zM10 1v4h3M5 8h6M5 11h6"/>`,
  people: `<circle cx="6" cy="5" r="2.5"/><circle cx="12" cy="6" r="2"/><path d="M1.5 14c.3-3 2-4.5 4.5-4.5S10.2 11 10.5 14M10 10c2.6 0 4 1.2 4.5 4"/>`,
  calendar: `<rect x="2" y="3" width="12" height="11" rx="2"/><path d="M5 1v4M11 1v4M2 7h12"/>`,
  trophy: `<path d="M5 2h6v3a3 3 0 0 1-6 0V2zM6 10h4M8 8v5M5 14h6M3 3H1v1a3 3 0 0 0 3 3M13 3h2v1a3 3 0 0 1-3 3"/>`,
  branch: `<circle cx="4" cy="3" r="2"/><circle cx="4" cy="13" r="2"/><circle cx="12" cy="8" r="2"/><path d="M4 5v6M6 4c4 0 4 4 4 4"/>`,
});

const MANIFEST_BASENAMES = new Set([
  ".firebaserc",
  "app.yaml",
  "build.gradle",
  "build.gradle.kts",
  "cargo.toml",
  "compose.yaml",
  "compose.yml",
  "docker-compose.yaml",
  "docker-compose.yml",
  "firebase.json",
  "go.mod",
  "gradle.properties",
  "libs.versions.toml",
  "package.json",
  "podfile",
  "pom.xml",
  "pubspec.yaml",
  "pubspec.yml",
  "pyproject.toml",
  "requirements.txt",
  "schema.prisma",
  "serverless.yaml",
  "serverless.yml",
  "settings.gradle",
  "settings.gradle.kts",
  "wrangler.toml",
]);

const CONTRIBUTION_LANGUAGE_BY_EXTENSION = Object.freeze({
  ".astro": "Astro",
  ".c": "C",
  ".cc": "C++",
  ".clj": "Clojure",
  ".cljs": "Clojure",
  ".cmake": "CMake",
  ".coffee": "CoffeeScript",
  ".cpp": "C++",
  ".cs": "C#",
  ".css": "CSS",
  ".cxx": "C++",
  ".dart": "Dart",
  ".ex": "Elixir",
  ".exs": "Elixir",
  ".fs": "F#",
  ".fsx": "F#",
  ".go": "Go",
  ".graphql": "GraphQL",
  ".gql": "GraphQL",
  ".groovy": "Groovy",
  ".h": "C",
  ".hpp": "C++",
  ".html": "HTML",
  ".ipynb": "Jupyter Notebook",
  ".java": "Java",
  ".jl": "Julia",
  ".js": "JavaScript",
  ".jsx": "JavaScript",
  ".kt": "Kotlin",
  ".kts": "Kotlin",
  ".lua": "Lua",
  ".m": "Objective-C",
  ".md": "Markdown",
  ".mdx": "MDX",
  ".mm": "Objective-C++",
  ".php": "PHP",
  ".pl": "Perl",
  ".ps1": "PowerShell",
  ".py": "Python",
  ".pyi": "Python",
  ".pyw": "Python",
  ".r": "R",
  ".rb": "Ruby",
  ".rs": "Rust",
  ".scala": "Scala",
  ".scss": "SCSS",
  ".sh": "Shell",
  ".sol": "Solidity",
  ".sql": "SQL",
  ".svelte": "Svelte",
  ".swift": "Swift",
  ".tex": "TeX",
  ".ts": "TypeScript",
  ".tsx": "TypeScript",
  ".vue": "Vue",
  ".yaml": "YAML",
  ".yml": "YAML",
  ".zig": "Zig",
});

const CONTRIBUTION_SPECIAL_FILENAMES = Object.freeze({
  dockerfile: "Dockerfile",
  makefile: "Makefile",
  "cmakelists.txt": "CMake",
  "jenkinsfile": "Groovy",
});

const CONTRIBUTION_IGNORED_BASENAMES = new Set([
  "bun.lock",
  "cargo.lock",
  "composer.lock",
  "package-lock.json",
  "pnpm-lock.yaml",
  "poetry.lock",
  "pubspec.lock",
  "yarn.lock",
]);

const CONTRIBUTION_IGNORED_PATH_PARTS = [
  "/.dart_tool/",
  "/.gradle/",
  "/.idea/",
  "/.next/",
  "/.nuxt/",
  "/build/",
  "/coverage/",
  "/dist/",
  "/generated/",
  "/node_modules/",
  "/target/",
  "/vendor/",
];


function requiredEnvironment(name) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is missing.`);
  }
  return value;
}

function integerEnvironment(name, fallback, { min, max }) {
  const raw = process.env[name]?.trim();
  const value = raw ? Number(raw) : fallback;
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new Error(`${name} must be an integer between ${min} and ${max}.`);
  }
  return value;
}

function numberEnvironment(name, fallback, { min, max }) {
  const raw = process.env[name]?.trim();
  const value = raw ? Number(raw) : fallback;
  if (!Number.isFinite(value) || value < min || value > max) {
    throw new Error(`${name} must be a number between ${min} and ${max}.`);
  }
  return value;
}

function booleanEnvironment(name, fallback) {
  const raw = process.env[name]?.trim().toLowerCase();
  if (!raw) return fallback;
  if (raw === "true") return true;
  if (raw === "false") return false;
  throw new Error(`${name} must be either true or false.`);
}

function parseCsv(value) {
  return new Set(
    String(value ?? "")
      .split(",")
      .map((item) => item.trim().toLowerCase())
      .filter(Boolean),
  );
}
/** Matches an exact owner/repository value or an owner/* scope. */
function repositoryPatternMatches(pattern, fullName) {
  const normalizedPattern = String(pattern ?? "").toLowerCase();
  const normalizedName = String(fullName ?? "").toLowerCase();
  if (normalizedPattern.endsWith("/*")) {
    return normalizedName.startsWith(normalizedPattern.slice(0, -1));
  }
  return normalizedPattern === normalizedName;
}

/**
 * Returns every configured identity for public contribution attribution.
 *
 * Historical usernames are GitHub accounts declared by the user as their own,
 * so they are searched globally. Repository inclusion is decided later from
 * verified commits, authored pull requests, or submitted reviews—not from a
 * repository whitelist.
 */
function contributionIdentitiesForScope(_scope) {
  // Configured identities represent the same person across username history.
  // GitHub can retain an old login on commits in personal repositories too,
  // so limiting aliases to external public projects under-counts authored work.
  return contributorIdentities;
}

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function safeInteger(value) {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function isoDate(date) {
  return date.toISOString().slice(0, 10);
}

function dateFromIso(value) {
  return new Date(`${value}T00:00:00Z`);
}

function addUtcDays(date, days) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function escapeXml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function compactNumber(value) {
  return new Intl.NumberFormat("en", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(safeInteger(value));
}

function formatPercentage(value) {
  if (!Number.isFinite(value) || value <= 0) return "0%";
  if (value < 0.1) return "<0.1%";
  return `${value.toFixed(1)}%`;
}

function formatDate(value) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en", {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(dateFromIso(value));
}

/**
 * Formats the elapsed contribution history as a compact calendar duration.
 *
 * The result is intentionally concise because it is displayed as a primary
 * value inside the GitHub Overview metric grid.
 */
function formatContributionTenure(firstContributionDate) {
  if (!firstContributionDate) return "—";

  const start = dateFromIso(firstContributionDate);
  const today = dateFromIso(isoDate(new Date()));

  let months =
    (today.getUTCFullYear() - start.getUTCFullYear()) * 12 +
    today.getUTCMonth() -
    start.getUTCMonth();

  if (today.getUTCDate() < start.getUTCDate()) {
    months -= 1;
  }

  months = Math.max(0, months);

  if (months === 0) return "<1 month";
  if (months < 12) return plural(months, "month");

  const years = Math.floor(months / 12);
  const remainingMonths = months % 12;

  return remainingMonths > 0
    ? `${years}y ${remainingMonths}m`
    : plural(years, "year");
}

/**
 * Counts distinct Monday-based calendar weeks containing contributions.
 *
 * This provides a more meaningful recent-consistency signal than only showing
 * the current streak, which can reset after one inactive day.
 */
function countActiveContributionWeeks(days) {
  const activeWeeks = new Set();

  for (const day of days) {
    if (safeInteger(day.contributionCount) <= 0) continue;

    const date = dateFromIso(day.date);
    const mondayOffset = (date.getUTCDay() + 6) % 7;
    activeWeeks.add(
      isoDate(addUtcDays(date, -mondayOffset)),
    );
  }

  return activeWeeks.size;
}

/**
 * Enriches the all-time streak result with recent contribution consistency.
 *
 * All recent metrics use the same 365-day calendar slice as GitHub Overview,
 * ensuring the two cards remain directly comparable.
 */
function buildStreakInsights(
  streak,
  recentContributionDays,
  recentContributionTotal,
) {
  const activeDays = recentContributionDays.filter(
    (day) => safeInteger(day.contributionCount) > 0,
  );

  const peakDay = recentContributionDays.reduce(
    (currentPeak, day) =>
      safeInteger(day.contributionCount) >
      safeInteger(currentPeak?.contributionCount)
        ? day
        : currentPeak,
    null,
  );

  return {
    ...streak,
    recentContributions: recentContributionTotal,
    recentActiveDays: activeDays.length,
    recentActiveWeeks:
      countActiveContributionWeeks(recentContributionDays),
    averagePerActiveDay:
      activeDays.length > 0
        ? recentContributionTotal / activeDays.length
        : 0,
    activeDayRate:
      recentContributionDays.length > 0
        ? (
            activeDays.length /
            recentContributionDays.length
          ) *
          100
        : 0,
    peakContributionCount:
      safeInteger(peakDay?.contributionCount),
    peakContributionDate:
      safeInteger(peakDay?.contributionCount) > 0
        ? peakDay.date
        : null,
  };
}

function plural(value, singular, pluralForm = `${singular}s`) {
  return `${value} ${value === 1 ? singular : pluralForm}`;
}

function truncate(value, maximumLength) {
  const text = String(value);
  if (text.length <= maximumLength) return text;
  return `${text.slice(0, Math.max(1, maximumLength - 1))}…`;
}

/**
 * Wraps human-readable SVG text without relying on browser layout support.
 *
 * SVG <text> elements do not wrap automatically. Every line is therefore
 * calculated before rendering so long repository evidence and identity text
 * cannot run outside the card boundary.
 */
function wrapWords(value, maximumCharactersPerLine, maximumLines = 3) {
  const words = String(value ?? "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (words.length === 0) return [];

  const lines = [];
  let currentLine = "";

  for (const word of words) {
    const candidate = currentLine
      ? `${currentLine} ${word}`
      : word;

    if (
      candidate.length <= maximumCharactersPerLine ||
      currentLine.length === 0
    ) {
      currentLine = candidate;
      continue;
    }

    lines.push(currentLine);
    currentLine = word;

    if (lines.length === maximumLines - 1) break;
  }

  if (currentLine && lines.length < maximumLines) {
    const consumedWords = lines
      .join(" ")
      .split(/\s+/)
      .filter(Boolean).length;
    const remainingWords = words.slice(consumedWords);
    const finalLine = remainingWords.join(" ");
    lines.push(
      finalLine.length > maximumCharactersPerLine
        ? truncate(finalLine, maximumCharactersPerLine)
        : finalLine,
    );
  }

  return lines.slice(0, maximumLines);
}

/**
 * Renders pre-wrapped SVG lines using tspans.
 */
function svgTextLines({
  lines,
  x,
  y,
  className,
  lineHeight = 16,
}) {
  if (!Array.isArray(lines) || lines.length === 0) return "";

  const tspans = lines
    .map(
      (line, index) =>
        `<tspan x="${x}" dy="${index === 0 ? 0 : lineHeight}">${escapeXml(line)}</tspan>`,
    )
    .join("");

  return `<text x="${x}" y="${y}" class="${className}">${tspans}</text>`;
}

function fallbackColor(seed) {
  const palette = [
    THEME.blue,
    THEME.green,
    THEME.purple,
    THEME.orange,
    THEME.yellow,
    THEME.pink,
    THEME.cyan,
    THEME.red,
  ];
  let hash = 0;
  for (const character of seed) {
    hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  }
  return palette[hash % palette.length];
}

function icon(name, x, y, color, size = 16) {
  const content = ICONS[name] ?? ICONS.activity;
  return `<g transform="translate(${x} ${y}) scale(${size / 16})" fill="none" stroke="${color}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${content}</g>`;
}

function cardShell({
  width,
  height,
  title,
  iconName,
  accent,
  body,
  subtitle = "",
}) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeXml(title)}">
  <style>
    .title{fill:${THEME.title};font:600 18px -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
    .subtitle{fill:${THEME.muted};font:400 11px -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
    .label{fill:${THEME.muted};font:400 12px -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
    .value{fill:${THEME.text};font:600 18px -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
    .small{fill:${THEME.text};font:500 12px -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
    .tiny{fill:${THEME.muted};font:400 10px -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
    .metricValue{fill:${THEME.title};font:700 19px -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
    .metricLabel{fill:${THEME.text};font:600 11px -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
    .metricNote{fill:${THEME.muted};font:500 9px -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
    .sectionLabel{fill:${THEME.green};font:700 11px -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;letter-spacing:.5px}
    .empty{fill:${THEME.muted};font:400 13px -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
  </style>
  <rect x=".5" y=".5" width="${width - 1}" height="${height - 1}" rx="12" fill="${THEME.background}" stroke="${THEME.border}"/>
  ${icon(iconName, 20, 17, accent, 18)}
  <text x="48" y="31" class="title">${escapeXml(title)}</text>
  ${subtitle ? `<text x="48" y="49" class="subtitle">${escapeXml(subtitle)}</text>` : ""}
  ${body}
</svg>`;
}

async function requestJson(
  url,
  {
    method = "GET",
    headers = REST_HEADERS,
    body,
    label = "GitHub API request",
    optionalStatuses = [],
    allowAnonymousFallback = false,
  } = {},
) {
  let activeHeaders = headers;
  let anonymousFallbackUsed = false;
  let retryAttempt = 0;

  while (true) {
    let response;

    try {
      response = await fetch(url, {
        method,
        headers: activeHeaders,
        body,
      });
    } catch (error) {
      if (retryAttempt >= REQUEST_RETRIES) {
        throw new Error(
          `${label} failed after ${REQUEST_RETRIES + 1} network attempts: ${error.message}`,
        );
      }

      const delay = transientRetryDelayMilliseconds(retryAttempt);
      retryAttempt += 1;
      console.warn(
        `${label} encountered a network error; retrying in ${Math.ceil(delay / 1_000)}s.`,
      );
      await sleep(delay);
      continue;
    }

    const rawBody = await response.text();

    if (response.ok) {
      if (!rawBody) return null;

      try {
        return JSON.parse(rawBody);
      } catch {
        throw new Error(`${label} returned invalid JSON.`);
      }
    }

    const diagnostics = parseGitHubError(rawBody, response);
    const rateLimited = responseIsRateLimited(response, diagnostics);

    if (rateLimited) {
      if (retryAttempt >= REQUEST_RETRIES) {
        const error = githubHttpError(label, response, diagnostics);
        error.message =
          `${label} remained rate-limited after ${REQUEST_RETRIES + 1} attempts: ` +
          diagnostics.summary;
        throw error;
      }

      const delay = rateLimitRetryDelayMilliseconds(
        response,
        retryAttempt,
      );
      retryAttempt += 1;

      console.warn(
        `${label} was rate-limited; retrying in ${Math.ceil(delay / 1_000)}s.`,
      );
      await sleep(delay);
      continue;
    }

    if (
      allowAnonymousFallback &&
      !anonymousFallbackUsed &&
      Object.hasOwn(activeHeaders, "Authorization") &&
      responseAllowsPublicFallback(response.status, diagnostics)
    ) {
      anonymousFallbackUsed = true;
      activeHeaders = PUBLIC_REST_HEADERS;
      retryAttempt = 0;
      console.warn(
        `${label} was not accessible with the personal token; retrying as a public repository request.`,
      );
      continue;
    }

    if (optionalStatuses.includes(response.status)) {
      return null;
    }

    const temporaryFailure = [502, 503, 504].includes(response.status);

    if (temporaryFailure && retryAttempt < REQUEST_RETRIES) {
      const delay = transientRetryDelayMilliseconds(retryAttempt);
      retryAttempt += 1;

      console.warn(
        `${label} was temporarily unavailable; retrying in ${Math.ceil(delay / 1_000)}s.`,
      );
      await sleep(delay);
      continue;
    }

    throw githubHttpError(label, response, diagnostics);
  }
}

async function requestText(
  url,
  {
    headers = PUBLIC_RAW_HEADERS,
    label = "Public content request",
    optionalStatuses = [],
  } = {},
) {
  for (let attempt = 0; attempt <= REQUEST_RETRIES; attempt += 1) {
    let response;

    try {
      response = await fetch(url, { headers });
    } catch (error) {
      if (attempt === REQUEST_RETRIES) {
        throw new Error(
          `${label} failed after ${REQUEST_RETRIES + 1} network attempts: ${error.message}`,
        );
      }

      const delay = transientRetryDelayMilliseconds(attempt);
      console.warn(
        `${label} encountered a network error; retrying in ${Math.ceil(delay / 1_000)}s.`,
      );
      await sleep(delay);
      continue;
    }

    if (response.ok) {
      return response.text();
    }

    if (optionalStatuses.includes(response.status)) {
      return null;
    }

    const rawBody = await response.text();
    const diagnostics = parseGitHubError(rawBody, response);
    const rateLimited = responseIsRateLimited(response, diagnostics);

    if (rateLimited && attempt < REQUEST_RETRIES) {
      const delay = rateLimitRetryDelayMilliseconds(response, attempt);
      console.warn(
        `${label} was rate-limited; retrying in ${Math.ceil(delay / 1_000)}s.`,
      );
      await sleep(delay);
      continue;
    }

    if ([502, 503, 504].includes(response.status) && attempt < REQUEST_RETRIES) {
      const delay = transientRetryDelayMilliseconds(attempt);
      console.warn(
        `${label} was temporarily unavailable; retrying in ${Math.ceil(delay / 1_000)}s.`,
      );
      await sleep(delay);
      continue;
    }

    throw githubHttpError(label, response, diagnostics);
  }

  throw new Error(`${label} failed unexpectedly.`);
}

/**
 * Retains GitHub's structured failure diagnostics without ever including
 * request headers or credentials. Search API 422 responses are otherwise too
 * ambiguous to distinguish access, qualifier, and abuse-control failures.
 */
function parseGitHubError(rawBody, response = null) {
  let parsed = null;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    // Non-JSON proxy responses are bounded before entering logs.
  }

  const errors = Array.isArray(parsed?.errors)
    ? parsed.errors.slice(0, 10).map((error) => {
        if (typeof error === "string") return { message: error.slice(0, 300) };
        if (!error || typeof error !== "object") return { message: String(error).slice(0, 300) };
        return {
          resource: error.resource ? String(error.resource).slice(0, 100) : null,
          field: error.field ? String(error.field).slice(0, 100) : null,
          code: error.code ? String(error.code).slice(0, 100) : null,
          message: error.message ? String(error.message).slice(0, 300) : null,
        };
      })
    : [];
  const message = parsed?.message
    ? String(parsed.message).slice(0, 500)
    : rawBody.slice(0, 200);
  const errorDetails = errors
    .map((error) =>
      [error.resource, error.field, error.code, error.message]
        .filter(Boolean)
        .join("/"),
    )
    .filter(Boolean)
    .join("; ");

  return Object.freeze({
    message,
    errors: Object.freeze(errors.map((error) => Object.freeze(error))),
    documentationUrl: parsed?.documentation_url
      ? String(parsed.documentation_url).slice(0, 500)
      : null,
    requestId: response?.headers.get("x-github-request-id") ?? null,
    rateLimitResource: response?.headers.get("x-ratelimit-resource") ?? null,
    rateLimitRemaining: response?.headers.get("x-ratelimit-remaining") ?? null,
    rateLimitReset: response?.headers.get("x-ratelimit-reset") ?? null,
    retryAfter: response?.headers.get("retry-after") ?? null,
    summary: [message, errorDetails].filter(Boolean).join(" · "),
  });
}

function githubHttpError(label, response, diagnostics) {
  const metadata = [
    diagnostics.requestId ? `request ${diagnostics.requestId}` : null,
    diagnostics.rateLimitResource
      ? `resource ${diagnostics.rateLimitResource}`
      : null,
    diagnostics.rateLimitRemaining !== null
      ? `remaining ${diagnostics.rateLimitRemaining}`
      : null,
  ].filter(Boolean).join(", ");
  const error = new Error(
    `${label} failed with HTTP ${response.status}` +
    `${diagnostics.summary ? `: ${diagnostics.summary}` : "."}` +
    `${metadata ? ` (${metadata})` : ""}`,
  );
  error.name = "GitHubHttpError";
  error.status = response.status;
  error.diagnostics = diagnostics;
  return error;
}

function responseIsRateLimited(response, diagnostics) {
  if (response.status === 429) return true;

  const remaining = response.headers.get("x-ratelimit-remaining");
  if (response.status === 403 && remaining === "0") return true;

  return (
    response.status === 403 &&
    /secondary rate limit|rate limit exceeded|abuse detection/i.test(
      diagnostics.summary,
    )
  );
}

function responseAllowsPublicFallback(status, diagnostics) {
  if (status !== 403 && status !== 404) return false;

  return (
    status === 404 ||
    /resource not accessible by personal access token|forbidden|requires authentication/i.test(
      diagnostics.summary,
    )
  );
}

function rateLimitRetryDelayMilliseconds(response, attempt) {
  const retryAfter = Number(response.headers.get("retry-after"));
  if (Number.isFinite(retryAfter) && retryAfter > 0) {
    const delay = retryAfter * 1_000;
    assertRateLimitWaitIsReasonable(delay);
    return delay;
  }

  const remaining = response.headers.get("x-ratelimit-remaining");
  const resetAt = Number(response.headers.get("x-ratelimit-reset"));

  if (
    remaining === "0" &&
    Number.isFinite(resetAt) &&
    resetAt > 0
  ) {
    const untilReset = Math.max(
      1_000,
      resetAt * 1_000 - Date.now() + 1_000,
    );
    assertRateLimitWaitIsReasonable(untilReset);
    return untilReset;
  }

  // GitHub recommends waiting at least one minute when a secondary-limit
  // response has neither Retry-After nor an exhausted primary limit.
  const delay = Math.min(
    60_000 * 2 ** attempt,
    MAX_RATE_LIMIT_WAIT_MS,
  );
  assertRateLimitWaitIsReasonable(delay);
  return delay;
}

function assertRateLimitWaitIsReasonable(delay) {
  if (delay <= MAX_RATE_LIMIT_WAIT_MS) return;

  throw new Error(
    `GitHub rate limit will not reset for approximately ${Math.ceil(delay / 60_000)} minutes; aborting instead of retrying too early.`,
  );
}

function transientRetryDelayMilliseconds(attempt) {
  return Math.min(
    1_000 * 2 ** attempt,
    MAX_TRANSIENT_RETRY_DELAY_MS,
  );
}

async function rest(pathOrUrl, options = {}) {
  const url = pathOrUrl.startsWith("http")
    ? pathOrUrl
    : `${REST_ENDPOINT}${pathOrUrl}`;
  return requestJson(url, options);
}

async function graphql(
  query,
  variables,
  label,
  { headers = REST_HEADERS } = {},
) {
  const payload = await requestJson(GRAPHQL_ENDPOINT, {
    method: "POST",
    headers: {
      ...headers,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query, variables }),
    label,
  });

  if (payload?.errors?.length) {
    const message = payload.errors
      .map((error) => error.message)
      .filter(Boolean)
      .join("; ");
    throw new Error(`${label} failed: ${message || "Unknown GraphQL error."}`);
  }

  return payload?.data;
}

async function mapLimit(items, limit, worker) {
  const results = new Array(items.length);
  let nextIndex = 0;

  async function runWorker() {
    while (true) {
      const currentIndex = nextIndex;
      nextIndex += 1;

      if (currentIndex >= items.length) return;

      try {
        results[currentIndex] = {
          status: "fulfilled",
          value: await worker(items[currentIndex], currentIndex),
        };
      } catch (error) {
        results[currentIndex] = {
          status: "rejected",
          reason: error,
        };
      }
    }
  }

  const workerCount = Math.min(limit, Math.max(1, items.length));
  await Promise.all(Array.from({ length: workerCount }, runWorker));
  return results;
}

async function fetchAllRepositories() {
  const repositories = [];

  for (let page = 1; ; page += 1) {
    const pageItems = await rest(
      `/user/repos?visibility=all&affiliation=${encodeURIComponent(config.affiliations)}&sort=full_name&direction=asc&per_page=100&page=${page}`,
      { label: "Repository listing" },
    );

    repositories.push(...pageItems);

    if (pageItems.length < 100) break;
    if (
      config.maxRepositories > 0 &&
      repositories.length >= config.maxRepositories
    ) {
      break;
    }
  }

  return config.maxRepositories > 0
    ? repositories.slice(0, config.maxRepositories)
    : repositories;
}


function normalizePublicContributionRepository(
  repository,
  evidence = [],
  identities = [],
) {
  if (!repository?.full_name || !repository.owner?.login) return null;
  if (repository.private || String(repository.visibility ?? "public").toLowerCase() !== "public") return null;
  if (String(repository.owner.login).toLowerCase() === username.toLowerCase()) return null;
  if (String(repository.owner.type ?? repository.owner.__typename ?? "").toLowerCase() !== "organization") return null;
  if (!repository.default_branch) return null;

  return {
    ...repository,
    private: false,
    visibility: "public",
    disabled: Boolean(repository.disabled),
    archived: Boolean(repository.archived),
    fork: Boolean(repository.fork),
    discovered_from_contributions: true,
    contribution_evidence: [...new Set(evidence.filter(Boolean))],
    contribution_identities: [...new Set(
      identities.map((identity) => String(identity).toLowerCase()).filter(Boolean),
    )],
  };
}

function graphqlRepositoryToRestShape(node, evidence, identity) {
  if (!node?.owner?.login || !node?.defaultBranchRef?.name) return null;
  return normalizePublicContributionRepository({
    name: node.name,
    full_name: node.nameWithOwner,
    owner: {
      login: node.owner.login,
      type: node.owner.__typename,
    },
    private: Boolean(node.isPrivate),
    visibility: node.isPrivate ? "private" : "public",
    archived: Boolean(node.isArchived),
    fork: Boolean(node.isFork),
    disabled: false,
    default_branch: node.defaultBranchRef.name,
    languages_url: `${REST_ENDPOINT}/repos/${node.nameWithOwner}/languages`,
    pushed_at: node.pushedAt,
    stargazers_count: safeInteger(node.stargazerCount),
    html_url: node.url,
  }, [evidence], [identity]);
}

function mergeContributionCandidate(target, repository) {
  if (!repository?.full_name) return;
  const key = repository.full_name.toLowerCase();
  const existing = target.get(key);
  if (!existing) {
    target.set(key, repository);
    return;
  }

  target.set(key, {
    ...existing,
    ...repository,
    contribution_evidence: [...new Set([
      ...(existing.contribution_evidence ?? []),
      ...(repository.contribution_evidence ?? []),
    ])],
    contribution_identities: [...new Set([
      ...(existing.contribution_identities ?? []),
      ...(repository.contribution_identities ?? []),
    ])],
    discovered_from_contributions: true,
  });
}

const PUBLIC_CONTRIBUTION_REPOSITORY_FIELDS = `
  name
  nameWithOwner
  isArchived
  isFork
  isPrivate
  pushedAt
  stargazerCount
  url
  owner { login __typename }
  defaultBranchRef { name }
`;

async function fetchRepositoriesContributedToConnection(
  identity,
  headers,
  label,
) {
  const repositories = new Map();
  let after = null;

  while (repositories.size < config.maxPublicContributedRepositories) {
    const query = `
      query PublicContributedRepositories($login: String!, $after: String) {
        user(login: $login) {
          repositoriesContributedTo(
            first: 100
            after: $after
            includeUserRepositories: false
            contributionTypes: [COMMIT, PULL_REQUEST, PULL_REQUEST_REVIEW]
            privacy: PUBLIC
            orderBy: { field: UPDATED_AT, direction: DESC }
          ) {
            pageInfo { hasNextPage endCursor }
            nodes { ${PUBLIC_CONTRIBUTION_REPOSITORY_FIELDS} }
          }
        }
      }
    `;

    const data = await graphql(
      query,
      { login: identity, after },
      label,
      { headers },
    );
    const connection = data?.user?.repositoriesContributedTo;
    for (const node of connection?.nodes ?? []) {
      const repository = graphqlRepositoryToRestShape(
        node,
        "repository-relationship",
        identity,
      );
      if (repository) mergeContributionCandidate(repositories, repository);
      if (repositories.size >= config.maxPublicContributedRepositories) break;
    }

    if (!connection?.pageInfo?.hasNextPage) break;
    after = connection.pageInfo.endCursor;
    if (!after) break;
  }

  return [...repositories.values()];
}

async function fetchContributionCollectionRepositories(
  headers,
  sourceLabel,
) {
  const identityResults = await mapLimit(
    globalContributorIdentities,
    1,
    async (identity) => {
      const years = await fetchContributionYearsForLogin(
        identity,
        headers,
        `${sourceLabel} contribution-year query (${identity})`,
      );

      const yearResults = await mapLimit(years, 2, async (year) => {
        const currentYear = new Date().getUTCFullYear();
        const from = new Date(Date.UTC(year, 0, 1, 0, 0, 0));
        const to = year === currentYear
          ? new Date()
          : new Date(Date.UTC(year, 11, 31, 23, 59, 59));
        const query = `
          query PublicContributionRepositoriesByYear(
            $login: String!
            $from: DateTime!
            $to: DateTime!
          ) {
            user(login: $login) {
              contributionsCollection(from: $from, to: $to) {
                commitContributionsByRepository(maxRepositories: 100) {
                  repository { ${PUBLIC_CONTRIBUTION_REPOSITORY_FIELDS} }
                }
                pullRequestContributionsByRepository(maxRepositories: 100) {
                  repository { ${PUBLIC_CONTRIBUTION_REPOSITORY_FIELDS} }
                }
                pullRequestReviewContributionsByRepository(maxRepositories: 100) {
                  repository { ${PUBLIC_CONTRIBUTION_REPOSITORY_FIELDS} }
                }
              }
            }
          }
        `;
        const data = await graphql(
          query,
          {
            login: identity,
            from: from.toISOString(),
            to: to.toISOString(),
          },
          `${sourceLabel} contribution-repository query for ${identity} in ${year}`,
          { headers },
        );
        const collection = data?.user?.contributionsCollection;
        const groups = [
          [collection?.commitContributionsByRepository, "commit"],
          [collection?.pullRequestContributionsByRepository, "pull-request"],
          [collection?.pullRequestReviewContributionsByRepository, "pull-request-review"],
        ];
        const repositories = [];
        for (const [items, evidence] of groups) {
          for (const item of items ?? []) {
            const repository = graphqlRepositoryToRestShape(
              item.repository,
              evidence,
              identity,
            );
            if (repository) repositories.push(repository);
          }
        }
        return repositories;
      });

      const repositories = [];
      const yearFailures = [];
      for (const result of yearResults) {
        if (result.status === "rejected") {
          yearFailures.push(result.reason.message);
          continue;
        }
        repositories.push(...result.value);
      }
      if (yearFailures.length > 0) {
        throw new Error(
          `Contribution-repository year discovery failed for ${identity}: ${yearFailures.join("; ")}`,
        );
      }
      return repositories;
    },
  );

  const repositories = new Map();
  const identityFailures = [];
  for (const result of identityResults) {
    if (result.status === "rejected") {
      identityFailures.push(result.reason.message);
      continue;
    }
    for (const repository of result.value) {
      mergeContributionCandidate(repositories, repository);
    }
  }
  if (identityFailures.length > 0) {
    throw new Error(
      `Contribution collection discovery was incomplete: ${identityFailures.join("; ")}`,
    );
  }
  return [...repositories.values()];
}

function repositoryNameFromApiUrl(value) {
  const match = String(value ?? "").match(/\/repos\/([^/]+)\/([^/?#]+)$/i);
  return match ? `${decodeURIComponent(match[1])}/${decodeURIComponent(match[2])}` : null;
}

async function searchPublicContributionRepositoryNames(
  query,
  evidence,
  identity,
) {
  const repositories = new Map();
  let reportedTotal = null;
  for (let page = 1; page <= 10; page += 1) {
    const endpoint =
      `/search/issues?q=${encodeURIComponent(query)}&sort=updated&order=desc&per_page=100&page=${page}`;
    const attempts = publicSearchCredentialAttempts().map((attempt) => ({
      headers: attempt.headers,
      label: attempt.name,
    }));

    let response = null;
    let lastError = null;
    for (const attempt of attempts) {
      try {
        response = await rest(endpoint, {
          label:
            `Public contribution search (${evidence}; ${identity}; ${attempt.label})`,
          headers: attempt.headers,
        });
        break;
      } catch (error) {
        lastError = error;
        console.warn(
          `Public contribution search (${evidence}; ${identity}) failed with the ${attempt.label}: ${error.message}`,
        );
      }
    }

    if (!response) {
      throw lastError ?? new Error(
        `Public contribution search failed for ${identity}.`,
      );
    }

    const items = Array.isArray(response?.items) ? response.items : [];
    reportedTotal ??= safeInteger(response?.total_count);
    if (response?.incomplete_results === true || reportedTotal > 1_000) {
      throw new Error(
        `Public contribution search (${evidence}; ${identity}) could not retrieve a complete GitHub Search result set (${reportedTotal} reported).`,
      );
    }
    for (const item of items) {
      const fullName = repositoryNameFromApiUrl(item.repository_url);
      if (fullName) {
        repositories.set(fullName.toLowerCase(), {
          fullName,
          evidence,
          identity,
        });
      }
    }
    if (items.length < 100 || page * 100 >= reportedTotal) break;
  }
  if (repositories.size > config.maxPublicContributedRepositories) {
    throw new Error(
      `Public contribution discovery found ${repositories.size} repositories for ${identity}, exceeding MAX_PUBLIC_CONTRIBUTED_REPOSITORIES=${config.maxPublicContributedRepositories}. Raise the cap rather than publishing a partial portfolio.`,
    );
  }
  return [...repositories.values()];
}

async function fetchPublicRepositoryMetadata(
  fullName,
  evidence,
  identities = [],
) {
  const encoded = fullName.split("/").map(encodeURIComponent).join("/");
  let repository;
  let lastError;
  for (const { headers } of publicSearchCredentialAttempts()) {
    try {
      repository = await rest(`/repos/${encoded}`, {
        label: `Public repository metadata (${fullName})`,
        headers,
      });
      break;
    } catch (error) {
      lastError = error;
    }
  }
  if (!repository) {
    throw lastError ?? new Error(
      `Could not load public repository metadata for ${fullName}.`,
    );
  }

  const normalized = normalizePublicContributionRepository(
    repository,
    [evidence],
    identities,
  );
  return normalized;
}

async function fetchSearchDiscoveredContributionRepositories() {
  const searchSpecs = globalContributorIdentities.flatMap((identity) => [
    {
      query: `author:${identity} is:pr`,
      evidence: "pull-request",
      identity,
    },
    {
      query: `reviewed-by:${identity} is:pr`,
      evidence: "pull-request-review",
      identity,
    },
  ]);

  const searchResults = await mapLimit(searchSpecs, 1, (spec) =>
    searchPublicContributionRepositoryNames(
      spec.query,
      spec.evidence,
      spec.identity,
    ),
  );

  const names = new Map();
  const searchFailures = [];
  for (const result of searchResults) {
    if (result.status === "rejected") {
      searchFailures.push(result.reason.message);
      continue;
    }
    for (const item of result.value) {
      const existing = names.get(item.fullName.toLowerCase()) ?? {
        fullName: item.fullName,
        evidence: new Set(),
        identities: new Set(),
      };
      existing.evidence.add(item.evidence);
      existing.identities.add(item.identity);
      names.set(item.fullName.toLowerCase(), existing);
    }
  }
  if (searchFailures.length > 0) {
    throw new Error(
      `Public contribution search discovery was incomplete: ${searchFailures.join("; ")}`,
    );
  }

  const metadataResults = await mapLimit(
    [...names.values()].slice(0, config.maxPublicContributedRepositories),
    3,
    async (item) => {
      const repository = await fetchPublicRepositoryMetadata(
        item.fullName,
        [...item.evidence][0],
        [...item.identities],
      );
      repository.contribution_evidence = [...item.evidence];
      repository.contribution_identities = [...item.identities];
      return repository;
    },
  );
  const metadataFailures = metadataResults
    .filter((result) => result.status === "rejected")
    .map((result) => result.reason.message);
  if (metadataFailures.length > 0) {
    throw new Error(
      `Public contribution metadata discovery was incomplete: ${metadataFailures.join("; ")}`,
    );
  }
  return metadataResults.map((result) => result.value);
}

async function fetchPublicContributedRepositories() {
  if (config.maxPublicContributedRepositories === 0) return [];

  // Every configured identity uses ordinary GitHub-wide public contribution
  // discovery. Candidates are verified later before affecting analytics.
  const sourceSpecs = [
    ...globalContributorIdentities.map((identity) => ({
      name: `repository relationship via workflow token (${identity})`,
      run: () => fetchRepositoriesContributedToConnection(
        identity,
        PUBLIC_REST_HEADERS,
        `Public contributed-repository relationship via workflow token (${identity})`,
      ),
    })),
    {
      name: "yearly contribution collections via workflow token",
      run: () => fetchContributionCollectionRepositories(
        PUBLIC_REST_HEADERS,
        "Workflow-token",
      ),
    },
    {
      name: "PR/review searches",
      run: fetchSearchDiscoveredContributionRepositories,
    },
  ];

  const sources = await Promise.allSettled(
    sourceSpecs.map((source) => source.run()),
  );
  const merged = new Map();
  const sourceFailures = [];
  sources.forEach((source, index) => {
    const sourceName = sourceSpecs[index].name;
    if (source.status === "rejected") {
      sourceFailures.push(`${sourceName}: ${source.reason.message}`);
      return;
    }
    console.log(
      `${sourceName} discovery returned ${source.value.length} public organization repositories.`,
    );
    for (const repository of source.value) {
      mergeContributionCandidate(merged, repository);
    }
  });

  if (sourceFailures.length > 0) {
    throw new Error(
      `Public contribution discovery was incomplete: ${sourceFailures.join("; ")}`,
    );
  }

  if (merged.size > config.maxPublicContributedRepositories) {
    throw new Error(
      `Public contribution discovery found ${merged.size} unique repositories, exceeding MAX_PUBLIC_CONTRIBUTED_REPOSITORIES=${config.maxPublicContributedRepositories}. Raise the cap rather than publishing a partial portfolio.`,
    );
  }

  return [...merged.values()]
    .sort((first, second) =>
      String(second.pushed_at ?? "").localeCompare(String(first.pushed_at ?? "")) ||
      first.full_name.localeCompare(second.full_name),
    );
}

function mergeRepositories(...repositoryLists) {
  const merged = new Map();

  for (const repository of repositoryLists.flat()) {
    if (!repository?.full_name) continue;
    const key = repository.full_name.toLowerCase();
    const existing = merged.get(key);

    if (!existing) {
      merged.set(key, { ...repository });
      continue;
    }

    // Prefer the richer REST object while preserving contribution discovery
    // flags contributed by the GraphQL repository relationship query.
    const richer = existing.id
      ? existing
      : repository.id
        ? repository
        : { ...existing, ...repository };

    merged.set(key, {
      ...richer,
      discovered_from_contributions:
        Boolean(existing.discovered_from_contributions) ||
        Boolean(repository.discovered_from_contributions),
      contribution_evidence: [...new Set([
        ...(existing.contribution_evidence ?? []),
        ...(repository.contribution_evidence ?? []),
      ])],
      contribution_identities: [...new Set([
        ...(existing.contribution_identities ?? []),
        ...(repository.contribution_identities ?? []),
      ])],
    });
  }

  return [...merged.values()].sort((first, second) =>
    first.full_name.localeCompare(second.full_name),
  );
}

function repositoryIsExcluded(repository) {
  const fullName = String(repository.full_name ?? "").toLowerCase();
  const shortName = String(repository.name ?? "").toLowerCase();

  return (
    config.excludedRepositories.has(fullName) ||
    config.excludedRepositories.has(shortName)
  );
}

function classifyRepositoryScope(repository) {
  const ownerLogin = String(repository.owner?.login ?? "").toLowerCase();
  const visibility = String(
    repository.visibility ??
      (repository.private ? "private" : "public"),
  ).toLowerCase();

  if (ownerLogin === username.toLowerCase()) {
    return REPOSITORY_SCOPE.PERSONAL;
  }

  // Full public-project composition is included only when GitHub reports a
  // concrete commit, pull-request, or pull-request-review relationship.
  if (
    visibility === "public" &&
    repository.discovered_from_contributions
  ) {
    return REPOSITORY_SCOPE.PUBLIC_CONTRIBUTED;
  }

  return null;
}

function repositoryPassesAnalyticsFilters(repository) {
  if (repository.disabled) return false;
  if (!repository.default_branch) return false;
  if (!config.includeForkedRepositories && repository.fork) return false;
  if (!config.includeArchivedRepositories && repository.archived) return false;
  if (repositoryIsExcluded(repository)) return false;
  return true;
}

function selectRepositoriesForAnalytics(repositories) {
  const selected = [];
  const summary = {
    personalPublic: 0,
    personalPrivate: 0,
    publicContributed: 0,
    excludedExternalPrivateOrInternal: 0,
    excludedExternalWithoutContributionRelationship: 0,
    excludedByAnalyticsFilters: 0,
  };

  for (const repository of repositories) {
    const scope = classifyRepositoryScope(repository);
    const visibility = String(
      repository.visibility ??
        (repository.private ? "private" : "public"),
    ).toLowerCase();

    if (!scope) {
      if (visibility !== "public") {
        summary.excludedExternalPrivateOrInternal += 1;
      } else {
        summary.excludedExternalWithoutContributionRelationship += 1;
      }
      continue;
    }

    if (!repositoryPassesAnalyticsFilters(repository)) {
      summary.excludedByAnalyticsFilters += 1;
      continue;
    }

    const publicContribution =
      scope === REPOSITORY_SCOPE.PUBLIC_CONTRIBUTED;

    if (scope === REPOSITORY_SCOPE.PERSONAL) {
      if (visibility === "public") {
        summary.personalPublic += 1;
      } else {
        summary.personalPrivate += 1;
      }
    } else {
      summary.publicContributed += 1;
    }

    selected.push({ repository, scope, publicContribution });
  }

  return { selected, summary };
}

function repositorySupportsAnonymousFallback(scope) {
  return scope === REPOSITORY_SCOPE.PUBLIC_CONTRIBUTED;
}

function manifestCandidate(entry) {
  if (entry.type !== "blob") return false;
  if (safeInteger(entry.size) > MAX_CONTENT_BYTES) return false;

  const lowerPath = entry.path.toLowerCase();
  const baseName = lowerPath.split("/").at(-1);

  if (MANIFEST_BASENAMES.has(baseName)) return true;
  if (/requirements[^/]*\.txt$/.test(baseName)) return true;
  if (isAiEvidenceCandidatePath(entry.path)) return true;
  return false;
}

function encodeRepositoryPath(value) {
  return value
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

async function fetchRepositoryContent(
  repository,
  scope,
  filePath,
) {
  if (
    repositorySupportsAnonymousFallback(scope)
  ) {
    const owner = encodeURIComponent(repository.owner.login);
    const name = encodeURIComponent(repository.name);
    const reference = encodeURIComponent(repository.default_branch);
    const encodedPath = encodeRepositoryPath(filePath);
    const rawUrl =
      `https://raw.githubusercontent.com/${owner}/${name}/${reference}/${encodedPath}`;

    const content = await requestText(rawUrl, {
      label: "Public repository manifest request",
      optionalStatuses: [404],
    });

    if (content === null) return null;
    if (Buffer.byteLength(content, "utf8") > MAX_CONTENT_BYTES) {
      return null;
    }

    return content;
  }

  const encodedPath = encodeRepositoryPath(filePath);
  const encodedReference = encodeURIComponent(repository.default_branch);

  const response = await rest(
    `/repos/${repository.full_name}/contents/${encodedPath}?ref=${encodedReference}`,
    {
      label: "Personal repository manifest request",
      optionalStatuses: [404, 409, 422],
    },
  );

  if (!response || Array.isArray(response)) return null;
  if (response.type !== "file") return null;
  if (safeInteger(response.size) > MAX_CONTENT_BYTES) return null;
  if (response.encoding !== "base64" || !response.content) return null;

  try {
    return Buffer.from(
      response.content.replaceAll("\n", ""),
      "base64",
    ).toString("utf8");
  } catch {
    return null;
  }
}

async function publicRestWithFallback(
  endpoint,
  { label, optionalStatuses = [] },
) {
  let lastError = null;
  // External public repositories must never inherit the fine-grained private
  // PAT's repository-selection or organization-authorization restrictions.
  for (const { headers } of publicSearchCredentialAttempts()) {
    try {
      return await rest(endpoint, {
        label,
        optionalStatuses,
        headers,
      });
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError ?? new Error(`${label} failed.`);
}

async function fetchRepositoryDetails(selection) {
  const { repository, scope, publicContribution = false } = selection;
  const publicRepository = repositorySupportsAnonymousFallback(scope);

  let languages = {};
  let treeResponse = null;

  if (publicRepository) {
    // Both results are required. Mixing GitHub Linguist byte counts with a
    // source-file-count fallback would make the aggregate mathematically
    // invalid and could silently publish partial repository analytics.
    const [languageResult, treeResult] = await Promise.allSettled([
      publicRestWithFallback(repository.languages_url, {
        label: `Public repository languages (${repository.full_name})`,
      }),
      publicRestWithFallback(
        `/repos/${repository.full_name}/git/trees/${encodeURIComponent(repository.default_branch)}?recursive=1`,
        {
          label: `Public repository tree (${repository.full_name})`,
          optionalStatuses: [409],
        },
      ),
    ]);

    if (languageResult.status === "rejected") throw languageResult.reason;
    if (treeResult.status === "rejected") throw treeResult.reason;
    languages = languageResult.value ?? {};
    treeResponse = treeResult.value;
  } else {
    [languages, treeResponse] = await Promise.all([
      rest(repository.languages_url, {
        label: "Repository languages request",
        headers: REST_HEADERS,
      }),
      rest(
        `/repos/${repository.full_name}/git/trees/${encodeURIComponent(repository.default_branch)}?recursive=1`,
        {
          label: "Repository tree request",
          optionalStatuses: [409],
          headers: REST_HEADERS,
        },
      ),
    ]);
  }

  const treeEntries = Array.isArray(treeResponse?.tree)
    ? treeResponse.tree
    : [];
  const paths = treeEntries
    .filter((entry) => entry.type === "blob" && entry.path)
    .map((entry) => entry.path);

  // An empty Linguist response is a valid result for an empty or non-code
  // repository. It remains empty rather than being replaced by incomparable
  // file counts.
  const languageSource = "github-linguist";

  const manifestEntries = treeEntries
    .filter(manifestCandidate)
    .sort((first, second) =>
      aiEvidencePriority(second.path) - aiEvidencePriority(first.path) ||
      first.path.localeCompare(second.path),
    )
    .slice(0, config.maxManifestFilesPerRepository);

  const manifestResults = await mapLimit(
    manifestEntries,
    config.manifestConcurrency,
    async (entry) => ({
      path: entry.path,
      content: await fetchRepositoryContent(repository, scope, entry.path),
    }),
  );
  const manifestFailures = manifestResults
    .filter((result) => result.status === "rejected")
    .map((result) => result.reason.message);
  if (manifestFailures.length > 0) {
    throw new Error(
      `Manifest inspection was incomplete for ${repository.full_name}: ${manifestFailures.join("; ")}`,
    );
  }
  const manifests = manifestResults
    .filter((result) =>
      result.status === "fulfilled" &&
      result.value?.content !== null &&
      result.value?.content !== undefined,
    )
    .map((result) => result.value);

  return {
    repository,
    scope,
    publicContribution,
    languages: languages ?? {},
    languageSource,
    paths,
    manifests,
    treeTruncated: Boolean(treeResponse?.truncated),
  };
}

async function fetchContributionYearsForLogin(
  login,
  headers,
  label,
) {
  const query = `
    query ContributionYears($login: String!) {
      user(login: $login) {
        contributionsCollection {
          contributionYears
        }
      }
    }
  `;

  const data = await graphql(
    query,
    { login },
    label,
    { headers },
  );

  const years = data?.user?.contributionsCollection?.contributionYears ?? [];
  const currentYear = new Date().getUTCFullYear();
  return [...new Set([...years, currentYear])]
    .filter(Number.isInteger)
    .sort((first, second) => first - second);
}

async function fetchContributionYears() {
  return fetchContributionYearsForLogin(
    username,
    REST_HEADERS,
    "Contribution-year query",
  );
}

async function fetchContributionYear(year) {
  const now = new Date();
  const currentYear = now.getUTCFullYear();
  const from = new Date(Date.UTC(year, 0, 1, 0, 0, 0));
  const to =
    year === currentYear
      ? now
      : new Date(Date.UTC(year, 11, 31, 23, 59, 59));

  const query = `
    query ContributionYear(
      $login: String!
      $from: DateTime!
      $to: DateTime!
    ) {
      user(login: $login) {
        contributionsCollection(from: $from, to: $to) {
          totalCommitContributions
          totalIssueContributions
          totalPullRequestContributions
          totalPullRequestReviewContributions
          restrictedContributionsCount
          contributionCalendar {
            totalContributions
            weeks {
              contributionDays {
                date
                contributionCount
                weekday
              }
            }
          }
        }
      }
    }
  `;

  const data = await graphql(
    query,
    {
      login: username,
      from: from.toISOString(),
      to: to.toISOString(),
    },
    `Contribution query for ${year}`,
  );

  return {
    year,
    from: isoDate(from),
    to: isoDate(to),
    collection: data?.user?.contributionsCollection,
  };
}

async function fetchAllContributionHistory() {
  const years = await fetchContributionYears();
  const results = await mapLimit(years, 2, fetchContributionYear);

  const failed = results.filter((result) => result.status === "rejected");
  if (failed.length > 0) {
    throw failed[0].reason;
  }

  const dayMap = new Map();
  const totals = {
    commits: 0,
    issues: 0,
    pullRequests: 0,
    reviews: 0,
    restricted: 0,
    calendarContributions: 0,
  };

  for (const result of results) {
    const { from, to, collection } = result.value;
    if (!collection) continue;

    totals.commits += safeInteger(collection.totalCommitContributions);
    totals.issues += safeInteger(collection.totalIssueContributions);
    totals.pullRequests += safeInteger(
      collection.totalPullRequestContributions,
    );
    totals.reviews += safeInteger(
      collection.totalPullRequestReviewContributions,
    );
    totals.restricted += safeInteger(
      collection.restrictedContributionsCount,
    );
    totals.calendarContributions += safeInteger(
      collection.contributionCalendar?.totalContributions,
    );

    for (const week of collection.contributionCalendar?.weeks ?? []) {
      for (const day of week.contributionDays ?? []) {
        if (day.date < from || day.date > to) continue;
        dayMap.set(day.date, {
          date: day.date,
          contributionCount: safeInteger(day.contributionCount),
          weekday: safeInteger(day.weekday),
        });
      }
    }
  }

  return {
    totals,
    days: buildContinuousDays(dayMap),
  };
}

function buildContinuousDays(dayMap) {
  if (dayMap.size === 0) return [];

  const dates = [...dayMap.keys()].sort();
  const start = dateFromIso(dates[0]);
  const today = dateFromIso(isoDate(new Date()));
  const days = [];

  for (
    let cursor = start;
    cursor.getTime() <= today.getTime();
    cursor = addUtcDays(cursor, 1)
  ) {
    const date = isoDate(cursor);
    days.push(
      dayMap.get(date) ?? {
        date,
        contributionCount: 0,
        weekday: cursor.getUTCDay(),
      },
    );
  }

  return days;
}

function calculateStreak(days) {
  if (days.length === 0) {
    return {
      current: 0,
      longest: 0,
      activeDays: 0,
      first: null,
      latest: null,
      mostActiveWeekday: "—",
    };
  }

  let longest = 0;
  let running = 0;
  let activeDays = 0;
  let first = null;
  let latest = null;
  const weekdayCounts = Array(7).fill(0);

  for (const day of days) {
    if (day.contributionCount > 0) {
      running += 1;
      longest = Math.max(longest, running);
      activeDays += 1;
      first ??= day.date;
      latest = day.date;
      weekdayCounts[day.weekday] += day.contributionCount;
    } else {
      running = 0;
    }
  }

  let current = 0;
  if (latest) {
    const today = dateFromIso(isoDate(new Date()));
    const latestDate = dateFromIso(latest);
    const differenceInDays = Math.round(
      (today.getTime() - latestDate.getTime()) / 86_400_000,
    );

    if (differenceInDays === 0 || differenceInDays === 1) {
      const countsByDate = new Map(
        days.map((day) => [day.date, day.contributionCount]),
      );

      for (
        let cursor = latestDate;
        safeInteger(countsByDate.get(isoDate(cursor))) > 0;
        cursor = addUtcDays(cursor, -1)
      ) {
        current += 1;
      }
    }
  }

  const weekdayNames = [
    "Sunday",
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
  ];
  const maximumWeekdayCount = Math.max(...weekdayCounts);
  const mostActiveWeekday =
    maximumWeekdayCount > 0
      ? weekdayNames[weekdayCounts.indexOf(maximumWeekdayCount)]
      : "—";

  return {
    current,
    longest,
    activeDays,
    first,
    latest,
    mostActiveWeekday,
  };
}

/**
 * Searches global collaboration activity across both credential scopes.
 *
 * The PAT is required for selected private repositories; the workflow token
 * (or anonymous fallback) covers external public repositories that a
 * fine-grained PAT may not be authorized to search. Result identifiers are
 * unioned across credentials and historical aliases to prevent double counts.
 */
async function searchCountsByContributorIdentity(
  queryFactory,
  label,
  { identities = globalContributorIdentities } = {},
) {
  const results = await mapLimit(
    identities,
    1,
    async (identity) => {
      const privateResult = await searchRepositoryIssueIdentifiers(
        queryFactory(identity),
        `${label} (${identity}; personal token)`,
        null,
        REST_HEADERS,
      );
      if (!privateResult.complete) {
        throw new Error(
          `${label} (${identity}; personal token) exceeded GitHub Search's 1,000-result retrieval boundary.`,
        );
      }

      let publicResult = null;
      let lastPublicError = null;
      for (const attempt of publicSearchCredentialAttempts()) {
        try {
          publicResult = await searchRepositoryIssueIdentifiers(
            queryFactory(identity),
            `${label} (${identity}; ${attempt.name})`,
            null,
            attempt.headers,
          );
          if (publicResult.complete) break;
        } catch (error) {
          lastPublicError = error;
        }
      }
      if (!publicResult) {
        throw lastPublicError ?? new Error(
          `${label} (${identity}; public scope) had no usable credential.`,
        );
      }
      if (!publicResult.complete) {
        throw new Error(
          `${label} (${identity}; public scope) exceeded GitHub Search's 1,000-result retrieval boundary.`,
        );
      }

      return {
        identity,
        keys: new Set([...privateResult.keys, ...publicResult.keys]),
      };
    },
  );

  const identityResults = [];
  const failures = [];
  for (const [index, result] of results.entries()) {
    if (result.status === "rejected") {
      failures.push(
        `${identities[index]}: ${result.reason.message}`,
      );
      continue;
    }
    identityResults.push(result.value);
  }

  if (failures.length > 0) {
    throw new Error(
      `${label} failed for ${failures.length} configured identity search(es): ${failures.join("; ")}`,
    );
  }

  const combinedKeys = new Set(
    identityResults.flatMap((item) => [...item.keys]),
  );
  return {
    total: combinedKeys.size,
    identities: identityResults
      .filter((item) => item.keys.size > 0)
      .map((item) => item.identity),
    counts: identityResults.map((item) => ({
      identity: item.identity,
      count: item.keys.size,
    })),
  };
}

function publicSearchCredentialAttempts() {
  return [
    ...(publicGithubToken
      ? [{ name: "workflow token", headers: PUBLIC_REST_HEADERS }]
      : []),
    { name: "anonymous public API", headers: ANONYMOUS_REST_HEADERS },
  ];
}

function publicSearchResultKey(item, expectedRepositoryFullName) {
  const repositoryFullName =
    repositoryNameFromApiUrl(item?.repository_url) ??
    expectedRepositoryFullName;
  const pullRequestNumber = Number(item?.number);
  if (!repositoryFullName || !Number.isSafeInteger(pullRequestNumber)) {
    return null;
  }
  return `${repositoryFullName.toLowerCase()}#${pullRequestNumber}`;
}

/**
 * Retrieves repository-scoped issue/PR identifiers instead of only
 * `total_count`. Identifiers can be unioned across historical aliases, which
 * prevents the same pull request from being counted twice.
 */
async function searchRepositoryIssueIdentifiers(
  query,
  label,
  repositoryFullName,
  headers,
) {
  const keys = new Set();
  let reportedTotal = null;
  let incompleteResults = false;

  for (let page = 1; page <= 10; page += 1) {
    const response = await rest(
      `/search/issues?q=${encodeURIComponent(query)}&sort=updated&order=desc&per_page=100&page=${page}`,
      { label, headers },
    );
    const items = Array.isArray(response?.items) ? response.items : [];
    reportedTotal ??= safeInteger(response?.total_count);
    incompleteResults ||= response?.incomplete_results === true;

    for (const item of items) {
      const key = publicSearchResultKey(item, repositoryFullName);
      if (key) keys.add(key);
    }

    if (items.length < 100 || keys.size >= reportedTotal) break;
  }

  return {
    keys,
    reportedTotal: safeInteger(reportedTotal),
    complete:
      !incompleteResults &&
      safeInteger(reportedTotal) <= 1_000 &&
      keys.size >= safeInteger(reportedTotal),
  };
}

/**
 * Searches one external public repository with public credentials only.
 * Switching from the workflow token to anonymous access is a credential
 * fallback, not a retry of the same deterministic 422 response.
 */
async function searchPublicRepositoryEvidence(
  repository,
  identities,
  qualifierFactory,
  label,
) {
  const combinedKeys = new Set();
  const matchedIdentities = new Set();
  const unavailable = [];

  for (const identity of identities) {
    const query = qualifierFactory(identity);
    let identityResult = null;
    const attemptFailures = [];

    for (const attempt of publicSearchCredentialAttempts()) {
      try {
        identityResult = await searchRepositoryIssueIdentifiers(
          query,
          `${label} (${identity}; ${attempt.name})`,
          repository.full_name,
          attempt.headers,
        );
        if (identityResult.complete) break;
        attemptFailures.push({
          credential: attempt.name,
          message:
            `GitHub Search returned an incomplete result set (${identityResult.keys.size}/${identityResult.reportedTotal}).`,
          status: null,
          diagnostics: null,
        });
      } catch (error) {
        attemptFailures.push({
          credential: attempt.name,
          message: error.message,
          status: Number.isInteger(error.status) ? error.status : null,
          diagnostics: error.diagnostics ?? null,
        });
      }
    }

    if (!identityResult?.complete) {
      unavailable.push({
        identity,
        reason: identityResult
          ? `GitHub Search reported ${identityResult.reportedTotal} results but only ${identityResult.keys.size} identifiers were retrievable.`
          : "All public credential attempts failed.",
        failures: attemptFailures,
      });
      continue;
    }

    for (const key of identityResult.keys) combinedKeys.add(key);
    if (identityResult.keys.size > 0) matchedIdentities.add(identity);
  }

  return {
    status: unavailable.length === 0 ? "success" : "unavailable",
    count: unavailable.length === 0 ? combinedKeys.size : null,
    keys: combinedKeys,
    identities: [...matchedIdentities],
    unavailable,
  };
}


function contributionLanguageForPath(filePath) {
  const normalized = String(filePath ?? "").replaceAll("\\", "/");
  const lowerPath = normalized.toLowerCase();
  const baseName = lowerPath.split("/").at(-1) ?? "";

  if (CONTRIBUTION_IGNORED_BASENAMES.has(baseName)) return null;
  if (lowerPath.endsWith(".min.js") || lowerPath.endsWith(".min.css")) {
    return null;
  }

  const paddedPath = `/${lowerPath}`;
  if (
    CONTRIBUTION_IGNORED_PATH_PARTS.some((part) =>
      paddedPath.includes(part),
    )
  ) {
    return null;
  }

  if (CONTRIBUTION_SPECIAL_FILENAMES[baseName]) {
    return CONTRIBUTION_SPECIAL_FILENAMES[baseName];
  }

  const extension = path.extname(baseName);
  return CONTRIBUTION_LANGUAGE_BY_EXTENSION[extension] ?? null;
}

async function fetchAuthoredCommitReferences(selection) {
  const { repository, scope } = selection;
  const requestHeaders = repositorySupportsAnonymousFallback(scope)
    ? PUBLIC_REST_HEADERS
    : REST_HEADERS;
  const since = new Date();
  since.setUTCFullYear(since.getUTCFullYear() - config.codeActivityYears);

  // Empty repositories have no default branch and therefore no commit list.
  // This is a known zero, unlike an inaccessible or invalid API response.
  if (!repository.default_branch) {
    return { selection, commits: [], capped: false };
  }

  // Public organization projects may contain work authored through historical
  // GitHub accounts. Query every configured identity and merge by commit SHA
  // so one commit can never be counted twice.
  const identities = contributionIdentitiesForScope(scope, repository.full_name);
  const commitsBySha = new Map();
  let cappedIdentityListings = 0;

  for (const identity of identities) {
    let identityCommitCount = 0;

    for (let pageNumber = 1; ; pageNumber += 1) {
      const remaining =
        config.maxCommitsPerRepository - identityCommitCount;
      if (remaining <= 0) {
        cappedIdentityListings += 1;
        break;
      }

      const perPage = Math.min(100, remaining);
      const endpoint =
        `/repos/${repository.full_name}/commits?sha=${encodeURIComponent(repository.default_branch)}&author=${encodeURIComponent(identity)}&since=${encodeURIComponent(since.toISOString())}&per_page=${perPage}&page=${pageNumber}`;
      const response = repositorySupportsAnonymousFallback(scope)
        ? await publicRestWithFallback(endpoint, {
            label: `Authored-commit listing (${identity})`,
            optionalStatuses: [409],
          })
        : await rest(endpoint, {
            label: `Authored-commit listing (${identity})`,
            optionalStatuses: [409],
            headers: requestHeaders,
          });

      const pageItems = Array.isArray(response) ? response : [];
      for (const commit of pageItems) {
        if (!commit?.sha) continue;

        const existing = commitsBySha.get(commit.sha) ?? {
          sha: commit.sha,
          date:
            commit.commit?.author?.date ??
            commit.commit?.committer?.date ??
            null,
          attributedIdentities: new Set(),
        };
        existing.attributedIdentities.add(identity);
        commitsBySha.set(commit.sha, existing);
      }

      identityCommitCount += pageItems.length;
      if (pageItems.length < perPage) break;
      if (identityCommitCount >= config.maxCommitsPerRepository) {
        cappedIdentityListings += 1;
        break;
      }
    }
  }

  const discoveredCommits = [...commitsBySha.values()]
    .map((commit) => ({
      ...commit,
      attributedIdentities: [...commit.attributedIdentities],
    }))
    .sort((first, second) =>
      String(second.date ?? "").localeCompare(String(first.date ?? "")) ||
      first.sha.localeCompare(second.sha),
    );

  return {
    selection,
    commits: discoveredCommits.slice(0, config.maxCommitsPerRepository),
    capped:
      discoveredCommits.length > config.maxCommitsPerRepository ||
      cappedIdentityListings > 0,
  };
}

function allocateCommitReferences(repositoryCommitLists) {
  const queues = repositoryCommitLists
    .filter((item) => item.commits.length > 0)
    .map((item) => ({ ...item, index: 0 }));
  const allocated = [];

  // Round-robin prevents one large repository from consuming the global cap
  // before smaller repositories and public contribution repositories appear.
  while (
    allocated.length < config.maxAnalyzedCommits &&
    queues.some((queue) => queue.index < queue.commits.length)
  ) {
    for (const queue of queues) {
      if (allocated.length >= config.maxAnalyzedCommits) break;
      if (queue.index >= queue.commits.length) continue;

      allocated.push({
        selection: queue.selection,
        commit: queue.commits[queue.index],
      });
      queue.index += 1;
    }
  }

  return {
    allocated,
    discoveredCount: repositoryCommitLists.reduce(
      (sum, item) => sum + item.commits.length,
      0,
    ),
    cappedRepositories: repositoryCommitLists.filter((item) => item.capped)
      .length,
  };
}

async function fetchCommitDetails(selection, commitReference) {
  const { repository, scope } = selection;
  const {
    sha,
    date: discoveredDate = null,
    attributedIdentities = [],
  } = commitReference;
  const requestHeaders = repositorySupportsAnonymousFallback(scope)
    ? PUBLIC_REST_HEADERS
    : REST_HEADERS;
  const files = [];
  let statistics = null;
  let filesTruncated = false;

  for (let pageNumber = 1; pageNumber <= 30; pageNumber += 1) {
    const endpoint =
      `/repos/${repository.full_name}/commits/${encodeURIComponent(sha)}?per_page=100&page=${pageNumber}`;
    const response = repositorySupportsAnonymousFallback(scope)
      ? await publicRestWithFallback(endpoint, {
          label: "Public commit-detail request",
        })
      : await rest(endpoint, {
          label: "Personal commit-detail request",
          headers: requestHeaders,
        });

    if (pageNumber === 1) statistics = response.stats ?? null;

    const pageFiles = Array.isArray(response.files) ? response.files : [];
    files.push(...pageFiles);
    if (pageFiles.length < 100) break;
    if (pageNumber === 30) filesTruncated = true;
  }

  return {
    repositoryFullName: repository.full_name,
    sha,
    date:
      discoveredDate ??
      statistics?.commit?.author?.date ??
      statistics?.commit?.committer?.date ??
      null,
    statistics,
    files,
    filesTruncated,
    attributedIdentities: [...new Set(attributedIdentities)],
  };
}

function createContributionAccumulator() {
  return {
    additions: 0,
    deletions: 0,
    changedLines: 0,
    commitShas: new Set(),
    repositories: new Set(),
    files: new Set(),
    attributedIdentities: new Set(),
  };
}

function finalizeContributionAccumulator(accumulator) {
  return {
    additions: accumulator.additions,
    deletions: accumulator.deletions,
    changedLines: accumulator.changedLines,
    commits: accumulator.commitShas.size,
    repositories: accumulator.repositories.size,
    files: accumulator.files.size,
    attributedIdentities: [...accumulator.attributedIdentities].sort(),
  };
}

async function analyzePersonalCodeContributions(repositorySelections) {
  console.log(
    `Discovering GitHub-attributed commits from the last ${config.codeActivityYears} years...`,
  );

  const listResults = await mapLimit(
    repositorySelections,
    config.commitListConcurrency,
    fetchAuthoredCommitReferences,
  );

  const repositoryCommitLists = [];
  const listingFailures = [];

  for (const [index, result] of listResults.entries()) {
    if (result.status === "fulfilled") {
      repositoryCommitLists.push(result.value);
    } else {
      listingFailures.push(
        `${repositorySelections[index].repository.full_name}: ${result.reason.message}`,
      );
    }
  }

  if (listingFailures.length > 0) {
    throw new Error(
      `Personal authored-commit discovery was incomplete: ${listingFailures.join("; ")}`,
    );
  }

  const allocation = allocateCommitReferences(repositoryCommitLists);
  console.log(
    `Authored commits discovered: ${allocation.discoveredCount}; selected for detailed analysis: ${allocation.allocated.length}; repository caps reached: ${allocation.cappedRepositories}; listing failures: 0.`,
  );

  if (
    allocation.cappedRepositories > 0 ||
    allocation.discoveredCount > allocation.allocated.length
  ) {
    throw new Error(
      "Personal code contribution analysis reached a configured commit cap. " +
      "Raise MAX_COMMITS_PER_REPOSITORY or MAX_ANALYZED_COMMITS rather than publishing partial language totals.",
    );
  }

  const detailResults = await mapLimit(
    allocation.allocated,
    config.commitDetailConcurrency,
    ({ selection, commit }) =>
      fetchCommitDetails(selection, commit),
  );

  const languages = new Map();
  const repositories = new Map();
  const aiWorkflow = {
    commitShas: new Set(),
    repositories: new Set(),
    files: new Set(),
    months: new Map(),
    changedLines: 0,
    firstDate: null,
    latestDate: null,
  };
  const detailFailures = [];

  for (const [index, result] of detailResults.entries()) {
    if (result.status === "rejected") {
      const allocationItem = allocation.allocated[index];
      detailFailures.push(
        `${allocationItem.selection.repository.full_name}@${allocationItem.commit.sha}: ${result.reason.message}`,
      );
      continue;
    }

    const detail = result.value;
    if (detail.filesTruncated) {
      detailFailures.push(
        `${detail.repositoryFullName}@${detail.sha}: changed-file pagination exceeded GitHub's 3,000-file retrieval boundary.`,
      );
      continue;
    }
    const repositoryAccumulator = repositories.get(detail.repositoryFullName) ??
      createContributionAccumulator();
    repositoryAccumulator.commitShas.add(detail.sha);
    repositoryAccumulator.repositories.add(detail.repositoryFullName);
    for (const identity of detail.attributedIdentities ?? []) {
      repositoryAccumulator.attributedIdentities.add(identity);
    }

    let aiWorkflowCommitTouched = false;

    for (const file of detail.files) {
      const additions = safeInteger(file.additions);
      const deletions = safeInteger(file.deletions);
      const changedLines = additions + deletions;

      if (isAiEvidencePath(file.filename)) {
        aiWorkflowCommitTouched = true;
        aiWorkflow.files.add(`${detail.repositoryFullName}:${file.filename}`);
        aiWorkflow.changedLines += changedLines;
      }

      const language = contributionLanguageForPath(file.filename);
      if (!language) continue;
      if (changedLines <= 0) continue;

      const languageAccumulator = languages.get(language) ??
        createContributionAccumulator();
      languageAccumulator.additions += additions;
      languageAccumulator.deletions += deletions;
      languageAccumulator.changedLines += changedLines;
      languageAccumulator.commitShas.add(detail.sha);
      languageAccumulator.repositories.add(detail.repositoryFullName);
      for (const identity of detail.attributedIdentities ?? []) {
        languageAccumulator.attributedIdentities.add(identity);
      }
      languageAccumulator.files.add(
        `${detail.repositoryFullName}:${file.filename}`,
      );
      languages.set(language, languageAccumulator);

      repositoryAccumulator.additions += additions;
      repositoryAccumulator.deletions += deletions;
      repositoryAccumulator.changedLines += changedLines;
      repositoryAccumulator.files.add(file.filename);
    }

    repositories.set(detail.repositoryFullName, repositoryAccumulator);

    if (aiWorkflowCommitTouched) {
      aiWorkflow.commitShas.add(detail.sha);
      aiWorkflow.repositories.add(detail.repositoryFullName);
      const date = detail.date ? String(detail.date).slice(0, 10) : null;
      if (date) {
        const month = date.slice(0, 7);
        aiWorkflow.months.set(month, (aiWorkflow.months.get(month) ?? 0) + 1);
        if (!aiWorkflow.firstDate || date < aiWorkflow.firstDate) aiWorkflow.firstDate = date;
        if (!aiWorkflow.latestDate || date > aiWorkflow.latestDate) aiWorkflow.latestDate = date;
      }
    }
  }

  if (detailFailures.length > 0) {
    throw new Error(
      `Personal commit-detail analysis was incomplete: ${detailFailures.join("; ")}`,
    );
  }

  const languageItems = [...languages.entries()]
    .map(([language, accumulator]) => ({
      language,
      color: LANGUAGE_COLORS[language] ?? fallbackColor(language),
      ...finalizeContributionAccumulator(accumulator),
    }))
    .sort(
      (first, second) =>
        second.changedLines - first.changedLines ||
        second.commits - first.commits ||
        first.language.localeCompare(second.language),
    );

  const repositoryItems = new Map(
    [...repositories.entries()].map(([fullName, accumulator]) => [
      fullName.toLowerCase(),
      finalizeContributionAccumulator(accumulator),
    ]),
  );

  return {
    languages: languageItems,
    repositories: repositoryItems,
    analyzedCommits: detailResults.length,
    discoveredCommits: allocation.discoveredCount,
    globalCapReached:
      allocation.discoveredCount > allocation.allocated.length,
    cappedRepositories: allocation.cappedRepositories,
    failedCommitDetails: 0,
    aiWorkflowActivity: {
      commits: aiWorkflow.commitShas.size,
      repositories: aiWorkflow.repositories.size,
      files: aiWorkflow.files.size,
      changedLines: aiWorkflow.changedLines,
      activeMonths: aiWorkflow.months.size,
      firstDate: aiWorkflow.firstDate,
      latestDate: aiWorkflow.latestDate,
      monthly: [...aiWorkflow.months.entries()]
        .map(([month, commits]) => ({ month, commits }))
        .sort((first, second) => first.month.localeCompare(second.month)),
    },
  };
}

/**
 * Aggregates the exact byte totals reported by GitHub's Languages endpoint.
 *
 * A percentage-of-percentages gives a tiny repository the same influence as a
 * monorepo and can badly distort languages such as Python. Raw Linguist bytes
 * are additive across repositories and therefore form one consistent metric.
 */
function aggregateLanguages(repositoryDetails) {
  const totals = new Map();

  for (const detail of repositoryDetails) {
    const composition = repositoryLanguageComposition(detail);
    for (const item of composition.languages) {
      const current = totals.get(item.language) ?? {
        language: item.language,
        weight: 0,
        rawUnits: 0,
        repositories: 0,
      };
      current.weight += item.bytes;
      current.rawUnits += item.bytes;
      current.repositories += 1;
      totals.set(item.language, current);
    }
  }

  const totalWeight = [...totals.values()].reduce(
    (sum, item) => sum + item.weight,
    0,
  );

  return [...totals.values()]
    .map((item) => ({
      ...item,
      percentage: totalWeight > 0
        ? (item.weight / totalWeight) * 100
        : 0,
      color: LANGUAGE_COLORS[item.language] ?? fallbackColor(item.language),
    }))
    .sort((first, second) =>
      second.weight - first.weight ||
      second.repositories - first.repositories ||
      first.language.localeCompare(second.language),
    );
}

function splitRepositoryFullName(fullName) {
  const parts = String(fullName ?? "").split("/").filter(Boolean);
  if (parts.length !== 2) {
    throw new Error(`Invalid repository name '${fullName}'.`);
  }
  return { owner: parts[0], name: parts[1] };
}

async function fetchPublicRepositoryLifecycle(repository) {
  const { owner, name } = splitRepositoryFullName(repository.full_name);
  const query = `
    query PublicRepositoryLifecycle(
      $owner: String!
      $name: String!
    ) {
      repository(owner: $owner, name: $name) {
        stargazerCount
        forkCount
        releases(first: 1) {
          totalCount
        }
        defaultBranchRef {
          target {
            ... on Commit {
              history(first: 1) {
                totalCount
              }
            }
          }
        }
      }
    }
  `;

  const data = await graphql(
    query,
    { owner, name },
    `Public contribution repository lifecycle query (${repository.full_name})`,
    { headers: PUBLIC_REST_HEADERS },
  );
  const result = data?.repository;
  if (!result) {
    throw new Error(
      `Public lifecycle query returned no repository for ${repository.full_name}.`,
    );
  }

  return {
    commits: safeInteger(
      result.defaultBranchRef?.target?.history?.totalCount,
    ),
    releases: safeInteger(result.releases?.totalCount),
    stars: safeInteger(result.stargazerCount),
    forks: safeInteger(result.forkCount),
  };
}

function repositoryLanguageComposition(detail) {
  const totalBytes = Object.values(detail.languages).reduce(
    (sum, value) => sum + safeInteger(value),
    0,
  );

  const fileCounts = new Map();
  for (const filePath of detail.paths) {
    const language = contributionLanguageForPath(filePath);
    if (!language) continue;
    fileCounts.set(language, safeInteger(fileCounts.get(language)) + 1);
  }

  const languages = Object.entries(detail.languages)
    .map(([language, bytesValue]) => {
      const bytes = safeInteger(bytesValue);
      return {
        language,
        bytes,
        percentage: totalBytes > 0 ? (bytes / totalBytes) * 100 : 0,
        files: safeInteger(fileCounts.get(language)),
        color: LANGUAGE_COLORS[language] ?? fallbackColor(language),
      };
    })
    .filter((item) => item.bytes > 0)
    .sort(
      (first, second) =>
        second.bytes - first.bytes ||
        first.language.localeCompare(second.language),
    );

  return {
    languages,
    sourceFiles: [...fileCounts.values()].reduce(
      (sum, value) => sum + value,
      0,
    ),
  };
}

async function fetchAttributedContributorCommits(repository, identities) {
  const identitySet = new Set(identities.map((identity) => identity.toLowerCase()));
  const matchedIdentities = new Set();
  let commits = 0;

  for (let page = 1; page <= 5; page += 1) {
    const contributors = await publicRestWithFallback(
      `/repos/${repository.full_name}/contributors?anon=1&per_page=100&page=${page}`,
      {
        label: `Repository contributors (${repository.full_name})`,
        optionalStatuses: [204, 409],
      },
    );
    const items = Array.isArray(contributors) ? contributors : [];
    for (const contributor of items) {
      const login = String(contributor?.login ?? "").toLowerCase();
      if (!identitySet.has(login)) continue;
      commits += safeInteger(contributor.contributions);
      matchedIdentities.add(contributor.login);
    }
    if (items.length < 100) break;
  }

  return { commits, identities: [...matchedIdentities] };
}

async function fetchPullRequestReviews(repository, pullRequestNumber) {
  const reviews = [];
  for (let page = 1; ; page += 1) {
    const pageItems = await publicRestWithFallback(
      `/repos/${repository.full_name}/pulls/${pullRequestNumber}/reviews?per_page=100&page=${page}`,
      {
        label: `Pull-request reviews (${repository.full_name}#${pullRequestNumber})`,
      },
    );
    const items = Array.isArray(pageItems) ? pageItems : [];
    reviews.push(...items);
    if (items.length < 100) break;
  }
  return reviews;
}

/**
 * Directly inspects historical pull requests and their submitted reviews.
 * This is used when contribution evidence indicates review activity because
 * search indexing can omit historical review records even though a repository's
 * PR review timeline still contains them.
 */
async function fetchDirectPullRequestActivity(
  repository,
  identities,
  { inspectReviews = true } = {},
) {
  const identitySet = new Set(identities.map((identity) => identity.toLowerCase()));
  const pullRequests = [];
  let capped = false;

  for (let page = 1; ; page += 1) {
    const remaining = config.maxPullRequestsPerPublicRepository - pullRequests.length;
    if (remaining <= 0) {
      capped = true;
      break;
    }
    const perPage = Math.min(100, remaining);
    const pageItems = await publicRestWithFallback(
      `/repos/${repository.full_name}/pulls?state=all&sort=updated&direction=desc&per_page=${perPage}&page=${page}`,
      {
        label: `Historical pull requests (${repository.full_name})`,
      },
    );
    const items = Array.isArray(pageItems) ? pageItems : [];
    pullRequests.push(...items);
    if (items.length < perPage) break;
  }

  const authored = new Set();
  const reviewed = new Set();
  const approved = new Set();
  const matchedIdentities = new Set();
  let reviewSubmissions = 0;

  for (const pullRequest of pullRequests) {
    const authorLogin = String(pullRequest?.user?.login ?? "").toLowerCase();
    if (!identitySet.has(authorLogin)) continue;
    authored.add(`${repository.full_name.toLowerCase()}#${pullRequest.number}`);
    matchedIdentities.add(pullRequest.user.login);
  }

  if (!inspectReviews) {
    return {
      authoredPullRequests: authored.size,
      reviewedPullRequests: null,
      approvedPullRequests: null,
      reviewSubmissions: null,
      authoredKeys: authored,
      reviewedKeys: reviewed,
      approvedKeys: approved,
      identities: [...matchedIdentities],
      listingComplete: !capped,
      reviewInspectionComplete: false,
      reviewFailures: [],
      capped,
    };
  }

  const reviewResults = await mapLimit(
    pullRequests,
    config.pullRequestReviewConcurrency,
    async (pullRequest) => {
      const reviews = await fetchPullRequestReviews(
        repository,
        pullRequest.number,
      );
      return { pullRequest, reviews };
    },
  );

  const reviewFailures = [];
  for (const result of reviewResults) {
    if (result.status === "rejected") {
      reviewFailures.push(result.reason.message);
      continue;
    }
    const { pullRequest, reviews } = result.value;
    const key = `${repository.full_name.toLowerCase()}#${pullRequest.number}`;

    for (const review of reviews) {
      const login = String(review?.user?.login ?? "").toLowerCase();
      if (!identitySet.has(login)) continue;
      reviewed.add(key);
      reviewSubmissions += 1;
      matchedIdentities.add(review.user.login);
      if (String(review.state ?? "").toUpperCase() === "APPROVED") {
        approved.add(key);
      }
    }
  }

  return {
    authoredPullRequests: authored.size,
    reviewedPullRequests: reviewed.size,
    approvedPullRequests: approved.size,
    reviewSubmissions,
    authoredKeys: authored,
    reviewedKeys: reviewed,
    approvedKeys: approved,
    identities: [...matchedIdentities],
    listingComplete: !capped,
    reviewInspectionComplete:
      !capped && reviewFailures.length === 0,
    reviewFailures,
    capped,
  };
}

async function buildPublicContributionPortfolio(
  repositoryDetails,
  personalCodeContributions,
) {
  const publicContributionDetails = repositoryDetails.filter(
    (detail) => detail.publicContribution,
  );

  const results = await mapLimit(
    publicContributionDetails,
    // GitHub Search has a separate, restrictive rate-limit bucket.
    1,
    async (detail) => {
      const repository = detail.repository;
      const identities = contributionIdentitiesForScope(
        detail.scope,
        repository.full_name,
      );
      const personal = personalCodeContributions.repositories.get(
        repository.full_name.toLowerCase(),
      ) ?? {
        additions: 0,
        deletions: 0,
        changedLines: 0,
        commits: 0,
        files: 0,
      };

      const [lifecycle, contributorActivity, authoredSearch, reviewedSearch] =
        await Promise.all([
        fetchPublicRepositoryLifecycle(repository),
        fetchAttributedContributorCommits(repository, identities),
        searchPublicRepositoryEvidence(
          repository,
          identities,
          (identity) =>
            `repo:${repository.full_name} author:${identity} is:pr`,
          `Public contribution authored-PR search (${repository.full_name})`,
        ),
        searchPublicRepositoryEvidence(
          repository,
          identities,
          (identity) =>
            `repo:${repository.full_name} reviewed-by:${identity} is:pr`,
          `Public contribution reviewed-PR search (${repository.full_name})`,
        ),
      ]);

      const discoveryEvidence = new Set(
        repository.contribution_evidence ?? [],
      );

      // Emit safe structured search diagnostics before any direct fallback can
      // fail. Authorization headers and credential values are never included.
      for (const [kind, searchResult] of [
        ["authored PR", authoredSearch],
        ["reviewed PR", reviewedSearch],
      ]) {
        if (searchResult.status !== "unavailable") continue;
        const summary = searchResult.unavailable
          .map((item) => {
            const attempts = (item.failures ?? [])
              .map((failure) =>
                `${failure.credential}: ${failure.message}`,
              )
              .join(" | ");
            return `${item.identity}: ${item.reason}` +
              `${attempts ? ` (${attempts})` : ""}`;
          })
          .join("; ");
        console.warn(
          `Public ${kind} search unavailable for ${repository.full_name}; bounded direct REST verification will be used. ${summary}`,
        );
      }

      // A failed search remains unknown. A bounded direct scan independently
      // verifies it instead of silently converting the failure to zero.
      const shouldInspectHistoricalReviews =
        reviewedSearch.status === "unavailable" ||
        discoveryEvidence.has("pull-request-review") ||
        safeInteger(reviewedSearch.count) > 0;
      const relationshipNeedsExplanation =
        discoveryEvidence.has("repository-relationship") &&
        contributorActivity.commits === 0 &&
        authoredSearch.status === "success" &&
        authoredSearch.count === 0;
      const shouldInspectPullRequests =
        authoredSearch.status === "unavailable" ||
        shouldInspectHistoricalReviews ||
        relationshipNeedsExplanation;

      const directPullRequestActivity = shouldInspectPullRequests
        ? await fetchDirectPullRequestActivity(repository, identities, {
            inspectReviews: shouldInspectHistoricalReviews,
          })
        : null;

      if (
        shouldInspectPullRequests &&
        !directPullRequestActivity?.listingComplete
      ) {
        throw new Error(
          `Direct pull-request verification for ${repository.full_name} reached MAX_PULL_REQUESTS_PER_PUBLIC_REPOSITORY. Raise the cap rather than publishing partial PR analytics.`,
        );
      }
      if (
        shouldInspectHistoricalReviews &&
        !directPullRequestActivity?.reviewInspectionComplete
      ) {
        const failures = directPullRequestActivity?.reviewFailures ?? [];
        throw new Error(
          `Direct review verification for ${repository.full_name} was incomplete` +
          `${failures.length > 0 ? `: ${failures.join("; ")}` : "."}`,
        );
      }

      const authoredKeys = new Set([
        ...(authoredSearch.status === "success" ? authoredSearch.keys : []),
        ...(directPullRequestActivity?.authoredKeys ?? []),
      ]);
      const reviewedKeys = new Set([
        ...(reviewedSearch.status === "success" ? reviewedSearch.keys : []),
        ...(directPullRequestActivity?.reviewedKeys ?? []),
      ]);

      const composition = repositoryLanguageComposition(detail);
      const technologies = [...detectTechnologies(
        buildRepositoryProfile(detail),
      )].sort();
      const attributedCommits = Math.max(
        safeInteger(personal.commits),
        safeInteger(contributorActivity.commits),
      );
      const authoredPullRequests = authoredKeys.size;
      const reviewedPullRequests = reviewedKeys.size;

      // A public repository is included only when GitHub verifies actual
      // engineering activity from at least one configured identity. Discovery
      // relationships alone are not enough.
      const verified =
        attributedCommits > 0 ||
        authoredPullRequests > 0 ||
        reviewedPullRequests > 0;

      const attributedIdentities = [...new Set([
        ...(repository.contribution_identities ?? []),
        ...(personal.attributedIdentities ?? []),
        ...contributorActivity.identities,
        ...authoredSearch.identities,
        ...reviewedSearch.identities,
        ...(directPullRequestActivity?.identities ?? []),
      ])].sort();

      return {
        verified,
        fullName: repository.full_name,
        url: repository.html_url,
        languages: composition.languages,
        languageSource: detail.languageSource,
        sourceFiles: composition.sourceFiles,
        technologies,
        lifecycle,
        personal,
        attributedCommits,
        authoredPullRequests,
        reviewedPullRequests,
        approvedPullRequests:
          directPullRequestActivity?.approvedPullRequests ?? 0,
        reviewSubmissions:
          directPullRequestActivity?.reviewSubmissions ?? 0,
        reviewScanCapped: false,
        attributedIdentities,
        evidence: repository.contribution_evidence ?? [],
      };
    },
  );

  const projects = [];
  const failures = [];
  for (const [index, result] of results.entries()) {
    if (result.status === "fulfilled") {
      if (result.value.verified) projects.push(result.value);
      else console.warn(
        `Excluded unverified public contribution candidate: ${result.value.fullName}`,
      );
    } else {
      failures.push(
        `${publicContributionDetails[index].repository.full_name}: ${result.reason.message}`,
      );
    }
  }

  if (failures.length > 0) {
    throw new Error(
      `Public contribution portfolio analytics failed: ${failures.join("; ")}`,
    );
  }

  return projects.sort((first, second) =>
    second.attributedCommits - first.attributedCommits ||
    second.reviewedPullRequests - first.reviewedPullRequests ||
    second.sourceFiles - first.sourceFiles ||
    first.fullName.localeCompare(second.fullName),
  );
}

function buildRepositoryProfile(detail) {
  const lowerPaths = detail.paths.map((filePath) => filePath.toLowerCase());
  const pathSet = new Set(lowerPaths);
  const packageNames = new Set();
  const manifestTextParts = [];
  const manifestTextsByPath = new Map();

  for (const manifest of detail.manifests) {
    const lowerPath = manifest.path.toLowerCase();
    const content = manifest.content ?? "";
    const lowerContent = content.toLowerCase();

    manifestTextParts.push(lowerContent);
    manifestTextsByPath.set(lowerPath, lowerContent);

    if (lowerPath.endsWith("package.json")) {
      try {
        const parsed = JSON.parse(content);
        const dependencyGroups = [
          parsed.dependencies,
          parsed.devDependencies,
          parsed.peerDependencies,
          parsed.optionalDependencies,
        ];

        for (const group of dependencyGroups) {
          for (const dependencyName of Object.keys(group ?? {})) {
            packageNames.add(dependencyName.toLowerCase());
          }
        }
      } catch {
        // Invalid package manifests are ignored rather than failing the scan.
      }
    }
  }

  return {
    detail,
    lowerPaths,
    pathSet,
    packageNames,
    manifestText: manifestTextParts.join("\n"),
    manifestTextsByPath,
  };
}

function detectTechnologies(profile) {
  const found = new Set();
  const {
    lowerPaths,
    pathSet,
    packageNames,
    manifestText,
    manifestTextsByPath,
  } = profile;
  const topics = new Set(
    (profile.detail.repository.topics ?? []).map((topic) =>
      String(topic).toLowerCase(),
    ),
  );

  const hasPath = (value) => pathSet.has(value.toLowerCase());
  const pathEndsWith = (value) =>
    lowerPaths.some((filePath) => filePath.endsWith(value.toLowerCase()));
  const pathContains = (value) =>
    lowerPaths.some((filePath) => filePath.includes(value.toLowerCase()));
  const hasPackage = (value) => packageNames.has(value.toLowerCase());
  const hasPackagePrefix = (value) =>
    [...packageNames].some((packageName) =>
      packageName.startsWith(value.toLowerCase()),
    );
  const contentMatches = (expression) => expression.test(manifestText);

  const hasAndroidManifest = pathEndsWith("androidmanifest.xml");
  const hasAndroidGradlePlugin = contentMatches(
    /com\.android\.(application|library|dynamic-feature|test)/,
  );

  if (
    hasAndroidManifest ||
    hasAndroidGradlePlugin ||
    topics.has("android")
  ) {
    found.add("Android");
  }

  if (
    contentMatches(/androidx\.compose|org\.jetbrains\.compose/) ||
    contentMatches(/buildfeatures[\s\S]{0,160}compose\s*(?:=|\.set\()\s*true/) ||
    contentMatches(/kotlin[\s.-]?compose/)
  ) {
    found.add("Jetpack Compose");
  }

  const pubspecContent = [...manifestTextsByPath.entries()]
    .filter(([filePath]) =>
      filePath.endsWith("pubspec.yaml") ||
      filePath.endsWith("pubspec.yml"),
    )
    .map(([, content]) => content)
    .join("\n");

  if (
    /sdk\s*:\s*flutter/.test(pubspecContent) ||
    /^\s*flutter\s*:/m.test(pubspecContent) ||
    topics.has("flutter") ||
    (pathEndsWith("pubspec.yaml") &&
      lowerPaths.some((filePath) => filePath.endsWith(".dart")))
  ) {
    found.add("Flutter");
  }

  if (
    topics.has("ios") ||
    pathContains(".xcodeproj/project.pbxproj") ||
    pathContains(".xcworkspace/") ||
    pathEndsWith("podfile") ||
    lowerPaths.some((filePath) =>
      filePath.endsWith(".swift") ||
      filePath.endsWith(".m") ||
      filePath.endsWith(".mm"),
    )
  ) {
    found.add("iOS");
  }

  if (
    topics.has("here-sdk") ||
    pathContains("here_sdk") ||
    contentMatches(/\bhere[-_. ]sdk\b/)
  ) {
    found.add("HERE SDK");
  }

  if (lowerPaths.some((filePath) => filePath.endsWith("package.json"))) {
    found.add("Node.js");
  }

  if (hasPackage("react")) found.add("React");
  if (hasPackage("react-native")) found.add("React Native");
  if (hasPackage("express")) found.add("Express");
  if (hasPackage("vite") || pathContains("vite.config.")) found.add("Vite");
  if (hasPackage("next") || pathContains("next.config.")) found.add("Next.js");
  if (hasPackagePrefix("@strapi/")) found.add("Strapi");
  if (
    hasPackage("tailwindcss") ||
    pathContains("tailwind.config.")
  ) {
    found.add("TailwindCSS");
  }
  if (
    hasPackage("@supabase/supabase-js") ||
    pathContains("supabase/config.toml") ||
    pathContains("supabase/migrations/")
  ) {
    found.add("Supabase");
  }
  if (
    hasPackage("firebase") ||
    hasPackagePrefix("@firebase/") ||
    hasPath("firebase.json") ||
    hasPath(".firebaserc") ||
    contentMatches(/com\.google\.firebase/)
  ) {
    found.add("Firebase");
  }
  if (
    hasPackage("@tanstack/react-query") ||
    hasPackage("react-query")
  ) {
    found.add("React Query");
  }
  if (
    hasPackage("@reduxjs/toolkit") ||
    hasPackage("redux") ||
    hasPackage("react-redux")
  ) {
    found.add("Redux");
  }

  if (
    hasPackage("pg") ||
    hasPackage("postgres") ||
    contentMatches(
      /\bpostgres(?:ql)?\b|org\.postgresql|psycopg|provider\s*=\s*["']postgresql["']/,
    )
  ) {
    found.add("PostgreSQL");
  }
  if (
    hasPackage("mongodb") ||
    hasPackage("mongoose") ||
    contentMatches(/\borg\.mongodb\b|mongodb(?:\+srv)?:\/\//)
  ) {
    found.add("MongoDB");
  }

  if (
    pathEndsWith("dockerfile") ||
    pathEndsWith("docker-compose.yml") ||
    pathEndsWith("docker-compose.yaml") ||
    pathEndsWith("compose.yml") ||
    pathEndsWith("compose.yaml")
  ) {
    found.add("Docker");
  }

  if (
    lowerPaths.some(
      (filePath) =>
        filePath.startsWith(".github/workflows/") &&
        (filePath.endsWith(".yml") || filePath.endsWith(".yaml")),
    )
  ) {
    found.add("GitHub Actions");
  }

  if (
    hasPackage("aws-sdk") ||
    hasPackagePrefix("@aws-sdk/") ||
    hasPackagePrefix("aws-cdk") ||
    contentMatches(/\bboto3\b|provider\s*:\s*aws|amazonaws\.com/)
  ) {
    found.add("AWS");
  }
  if (
    hasPackagePrefix("@google-cloud/") ||
    contentMatches(/\bgoogle[-_. ]cloud\b|google\.cloud\./) ||
    hasPath("app.yaml")
  ) {
    found.add("Google Cloud");
  }
  if (
    contentMatches(/\bdigitalocean\b/) ||
    pathContains("digitalocean")
  ) {
    found.add("DigitalOcean");
  }

  if (
    hasPackage("graphql") ||
    hasPackagePrefix("@apollo/") ||
    lowerPaths.some(
      (filePath) =>
        filePath.endsWith(".graphql") || filePath.endsWith(".gql"),
    )
  ) {
    found.add("GraphQL");
  }
  if (
    hasPackage("@grpc/grpc-js") ||
    hasPackage("grpc") ||
    contentMatches(/\bio\.grpc\b|grpcio|\bgrpc\b/) ||
    lowerPaths.some((filePath) => filePath.endsWith(".proto"))
  ) {
    found.add("gRPC");
  }

  if (
    hasPackage("openai") ||
    contentMatches(/\bopenai\b/)
  ) {
    found.add("OpenAI");
  }
  if (
    hasPackage("langchain") ||
    hasPackagePrefix("@langchain/") ||
    contentMatches(/\blangchain\b|\blanggraph\b/)
  ) {
    found.add("LangChain");
  }
  if (contentMatches(/\btensorflow\b/)) found.add("TensorFlow");
  if (contentMatches(/\btorch\b|\bpytorch\b/)) found.add("PyTorch");

  if (contentMatches(/\borg\.springframework\.boot\b/)) {
    found.add("Spring Boot");
  }
  if (contentMatches(/\bio\.ktor\b/)) found.add("Ktor");
  if (contentMatches(/\bandroidx\.room\b/)) found.add("Room");
  if (contentMatches(/\bdagger\.hilt\b|\bhilt[-_.]/)) found.add("Hilt");
  if (contentMatches(/\bio\.insert-koin\b|\bkoin[-_.]/)) found.add("Koin");
  if (contentMatches(/\bcom\.squareup\.retrofit2\b|\bretrofit2\b/)) {
    found.add("Retrofit");
  }

  return found;
}

function buildTechnologyDetection(repositoryDetails) {
  const counts = new Map();
  const byRepository = new Map();

  for (const detail of repositoryDetails) {
    const profile = buildRepositoryProfile(detail);
    const technologies = detectTechnologies(profile);
    const key = detail.repository.full_name.toLowerCase();
    byRepository.set(key, technologies);

    for (const technology of technologies) {
      counts.set(technology, (counts.get(technology) ?? 0) + 1);
    }
  }

  return { counts, byRepository };
}

function buildTechnologyImpact(
  technologyDetection,
  personalCodeContributions,
) {
  const impact = new Map();

  for (const [repositoryName, technologies] of
    technologyDetection.byRepository) {
    const repositoryContribution =
      personalCodeContributions.repositories.get(repositoryName) ?? {
        commits: 0,
        changedLines: 0,
        files: 0,
      };

    for (const technology of technologies) {
      const current = impact.get(technology) ?? {
        name: technology,
        repositories: 0,
        activeRepositories: 0,
        commits: 0,
        changedLines: 0,
        files: 0,
      };

      current.repositories += 1;
      if (repositoryContribution.commits > 0) {
        current.activeRepositories += 1;
      }
      current.commits += repositoryContribution.commits;
      current.changedLines += repositoryContribution.changedLines;
      current.files += repositoryContribution.files;
      impact.set(technology, current);
    }
  }

  return [...impact.values()]
    .map((item) => ({
      ...item,
      color: TECHNOLOGY_COLORS[item.name] ?? fallbackColor(item.name),
      score:
        Math.log1p(item.changedLines) * 0.50 +
        Math.log1p(item.commits) * 0.25 +
        Math.log1p(item.files) * 0.10 +
        Math.log1p(item.repositories) * 0.75,
    }))
    .sort(
      (first, second) =>
        second.score - first.score ||
        second.repositories - first.repositories ||
        first.name.localeCompare(second.name),
    );
}

function classifyDomains(technologyCounts, languages) {
  const scores = new Map([
    ["Mobile Engineering", 0],
    ["Full-Stack Development", 0],
    ["Backend & APIs", 0],
    ["AI/ML & RAG", 0],
    ["Cloud & DevOps", 0],
    ["Developer Tooling", 0],
    ["Data Engineering", 0],
  ]);

  const add = (domain, value) => {
    scores.set(domain, safeInteger(scores.get(domain)) + value);
  };

  for (const [technology, repositoryCount] of technologyCounts) {
    const weight = Math.max(1, Math.log2(repositoryCount + 1));

    if (
      ["Android", "Jetpack Compose", "Flutter", "React Native"].includes(
        technology,
      )
    ) {
      add("Mobile Engineering", 3 * weight);
    }

    if (
      [
        "React",
        "Vite",
        "Next.js",
        "Strapi",
        "TailwindCSS",
        "Supabase",
      ].includes(technology)
    ) {
      add("Full-Stack Development", 2 * weight);
    }

    if (
      [
        "Node.js",
        "Express",
        "Ktor",
        "Spring Boot",
        "GraphQL",
        "gRPC",
      ].includes(technology)
    ) {
      add("Backend & APIs", 2 * weight);
    }

    if (
      ["TensorFlow", "PyTorch", "OpenAI", "LangChain"].includes(technology)
    ) {
      add("AI/ML & RAG", 3 * weight);
    }

    if (
      [
        "Docker",
        "GitHub Actions",
        "AWS",
        "Google Cloud",
        "DigitalOcean",
      ].includes(technology)
    ) {
      add("Cloud & DevOps", 2 * weight);
    }

    if (
      ["GitHub Actions", "GraphQL", "gRPC"].includes(technology)
    ) {
      add("Developer Tooling", weight);
    }

    if (
      ["PostgreSQL", "MongoDB", "Supabase", "Firebase"].includes(
        technology,
      )
    ) {
      add("Data Engineering", weight);
    }
  }

  for (const language of languages.slice(0, 15)) {
    const weight = Math.max(0.5, language.percentage / 8);

    if (
      ["Kotlin", "Dart", "Swift", "Objective-C", "Java"].includes(
        language.language,
      )
    ) {
      add("Mobile Engineering", weight);
    }

    if (
      [
        "JavaScript",
        "TypeScript",
        "HTML",
        "CSS",
        "SCSS",
        "Vue",
        "Svelte",
      ].includes(language.language)
    ) {
      add("Full-Stack Development", weight);
    }

    if (
      ["Python", "Jupyter Notebook", "R", "Julia"].includes(
        language.language,
      )
    ) {
      add("AI/ML & RAG", weight);
    }

    if (
      ["Shell", "PowerShell", "Dockerfile", "HCL", "Makefile"].includes(
        language.language,
      )
    ) {
      add("Cloud & DevOps", weight);
    }
  }

  return [...scores.entries()]
    .map(([name, score]) => ({ name, score }))
    .filter((item) => item.score > 0)
    .sort((first, second) => second.score - first.score);
}

function hasReadme(paths) {
  return paths.some((filePath) => {
    const lowerPath = filePath.toLowerCase();
    const baseName = lowerPath.split("/").at(-1);
    return /^readme(?:\.[a-z0-9]+)?$/.test(baseName);
  });
}

function hasTests(paths) {
  return paths.some((filePath) => {
    const lowerPath = filePath.toLowerCase();
    return (
      lowerPath.includes("/test/") ||
      lowerPath.includes("/tests/") ||
      lowerPath.includes("/androidtest/") ||
      lowerPath.startsWith("test/") ||
      lowerPath.startsWith("tests/") ||
      lowerPath.endsWith(".test.js") ||
      lowerPath.endsWith(".test.jsx") ||
      lowerPath.endsWith(".test.ts") ||
      lowerPath.endsWith(".test.tsx") ||
      lowerPath.endsWith(".spec.js") ||
      lowerPath.endsWith(".spec.jsx") ||
      lowerPath.endsWith(".spec.ts") ||
      lowerPath.endsWith(".spec.tsx") ||
      lowerPath.endsWith("_test.dart") ||
      lowerPath.endsWith("test.kt") ||
      lowerPath.endsWith("test.java") ||
      lowerPath.endsWith("_test.py")
    );
  });
}

function hasCi(paths) {
  return paths.some((filePath) => {
    const lowerPath = filePath.toLowerCase();
    return (
      lowerPath.startsWith(".github/workflows/") &&
      (lowerPath.endsWith(".yml") || lowerPath.endsWith(".yaml"))
    );
  });
}

function metricGrid(metrics, startY = 78, columns = 2, width = 560) {
  const cellWidth = (width - 40) / columns;

  return metrics
    .map((metric, index) => {
      const column = index % columns;
      const row = Math.floor(index / columns);
      const x = 20 + column * cellWidth;
      const y = startY + row * 62;

      return `${icon(metric.icon, x, y - 13, metric.color, 16)}
      <text x="${x + 26}" y="${y}" class="value">${escapeXml(metric.value)}</text>
      <text x="${x + 26}" y="${y + 18}" class="label">${escapeXml(metric.label)}</text>`;
    })
    .join("");
}

function lockedCardText(
  x,
  y,
  value,
  {
    size = 10,
    fill = THEME.text,
    weight = 500,
    anchor = "start",
    letterSpacing = null,
  } = {},
) {
  const spacing = letterSpacing === null
    ? ""
    : ` letter-spacing="${letterSpacing}"`;

  return `<text x="${x}" y="${y}" fill="${fill}" font-size="${size}" font-weight="${weight}" text-anchor="${anchor}"${spacing}>${escapeXml(value)}</text>`;
}

function lockedCardLabel(
  x,
  y,
  primary,
  qualifier = "",
  {
    anchor = "start",
    size = 9.2,
    letterSpacing = null,
  } = {},
) {
  const spacing = letterSpacing === null
    ? ""
    : ` letter-spacing="${letterSpacing}"`;

  return `<text x="${x}" y="${y}" fill="#D0D7DE" font-size="${size}" font-weight="600" text-anchor="${anchor}"${spacing}><tspan>${escapeXml(primary)}</tspan><tspan fill="${THEME.muted}" font-weight="500">${escapeXml(qualifier)}</tspan></text>`;
}

function lockedMetricIcon(name, x, y, color) {
  // The approved design uses visible semantic icons with no badge or circle.
  return icon(name, x + 2, y + 2, color, 20.8);
}

function lockedCardLine(x1, y1, x2, y2, color, width = 1, opacity = null) {
  const opacityAttribute = opacity === null
    ? ""
    : ` stroke-opacity="${opacity}"`;
  return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${color}" stroke-width="${width}"${opacityAttribute}/>`;
}

function lockedCardDot(x, y, color, radius = 3) {
  return `<circle cx="${x}" cy="${y}" r="${radius}" fill="${color}"/>`;
}

function boundedPercentage(value) {
  return Math.min(100, Math.max(0, Number(value) || 0));
}

function lockedCardShell({ id, title, description, definitions, body }) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="760" height="360" viewBox="0 0 760 360" role="img" aria-labelledby="${id}-title ${id}-description">
  <title id="${id}-title">${escapeXml(title)}</title>
  <desc id="${id}-description">${escapeXml(description)}</desc>
  <style>text{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}</style>
  <defs>${definitions}</defs>
  <rect x=".5" y=".5" width="759" height="359" rx="2" fill="${THEME.background}" stroke="${THEME.border}"/>
  ${body}
</svg>`;
}

/**
 * Renders the approved 760×360 Contribution Engine overview.
 *
 * The visual structure is intentionally locked. Only validated values and
 * percentage-bar lengths change between workflow runs.
 */
function renderOverview(data) {
  const ciCoverage = boundedPercentage(data.ciCoverage);
  const testCoverage = boundedPercentage(data.testCoverage);
  const ciBarWidth = (ciCoverage / 100) * 170;
  const testBarWidth = (testCoverage / 100) * 176;

  const definitions = `
    <linearGradient id="overview-flow" x1="0" x2="1"><stop stop-color="${THEME.blue}"/><stop offset=".5" stop-color="${THEME.green}"/><stop offset="1" stop-color="${THEME.purple}"/></linearGradient>
    <radialGradient id="overview-core"><stop stop-color="#19314A"/><stop offset=".62" stop-color="#111923"/><stop offset="1" stop-color="${THEME.background}"/></radialGradient>
    <linearGradient id="overview-quality" x1="0" x2="1"><stop stop-color="${THEME.cyan}"/><stop offset="1" stop-color="${THEME.green}"/></linearGradient>
    <filter id="overview-glow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="7"/></filter>`;

  let body = "";
  body += icon("star", 22, 20, THEME.yellow, 18);
  body += lockedCardText(54, 36, "GitHub Overview", {
    size: 19,
    weight: 700,
  });
  body += lockedCardText(
    54,
    55,
    "From repository scale to sustained delivery and engineering quality",
    { size: 11, fill: THEME.muted, weight: 400 },
  );
  body += lockedCardDot(570, 31, THEME.green, 3);
  body += lockedCardText(732, 34, "PRIVATE + PUBLIC · DAILY", {
    size: 7.5,
    fill: THEME.muted,
    weight: 700,
    anchor: "end",
    letterSpacing: ".5",
  });
  body += lockedCardLine(22, 68, 738, 68, THEME.border);

  body += lockedCardText(28, 90, "REPOSITORY BASE", {
    size: 8.1,
    fill: THEME.blue,
    weight: 750,
    letterSpacing: "1.05",
  });

  const repositoryMetrics = [
    [compactNumber(data.repositories), "Verified repositories", "", "repo"],
    [compactNumber(data.activeRepositories), "Active repositories", " · 90d", "activity"],
    [data.contributionTenure, "Contribution tenure", "", "calendar"],
  ];

  for (const [index, metric] of repositoryMetrics.entries()) {
    const [value, label, qualifier, iconName] = metric;
    const y = 120 + index * 52;
    body += lockedMetricIcon(iconName, 28, y - 21, THEME.blue);
    body += lockedCardText(64, y, value, { size: 20, weight: 780 });
    body += lockedCardLabel(64, y + 17, label, qualifier);
    if (index < 2) {
      body += lockedCardLine(28, y + 29, 205, y + 29, "#202730");
    }
  }

  body += `<path d="M211 177 C254 177 265 160 307 160" fill="none" stroke="${THEME.blue}" stroke-opacity=".4" stroke-width="2"/>`;
  body += `<path d="M453 160 C495 160 506 177 548 177" fill="none" stroke="${THEME.purple}" stroke-opacity=".4" stroke-width="2"/>`;
  body += `<circle cx="380" cy="169" r="68" fill="${THEME.blue}" opacity=".08" filter="url(#overview-glow)"/>`;
  body += `<circle cx="380" cy="169" r="62" fill="url(#overview-core)" stroke="url(#overview-flow)" stroke-width="2"/>`;
  body += `<circle cx="380" cy="169" r="52" fill="none" stroke="#303D4D" stroke-dasharray="2 7"/>`;
  body += lockedMetricIcon("activity", 316, 132, THEME.green);
  body += lockedCardText(350, 162, compactNumber(data.recentContributions), {
    size: 34,
    weight: 820,
  });
  body += lockedCardText(380, 183, "CONTRIBUTIONS", {
    size: 8.6,
    fill: THEME.green,
    weight: 780,
    anchor: "middle",
    letterSpacing: ".75",
  });
  body += lockedCardText(380, 200, "ROLLING 12 MONTHS", {
    size: 7.7,
    fill: "#B1BAC4",
    weight: 650,
    anchor: "middle",
    letterSpacing: ".45",
  });
  body += lockedCardDot(307, 160, THEME.blue, 4);
  body += lockedCardDot(453, 160, THEME.purple, 4);

  body += lockedMetricIcon("commit", 282, 70, THEME.cyan);
  body += lockedCardText(318, 91, compactNumber(data.allTimeCommitContributions), {
    size: 17,
    fill: THEME.cyan,
    weight: 780,
  });
  body += lockedCardLabel(
    380,
    107,
    "COMMIT CONTRIBUTIONS",
    " · ALL TIME",
    { anchor: "middle", size: 7.8, letterSpacing: ".25" },
  );

  body += lockedMetricIcon("pull", 329, 233, THEME.green);
  body += lockedCardText(365, 254, compactNumber(data.mergedPullRequests), {
    size: 17,
    fill: THEME.green,
    weight: 780,
  });
  body += lockedCardLabel(380, 271, "MERGED PRS", " · ALL TIME", {
    anchor: "middle",
    size: 7.9,
    letterSpacing: ".35",
  });
  body += lockedCardLine(380, 232, 380, 238, THEME.green, 1, ".45");

  body += lockedCardText(552, 90, "COLLABORATION REACH", {
    size: 8.1,
    fill: THEME.purple,
    weight: 750,
    letterSpacing: ".75",
  });

  const collaborationMetrics = [
    [compactNumber(data.publicContributedRepositories), "Public contribution repos", "", "branch"],
    [compactNumber(data.publicOrganizationsContributed), "Public organizations", "", "people"],
    [compactNumber(data.reviewContributions), "PR reviews", " · all time", "people"],
  ];

  for (const [index, metric] of collaborationMetrics.entries()) {
    const [value, label, qualifier, iconName] = metric;
    const y = 120 + index * 52;
    body += lockedMetricIcon(iconName, 552, y - 21, THEME.purple);
    body += lockedCardText(588, y, value, { size: 20, weight: 780 });
    body += lockedCardLabel(588, y + 17, label, qualifier);
    if (index < 2) {
      body += lockedCardLine(552, y + 29, 732, y + 29, "#202730");
    }
  }

  body += lockedMetricIcon("star", 552, 246, THEME.yellow);
  body += lockedCardText(588, 267, compactNumber(data.ownedRepositoryStars), {
    size: 16,
    fill: THEME.yellow,
    weight: 780,
  });
  body += lockedCardLabel(616, 267, "Owned repository stars", "", {
    size: 8.8,
  });

  body += lockedCardLine(22, 283, 738, 283, THEME.border);
  body += lockedCardText(28, 301, "ENGINEERING QUALITY", {
    size: 7.8,
    fill: THEME.cyan,
    weight: 750,
    letterSpacing: ".95",
  });

  body += lockedMetricIcon("workflow", 28, 303, THEME.cyan);
  body += lockedCardText(64, 324, formatPercentage(ciCoverage), {
    size: 17,
    fill: THEME.cyan,
    weight: 780,
  });
  body += lockedCardLabel(64, 341, "CI/CD coverage", "", { size: 9 });
  body += `<rect x="164" y="315" width="170" height="7" rx="3" fill="${THEME.track}"/>`;
  body += `<rect x="164" y="315" width="${ciBarWidth.toFixed(2)}" height="7" rx="3" fill="${THEME.cyan}"/>`;
  body += lockedCardText(334, 341, `${ciCoverage.toFixed(1)} / 100`, {
    size: 7.4,
    fill: THEME.muted,
    weight: 650,
    anchor: "end",
  });

  body += lockedMetricIcon("test", 398, 303, THEME.green);
  body += lockedCardText(434, 324, formatPercentage(testCoverage), {
    size: 17,
    fill: THEME.green,
    weight: 780,
  });
  body += lockedCardLabel(434, 341, "Test coverage", "", { size: 9 });
  body += `<rect x="534" y="315" width="176" height="7" rx="3" fill="${THEME.track}"/>`;
  body += `<rect x="534" y="315" width="${testBarWidth.toFixed(2)}" height="7" rx="3" fill="url(#overview-quality)"/>`;
  body += lockedCardText(710, 341, `${testCoverage.toFixed(1)} / 100`, {
    size: 7.4,
    fill: THEME.muted,
    weight: 650,
    anchor: "end",
  });

  return lockedCardShell({
    id: "github-overview",
    title: "GitHub Overview",
    description:
      "Repository scale, rolling contribution delivery, collaboration reach, and engineering quality metrics.",
    definitions,
    body,
  });
}

/**
 * Renders the approved 760×360 Fire Orbit streak card.
 *
 * The circular fire centerpiece is the only circular badge; all supporting
 * semantic icons remain unframed for clarity and quick scanning.
 */
function renderStreak(streak) {
  const definitions = `
    <linearGradient id="streak-ring" x1="0" y1="0" x2="1" y2="1"><stop stop-color="${THEME.orange}"/><stop offset=".55" stop-color="#FF6B35"/><stop offset="1" stop-color="${THEME.yellow}"/></linearGradient>
    <radialGradient id="streak-core"><stop stop-color="#321B13"/><stop offset=".62" stop-color="#171512"/><stop offset="1" stop-color="${THEME.background}"/></radialGradient>
    <filter id="streak-glow" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="9"/></filter>`;

  let body = "";
  body += icon("flame", 22, 20, THEME.orange, 18);
  body += lockedCardText(54, 36, "Contribution Streak", {
    size: 19,
    weight: 700,
  });
  body += lockedCardText(
    54,
    55,
    "Consistency, momentum and all-time contribution history",
    { size: 11, fill: THEME.muted, weight: 400 },
  );
  body += lockedCardDot(570, 31, THEME.green, 3);
  body += lockedCardText(732, 34, "PRIVATE + PUBLIC · DAILY", {
    size: 7.5,
    fill: THEME.muted,
    weight: 700,
    anchor: "end",
    letterSpacing: ".5",
  });
  body += lockedCardLine(22, 68, 738, 68, THEME.border);

  body += lockedCardText(28, 91, "ALL-TIME CONSISTENCY", {
    size: 8.1,
    fill: THEME.blue,
    weight: 750,
    letterSpacing: ".95",
  });

  const allTimeMetrics = [
    [compactNumber(streak.activeDays), "Active days", " · all time", "activity", THEME.green, 18],
    [plural(streak.longest, "day"), "Longest streak", " · all time", "star", THEME.yellow, 18],
    [streak.mostActiveWeekday, "Most active weekday", "", "calendar", THEME.blue, 15],
  ];

  for (const [index, metric] of allTimeMetrics.entries()) {
    const [value, label, qualifier, iconName, color, size] = metric;
    const y = 121 + index * 48;
    body += lockedMetricIcon(iconName, 28, y - 21, color);
    body += lockedCardText(64, y, value, { size, fill: color, weight: 780 });
    body += lockedCardLabel(64, y + 17, label, qualifier, { size: 8.8 });
    if (index < 2) {
      body += lockedCardLine(28, y + 27, 212, y + 27, "#202730");
    }
  }

  body += `<circle cx="380" cy="163" r="72" fill="${THEME.orange}" opacity=".1" filter="url(#streak-glow)"/>`;
  body += `<circle cx="380" cy="163" r="66" fill="url(#streak-core)" stroke="url(#streak-ring)" stroke-width="3"/>`;
  body += `<circle cx="380" cy="163" r="56" fill="none" stroke="#4B2B1F" stroke-dasharray="2 7"/>`;
  body += icon("flame", 364, 101, THEME.orange, 32);
  body += lockedCardText(380, 180, compactNumber(streak.current), {
    size: 39,
    weight: 820,
    anchor: "middle",
  });
  body += lockedCardText(380, 200, "DAY STREAK", {
    size: 8.8,
    fill: THEME.orange,
    weight: 780,
    anchor: "middle",
    letterSpacing: "1",
  });
  body += lockedCardText(380, 217, "CURRENT", {
    size: 7.4,
    fill: "#B1BAC4",
    weight: 650,
    anchor: "middle",
    letterSpacing: ".7",
  });
  body += lockedCardLine(380, 230, 380, 242, THEME.orange, 1, ".5");

  body += lockedMetricIcon("activity", 300, 238, THEME.blue);
  body += lockedCardText(336, 259, streak.averagePerActiveDay.toFixed(1), {
    size: 14,
    fill: THEME.blue,
    weight: 780,
  });
  body += lockedCardLabel(336, 274, "Average", " / active day", {
    size: 7.6,
  });
  body += lockedMetricIcon("calendar", 408, 238, THEME.orange);
  body += lockedCardText(444, 259, formatPercentage(streak.activeDayRate), {
    size: 14,
    fill: THEME.orange,
    weight: 780,
  });
  body += lockedCardLabel(444, 274, "Active-day rate", " · 12m", {
    size: 7.6,
  });

  body += lockedCardText(548, 91, "ROLLING 12-MONTH PULSE", {
    size: 8.1,
    fill: THEME.purple,
    weight: 750,
    letterSpacing: ".75",
  });

  const rollingMetrics = [
    [compactNumber(streak.recentContributions), "Contributions", " · 12 months", "commit", THEME.blue, 18],
    [compactNumber(streak.recentActiveDays), "Active days", " · 12 months", "activity", THEME.green, 18],
    [plural(streak.recentActiveWeeks, "week"), "Active weeks", " · latest 53", "calendar", THEME.purple, 15],
  ];

  for (const [index, metric] of rollingMetrics.entries()) {
    const [value, label, qualifier, iconName, color, size] = metric;
    const y = 121 + index * 48;
    body += lockedMetricIcon(iconName, 548, y - 21, color);
    body += lockedCardText(584, y, value, { size, fill: color, weight: 780 });
    body += lockedCardLabel(584, y + 17, label, qualifier, { size: 8.8 });
    if (index < 2) {
      body += lockedCardLine(548, y + 27, 732, y + 27, "#202730");
    }
  }

  const peakValue = plural(streak.peakContributionCount, "contribution");
  const peakDate = streak.peakContributionDate
    ? formatDate(streak.peakContributionDate)
    : "—";

  body += lockedCardLine(22, 289, 738, 289, THEME.border);
  body += lockedCardText(28, 307, "ACTIVITY TIMELINE", {
    size: 7.8,
    fill: THEME.muted,
    weight: 750,
    letterSpacing: ".9",
  });
  body += lockedCardLine(43, 323, 717, 323, "#252C35", 2);
  body += lockedCardDot(43, 323, THEME.blue, 4);
  body += lockedCardDot(380, 323, THEME.yellow, 5);
  body += lockedCardDot(717, 323, THEME.green, 4);
  body += lockedCardText(43, 342, formatDate(streak.first), {
    size: 9.2,
    fill: "#D0D7DE",
    weight: 650,
  });
  body += lockedCardText(43, 354, "First recorded", {
    size: 7.1,
    fill: THEME.muted,
  });
  body += lockedCardText(380, 342, peakValue, {
    size: 9.2,
    fill: THEME.yellow,
    weight: 700,
    anchor: "middle",
  });
  body += lockedCardText(380, 354, `Peak · ${peakDate}`, {
    size: 7.1,
    fill: THEME.muted,
    anchor: "middle",
  });
  body += lockedCardText(717, 342, formatDate(streak.latest), {
    size: 9.2,
    fill: "#D0D7DE",
    weight: 650,
    anchor: "end",
  });
  body += lockedCardText(717, 354, "Latest recorded", {
    size: 7.1,
    fill: THEME.muted,
    anchor: "end",
  });

  return lockedCardShell({
    id: "contribution-streak",
    title: "Contribution Streak",
    description:
      "Current and longest streaks, all-time active days, rolling 12-month consistency, and contribution timeline.",
    definitions,
    body,
  });
}

/**
 * Rejects incomplete or internally inconsistent summary data before either
 * approved card can be published. This complements the upstream API and
 * repository-scan checks with cross-card invariants.
 */
function validateSummaryCardMetrics(overview, streak) {
  const errors = [];
  const integerMetrics = [
    ["overview.repositories", overview.repositories],
    ["overview.activeRepositories", overview.activeRepositories],
    ["overview.recentContributions", overview.recentContributions],
    ["overview.allTimeCommitContributions", overview.allTimeCommitContributions],
    ["overview.mergedPullRequests", overview.mergedPullRequests],
    ["overview.reviewContributions", overview.reviewContributions],
    ["overview.publicContributedRepositories", overview.publicContributedRepositories],
    ["overview.publicOrganizationsContributed", overview.publicOrganizationsContributed],
    ["overview.ownedRepositoryStars", overview.ownedRepositoryStars],
    ["streak.current", streak.current],
    ["streak.longest", streak.longest],
    ["streak.activeDays", streak.activeDays],
    ["streak.recentContributions", streak.recentContributions],
    ["streak.recentActiveDays", streak.recentActiveDays],
    ["streak.recentActiveWeeks", streak.recentActiveWeeks],
    ["streak.peakContributionCount", streak.peakContributionCount],
  ];

  for (const [name, value] of integerMetrics) {
    if (!Number.isSafeInteger(value) || value < 0) {
      errors.push(`${name} must be a non-negative safe integer; received ${value}.`);
    }
  }

  const percentageMetrics = [
    ["overview.ciCoverage", overview.ciCoverage],
    ["overview.testCoverage", overview.testCoverage],
    ["streak.activeDayRate", streak.activeDayRate],
  ];
  for (const [name, value] of percentageMetrics) {
    if (!Number.isFinite(value) || value < 0 || value > 100) {
      errors.push(`${name} must be between 0 and 100; received ${value}.`);
    }
  }

  if (
    typeof overview.contributionTenure !== "string" ||
    overview.contributionTenure.trim().length === 0
  ) {
    errors.push("overview.contributionTenure must be a non-empty string.");
  }

  if (overview.activeRepositories > overview.repositories) {
    errors.push("Active repositories cannot exceed verified repositories.");
  }
  if (
    overview.publicOrganizationsContributed >
    overview.publicContributedRepositories
  ) {
    errors.push("Public organizations cannot exceed verified public contribution repositories.");
  }
  if (overview.recentContributions !== streak.recentContributions) {
    errors.push(
      "The overview and streak rolling-12-month contribution totals must match.",
    );
  }
  if (streak.recentActiveDays > 365) {
    errors.push("Rolling active days cannot exceed the 365-day source window.");
  }
  if (streak.recentActiveWeeks > 53) {
    errors.push("Rolling active weeks cannot exceed the 53 intersecting calendar weeks.");
  }
  if (streak.recentActiveDays > streak.activeDays) {
    errors.push("Rolling active days cannot exceed all-time active days.");
  }
  if (streak.longest > streak.activeDays) {
    errors.push("The longest streak cannot exceed all-time active days.");
  }
  if (streak.current > streak.longest) {
    errors.push("The current streak cannot exceed the longest streak.");
  }

  const expectedAverage = streak.recentActiveDays > 0
    ? streak.recentContributions / streak.recentActiveDays
    : 0;
  if (
    !Number.isFinite(streak.averagePerActiveDay) ||
    Math.abs(streak.averagePerActiveDay - expectedAverage) > 1e-9
  ) {
    errors.push("Average contributions per active day is inconsistent with the rolling totals.");
  }

  const expectedActiveDayRate = (streak.recentActiveDays / 365) * 100;
  if (Math.abs(streak.activeDayRate - expectedActiveDayRate) > 1e-9) {
    errors.push("Active-day rate is inconsistent with the 365-day source window.");
  }
  if (streak.peakContributionCount > streak.recentContributions) {
    errors.push("Peak-day contributions cannot exceed the rolling contribution total.");
  }

  const weekdays = new Set([
    "Sunday",
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
    "—",
  ]);
  if (!weekdays.has(streak.mostActiveWeekday)) {
    errors.push(`Invalid most-active weekday '${streak.mostActiveWeekday}'.`);
  }

  function validIsoDate(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value ?? ""))) return false;
    const date = dateFromIso(value);
    return Number.isFinite(date.getTime()) && isoDate(date) === value;
  }

  if (Boolean(streak.first) !== Boolean(streak.latest)) {
    errors.push("First and latest contribution dates must either both exist or both be empty.");
  }
  for (const [name, value] of [
    ["streak.first", streak.first],
    ["streak.latest", streak.latest],
    ["streak.peakContributionDate", streak.peakContributionDate],
  ]) {
    if (value !== null && value !== undefined && !validIsoDate(value)) {
      errors.push(`${name} must be a valid ISO calendar date; received '${value}'.`);
    }
  }
  if (streak.first && streak.latest && streak.first > streak.latest) {
    errors.push("The first contribution date cannot be later than the latest date.");
  }

  if (streak.recentContributions === 0) {
    if (streak.peakContributionCount !== 0 || streak.peakContributionDate) {
      errors.push("An empty rolling window cannot have a peak contribution day.");
    }
  } else if (
    streak.peakContributionCount <= 0 ||
    !streak.peakContributionDate
  ) {
    errors.push("A non-empty rolling window must have a positive peak and peak date.");
  }

  if (streak.peakContributionDate) {
    const today = dateFromIso(isoDate(new Date()));
    const rollingStart = isoDate(addUtcDays(today, -364));
    const todayIso = isoDate(today);
    if (
      streak.peakContributionDate < rollingStart ||
      streak.peakContributionDate > todayIso
    ) {
      errors.push("The peak contribution date must fall inside the rolling 365-day window.");
    }
  }

  if (errors.length > 0) {
    throw new Error(
      `Summary card data validation failed:\n- ${errors.join("\n- ")}`,
    );
  }
}

function recentDays(days, numberOfDays) {
  const today = dateFromIso(isoDate(new Date()));
  const start = addUtcDays(today, -(numberOfDays - 1));
  const countByDate = new Map(
    days.map((day) => [day.date, day.contributionCount]),
  );
  const result = [];

  for (
    let cursor = start;
    cursor.getTime() <= today.getTime();
    cursor = addUtcDays(cursor, 1)
  ) {
    const date = isoDate(cursor);
    result.push({
      date,
      contributionCount: safeInteger(countByDate.get(date)),
    });
  }

  return result;
}

function aggregateWeeks(days) {
  const weeks = [];

  for (let index = 0; index < days.length; index += 7) {
    const group = days.slice(index, index + 7);
    weeks.push({
      start: group[0]?.date,
      end: group.at(-1)?.date,
      total: group.reduce(
        (sum, day) => sum + day.contributionCount,
        0,
      ),
    });
  }

  return weeks;
}

function renderActivity(days) {
  const width = 820;
  const height = 240;
  const chartX = 34;
  const chartY = 78;
  const chartWidth = width - 68;
  const chartHeight = 108;
  const recent = recentDays(days, 365);
  const weeks = aggregateWeeks(recent);
  const maximum = Math.max(1, ...weeks.map((week) => week.total));
  const recentTotal = recent.reduce(
    (sum, day) => sum + day.contributionCount,
    0,
  );

  const points = weeks
    .map((week, index) => {
      const x =
        chartX +
        (index / Math.max(1, weeks.length - 1)) * chartWidth;
      const y =
        chartY +
        chartHeight -
        (week.total / maximum) * chartHeight;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  const areaPoints = `${chartX},${chartY + chartHeight} ${points} ${chartX + chartWidth},${chartY + chartHeight}`;

  const grid = [0.25, 0.5, 0.75, 1]
    .map((ratio) => {
      const y = chartY + chartHeight - chartHeight * ratio;
      return `<line x1="${chartX}" y1="${y}" x2="${chartX + chartWidth}" y2="${y}" stroke="${THEME.border}" stroke-dasharray="3 4"/>`;
    })
    .join("");

  const monthLabels = [];
  let previousMonth = "";
  let previousLabelX = Number.NEGATIVE_INFINITY;
  let previousLabelYear = "";

  for (const [index, week] of weeks.entries()) {
    const month = week.start?.slice(0, 7) ?? "";
    if (!month || month === previousMonth) continue;
    previousMonth = month;

    const x =
      chartX +
      (index / Math.max(1, weeks.length - 1)) * chartWidth;

    // Keep labels readable on GitHub by enforcing a minimum horizontal gap.
    if (x - previousLabelX < 72) continue;

    const date = dateFromIso(`${month}-01`);
    const year = String(date.getUTCFullYear());
    const includeYear =
      monthLabels.length === 0 ||
      date.getUTCMonth() === 0 ||
      year !== previousLabelYear;

    const label = new Intl.DateTimeFormat("en", {
      month: "short",
      ...(includeYear ? { year: "numeric" } : {}),
      timeZone: "UTC",
    }).format(date);

    previousLabelX = x;
    previousLabelYear = year;

    monthLabels.push(
      `<text x="${x.toFixed(1)}" y="216" text-anchor="middle" class="tiny">${escapeXml(label)}</text>`,
    );
  }

  return cardShell({
    width,
    height,
    title: "GitHub Activity Graph",
    iconName: "activity",
    accent: THEME.green,
    subtitle: `${compactNumber(recentTotal)} contributions across the last 12 months · weekly area graph`,
    body: `
      <defs>
        <linearGradient id="activity-area" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="${THEME.blue}" stop-opacity=".50"/>
          <stop offset="1" stop-color="${THEME.blue}" stop-opacity="0"/>
        </linearGradient>
      </defs>
      ${grid}
      <line x1="${chartX}" y1="${chartY + chartHeight}" x2="${chartX + chartWidth}" y2="${chartY + chartHeight}" stroke="${THEME.border}"/>
      <polygon points="${areaPoints}" fill="url(#activity-area)"/>
      <polyline points="${points}" fill="none" stroke="${THEME.blue}" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round"/>
      ${monthLabels.join("")}
    `,
  });
}


function renderContributionGraph(days) {
  const width = 900;
  const cell = 11;
  const gap = 3;
  const graphX = 52;
  const graphY = 88;
  const today = dateFromIso(isoDate(new Date()));
  const currentWeekStart = addUtcDays(today, -today.getUTCDay());
  const graphStart = addUtcDays(currentWeekStart, -52 * 7);
  const contributionByDate = new Map(
    days.map((day) => [day.date, day.contributionCount]),
  );
  const graphDays = [];

  for (let week = 0; week < 53; week += 1) {
    for (let weekday = 0; weekday < 7; weekday += 1) {
      const date = addUtcDays(graphStart, week * 7 + weekday);
      const dateText = isoDate(date);
      graphDays.push({
        week,
        weekday,
        date: dateText,
        count:
          date.getTime() <= today.getTime()
            ? safeInteger(contributionByDate.get(dateText))
            : 0,
        future: date.getTime() > today.getTime(),
      });
    }
  }

  const nonZero = graphDays
    .filter((day) => day.count > 0)
    .map((day) => day.count)
    .sort((first, second) => first - second);
  const quantile = (ratio) =>
    nonZero.length === 0
      ? 1
      : nonZero[Math.min(
          nonZero.length - 1,
          Math.floor((nonZero.length - 1) * ratio),
        )];
  const thresholds = [quantile(0.25), quantile(0.50), quantile(0.75)];
  const levelColor = (count, future) => {
    if (future || count <= 0) return THEME.track;
    if (count <= thresholds[0]) return "#0E4429";
    if (count <= thresholds[1]) return "#006D32";
    if (count <= thresholds[2]) return "#26A641";
    return "#39D353";
  };

  const cells = graphDays
    .map((day) => {
      const x = graphX + day.week * (cell + gap);
      const y = graphY + day.weekday * (cell + gap);
      return `<rect x="${x}" y="${y}" width="${cell}" height="${cell}" rx="2" fill="${levelColor(day.count, day.future)}"><title>${escapeXml(day.date)}: ${day.count} contributions</title></rect>`;
    })
    .join("");

  const weekdayLabels = [
    [1, "Mon"],
    [3, "Wed"],
    [5, "Fri"],
  ]
    .map(([weekday, label]) =>
      `<text x="42" y="${graphY + weekday * (cell + gap) + 9}" text-anchor="end" class="tiny">${label}</text>`,
    )
    .join("");

  const monthLabels = [];
  let previousMonth = "";
  let previousX = Number.NEGATIVE_INFINITY;
  for (let week = 0; week < 53; week += 1) {
    const date = addUtcDays(graphStart, week * 7);
    const month = `${date.getUTCFullYear()}-${date.getUTCMonth()}`;
    if (month === previousMonth) continue;
    previousMonth = month;
    const x = graphX + week * (cell + gap);
    if (x - previousX < 42) continue;
    previousX = x;
    const label = new Intl.DateTimeFormat("en", {
      month: "short",
      timeZone: "UTC",
    }).format(date);
    monthLabels.push(
      `<text x="${x}" y="75" class="tiny">${escapeXml(label)}</text>`,
    );
  }

  const total = graphDays.reduce((sum, day) => sum + day.count, 0);
  const legendX = width - 178;
  const legend = [THEME.track, "#0E4429", "#006D32", "#26A641", "#39D353"]
    .map((color, index) =>
      `<rect x="${legendX + 35 + index * 15}" y="198" width="11" height="11" rx="2" fill="${color}"/>`,
    )
    .join("");

  return cardShell({
    width,
    height: 224,
    title: "GitHub Contribution Calendar",
    iconName: "calendar",
    accent: THEME.green,
    subtitle: `${compactNumber(total)} contributions across the latest 53 contribution weeks`,
    body: `
      ${monthLabels.join("")}
      ${weekdayLabels}
      ${cells}
      <text x="${legendX}" y="207" class="tiny">Less</text>
      ${legend}
      <text x="${width - 25}" y="207" text-anchor="end" class="tiny">More</text>
    `,
  });
}

function renderPersonalLanguageContributions(data) {
  const width = 1000;
  const languages = data.languages;
  const columns = 2;
  const rows = Math.max(1, Math.ceil(languages.length / columns));
  const height = 112 + rows * 56;
  const totalChangedLines = languages.reduce(
    (sum, item) => sum + item.changedLines,
    0,
  );
  const maximum = Math.max(
    1,
    ...languages.map((item) => item.changedLines),
  );

  const body = languages.length > 0
    ? languages.map((item, index) => {
        const column = index % columns;
        const row = Math.floor(index / columns);
        const x = 26 + column * 490;
        const y = 84 + row * 56;
        const share = totalChangedLines > 0
          ? (item.changedLines / totalChangedLines) * 100
          : 0;
        const barWidth = Math.max(
          item.changedLines > 0 ? 1 : 0,
          (item.changedLines / maximum) * 165,
        );

        return `<circle cx="${x + 5}" cy="${y - 5}" r="5" fill="${item.color}"/>
      <text x="${x + 18}" y="${y}" class="small">${escapeXml(truncate(item.language, 19))}</text>
      <text x="${x + 170}" y="${y}" class="label">${escapeXml(formatPercentage(share))}</text>
      <rect x="${x + 230}" y="${y - 12}" width="165" height="8" rx="4" fill="${THEME.track}"/>
      <rect x="${x + 230}" y="${y - 12}" width="${barWidth.toFixed(1)}" height="8" rx="4" fill="${item.color}"/>
      <text x="${x + 18}" y="${y + 20}" class="tiny">${compactNumber(item.changedLines)} changed lines · ${compactNumber(item.commits)} commits · ${compactNumber(item.files)} files</text>`;
      }).join("")
    : `<text x="28" y="88" class="empty">No attributable source-file changes were available for analysis.</text>`;

  const capNote = data.globalCapReached
    ? ` · safety cap used: ${compactNumber(config.maxAnalyzedCommits)} commits`
    : "";

  return cardShell({
    width,
    height,
    title: "Personal Code Contribution",
    iconName: "branch",
    accent: THEME.cyan,
    subtitle: `GitHub-attributed default-branch changes · last ${config.codeActivityYears} years${capNote}`,
    body,
  });
}

function renderLanguages(languages, scopeSummary) {
  const width = 900;
  const columns = 3;
  const rows = Math.max(1, Math.ceil(languages.length / columns));
  const height = 122 + rows * 34;
  const totalWeight = languages.reduce(
    (sum, language) => sum + language.weight,
    0,
  );
  const barX = 28;
  const barY = 68;
  const barWidth = width - 56;
  let currentX = barX;

  const segments = languages.map((language) => {
    const segmentWidth = totalWeight > 0
      ? (language.weight / totalWeight) * barWidth
      : 0;
    const segment = `<rect x="${currentX.toFixed(3)}" y="${barY}" width="${Math.max(0, segmentWidth).toFixed(3)}" height="13" fill="${language.color}"/>`;
    currentX += segmentWidth;
    return segment;
  }).join("");

  const legend = languages.length > 0
    ? languages.map((language, index) => {
        const column = index % columns;
        const row = Math.floor(index / columns);
        const x = 28 + column * 290;
        const y = 110 + row * 34;
        return `<circle cx="${x + 5}" cy="${y - 4}" r="5" fill="${language.color}"/>
      <text x="${x + 18}" y="${y}" class="small">${escapeXml(truncate(language.language, 18))}</text>
      <text x="${x + 158}" y="${y}" class="label">${escapeXml(formatPercentage(language.percentage))}</text>
      <text x="${x + 218}" y="${y}" class="tiny">${escapeXml(plural(language.repositories, "repo"))}</text>`;
      }).join("")
    : `<text x="28" y="110" class="empty">No repository language composition data was reported for the verified repositories.</text>`;

  return cardShell({
    width,
    height,
    title: "Engineering Language Footprint",
    iconName: "code",
    accent: THEME.cyan,
    subtitle: `GitHub Linguist code-byte composition across ${scopeSummary.personal} personal repositories + ${scopeSummary.publicContributed} verified public contribution projects`,
    body: `
      <defs><clipPath id="language-bar"><rect x="${barX}" y="${barY}" width="${barWidth}" height="13" rx="6.5"/></clipPath></defs>
      <rect x="${barX}" y="${barY}" width="${barWidth}" height="13" rx="6.5" fill="${THEME.track}"/>
      <g clip-path="url(#language-bar)">${segments}</g>
      ${legend}
    `,
  });
}

function renderTechnologies(
  technologyImpact,
  scannedRepositoryCount,
) {
  const width = 1000;
  const items = technologyImpact;
  const columns = 2;
  const rows = Math.max(1, Math.ceil(items.length / columns));
  const height = 112 + rows * 58;
  const maximumScore = Math.max(1, ...items.map((item) => item.score));

  const body = items.length > 0
    ? items.map((item, index) => {
        const column = index % columns;
        const row = Math.floor(index / columns);
        const x = 26 + column * 490;
        const y = 84 + row * 58;
        const barWidth = Math.max(
          item.score > 0 ? 1 : 0,
          (item.score / maximumScore) * 165,
        );

        return `<circle cx="${x + 5}" cy="${y - 5}" r="5" fill="${item.color}"/>
      <text x="${x + 18}" y="${y}" class="small">${escapeXml(truncate(item.name, 20))}</text>
      <text x="${x + 180}" y="${y}" class="label">${escapeXml(plural(item.repositories, "repo"))}</text>
      <rect x="${x + 255}" y="${y - 12}" width="165" height="8" rx="4" fill="${THEME.track}"/>
      <rect x="${x + 255}" y="${y - 12}" width="${barWidth.toFixed(1)}" height="8" rx="4" fill="${item.color}"/>
      <text x="${x + 18}" y="${y + 20}" class="tiny">${compactNumber(item.changedLines)} changed lines · ${compactNumber(item.commits)} commits · ${compactNumber(item.files)} files touched</text>`;
      }).join("")
    : `<text x="28" y="88" class="empty">No supported frameworks or platforms were detected.</text>`;

  return cardShell({
    width,
    height,
    title: "Frameworks & Platforms",
    iconName: "package",
    accent: THEME.purple,
    subtitle: `Contribution impact in projects where detected · overlapping metrics across ${scannedRepositoryCount} repositories`,
    body,
  });
}

function renderPublicContributionPortfolio(projects) {
  const width = 1000;
  const projectX = 18;
  const projectWidth = width - projectX * 2;
  const innerPadding = 24;
  const contentX = projectX + innerPadding;
  const contentWidth =
    projectWidth - innerPadding * 2;
  const projectGap = 30;
  const maximumVisibleProjects = 12;
  const maximumVisibleLanguages = 12;
  const maximumVisibleTechnologies = 16;
  const projectAccents = [
    THEME.green,
    THEME.blue,
    THEME.purple,
    THEME.orange,
    THEME.cyan,
    THEME.pink,
    THEME.yellow,
  ];

  if (projects.length === 0) {
    return cardShell({
      width,
      height: 142,
      title: "Public Open-Source Contributions",
      iconName: "branch",
      accent: THEME.green,
      subtitle:
        "Verified public repositories with attributed commits, authored PRs, or submitted reviews",
      body:
        `<rect x="20" y="70" width="${width - 40}" height="48" rx="10" fill="${THEME.track}" stroke="${THEME.border}"/>
      <text x="38" y="99" class="empty">No verified public contribution projects were returned by GitHub.</text>`,
    });
  }

  const visibleProjects =
    projects.slice(0, maximumVisibleProjects);
  const hiddenCount = Math.max(
    0,
    projects.length - visibleProjects.length,
  );

  const layouts = [];
  let cursorY = 74;

  visibleProjects.forEach((project, index) => {
    const displayedLanguages =
      (project.languages ?? [])
        .slice(0, maximumVisibleLanguages);
    const hiddenLanguages = Math.max(
      0,
      (project.languages ?? []).length -
        displayedLanguages.length,
    );

    const displayedTechnologies =
      (project.technologies ?? [])
        .slice(0, maximumVisibleTechnologies);
    const hiddenTechnologies = Math.max(
      0,
      (project.technologies ?? []).length -
        displayedTechnologies.length,
    );

    const titleLines = wrapWords(
      project.fullName,
      70,
      2,
    );

    const identities =
      (project.attributedIdentities ?? []).length > 0
        ? project.attributedIdentities
        : [username];

    const identityLines = wrapWords(
      `Attributed identities: ${identities.join(", ")}`,
      120,
      2,
    );

    const evidenceLines = wrapWords(
      `Verified by: ${
        (project.evidence ?? []).join(", ") ||
        "engineering activity"
      }`,
      120,
      2,
    );

    const languageRows =
      displayedLanguages.length > 0
        ? Math.ceil(displayedLanguages.length / 3)
        : 1;

    const technologyRows =
      displayedTechnologies.length > 0
        ? Math.ceil(displayedTechnologies.length / 4)
        : 1;

    // SVG has no automatic document flow. Precompute every section position
    // and include complete bottom padding in the final project-card height.
    const titleY = 38;
    const titleLineHeight = 21;
    const titleBottom =
      titleY +
      Math.max(0, titleLines.length - 1) *
        titleLineHeight;

    const identityY = titleBottom + 24;
    const identityBottom =
      identityY +
      Math.max(0, identityLines.length - 1) * 15;

    const evidenceY = identityBottom + 22;
    const evidenceBottom =
      evidenceY +
      Math.max(0, evidenceLines.length - 1) * 15;

    const summaryTitleY = evidenceBottom + 30;
    const summaryGridY = summaryTitleY + 17;
    const summaryGridHeight = 42 * 2 + 10;

    const contributionTitleY =
      summaryGridY + summaryGridHeight + 29;
    const contributionGridY =
      contributionTitleY + 17;
    const contributionGridHeight = 64 * 2 + 10;

    const languageTitleY =
      contributionGridY +
      contributionGridHeight +
      29;
    const languageBarY = languageTitleY + 18;
    const languageLegendY = languageBarY + 36;
    const languageLegendHeight =
      displayedLanguages.length > 0
        ? languageRows * 32
        : 24;
    const languageOverflowHeight =
      hiddenLanguages > 0 ? 20 : 0;

    const technologyTitleY =
      languageLegendY +
      languageLegendHeight +
      languageOverflowHeight +
      22;
    const technologyGridY =
      technologyTitleY + 25;
    const technologyGridHeight =
      displayedTechnologies.length > 0
        ? technologyRows * 30
        : 24;
    const technologyOverflowHeight =
      hiddenTechnologies > 0 ? 20 : 0;

    const blockHeight =
      technologyGridY +
      technologyGridHeight +
      technologyOverflowHeight +
      25;

    layouts.push({
      project,
      index,
      y: cursorY,
      blockHeight,
      accent:
        projectAccents[index % projectAccents.length],
      titleLines,
      identityLines,
      evidenceLines,
      displayedLanguages,
      hiddenLanguages,
      displayedTechnologies,
      hiddenTechnologies,
      positions: {
        titleY,
        identityY,
        evidenceY,
        summaryTitleY,
        summaryGridY,
        contributionTitleY,
        contributionGridY,
        languageTitleY,
        languageBarY,
        languageLegendY,
        languageLegendHeight,
        technologyTitleY,
        technologyGridY,
        technologyGridHeight,
      },
    });

    cursorY += blockHeight + projectGap;
  });

  const footerHeight =
    hiddenCount > 0 ? 46 : 16;
  const height =
    cursorY - projectGap + footerHeight;

  const body = layouts
    .map((layout) => {
      const {
        project,
        index,
        y,
        blockHeight,
        accent,
        titleLines,
        identityLines,
        evidenceLines,
        displayedLanguages,
        hiddenLanguages,
        displayedTechnologies,
        hiddenTechnologies,
        positions,
      } = layout;

      const absolute = (value) => y + value;

      const summaryMetrics = [
        {
          value: compactNumber(project.lifecycle.commits),
          label: "Project commits",
        },
        {
          value: compactNumber(project.lifecycle.releases),
          label: "Releases",
        },
        {
          value: compactNumber(
            (project.languages ?? []).length,
          ),
          label: "Languages",
        },
        {
          value: compactNumber(project.sourceFiles),
          label: "Source files",
        },
        {
          value: compactNumber(project.lifecycle.stars),
          label: "Stars",
        },
        {
          value: compactNumber(project.lifecycle.forks),
          label: "Forks",
        },
      ];

      const summaryCellWidth =
        (contentWidth - 10 * 2) / 3;

      const summaryGrid = summaryMetrics
        .map((metric, metricIndex) => {
          const column = metricIndex % 3;
          const row = Math.floor(metricIndex / 3);
          const metricX =
            contentX +
            column * (summaryCellWidth + 10);
          const metricY =
            absolute(positions.summaryGridY) +
            row * 52;

          return `<rect x="${metricX}" y="${metricY}" width="${summaryCellWidth}" height="42" rx="9" fill="${THEME.background}" stroke="${accent}" stroke-opacity=".34"/>
      <text x="${metricX + 13}" y="${metricY + 19}" class="small">${escapeXml(metric.value)}</text>
      <text x="${metricX + 13}" y="${metricY + 34}" class="tiny">${escapeXml(metric.label)}</text>`;
        })
        .join("");

      const reviewCapNote =
        project.reviewScanCapped
          ? "Scan capped"
          : "";

      const contributionMetrics = [
        {
          value: compactNumber(project.attributedCommits),
          label: "Attributed commits",
          iconName: "commit",
          color: THEME.blue,
        },
        {
          value: compactNumber(project.authoredPullRequests),
          label: "Authored PRs",
          iconName: "pull",
          color: THEME.purple,
        },
        {
          value: compactNumber(project.reviewedPullRequests),
          label: "PRs reviewed",
          iconName: "people",
          color: THEME.cyan,
          note: reviewCapNote,
        },
        {
          value: compactNumber(project.approvedPullRequests),
          label: "PRs approved",
          iconName: "test",
          color: THEME.green,
          note: reviewCapNote,
        },
        {
          value: compactNumber(project.reviewSubmissions),
          label: "Review submissions",
          iconName: "activity",
          color: THEME.orange,
          note: reviewCapNote,
        },
        {
          value: compactNumber(project.personal.changedLines),
          label: "Analyzed changed lines",
          iconName: "code",
          color: THEME.yellow,
        },
        {
          value: compactNumber(project.personal.files),
          label: "Files touched",
          iconName: "repo",
          color: THEME.pink,
        },
      ];

      const contributionCellWidth =
        (contentWidth - 10 * 3) / 4;

      const contributionGrid =
        contributionMetrics
          .map((metric, metricIndex) => {
            const column = metricIndex % 4;
            const row = Math.floor(metricIndex / 4);
            const metricX =
              contentX +
              column * (contributionCellWidth + 10);
            const metricY =
              absolute(positions.contributionGridY) +
              row * 74;

            return `<rect x="${metricX}" y="${metricY}" width="${contributionCellWidth}" height="64" rx="10" fill="${metric.color}" fill-opacity=".15" stroke="${metric.color}" stroke-opacity=".9" stroke-width="1.5"/>
      ${icon(metric.iconName, metricX + 12, metricY + 12, metric.color, 17)}
      <text x="${metricX + 42}" y="${metricY + 28}" class="metricValue">${escapeXml(metric.value)}</text>
      <text x="${metricX + 12}" y="${metricY + 52}" class="metricLabel">${escapeXml(metric.label)}</text>
      ${
        metric.note
          ? `<text x="${metricX + contributionCellWidth - 10}" y="${metricY + 15}" text-anchor="end" class="metricNote">${escapeXml(metric.note)}</text>`
          : ""
      }`;
          })
          .join("");

      const languageBarX = contentX;
      const languageBarWidth = contentWidth;
      let languageCursorX = languageBarX;

      const languageSegments =
        (project.languages ?? [])
          .map((language) => {
            const segmentWidth =
              (language.percentage / 100) *
              languageBarWidth;
            const segment =
              `<rect x="${languageCursorX.toFixed(2)}" y="${absolute(positions.languageBarY)}" width="${Math.max(0, segmentWidth).toFixed(2)}" height="12" fill="${language.color}"/>`;

            languageCursorX += segmentWidth;
            return segment;
          })
          .join("");

      const clipId =
        `public-project-${index}-${
          project.fullName
            .replace(/[^a-z0-9]/gi, "-")
        }`;

      const languageColumnWidth =
        contentWidth / 3;

      const languageLegend =
        displayedLanguages.length > 0
          ? displayedLanguages
              .map((language, languageIndex) => {
                const column = languageIndex % 3;
                const row = Math.floor(languageIndex / 3);
                const itemX =
                  contentX +
                  column * languageColumnWidth;
                const itemY =
                  absolute(positions.languageLegendY) +
                  row * 32;
                const fileText =
                  language.files > 0
                    ? plural(language.files, "file")
                    : project.languageSource;

                return `<circle cx="${itemX + 5}" cy="${itemY - 4}" r="5" fill="${language.color}"/>
      <text x="${itemX + 18}" y="${itemY}" class="small">${escapeXml(truncate(language.language, 20))}</text>
      <text x="${itemX + 150}" y="${itemY}" class="label">${escapeXml(formatPercentage(language.percentage))}</text>
      <text x="${itemX + 210}" y="${itemY}" class="tiny">${escapeXml(truncate(fileText, 16))}</text>`;
              })
              .join("")
          : `<text x="${contentX}" y="${absolute(positions.languageLegendY)}" class="empty">No language composition was available.</text>`;

      const languageOverflowY =
        absolute(
          positions.languageLegendY +
          positions.languageLegendHeight +
          3,
        );

      const technologyColumnWidth =
        contentWidth / 4;

      const technologyBadges =
        displayedTechnologies.length > 0
          ? displayedTechnologies
              .map((technology, technologyIndex) => {
                const column = technologyIndex % 4;
                const row = Math.floor(technologyIndex / 4);
                const itemX =
                  contentX +
                  column * technologyColumnWidth;
                const itemY =
                  absolute(positions.technologyGridY) +
                  row * 30;
                const color =
                  TECHNOLOGY_COLORS[technology] ??
                  fallbackColor(technology);

                return `<rect x="${itemX}" y="${itemY}" width="${technologyColumnWidth - 10}" height="23" rx="11.5" fill="${color}" fill-opacity=".12" stroke="${color}" stroke-opacity=".62"/>
      <circle cx="${itemX + 12}" cy="${itemY + 11.5}" r="4" fill="${color}"/>
      <text x="${itemX + 24}" y="${itemY + 15}" class="small">${escapeXml(truncate(technology, 24))}</text>`;
              })
              .join("")
          : `<text x="${contentX}" y="${absolute(positions.technologyGridY + 16)}" class="tiny">No supported framework or platform signature was detected.</text>`;

      const technologyOverflowY =
        absolute(
          positions.technologyGridY +
          positions.technologyGridHeight +
          2,
        );

      const projectNumber =
        String(index + 1).padStart(2, "0");

      return `<g data-project-index="${index + 1}">
      <rect x="${projectX + 5}" y="${y + 7}" width="${projectWidth - 2}" height="${blockHeight}" rx="16" fill="#000000" fill-opacity=".22"/>
      <rect data-project-card="${index + 1}" x="${projectX}" y="${y}" width="${projectWidth}" height="${blockHeight}" rx="16" fill="${THEME.track}" stroke="${accent}" stroke-opacity=".86" stroke-width="1.7"/>
      <rect x="${projectX}" y="${y}" width="${projectWidth}" height="6" rx="3" fill="${accent}"/>
      <rect x="${projectX + 1}" y="${y + 7}" width="${projectWidth - 2}" height="${positions.summaryTitleY - 18}" rx="14" fill="${accent}" fill-opacity=".065"/>
      ${icon("repo", contentX, absolute(19), accent, 20)}
      ${svgTextLines({
        lines: titleLines,
        x: contentX + 30,
        y: absolute(positions.titleY),
        className: "value",
        lineHeight: 21,
      })}
      <rect x="${width - 142}" y="${y + 18}" width="100" height="25" rx="12.5" fill="${accent}" fill-opacity=".16" stroke="${accent}" stroke-opacity=".72"/>
      <text x="${width - 92}" y="${y + 35}" text-anchor="middle" class="metricLabel">PROJECT ${projectNumber}</text>
      ${svgTextLines({
        lines: identityLines,
        x: contentX,
        y: absolute(positions.identityY),
        className: "label",
        lineHeight: 15,
      })}
      ${svgTextLines({
        lines: evidenceLines,
        x: contentX,
        y: absolute(positions.evidenceY),
        className: "tiny",
        lineHeight: 15,
      })}

      <rect x="${contentX - 10}" y="${absolute(positions.summaryTitleY - 17)}" width="${contentWidth + 20}" height="22" rx="7" fill="${accent}" fill-opacity=".1"/>
      <text x="${contentX}" y="${absolute(positions.summaryTitleY)}" class="sectionLabel">FULL PROJECT COMPOSITION</text>
      ${summaryGrid}

      <rect x="${contentX - 10}" y="${absolute(positions.contributionTitleY - 17)}" width="${contentWidth + 20}" height="${positions.languageTitleY - positions.contributionTitleY - 1}" rx="12" fill="${THEME.background}" stroke="${accent}" stroke-opacity=".34"/>
      <text x="${contentX}" y="${absolute(positions.contributionTitleY)}" class="sectionLabel">VERIFIED PERSONAL CONTRIBUTION</text>
      ${contributionGrid}

      <rect x="${contentX - 10}" y="${absolute(positions.languageTitleY - 17)}" width="${contentWidth + 20}" height="${positions.technologyTitleY - positions.languageTitleY - 1}" rx="12" fill="${THEME.background}" stroke="${THEME.border}"/>
      <text x="${contentX}" y="${absolute(positions.languageTitleY)}" class="sectionLabel">LANGUAGE COMPOSITION</text>
      <defs>
        <clipPath id="${escapeXml(clipId)}">
          <rect x="${languageBarX}" y="${absolute(positions.languageBarY)}" width="${languageBarWidth}" height="12" rx="6"/>
        </clipPath>
      </defs>
      <rect x="${languageBarX}" y="${absolute(positions.languageBarY)}" width="${languageBarWidth}" height="12" rx="6" fill="${THEME.track}"/>
      <g clip-path="url(#${escapeXml(clipId)})">${languageSegments}</g>
      ${languageLegend}
      ${
        hiddenLanguages > 0
          ? `<text x="${contentX}" y="${languageOverflowY}" class="tiny">+${hiddenLanguages} additional languages are included in the composition bar and aggregate analytics.</text>`
          : ""
      }

      <rect x="${contentX - 10}" y="${absolute(positions.technologyTitleY - 17)}" width="${contentWidth + 20}" height="${blockHeight - positions.technologyTitleY - 7}" rx="12" fill="${THEME.background}" stroke="${THEME.border}"/>
      <text x="${contentX}" y="${absolute(positions.technologyTitleY)}" class="sectionLabel">FRAMEWORKS &amp; PLATFORMS</text>
      ${technologyBadges}
      ${
        hiddenTechnologies > 0
          ? `<text x="${contentX}" y="${technologyOverflowY}" class="tiny">+${hiddenTechnologies} additional framework or platform signals are included in aggregate analytics.</text>`
          : ""
      }
    </g>`;
    })
    .join("");

  const footer =
    hiddenCount > 0
      ? `<rect x="20" y="${height - 38}" width="${width - 40}" height="25" rx="12.5" fill="${THEME.track}" stroke="${THEME.border}"/>
      <text x="36" y="${height - 21}" class="subtitle">${hiddenCount} additional verified public projects are included in aggregate language and framework statistics.</text>`
      : "";

  return cardShell({
    width,
    height,
    title: "Public Open-Source Contributions",
    iconName: "branch",
    accent: THEME.green,
    subtitle:
      "Each verified repository is rendered as an independent adaptive project card",
    body: `${body}${footer}`,
  });
}

function renderDomains(domains) {
  const width = 660;
  const rows = Math.max(1, domains.length);
  const height = 100 + rows * 46;
  const totalScore = domains.reduce(
    (sum, domain) => sum + domain.score,
    0,
  );
  const colors = [
    THEME.blue,
    THEME.purple,
    THEME.green,
    THEME.orange,
    THEME.cyan,
    THEME.yellow,
    THEME.pink,
  ];

  const body =
    domains.length > 0
      ? domains
          .map((domain, index) => {
            const y = 84 + index * 46;
            const percentage =
              totalScore > 0
                ? (domain.score / totalScore) * 100
                : 0;
            const barWidth = (percentage / 100) * 320;
            const color = colors[index % colors.length];

            return `${icon(index === 0 ? "layers" : "code", 24, y - 17, color, 15)}
      <text x="50" y="${y}" class="small">${escapeXml(domain.name)}</text>
      <rect x="278" y="${y - 12}" width="320" height="9" rx="4.5" fill="${THEME.track}"/>
      <rect x="278" y="${y - 12}" width="${barWidth.toFixed(1)}" height="9" rx="4.5" fill="${color}"/>
      <text x="630" y="${y}" text-anchor="end" class="label">${percentage.toFixed(0)}%</text>`;
          })
          .join("")
      : `<text x="28" y="86" class="empty">Not enough technology signals were available for classification.</text>`;

  return cardShell({
    width,
    height,
    title: "Engineering Domains",
    iconName: "layers",
    accent: THEME.blue,
    subtitle: "Heuristic classification derived from detected technologies and language composition",
    body,
  });
}

function renderDelivery(data) {
  const metrics = [
    {
      icon: "pull",
      color: THEME.purple,
      value: compactNumber(data.pullRequests),
      label: "Pull requests opened · all time",
    },
    {
      icon: "pull",
      color: THEME.green,
      value: compactNumber(data.mergedPullRequests),
      label: "Pull requests merged · all time",
    },
    {
      icon: "people",
      color: THEME.cyan,
      value: compactNumber(data.reviewContributions),
      label: "Review contributions · all time",
    },
    {
      icon: "issue",
      color: THEME.orange,
      value: compactNumber(data.closedIssues),
      label: "Issues closed · all time",
    },
    {
      icon: "workflow",
      color: THEME.blue,
      value: compactNumber(data.ciRepositories),
      label: "Scanned repositories with CI/CD",
    },
    {
      icon: "activity",
      color: THEME.yellow,
      value: compactNumber(data.activeRepositories),
      label: "Repositories updated · 90 days",
    },
  ];

  return cardShell({
    width: 560,
    height: 280,
    title: "Delivery & Collaboration",
    iconName: "rocket",
    accent: THEME.green,
    subtitle: "Contribution and repository-delivery signals with explicit time ranges",
    body: metricGrid(metrics, 78, 2, 560),
  });
}

function renderPortfolio(data) {
  const metrics = [
    {
      icon: "repo",
      color: THEME.blue,
      value: compactNumber(data.total),
      label: "Token-accessible repositories",
    },
    {
      icon: "unlock",
      color: THEME.green,
      value: compactNumber(data.public),
      label: "Public repositories",
    },
    {
      icon: "lock",
      color: THEME.purple,
      value: compactNumber(data.private),
      label: "Private repositories",
    },
    {
      icon: "activity",
      color: THEME.orange,
      value: compactNumber(data.active),
      label: "Updated in the last 90 days",
    },
    {
      icon: "docs",
      color: THEME.cyan,
      value: compactNumber(data.documented),
      label: "Scanned repositories with README",
    },
    {
      icon: "test",
      color: THEME.green,
      value: compactNumber(data.withTests),
      label: "Scanned repositories with tests",
    },
    {
      icon: "workflow",
      color: THEME.blue,
      value: compactNumber(data.withCi),
      label: "Scanned repositories with CI/CD",
    },
    {
      icon: "repo",
      color: THEME.muted,
      value: compactNumber(data.archived),
      label: "Archived repositories",
    },
  ];

  return cardShell({
    width: 560,
    height: 342,
    title: "Repository Portfolio",
    iconName: "repo",
    accent: THEME.blue,
    subtitle: `${data.scanned} repositories scanned successfully · aggregate-only private data`,
    body: metricGrid(metrics, 78, 2, 560),
  });
}


function trophyTier(value, thresholds) {
  const tiers = [
    { name: "Bronze", color: "#CD7F32" },
    { name: "Silver", color: "#C0C0C0" },
    { name: "Gold", color: "#D29922" },
    { name: "Platinum", color: "#A371F7" },
  ];
  let achieved = null;

  for (let index = 0; index < thresholds.length; index += 1) {
    if (value >= thresholds[index]) {
      achieved = { ...tiers[index], target: thresholds[index] };
    }
  }

  return achieved ?? {
    name: "Building",
    color: THEME.muted,
    target: thresholds[0],
  };
}

function buildTrophies(metrics) {
  const definitions = [
    {
      title: "Commit Builder",
      value: metrics.commits,
      thresholds: [100, 500, 1_000, 2_500],
      icon: "commit",
    },
    {
      title: "Pull Shark",
      value: metrics.pullRequests,
      thresholds: [10, 50, 100, 250],
      icon: "pull",
    },
    {
      title: "Code Reviewer",
      value: metrics.reviews,
      thresholds: [10, 50, 100, 250],
      icon: "people",
    },
    {
      title: "Polyglot",
      value: metrics.languages,
      thresholds: [5, 8, 12, 16],
      icon: "code",
    },
    {
      title: "Stack Architect",
      value: metrics.technologies,
      thresholds: [5, 10, 15, 20],
      icon: "layers",
    },
    {
      title: "Repository Builder",
      value: metrics.ownedRepositories,
      thresholds: [5, 10, 20, 30],
      icon: "repo",
    },
    {
      title: "Streak Keeper",
      value: metrics.longestStreak,
      thresholds: [7, 30, 100, 365],
      icon: "flame",
    },
    {
      title: "Open Source Contributor",
      value: metrics.publicContributedRepositories,
      thresholds: [1, 2, 3, 5],
      icon: "branch",
    },
  ];

  return definitions.map((definition) => ({
    ...definition,
    tier: trophyTier(definition.value, definition.thresholds),
  }));
}

function renderTrophies(trophies) {
  const width = 900;
  const columns = 4;
  const rows = Math.ceil(trophies.length / columns);
  const tileWidth = 206;
  const tileHeight = 112;
  const height = 76 + rows * tileHeight + 20;

  const body = trophies.map((trophy, index) => {
    const column = index % columns;
    const row = Math.floor(index / columns);
    const x = 22 + column * 218;
    const y = 70 + row * tileHeight;
    const achieved = trophy.tier.name !== "Building";
    const statusText = achieved
      ? `${trophy.tier.name} · ${compactNumber(trophy.value)}`
      : `${compactNumber(trophy.value)} / ${compactNumber(trophy.tier.target)}`;

    return `<rect x="${x}" y="${y}" width="${tileWidth}" height="94" rx="10" fill="${THEME.track}" stroke="${THEME.border}"/>
      ${icon(trophy.icon, x + 16, y + 16, trophy.tier.color, 22)}
      <text x="${x + 50}" y="${y + 31}" class="small">${escapeXml(trophy.title)}</text>
      <text x="${x + 16}" y="${y + 61}" class="value" style="fill:${trophy.tier.color}">${escapeXml(statusText)}</text>
      <text x="${x + 16}" y="${y + 80}" class="tiny">Milestone-based GitHub analytics</text>`;
  }).join("");

  return cardShell({
    width,
    height,
    title: "GitHub Engineering Trophies",
    iconName: "trophy",
    accent: THEME.yellow,
    subtitle: "Custom Bronze, Silver, Gold and Platinum milestones derived from verified GitHub analytics · not GitHub-issued achievements",
    body,
  });
}

async function writeCards(cards) {
  await fs.mkdir(config.outputDirectory, { recursive: true });

  for (const [filename, svg] of Object.entries(cards)) {
    const outputPath = path.join(config.outputDirectory, filename);
    await fs.writeFile(outputPath, svg.trim(), "utf8");
    console.log(`Generated ${path.relative(process.cwd(), outputPath)}`);
  }
}

async function runSummaryCardSelfTest() {
  const today = isoDate(new Date());
  const overviewFixture = {
    repositories: 37,
    activeRepositories: 18,
    recentContributions: 444,
    allTimeCommitContributions: 9_876,
    mergedPullRequests: 123,
    reviewContributions: 27,
    publicContributedRepositories: 8,
    publicOrganizationsContributed: 5,
    ciCoverage: 77.8,
    testCoverage: 68.4,
    contributionTenure: "<1 month",
    ownedRepositoryStars: 91,
  };
  const streakFixture = {
    current: 8,
    longest: 21,
    activeDays: 196,
    first: "2018-02-22",
    latest: today,
    mostActiveWeekday: "Monday",
    recentContributions: 444,
    recentActiveDays: 101,
    recentActiveWeeks: 49,
    averagePerActiveDay: 444 / 101,
    activeDayRate: (101 / 365) * 100,
    peakContributionCount: 20,
    peakContributionDate: today,
  };

  validateSummaryCardMetrics(overviewFixture, streakFixture);

  let mismatchRejected = false;
  try {
    validateSummaryCardMetrics(
      { ...overviewFixture, recentContributions: 443 },
      streakFixture,
    );
  } catch (error) {
    mismatchRejected = String(error.message).includes(
      "rolling-12-month contribution totals must match",
    );
  }
  if (!mismatchRejected) {
    throw new Error(
      "Summary card validator self-test failed to reject a cross-card total mismatch.",
    );
  }

  const overviewSvg = renderOverview(overviewFixture);
  const streakSvg = renderStreak(streakFixture);

  const checks = [
    [overviewSvg, 'width="760" height="360"'],
    [overviewSvg, 'viewBox="0 0 760 360"'],
    [overviewSvg, "444"],
    [overviewSvg, "9.9K"],
    [overviewSvg, "&lt;1 month"],
    [overviewSvg, "77.8%"],
    [overviewSvg, "68.4%"],
    [streakSvg, 'width="760" height="360"'],
    [streakSvg, 'viewBox="0 0 760 360"'],
    [streakSvg, "DAY STREAK"],
    [streakSvg, "49 weeks"],
    [streakSvg, "20 contributions"],
    [streakSvg, "Monday"],
  ];

  for (const [svg, expected] of checks) {
    if (!svg.includes(expected)) {
      throw new Error(
        `Summary card renderer self-test failed: missing '${expected}'.`,
      );
    }
  }

  for (const [name, svg] of [
    ["GitHub Overview", overviewSvg],
    ["Contribution Streak", streakSvg],
  ]) {
    if (!svg.trim().endsWith("</svg>")) {
      throw new Error(`${name} renderer produced an incomplete SVG document.`);
    }
    if (/\b(?:undefined|NaN|Infinity)\b/.test(svg)) {
      throw new Error(`${name} renderer leaked an invalid numeric value.`);
    }
  }

  const previewDirectory =
    process.env.SUMMARY_CARD_PREVIEW_DIRECTORY?.trim();
  if (previewDirectory) {
    const absolutePreviewDirectory = path.resolve(previewDirectory);
    await fs.mkdir(absolutePreviewDirectory, { recursive: true });
    await Promise.all([
      fs.writeFile(
        path.join(absolutePreviewDirectory, "github-overview.svg"),
        overviewSvg,
        "utf8",
      ),
      fs.writeFile(
        path.join(absolutePreviewDirectory, "contribution-streak.svg"),
        streakSvg,
        "utf8",
      ),
    ]);
    console.log(
      `Wrote summary-card QA previews to ${absolutePreviewDirectory}.`,
    );
  }

  console.log(
    "Summary card self-test passed: locked dimensions, dynamic values, XML escaping, and validation invariants are intact.",
  );
}

/**
 * Exercises the v20 accuracy invariants without contacting GitHub.
 * This deliberately tests the failure-prone seams: aliases, notebooks,
 * additive Linguist bytes, search-result deduplication, and 422 diagnostics.
 */
async function runDataPipelineSelfTest() {
  const assert = (condition, message) => {
    if (!condition) throw new Error(`Data pipeline self-test failed: ${message}`);
  };

  assert(
    contributionLanguageForPath("analysis/model.ipynb") ===
      "Jupyter Notebook",
    "Jupyter notebooks are not classified.",
  );
  assert(
    contributionLanguageForPath("services/forecast.py") === "Python",
    "Python files are not classified.",
  );
  assert(
    contributionIdentitiesForScope(REPOSITORY_SCOPE.PERSONAL).length ===
      contributorIdentities.length,
    "historical aliases are not applied to personal repositories.",
  );

  const languageFixture = aggregateLanguages([
    {
      languages: { Python: 900, JavaScript: 100 },
      paths: ["src/app.py", "web/app.js"],
    },
    {
      languages: { Python: 100, "Jupyter Notebook": 900 },
      paths: ["tools/helper.py", "notebooks/model.ipynb"],
    },
  ]);
  const languagePercentages = new Map(
    languageFixture.map((item) => [item.language, item.percentage]),
  );
  assert(
    Math.abs(languagePercentages.get("Python") - 50) < 0.0001,
    "Linguist bytes are not aggregated additively.",
  );
  assert(
    Math.abs(languagePercentages.get("Jupyter Notebook") - 45) < 0.0001,
    "Jupyter Linguist bytes are missing from the footprint.",
  );

  const duplicateKeyA = publicSearchResultKey(
    {
      repository_url: "https://api.github.com/repos/example/project",
      number: 42,
    },
    null,
  );
  const duplicateKeyB = publicSearchResultKey(
    { number: 42 },
    "example/project",
  );
  assert(
    new Set([duplicateKeyA, duplicateKeyB]).size === 1,
    "PR identifiers do not deduplicate across identities or credentials.",
  );

  const diagnostics = parseGitHubError(
    JSON.stringify({
      message: "Validation Failed",
      errors: [{ resource: "Search", field: "q", code: "invalid" }],
      documentation_url: "https://docs.github.com/rest/search",
    }),
    {
      headers: new Headers({
        "x-github-request-id": "SELF-TEST",
        "x-ratelimit-resource": "search",
        "x-ratelimit-remaining": "29",
      }),
    },
  );
  assert(
    diagnostics.errors[0]?.field === "q" &&
      diagnostics.requestId === "SELF-TEST" &&
      diagnostics.rateLimitResource === "search",
    "structured GitHub failure diagnostics were discarded.",
  );

  console.log(
    "Data pipeline self-test passed: aliases, Python/Jupyter classification, Linguist-byte aggregation, identifier deduplication, and GitHub diagnostics are intact.",
  );
}

async function main() {
  console.log("Fetching authenticated account...");
  console.log(
    `Configured public identities: ${contributorIdentities.join(", ")} · global discovery: ${globalContributorIdentities.join(", ")}`,
  );
  const authenticatedUser = await rest("/user", {
    label: "Authenticated-user request",
  });

  if (
    String(authenticatedUser?.login ?? "").toLowerCase() !==
    username.toLowerCase()
  ) {
    throw new Error(
      `PRIVATE_STATS_TOKEN belongs to '${authenticatedUser?.login ?? "unknown"}', not '${username}'.`,
    );
  }

  console.log(
    "Fetching token-accessible repositories and public repositories linked to commits, pull requests, or reviews...",
  );
  const [accessibleRepositories, publicContributedRepositories] =
    await Promise.all([
      fetchAllRepositories(),
      fetchPublicContributedRepositories(),
    ]);
  const listedRepositories = mergeRepositories(
    accessibleRepositories,
    publicContributedRepositories,
  );
  const {
    selected: repositorySelections,
    summary: repositorySelectionSummary,
  } = selectRepositoriesForAnalytics(listedRepositories);

  const repositories = repositorySelections.map(
    (selection) => selection.repository,
  );

  console.log(
    `Repositories listed: ${listedRepositories.length}; selected for analytics: ${repositorySelections.length}.`,
  );
  console.log(
    [
      `Selection policy: ${repositorySelectionSummary.personalPublic} personal public`,
      `${repositorySelectionSummary.personalPrivate} personal private`,
      `${repositorySelectionSummary.publicContributed} public contributed`,
      `${repositorySelectionSummary.excludedExternalPrivateOrInternal} external private/internal excluded`,
      `${repositorySelectionSummary.excludedExternalWithoutContributionRelationship} external public without contribution relationship excluded`,
      `${repositorySelectionSummary.excludedByAnalyticsFilters} excluded by fork/archive/disabled/profile filters`,
    ].join("; "),
  );

  const scanResults = await mapLimit(
    repositorySelections,
    config.repositoryConcurrency,
    fetchRepositoryDetails,
  );

  const repositoryDetails = [];
  let failedScans = 0;
  let truncatedTrees = 0;

  for (const [index, result] of scanResults.entries()) {
    if (result.status === "fulfilled") {
      repositoryDetails.push(result.value);
      if (result.value.treeTruncated) truncatedTrees += 1;
      continue;
    }

    failedScans += 1;
    const repository = repositorySelections[index].repository;

    if (config.debugPrivateRepositories) {
      console.warn(
        `Repository scan failed for ${repository.full_name}: ${result.reason.message}`,
      );
    } else {
      console.warn(
        `Repository scan ${index + 1} failed: ${result.reason.message}`,
      );
    }
  }

  if (
    repositorySelections.length > 0 &&
    repositoryDetails.length === 0
  ) {
    throw new Error(
      "No selected repositories could be scanned. Ensure the token has Contents: read for personal repositories and that external organization repositories are public.",
    );
  }

  const scanSuccessRatio =
    repositorySelections.length === 0
      ? 1
      : repositoryDetails.length / repositorySelections.length;

  if (scanSuccessRatio < config.minimumScanSuccessRatio) {
    throw new Error(
      `Only ${(scanSuccessRatio * 100).toFixed(1)}% of selected repositories were scanned successfully; required minimum is ${(config.minimumScanSuccessRatio * 100).toFixed(1)}%.`,
    );
  }

  console.log(
    `Repository scan completed: ${repositoryDetails.length} succeeded, ${failedScans} failed, ${truncatedTrees} recursive trees were truncated.`,
  );

  if (truncatedTrees > 0) {
    throw new Error(
      `GitHub truncated ${truncatedTrees} recursive repository tree(s). Refusing to publish potentially incomplete manifest, test, or CI coverage metrics.`,
    );
  }

  console.log("Fetching contribution history...");
  const contributionHistory = await fetchAllContributionHistory();
  const baseStreak = calculateStreak(
    contributionHistory.days,
  );
  const recent365 = recentDays(
    contributionHistory.days,
    365,
  );
  const recentContributionTotal = recent365.reduce(
    (sum, day) => sum + day.contributionCount,
    0,
  );
  const streak = buildStreakInsights(
    baseStreak,
    recent365,
    recentContributionTotal,
  );

  console.log("Fetching all-time collaboration counts...");
  const [
    pullRequestResult,
    mergedPullRequestResult,
    closedIssueResult,
  ] = await Promise.all([
    searchCountsByContributorIdentity(
      (identity) => `author:${identity} is:pr`,
      "Pull-request search",
    ),
    searchCountsByContributorIdentity(
      (identity) => `author:${identity} is:pr is:merged`,
      "Merged pull-request search",
    ),
    searchCountsByContributorIdentity(
      (identity) => `author:${identity} is:issue is:closed`,
      "Closed-issue search",
    ),
  ]);

  const pullRequests = pullRequestResult.total;
  const mergedPullRequests = mergedPullRequestResult.total;
  const closedIssues = closedIssueResult.total;

  console.log("Analyzing personal code contribution impact...");
  const personalCodeContributions =
    await analyzePersonalCodeContributions(repositorySelections);

  // Verify public candidates before allowing them to affect project, language,
  // framework, domain, or trophy totals. This removes repositories discovered
  // only through a weak/stale relationship but showing zero actual activity.
  const publicContributionPortfolio = await buildPublicContributionPortfolio(
    repositoryDetails,
    personalCodeContributions,
  );
  const verifiedPublicRepositoryNames = new Set(
    publicContributionPortfolio.map((project) => project.fullName.toLowerCase()),
  );

  const engineeringFootprintDetails = repositoryDetails.filter(
    (detail) =>
      detail.scope === REPOSITORY_SCOPE.PERSONAL ||
      (detail.publicContribution &&
        verifiedPublicRepositoryNames.has(
          detail.repository.full_name.toLowerCase(),
        )),
  );
  const verifiedRepositories = repositorySelections
    .filter((selection) =>
      selection.scope === REPOSITORY_SCOPE.PERSONAL ||
      verifiedPublicRepositoryNames.has(
        selection.repository.full_name.toLowerCase(),
      ),
    )
    .map((selection) => selection.repository);
  const personalFootprintCount = engineeringFootprintDetails.filter(
    (detail) => detail.scope === REPOSITORY_SCOPE.PERSONAL,
  ).length;
  const publicContributedFootprintCount = publicContributionPortfolio.length;

  const languages = aggregateLanguages(engineeringFootprintDetails);
  const technologyDetection = buildTechnologyDetection(
    engineeringFootprintDetails,
  );
  const technologyImpact = buildTechnologyImpact(
    technologyDetection,
    personalCodeContributions,
  );
  const aiCards = buildAiEngineeringCards(
    engineeringFootprintDetails,
    personalCodeContributions.aiWorkflowActivity,
  );
  const domains = classifyDomains(technologyDetection.counts, languages);

  const ninetyDaysAgo =
    Date.now() - 90 * 24 * 60 * 60 * 1_000;

  const activeRepositories = verifiedRepositories.filter(
    (repository) =>
      repository.pushed_at &&
      new Date(repository.pushed_at).getTime() >= ninetyDaysAgo,
  ).length;

  const portfolio = {
    total: verifiedRepositories.length,
    public: verifiedRepositories.filter((repository) => !repository.private).length,
    private: verifiedRepositories.filter((repository) => repository.private).length,
    active: activeRepositories,
    archived: verifiedRepositories.filter((repository) => repository.archived).length,
    documented: engineeringFootprintDetails.filter((detail) =>
      hasReadme(detail.paths),
    ).length,
    withTests: engineeringFootprintDetails.filter((detail) =>
      hasTests(detail.paths),
    ).length,
    withCi: engineeringFootprintDetails.filter((detail) =>
      hasCi(detail.paths),
    ).length,
    scanned: engineeringFootprintDetails.length,
  };

  // Overview metrics are derived from already-fetched repository and
  // contribution data, so the richer card adds no extra GitHub API requests.
  const ownedRepositoryStars = verifiedRepositories
    .filter(
      (repository) =>
        String(
          repository.owner?.login ?? "",
        ).toLowerCase() ===
        username.toLowerCase(),
    )
    .reduce(
      (sum, repository) =>
        sum +
        safeInteger(
          repository.stargazers_count,
        ),
      0,
    );

  const publicOrganizationsContributed =
    new Set(
      verifiedRepositories
        .filter(
          (repository) =>
            verifiedPublicRepositoryNames.has(
              String(
                repository.full_name ?? "",
              ).toLowerCase(),
            ) &&
            String(
              repository.owner?.type ?? "",
            ).toLowerCase() ===
              "organization",
        )
        .map((repository) =>
          String(
            repository.owner?.login ?? "",
          ).toLowerCase(),
        )
        .filter(Boolean),
    ).size;

  const repositoryCoverageDenominator =
    Math.max(1, portfolio.scanned);

  const overview = {
    repositories: verifiedRepositories.length,
    activeRepositories,
    recentContributions:
      recentContributionTotal,
    allTimeCommitContributions:
      contributionHistory.totals.commits,
    mergedPullRequests,
    reviewContributions:
      contributionHistory.totals.reviews,
    publicContributedRepositories:
      publicContributedFootprintCount,
    publicOrganizationsContributed,
    ciCoverage:
      (
        portfolio.withCi /
        repositoryCoverageDenominator
      ) *
      100,
    testCoverage:
      (
        portfolio.withTests /
        repositoryCoverageDenominator
      ) *
      100,
    contributionTenure:
      formatContributionTenure(streak.first),
    ownedRepositoryStars,
  };

  validateSummaryCardMetrics(overview, streak);
  console.log(
    "Validated GitHub Overview and Contribution Streak source metrics and cross-card totals.",
  );

  const delivery = {
    pullRequests,
    mergedPullRequests,
    reviewContributions: contributionHistory.totals.reviews,
    closedIssues,
    ciRepositories: portfolio.withCi,
    activeRepositories,
  };

  const ownedRepositories = verifiedRepositories.filter(
    (repository) =>
      String(repository.owner?.login ?? "").toLowerCase() ===
      username.toLowerCase(),
  ).length;
  const publicOrganizationRepositories = verifiedRepositories.filter(
    (repository) =>
      String(repository.owner?.type ?? "").toLowerCase() ===
        "organization" &&
      !repository.private &&
      String(repository.owner?.login ?? "").toLowerCase() !==
        username.toLowerCase(),
  ).length;

  const trophies = buildTrophies({
    commits: contributionHistory.totals.commits,
    pullRequests,
    reviews: contributionHistory.totals.reviews,
    languages: personalCodeContributions.languages.length,
    technologies: technologyDetection.counts.size,
    ownedRepositories,
    longestStreak: streak.longest,
    publicOrganizationRepositories,
    publicContributedRepositories: publicContributedFootprintCount,
  });

  const cards = {
    "github-overview.svg": renderOverview(overview),
    "contribution-streak.svg": renderStreak(streak),
    "contribution-graph.svg": renderContributionGraph(
      contributionHistory.days,
    ),
    "github-activity-graph.svg": renderActivity(
      contributionHistory.days,
    ),
    "language-spectrum.svg": renderLanguages(
      languages,
      {
        personal: personalFootprintCount,
        publicContributed: publicContributedFootprintCount,
      },
    ),
    "personal-code-contribution.svg":
      renderPersonalLanguageContributions(personalCodeContributions),
    "frameworks-platforms.svg": renderTechnologies(
      technologyImpact,
      engineeringFootprintDetails.length,
    ),
    "public-contribution-portfolio.svg": renderPublicContributionPortfolio(
      publicContributionPortfolio,
    ),
    "engineering-domains.svg": renderDomains(domains),
    "delivery-collaboration.svg": renderDelivery(delivery),
    "repository-portfolio.svg": renderPortfolio(portfolio),
    "github-trophies.svg": renderTrophies(trophies),
    ...aiCards,
  };

  await writeCards(cards);

  console.log(
    `Analytics complete: ${languages.length} engineering-footprint languages, ${personalCodeContributions.languages.length} personal contribution languages, ${technologyDetection.counts.size} frameworks/platforms, ${publicContributionPortfolio.length} public organization projects contributed to, ${repositoryDetails.length} repositories scanned, 7 AI engineering cards generated.`,
  );
}

if (summaryCardSelfTest) {
  await runSummaryCardSelfTest();
} else if (dataPipelineSelfTest) {
  await runDataPipelineSelfTest();
} else {
  await main();
}
