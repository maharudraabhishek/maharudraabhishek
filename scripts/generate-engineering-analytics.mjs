import fs from "node:fs/promises";
import path from "node:path";
import {
  aiEvidencePriority,
  buildAiEngineeringCards,
  isAiEvidenceCandidatePath,
  isAiEvidencePath,
} from "./ai-engineering-analytics.mjs";

const API_VERSION = "2022-11-28";
const GRAPHQL_ENDPOINT = "https://api.github.com/graphql";
const REST_ENDPOINT = "https://api.github.com";
const MAX_TRANSIENT_RETRY_DELAY_MS = 60_000;
const MAX_RATE_LIMIT_WAIT_MS = 15 * 60_000;
const REQUEST_RETRIES = 4;
const MAX_CONTENT_BYTES = 1_000_000;

const token = requiredEnvironment("PRIVATE_STATS_TOKEN");
const username = requiredEnvironment("GITHUB_USERNAME");

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
    0.75,
    { min: 0, max: 1 },
  ),
  affiliations:
    process.env.REPOSITORY_AFFILIATIONS?.trim() ||
    "owner,collaborator,organization_member",
  excludedRepositories: parseCsv(process.env.EXCLUDE_REPOSITORIES),
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

function plural(value, singular, pluralForm = `${singular}s`) {
  return `${value} ${value === 1 ? singular : pluralForm}`;
}

function truncate(value, maximumLength) {
  const text = String(value);
  if (text.length <= maximumLength) return text;
  return `${text.slice(0, Math.max(1, maximumLength - 1))}…`;
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

    const message = parseGitHubError(rawBody);
    const rateLimited = responseIsRateLimited(response, message);

    if (rateLimited) {
      if (retryAttempt >= REQUEST_RETRIES) {
        throw new Error(
          `${label} remained rate-limited after ${REQUEST_RETRIES + 1} attempts.`,
        );
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
      responseAllowsPublicFallback(response.status, message)
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

    if (response.status === 401) {
      throw new Error(`${label} failed: GitHub rejected the token.`);
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

    throw new Error(
      `${label} failed with HTTP ${response.status}${message ? `: ${message}` : "."}`,
    );
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
    const message = parseGitHubError(rawBody);
    const rateLimited = responseIsRateLimited(response, message);

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

    throw new Error(
      `${label} failed with HTTP ${response.status}${message ? `: ${message}` : "."}`,
    );
  }

  throw new Error(`${label} failed unexpectedly.`);
}

function parseGitHubError(rawBody) {
  try {
    const parsed = JSON.parse(rawBody);
    return parsed.message ? String(parsed.message) : "";
  } catch {
    return rawBody.slice(0, 200);
  }
}

function responseIsRateLimited(response, message) {
  if (response.status === 429) return true;

  const remaining = response.headers.get("x-ratelimit-remaining");
  if (response.status === 403 && remaining === "0") return true;

  return (
    response.status === 403 &&
    /secondary rate limit|rate limit exceeded|abuse detection/i.test(
      message,
    )
  );
}

function responseAllowsPublicFallback(status, message) {
  if (status !== 403 && status !== 404) return false;

  return (
    status === 404 ||
    /resource not accessible by personal access token|forbidden|requires authentication/i.test(
      message,
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


function normalizePublicContributionRepository(repository, evidence = []) {
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
  };
}

function graphqlRepositoryToRestShape(node, evidence) {
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
  }, [evidence]);
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

async function fetchRepositoriesContributedToConnection(headers, label) {
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
            contributionTypes: [COMMIT, ISSUE, PULL_REQUEST, PULL_REQUEST_REVIEW]
            privacy: PUBLIC
            orderBy: { field: UPDATED_AT, direction: DESC }
          ) {
            pageInfo { hasNextPage endCursor }
            nodes { ${PUBLIC_CONTRIBUTION_REPOSITORY_FIELDS} }
          }
        }
      }
    `;

    const data = await graphql(query, { login: username, after }, label, { headers });
    const connection = data?.user?.repositoriesContributedTo;
    for (const node of connection?.nodes ?? []) {
      const repository = graphqlRepositoryToRestShape(node, "repository-relationship");
      if (repository) mergeContributionCandidate(repositories, repository);
      if (repositories.size >= config.maxPublicContributedRepositories) break;
    }

    if (!connection?.pageInfo?.hasNextPage) break;
    after = connection.pageInfo.endCursor;
    if (!after) break;
  }

  return [...repositories.values()];
}

async function fetchContributionCollectionRepositories() {
  const years = await fetchContributionYears();
  const results = await mapLimit(years, 2, async (year) => {
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
            issueContributionsByRepository(maxRepositories: 100) {
              repository { ${PUBLIC_CONTRIBUTION_REPOSITORY_FIELDS} }
            }
          }
        }
      }
    `;
    const data = await graphql(
      query,
      { login: username, from: from.toISOString(), to: to.toISOString() },
      `Contribution-repository query for ${year}`,
      { headers: REST_HEADERS },
    );
    const collection = data?.user?.contributionsCollection;
    const groups = [
      [collection?.commitContributionsByRepository, "commit"],
      [collection?.pullRequestContributionsByRepository, "pull-request"],
      [collection?.pullRequestReviewContributionsByRepository, "pull-request-review"],
      [collection?.issueContributionsByRepository, "issue"],
    ];
    const repositories = [];
    for (const [items, evidence] of groups) {
      for (const item of items ?? []) {
        const repository = graphqlRepositoryToRestShape(item.repository, evidence);
        if (repository) repositories.push(repository);
      }
    }
    return repositories;
  });

  const repositories = new Map();
  for (const result of results) {
    if (result.status === "rejected") {
      console.warn(`Contribution-repository year query failed: ${result.reason.message}`);
      continue;
    }
    for (const repository of result.value) mergeContributionCandidate(repositories, repository);
  }
  return [...repositories.values()];
}

function repositoryNameFromApiUrl(value) {
  const match = String(value ?? "").match(/\/repos\/([^/]+)\/([^/?#]+)$/i);
  return match ? `${decodeURIComponent(match[1])}/${decodeURIComponent(match[2])}` : null;
}

async function searchPublicContributionRepositoryNames(query, evidence) {
  const repositories = new Map();
  for (let page = 1; page <= 10 && repositories.size < config.maxPublicContributedRepositories; page += 1) {
    let response;
    try {
      response = await rest(
        `/search/issues?q=${encodeURIComponent(query)}&sort=updated&order=desc&per_page=100&page=${page}`,
        { label: `Public contribution search (${evidence})`, headers: REST_HEADERS },
      );
    } catch (error) {
      console.warn(`Public contribution search (${evidence}) failed with the personal token: ${error.message}`);
      response = await rest(
        `/search/issues?q=${encodeURIComponent(query)}&sort=updated&order=desc&per_page=100&page=${page}`,
        { label: `Anonymous public contribution search (${evidence})`, headers: ANONYMOUS_REST_HEADERS },
      );
    }

    const items = Array.isArray(response?.items) ? response.items : [];
    for (const item of items) {
      const fullName = repositoryNameFromApiUrl(item.repository_url);
      if (fullName) repositories.set(fullName.toLowerCase(), { fullName, evidence });
    }
    if (items.length < 100) break;
  }
  return [...repositories.values()];
}

async function fetchPublicRepositoryMetadata(fullName, evidence) {
  const encoded = fullName.split("/").map(encodeURIComponent).join("/");
  let repository;
  const attempts = [REST_HEADERS, PUBLIC_REST_HEADERS, ANONYMOUS_REST_HEADERS];
  let lastError;
  for (const headers of attempts) {
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
    console.warn(`Could not load public repository metadata for ${fullName}: ${lastError?.message ?? "unknown error"}`);
    return null;
  }
  return normalizePublicContributionRepository(repository, [evidence]);
}

async function fetchSearchDiscoveredContributionRepositories() {
  const searchSpecs = [
    [`author:${username} is:pr`, "pull-request"],
    [`reviewed-by:${username} is:pr`, "pull-request-review"],
    [`author:${username} is:issue`, "issue"],
  ];
  const searchResults = await mapLimit(searchSpecs, 1, ([query, evidence]) =>
    searchPublicContributionRepositoryNames(query, evidence),
  );
  const names = new Map();
  for (const result of searchResults) {
    if (result.status === "rejected") {
      console.warn(`Public contribution search source failed: ${result.reason.message}`);
      continue;
    }
    for (const item of result.value) {
      const existing = names.get(item.fullName.toLowerCase()) ?? { fullName: item.fullName, evidence: new Set() };
      existing.evidence.add(item.evidence);
      names.set(item.fullName.toLowerCase(), existing);
    }
  }

  const metadataResults = await mapLimit(
    [...names.values()].slice(0, config.maxPublicContributedRepositories),
    3,
    async (item) => {
      const repository = await fetchPublicRepositoryMetadata(item.fullName, [...item.evidence][0]);
      if (!repository) return null;
      repository.contribution_evidence = [...item.evidence];
      return repository;
    },
  );
  return metadataResults
    .filter((result) => result.status === "fulfilled" && result.value)
    .map((result) => result.value);
}

async function fetchPublicContributedRepositories() {
  if (config.maxPublicContributedRepositories === 0) return [];

  const sources = await Promise.allSettled([
    fetchRepositoriesContributedToConnection(REST_HEADERS, "Public contributed-repository relationship query"),
    fetchRepositoriesContributedToConnection(PUBLIC_REST_HEADERS, "Public contributed-repository public relationship query"),
    fetchContributionCollectionRepositories(),
    fetchSearchDiscoveredContributionRepositories(),
  ]);

  const merged = new Map();
  const sourceNames = ["repository relationship", "public relationship", "yearly contribution collection", "PR/review/issue search"];
  sources.forEach((source, index) => {
    if (source.status === "rejected") {
      console.warn(`${sourceNames[index]} discovery failed: ${source.reason.message}`);
      return;
    }
    console.log(`${sourceNames[index]} discovery returned ${source.value.length} public organization repositories.`);
    for (const repository of source.value) mergeContributionCandidate(merged, repository);
  });

  return [...merged.values()]
    .sort((first, second) =>
      String(second.pushed_at ?? "").localeCompare(String(first.pushed_at ?? "")) ||
      first.full_name.localeCompare(second.full_name),
    )
    .slice(0, config.maxPublicContributedRepositories);
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

async function fetchRepositoryDetails(selection) {
  const { repository, scope, publicContribution = false } = selection;
  const publicRepository =
    repositorySupportsAnonymousFallback(scope);
  const requestHeaders = publicRepository
    ? PUBLIC_REST_HEADERS
    : REST_HEADERS;

  const languagesPromise = rest(repository.languages_url, {
    label: "Repository languages request",
    headers: requestHeaders,
  });

  const treePromise = rest(
    `/repos/${repository.full_name}/git/trees/${encodeURIComponent(repository.default_branch)}?recursive=1`,
    {
      label: "Repository tree request",
      optionalStatuses: [404, 409, 422],
      headers: requestHeaders,
    },
  );

  const [languages, treeResponse] = await Promise.all([
    languagesPromise,
    treePromise,
  ]);

  const treeEntries = Array.isArray(treeResponse?.tree)
    ? treeResponse.tree
    : [];

  const paths = treeEntries
    .filter((entry) => entry.type === "blob" && entry.path)
    .map((entry) => entry.path);

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
      content: await fetchRepositoryContent(
        repository,
        scope,
        entry.path,
      ),
    }),
  );

  const manifests = manifestResults
    .filter(
      (result) =>
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
    paths,
    manifests,
    treeTruncated: Boolean(treeResponse?.truncated),
  };
}

async function fetchContributionYears() {
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
    { login: username },
    "Contribution-year query",
  );

  const years = data?.user?.contributionsCollection?.contributionYears ?? [];
  const currentYear = new Date().getUTCFullYear();
  return [...new Set([...years, currentYear])]
    .filter(Number.isInteger)
    .sort((first, second) => first - second);
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

async function searchCount(
  query,
  label,
  { headers = REST_HEADERS } = {},
) {
  const response = await rest(
    `/search/issues?q=${encodeURIComponent(query)}&per_page=1`,
    { label, headers },
  );
  return safeInteger(response?.total_count);
}

async function safeSearchCount(
  query,
  label,
  fallback,
  options = {},
) {
  try {
    return await searchCount(query, label, options);
  } catch (error) {
    console.warn(`${label} unavailable; using the fallback value.`);
    return fallback;
  }
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

  const commits = [];

  for (let pageNumber = 1; ; pageNumber += 1) {
    const remaining = config.maxCommitsPerRepository - commits.length;
    if (remaining <= 0) break;

    const perPage = Math.min(100, remaining);
    const response = await rest(
      `/repos/${repository.full_name}/commits?sha=${encodeURIComponent(repository.default_branch)}&author=${encodeURIComponent(username)}&since=${encodeURIComponent(since.toISOString())}&per_page=${perPage}&page=${pageNumber}`,
      {
        label: "Authored-commit listing",
        optionalStatuses: [404, 409, 422],
        headers: requestHeaders,
      },
    );

    const pageItems = Array.isArray(response) ? response : [];
    for (const commit of pageItems) {
      if (!commit?.sha) continue;
      commits.push({
        sha: commit.sha,
        date:
          commit.commit?.author?.date ??
          commit.commit?.committer?.date ??
          null,
      });
    }

    if (pageItems.length < perPage) break;
    if (commits.length >= config.maxCommitsPerRepository) break;
  }

  return {
    selection,
    commits,
    capped: commits.length >= config.maxCommitsPerRepository,
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

async function fetchCommitDetails(selection, sha, discoveredDate = null) {
  const { repository, scope } = selection;
  const requestHeaders = repositorySupportsAnonymousFallback(scope)
    ? PUBLIC_REST_HEADERS
    : REST_HEADERS;
  const files = [];
  let statistics = null;

  for (let pageNumber = 1; pageNumber <= 30; pageNumber += 1) {
    const response = await rest(
      `/repos/${repository.full_name}/commits/${encodeURIComponent(sha)}?per_page=100&page=${pageNumber}`,
      {
        label: "Commit-detail request",
        optionalStatuses: [404, 409, 422],
        headers: requestHeaders,
      },
    );

    if (!response) break;
    if (pageNumber === 1) statistics = response.stats ?? null;

    const pageFiles = Array.isArray(response.files) ? response.files : [];
    files.push(...pageFiles);
    if (pageFiles.length < 100) break;
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
  let failedCommitLists = 0;

  for (const result of listResults) {
    if (result.status === "fulfilled") {
      repositoryCommitLists.push(result.value);
    } else {
      failedCommitLists += 1;
      console.warn(`Authored-commit listing failed: ${result.reason.message}`);
    }
  }

  const allocation = allocateCommitReferences(repositoryCommitLists);
  console.log(
    `Authored commits discovered: ${allocation.discoveredCount}; selected for detailed analysis: ${allocation.allocated.length}; repository caps reached: ${allocation.cappedRepositories}; listing failures: ${failedCommitLists}.`,
  );

  const detailResults = await mapLimit(
    allocation.allocated,
    config.commitDetailConcurrency,
    ({ selection, commit }) =>
      fetchCommitDetails(selection, commit.sha, commit.date),
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
  let failedCommitDetails = 0;

  for (const result of detailResults) {
    if (result.status === "rejected") {
      failedCommitDetails += 1;
      console.warn(`Commit-detail analysis failed: ${result.reason.message}`);
      continue;
    }

    const detail = result.value;
    const repositoryAccumulator = repositories.get(detail.repositoryFullName) ??
      createContributionAccumulator();
    repositoryAccumulator.commitShas.add(detail.sha);
    repositoryAccumulator.repositories.add(detail.repositoryFullName);

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
    analyzedCommits: detailResults.length - failedCommitDetails,
    discoveredCommits: allocation.discoveredCount,
    globalCapReached:
      allocation.discoveredCount > allocation.allocated.length,
    cappedRepositories: allocation.cappedRepositories,
    failedCommitDetails,
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

function aggregateLanguages(repositoryDetails) {
  const totals = new Map();

  for (const detail of repositoryDetails) {
    for (const [language, bytesValue] of Object.entries(detail.languages)) {
      const bytes = safeInteger(bytesValue);
      if (bytes <= 0) continue;

      const current = totals.get(language) ?? {
        language,
        bytes: 0,
        repositories: 0,
      };

      current.bytes += bytes;
      current.repositories += 1;
      totals.set(language, current);
    }
  }

  return [...totals.values()]
    .map((item) => ({
      ...item,
      color: LANGUAGE_COLORS[item.language] ?? fallbackColor(item.language),
    }))
    .sort((first, second) => second.bytes - first.bytes);
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

  try {
    const data = await graphql(
      query,
      { owner, name },
      `Public contribution repository lifecycle query (${repository.full_name})`,
      { headers: PUBLIC_REST_HEADERS },
    );
    const result = data?.repository;

    return {
      commits: safeInteger(
        result?.defaultBranchRef?.target?.history?.totalCount,
      ),
      releases: safeInteger(result?.releases?.totalCount),
      stars: safeInteger(result?.stargazerCount),
      forks: safeInteger(result?.forkCount),
    };
  } catch (error) {
    // Lifecycle counts improve the card but must not block language/code
    // composition for an otherwise accessible public contribution project.
    console.warn(
      `Public repository lifecycle metrics unavailable for ${repository.full_name}: ${error.message}`,
    );
    return {
      commits: 0,
      releases: 0,
      stars: safeInteger(repository.stargazers_count),
      forks: safeInteger(repository.forks_count),
    };
  }
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

async function buildPublicContributionPortfolio(
  repositoryDetails,
  personalCodeContributions,
) {
  const publicContributionDetails = repositoryDetails.filter(
    (detail) => detail.publicContribution,
  );

  const results = await mapLimit(
    publicContributionDetails,
    2,
    async (detail) => {
      const repository = detail.repository;
      const personal =
        personalCodeContributions.repositories.get(
          repository.full_name.toLowerCase(),
        ) ?? {
          additions: 0,
          deletions: 0,
          changedLines: 0,
          commits: 0,
          repositories: 0,
          files: 0,
        };

      const [lifecycle, authoredPullRequests, reviewedPullRequests] =
        await Promise.all([
          fetchPublicRepositoryLifecycle(repository),
          safeSearchCount(
            `repo:${repository.full_name} author:${username} is:pr`,
            `Public contribution authored-PR search (${repository.full_name})`,
            0,
            { headers: PUBLIC_REST_HEADERS },
          ),
          safeSearchCount(
            `repo:${repository.full_name} reviewed-by:${username} is:pr`,
            `Public contribution reviewed-PR search (${repository.full_name})`,
            0,
            { headers: PUBLIC_REST_HEADERS },
          ),
        ]);

      const composition = repositoryLanguageComposition(detail);

      return {
        fullName: repository.full_name,
        url: repository.html_url,
        languages: composition.languages,
        sourceFiles: composition.sourceFiles,
        lifecycle,
        personal,
        authoredPullRequests,
        reviewedPullRequests,
        evidence: repository.contribution_evidence ?? [],
      };
    },
  );

  const projects = [];
  const failures = [];

  for (const [index, result] of results.entries()) {
    if (result.status === "fulfilled") {
      projects.push(result.value);
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

  return projects.sort(
    (first, second) =>
      second.sourceFiles - first.sourceFiles ||
      second.lifecycle.commits - first.lifecycle.commits ||
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

  if (hasAndroidManifest || hasAndroidGradlePlugin) {
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
    /^\s*flutter\s*:/m.test(pubspecContent)
  ) {
    found.add("Flutter");
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
        Math.log1p(item.changedLines) * 0.55 +
        Math.log1p(item.commits) * 0.30 +
        Math.log1p(item.files) * 0.15,
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
    const weight = Math.max(0.5, Math.log10(language.bytes + 1));

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

function renderOverview(data) {
  const metrics = [
    {
      icon: "repo",
      color: THEME.blue,
      value: compactNumber(data.repositories),
      label: "Token-accessible repositories",
    },
    {
      icon: "star",
      color: THEME.yellow,
      value: compactNumber(data.stars),
      label: "Stars received · current",
    },
    {
      icon: "activity",
      color: THEME.green,
      value: compactNumber(data.recentContributions),
      label: "Contributions · last 12 months",
    },
    {
      icon: "commit",
      color: THEME.cyan,
      value: compactNumber(data.allTimeCommitContributions),
      label: "Commit contributions · all time",
    },
    {
      icon: "pull",
      color: THEME.purple,
      value: compactNumber(data.allTimePullRequests),
      label: "Pull requests opened · all time",
    },
    {
      icon: "people",
      color: THEME.pink,
      value: compactNumber(data.followers),
      label: "Followers · current",
    },
  ];

  return cardShell({
    width: 560,
    height: 280,
    title: "GitHub Overview",
    iconName: "star",
    accent: THEME.yellow,
    subtitle: "Public + token-accessible private engineering activity",
    body: metricGrid(metrics, 78, 2, 560),
  });
}

function renderStreak(streak) {
  const metrics = [
    {
      icon: "flame",
      color: THEME.orange,
      value: plural(streak.current, "day"),
      label: "Current streak",
    },
    {
      icon: "star",
      color: THEME.yellow,
      value: plural(streak.longest, "day"),
      label: "Longest streak · all time",
    },
    {
      icon: "activity",
      color: THEME.green,
      value: compactNumber(streak.activeDays),
      label: "Active contribution days",
    },
    {
      icon: "calendar",
      color: THEME.cyan,
      value: formatDate(streak.first),
      label: "First recorded contribution",
    },
    {
      icon: "commit",
      color: THEME.blue,
      value: formatDate(streak.latest),
      label: "Latest recorded contribution",
    },
    {
      icon: "activity",
      color: THEME.purple,
      value: streak.mostActiveWeekday,
      label: "Most active weekday",
    },
  ];

  return cardShell({
    width: 560,
    height: 280,
    title: "Contribution Streak",
    iconName: "flame",
    accent: THEME.orange,
    subtitle: "Calculated from available GitHub contribution calendars",
    body: metricGrid(metrics, 78, 2, 560),
  });
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
  const totalBytes = languages.reduce(
    (sum, language) => sum + language.bytes,
    0,
  );
  const barX = 28;
  const barY = 68;
  const barWidth = width - 56;
  let currentX = barX;

  const segments = languages
    .map((language) => {
      const segmentWidth =
        totalBytes > 0
          ? (language.bytes / totalBytes) * barWidth
          : 0;

      const segment = `<rect x="${currentX.toFixed(3)}" y="${barY}" width="${Math.max(0, segmentWidth).toFixed(3)}" height="13" fill="${language.color}"/>`;
      currentX += segmentWidth;
      return segment;
    })
    .join("");

  const legend =
    languages.length > 0
      ? languages
          .map((language, index) => {
            const column = index % columns;
            const row = Math.floor(index / columns);
            const x = 28 + column * 290;
            const y = 110 + row * 34;
            const percentage =
              totalBytes > 0
                ? (language.bytes / totalBytes) * 100
                : 0;

            return `<circle cx="${x + 5}" cy="${y - 4}" r="5" fill="${language.color}"/>
      <text x="${x + 18}" y="${y}" class="small">${escapeXml(truncate(language.language, 18))}</text>
      <text x="${x + 158}" y="${y}" class="label">${escapeXml(formatPercentage(percentage))}</text>
      <text x="${x + 218}" y="${y}" class="tiny">${escapeXml(plural(language.repositories, "repo"))}</text>`;
          })
          .join("")
      : `<text x="28" y="110" class="empty">No repository language composition data was reported for the scanned repositories.</text>`;

  return cardShell({
    width,
    height,
    title: "Engineering Language Footprint",
    iconName: "code",
    accent: THEME.cyan,
    subtitle: `Current composition across ${scopeSummary.personal} personal repositories + ${scopeSummary.publicContributed} public projects contributed to · project composition is separate from personal authorship`,
    body: `
      <defs>
        <clipPath id="language-bar">
          <rect x="${barX}" y="${barY}" width="${barWidth}" height="13" rx="6.5"/>
        </clipPath>
      </defs>
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

  if (projects.length === 0) {
    return cardShell({
      width,
      height: 132,
      title: "Public Open-Source Contributions",
      iconName: "branch",
      accent: THEME.green,
      subtitle: "Public repositories discovered from commits, pull requests, or reviews",
      body: `<text x="28" y="92" class="empty">No public contributed repositories were returned by GitHub.</text>`,
    });
  }

  // Keep the README readable. All discovered repositories still contribute
  // to aggregate language/framework cards; this card lists the largest 12.
  const visibleProjects = projects.slice(0, 12);
  const hiddenCount = Math.max(0, projects.length - visibleProjects.length);
  const layouts = [];
  let cursorY = 70;

  for (const project of visibleProjects) {
    const languageRows = Math.max(
      1,
      Math.ceil(project.languages.length / 4),
    );
    const blockHeight = 158 + languageRows * 28;
    layouts.push({ project, y: cursorY, blockHeight });
    cursorY += blockHeight + 14;
  }

  const footerHeight = hiddenCount > 0 ? 34 : 8;
  const height = cursorY + footerHeight;
  const body = layouts.map(({ project, y, blockHeight }) => {
    const barX = 28;
    const barY = y + 84;
    const barWidth = width - 56;
    let currentX = barX;

    const segments = project.languages.map((language) => {
      const segmentWidth = (language.percentage / 100) * barWidth;
      const segment = `<rect x="${currentX.toFixed(2)}" y="${barY}" width="${Math.max(0, segmentWidth).toFixed(2)}" height="12" fill="${language.color}"/>`;
      currentX += segmentWidth;
      return segment;
    }).join("");

    const legend = project.languages.length > 0
      ? project.languages.map((language, index) => {
          const column = index % 4;
          const row = Math.floor(index / 4);
          const x = 32 + column * 238;
          const legendY = y + 124 + row * 28;
          const fileText = language.files > 0
            ? plural(language.files, "file")
            : "GitHub detected";

          return `<circle cx="${x + 5}" cy="${legendY - 4}" r="5" fill="${language.color}"/>
      <text x="${x + 18}" y="${legendY}" class="small">${escapeXml(truncate(language.language, 15))}</text>
      <text x="${x + 126}" y="${legendY}" class="label">${escapeXml(formatPercentage(language.percentage))}</text>
      <text x="${x + 180}" y="${legendY}" class="tiny">${escapeXml(fileText)}</text>`;
        }).join("")
      : `<text x="32" y="${y + 130}" class="empty">No language composition was reported.</text>`;

    const projectParts = [
      `${compactNumber(project.lifecycle.commits)} project commits`,
      `${compactNumber(project.lifecycle.releases)} releases`,
      plural(project.languages.length, "language"),
      `${compactNumber(project.sourceFiles)} source files`,
      `${compactNumber(project.lifecycle.stars)} stars`,
      `${compactNumber(project.lifecycle.forks)} forks`,
    ];

    const personalParts = [
      `${compactNumber(project.personal.commits)} attributed commits`,
      `${compactNumber(project.personal.changedLines)} changed lines`,
      `${compactNumber(project.personal.files)} files touched`,
      `${compactNumber(project.authoredPullRequests)} authored PRs`,
      `${compactNumber(project.reviewedPullRequests)} PRs reviewed`,
      `evidence: ${(project.evidence ?? []).join(", ") || "GitHub contribution record"}`,
    ];

    const clipId = `public-${project.fullName.replace(/[^a-z0-9]/gi, "-")}`;

    return `<rect x="18" y="${y}" width="${width - 36}" height="${blockHeight}" rx="10" fill="${THEME.track}" stroke="${THEME.border}"/>
      ${icon("repo", 32, y + 16, THEME.green, 19)}
      <text x="60" y="${y + 31}" class="value">${escapeXml(project.fullName)}</text>
      <text x="32" y="${y + 55}" class="small">Full public project composition: ${escapeXml(projectParts.join(" · "))}</text>
      <text x="32" y="${y + 76}" class="label">Attributed to ${escapeXml(username)}: ${escapeXml(personalParts.join(" · "))}</text>
      <defs><clipPath id="${escapeXml(clipId)}"><rect x="${barX}" y="${barY}" width="${barWidth}" height="12" rx="6"/></clipPath></defs>
      <rect x="${barX}" y="${barY}" width="${barWidth}" height="12" rx="6" fill="${THEME.background}"/>
      <g clip-path="url(#${escapeXml(clipId)})">${segments}</g>
      ${legend}`;
  }).join("");

  const footer = hiddenCount > 0
    ? `<text x="28" y="${height - 16}" class="subtitle">${hiddenCount} additional contributed public repositories are included in aggregate language and framework statistics.</text>`
    : "";

  return cardShell({
    width,
    height,
    title: "Public Open-Source Contributions",
    iconName: "branch",
    accent: THEME.green,
    subtitle: "Full project composition for public repositories GitHub links to your commits, pull requests, or reviews · not a personal-authorship claim",
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

async function main() {
  console.log("Fetching authenticated account...");
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
    console.warn(
      "Some recursive Git trees were truncated by GitHub. Language totals remain available, but manifest/test/CI detection may be incomplete for those repositories.",
    );
  }

  console.log("Fetching contribution history...");
  const contributionHistory = await fetchAllContributionHistory();
  const streak = calculateStreak(contributionHistory.days);
  const recent365 = recentDays(contributionHistory.days, 365);
  const recentContributionTotal = recent365.reduce(
    (sum, day) => sum + day.contributionCount,
    0,
  );

  console.log("Fetching all-time collaboration counts...");
  const [
    pullRequests,
    mergedPullRequests,
    closedIssues,
  ] = await Promise.all([
    safeSearchCount(
      `author:${username} is:pr`,
      "Pull-request search",
      contributionHistory.totals.pullRequests,
    ),
    safeSearchCount(
      `author:${username} is:pr is:merged`,
      "Merged pull-request search",
      contributionHistory.totals.pullRequests,
    ),
    safeSearchCount(
      `author:${username} is:issue is:closed`,
      "Closed-issue search",
      contributionHistory.totals.issues,
    ),
  ]);

  console.log("Analyzing personal code contribution impact...");
  const personalCodeContributions =
    await analyzePersonalCodeContributions(repositorySelections);

  // Full project composition is included for repositories owned by the
  // profile user and for public repositories GitHub links to the user through
  // commits, pull requests, or pull-request reviews. Personal contribution
  // cards still count only attributable commits and review activity.
  const engineeringFootprintDetails = repositoryDetails.filter(
    (detail) =>
      detail.scope === REPOSITORY_SCOPE.PERSONAL ||
      detail.publicContribution,
  );
  const personalFootprintCount = engineeringFootprintDetails.filter(
    (detail) => detail.scope === REPOSITORY_SCOPE.PERSONAL,
  ).length;
  const publicContributedFootprintCount =
    engineeringFootprintDetails.filter(
      (detail) => detail.publicContribution,
    ).length;

  const languages = aggregateLanguages(engineeringFootprintDetails);
  const technologyDetection = buildTechnologyDetection(
    engineeringFootprintDetails,
  );
  const technologyImpact = buildTechnologyImpact(
    technologyDetection,
    personalCodeContributions,
  );
  const aiCards = buildAiEngineeringCards(
    repositoryDetails,
    personalCodeContributions.aiWorkflowActivity,
  );
  const domains = classifyDomains(technologyDetection.counts, languages);
  const publicContributionPortfolio = await buildPublicContributionPortfolio(
    repositoryDetails,
    personalCodeContributions,
  );

  const ninetyDaysAgo =
    Date.now() - 90 * 24 * 60 * 60 * 1_000;

  const activeRepositories = repositories.filter(
    (repository) =>
      repository.pushed_at &&
      new Date(repository.pushed_at).getTime() >= ninetyDaysAgo,
  ).length;

  const stars = repositories.reduce(
    (sum, repository) =>
      sum + safeInteger(repository.stargazers_count),
    0,
  );

  const portfolio = {
    total: repositories.length,
    public: repositories.filter((repository) => !repository.private).length,
    private: repositories.filter((repository) => repository.private).length,
    active: activeRepositories,
    archived: repositories.filter((repository) => repository.archived).length,
    documented: repositoryDetails.filter((detail) =>
      hasReadme(detail.paths),
    ).length,
    withTests: repositoryDetails.filter((detail) =>
      hasTests(detail.paths),
    ).length,
    withCi: repositoryDetails.filter((detail) =>
      hasCi(detail.paths),
    ).length,
    scanned: repositoryDetails.length,
  };

  const overview = {
    repositories: repositories.length,
    stars,
    recentContributions: recentContributionTotal,
    allTimeCommitContributions: contributionHistory.totals.commits,
    allTimePullRequests: pullRequests,
    followers: safeInteger(authenticatedUser.followers),
  };

  const delivery = {
    pullRequests,
    mergedPullRequests,
    reviewContributions: contributionHistory.totals.reviews,
    closedIssues,
    ciRepositories: portfolio.withCi,
    activeRepositories,
  };

  const ownedRepositories = repositories.filter(
    (repository) =>
      String(repository.owner?.login ?? "").toLowerCase() ===
      username.toLowerCase(),
  ).length;
  const publicOrganizationRepositories = repositories.filter(
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

await main();
