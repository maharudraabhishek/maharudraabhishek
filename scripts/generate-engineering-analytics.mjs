import fs from "node:fs/promises";
import path from "node:path";

const API_VERSION = "2022-11-28";
const GRAPHQL_ENDPOINT = "https://api.github.com/graphql";
const REST_ENDPOINT = "https://api.github.com";
const MAX_RETRY_DELAY_MS = 60_000;
const REQUEST_RETRIES = 4;
const MAX_CONTENT_BYTES = 1_000_000;

const token = requiredEnvironment("PRIVATE_STATS_TOKEN");
const username = requiredEnvironment("GITHUB_USERNAME");

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
});

const REST_HEADERS = Object.freeze({
  Accept: "application/vnd.github+json",
  Authorization: `Bearer ${token}`,
  "X-GitHub-Api-Version": API_VERSION,
  "User-Agent": `${username}-private-readme-analytics`,
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
  Solidity: "#AA6746",
  Svelte: "#FF3E00",
  Swift: "#F05138",
  TeX: "#3D6117",
  TypeScript: "#3178C6",
  Vue: "#41B883",
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
  } = {},
) {
  for (let attempt = 0; attempt <= REQUEST_RETRIES; attempt += 1) {
    const response = await fetch(url, {
      method,
      headers,
      body,
    });

    const rawBody = await response.text();

    if (response.ok) {
      if (!rawBody) return null;
      try {
        return JSON.parse(rawBody);
      } catch {
        throw new Error(`${label} returned invalid JSON.`);
      }
    }

    if (optionalStatuses.includes(response.status)) {
      return null;
    }

    if (response.status === 401) {
      throw new Error(`${label} failed: GitHub rejected the token.`);
    }

    const retryable =
      response.status === 403 ||
      response.status === 429 ||
      response.status === 502 ||
      response.status === 503 ||
      response.status === 504;

    if (!retryable || attempt === REQUEST_RETRIES) {
      const message = parseGitHubError(rawBody);
      throw new Error(
        `${label} failed with HTTP ${response.status}${message ? `: ${message}` : "."}`,
      );
    }

    const delay = retryDelayMilliseconds(response, attempt);
    console.warn(
      `${label} was rate-limited or temporarily unavailable; retrying in ${Math.ceil(delay / 1_000)}s.`,
    );
    await sleep(delay);
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

function retryDelayMilliseconds(response, attempt) {
  const retryAfter = Number(response.headers.get("retry-after"));
  if (Number.isFinite(retryAfter) && retryAfter > 0) {
    return Math.min(retryAfter * 1_000, MAX_RETRY_DELAY_MS);
  }

  const resetAt = Number(response.headers.get("x-ratelimit-reset"));
  if (Number.isFinite(resetAt) && resetAt > 0) {
    const untilReset = resetAt * 1_000 - Date.now() + 1_000;
    if (untilReset > 0) {
      return Math.min(untilReset, MAX_RETRY_DELAY_MS);
    }
  }

  return Math.min(1_000 * 2 ** attempt, MAX_RETRY_DELAY_MS);
}

async function rest(pathOrUrl, options = {}) {
  const url = pathOrUrl.startsWith("http")
    ? pathOrUrl
    : `${REST_ENDPOINT}${pathOrUrl}`;
  return requestJson(url, options);
}

async function graphql(query, variables, label) {
  const payload = await requestJson(GRAPHQL_ENDPOINT, {
    method: "POST",
    headers: {
      ...REST_HEADERS,
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

function repositoryIsExcluded(repository) {
  const fullName = repository.full_name.toLowerCase();
  const shortName = repository.name.toLowerCase();
  return (
    config.excludedRepositories.has(fullName) ||
    config.excludedRepositories.has(shortName)
  );
}

function repositoryIsEligibleForScanning(repository) {
  if (repository.disabled) return false;
  if (!repository.default_branch) return false;
  if (!config.includeForkedRepositories && repository.fork) return false;
  if (!config.includeArchivedRepositories && repository.archived) return false;
  if (repositoryIsExcluded(repository)) return false;
  return true;
}

function manifestCandidate(entry) {
  if (entry.type !== "blob") return false;
  if (safeInteger(entry.size) > MAX_CONTENT_BYTES) return false;

  const lowerPath = entry.path.toLowerCase();
  const baseName = lowerPath.split("/").at(-1);

  if (MANIFEST_BASENAMES.has(baseName)) return true;
  if (/requirements[^/]*\.txt$/.test(baseName)) return true;
  return false;
}

function encodeRepositoryPath(value) {
  return value
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

async function fetchRepositoryContent(repository, filePath) {
  const encodedPath = encodeRepositoryPath(filePath);
  const encodedReference = encodeURIComponent(repository.default_branch);

  const response = await rest(
    `/repos/${repository.full_name}/contents/${encodedPath}?ref=${encodedReference}`,
    {
      label: "Repository manifest request",
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

async function fetchRepositoryDetails(repository) {
  const languagesPromise = rest(repository.languages_url, {
    label: "Repository languages request",
  });

  const treePromise = rest(
    `/repos/${repository.full_name}/git/trees/${encodeURIComponent(repository.default_branch)}?recursive=1`,
    {
      label: "Repository tree request",
      optionalStatuses: [404, 409, 422],
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
    .slice(0, config.maxManifestFilesPerRepository);

  const manifestResults = await mapLimit(
    manifestEntries,
    config.manifestConcurrency,
    async (entry) => ({
      path: entry.path,
      content: await fetchRepositoryContent(repository, entry.path),
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

async function searchCount(query, label) {
  const response = await rest(
    `/search/issues?q=${encodeURIComponent(query)}&per_page=1`,
    { label },
  );
  return safeInteger(response?.total_count);
}

async function safeSearchCount(query, label, fallback) {
  try {
    return await searchCount(query, label);
  } catch (error) {
    console.warn(`${label} unavailable; using contribution-history fallback.`);
    return fallback;
  }
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

function aggregateTechnologies(repositoryDetails) {
  const counts = new Map();

  for (const detail of repositoryDetails) {
    const profile = buildRepositoryProfile(detail);
    for (const technology of detectTechnologies(profile)) {
      counts.set(technology, (counts.get(technology) ?? 0) + 1);
    }
  }

  return counts;
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
    title: "Activity Timeline",
    iconName: "activity",
    accent: THEME.green,
    subtitle: `${compactNumber(recentTotal)} contributions across the last 12 months · weekly totals`,
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

function renderLanguages(languages, scannedRepositoryCount) {
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
      <text x="${x + 158}" y="${y}" class="label">${percentage.toFixed(1)}%</text>
      <text x="${x + 218}" y="${y}" class="tiny">${escapeXml(plural(language.repositories, "repo"))}</text>`;
          })
          .join("")
      : `<text x="28" y="110" class="empty">No language bytes were reported for the scanned repositories.</text>`;

  return cardShell({
    width,
    height,
    title: "Language Spectrum",
    iconName: "code",
    accent: THEME.cyan,
    subtitle: `All detected languages · GitHub Linguist bytes across ${scannedRepositoryCount} scanned repositories`,
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
  technologyCounts,
  scannedRepositoryCount,
) {
  const width = 900;
  const items = [...technologyCounts.entries()]
    .map(([name, repositoryCount]) => ({
      name,
      repositoryCount,
      color: TECHNOLOGY_COLORS[name] ?? fallbackColor(name),
    }))
    .sort(
      (first, second) =>
        second.repositoryCount - first.repositoryCount ||
        first.name.localeCompare(second.name),
    );

  const columns = 3;
  const rows = Math.max(1, Math.ceil(items.length / columns));
  const height = 100 + rows * 42;
  const maximum = Math.max(
    1,
    ...items.map((item) => item.repositoryCount),
  );

  const body =
    items.length > 0
      ? items
          .map((item, index) => {
            const column = index % columns;
            const row = Math.floor(index / columns);
            const x = 24 + column * 292;
            const y = 82 + row * 42;
            const widthValue =
              (item.repositoryCount / maximum) * 118;

            return `<circle cx="${x + 5}" cy="${y - 5}" r="5" fill="${item.color}"/>
      <text x="${x + 18}" y="${y}" class="small">${escapeXml(truncate(item.name, 18))}</text>
      <rect x="${x + 140}" y="${y - 12}" width="118" height="7" rx="3.5" fill="${THEME.track}"/>
      <rect x="${x + 140}" y="${y - 12}" width="${widthValue.toFixed(1)}" height="7" rx="3.5" fill="${item.color}"/>
      <text x="${x + 270}" y="${y}" text-anchor="end" class="tiny">${item.repositoryCount}</text>`;
          })
          .join("")
      : `<text x="28" y="86" class="empty">No supported frameworks or platforms were detected.</text>`;

  return cardShell({
    width,
    height,
    title: "Frameworks & Platforms",
    iconName: "package",
    accent: THEME.purple,
    subtitle: `Repository count where detected · manifests and project structure across ${scannedRepositoryCount} repositories`,
    body,
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

  console.log("Fetching token-accessible repositories...");
  const repositories = await fetchAllRepositories();
  const repositoriesForScanning = repositories.filter(
    repositoryIsEligibleForScanning,
  );

  console.log(
    `Repositories listed: ${repositories.length}; selected for deep scan: ${repositoriesForScanning.length}.`,
  );

  const scanResults = await mapLimit(
    repositoriesForScanning,
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
    const repository = repositoriesForScanning[index];

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
    repositoriesForScanning.length > 0 &&
    repositoryDetails.length === 0
  ) {
    throw new Error(
      "No repositories could be scanned. Ensure PRIVATE_STATS_TOKEN has Contents: read access to the selected repositories.",
    );
  }

  const scanSuccessRatio =
    repositoriesForScanning.length === 0
      ? 1
      : repositoryDetails.length / repositoriesForScanning.length;

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

  const languages = aggregateLanguages(repositoryDetails);
  const technologyCounts = aggregateTechnologies(repositoryDetails);
  const domains = classifyDomains(technologyCounts, languages);

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

  const cards = {
    "github-overview.svg": renderOverview(overview),
    "contribution-streak.svg": renderStreak(streak),
    "activity-timeline.svg": renderActivity(contributionHistory.days),
    "language-spectrum.svg": renderLanguages(
      languages,
      repositoryDetails.length,
    ),
    "frameworks-platforms.svg": renderTechnologies(
      technologyCounts,
      repositoryDetails.length,
    ),
    "engineering-domains.svg": renderDomains(domains),
    "delivery-collaboration.svg": renderDelivery(delivery),
    "repository-portfolio.svg": renderPortfolio(portfolio),
  };

  await writeCards(cards);

  console.log(
    `Analytics complete: ${languages.length} languages, ${technologyCounts.size} frameworks/platforms, ${repositoryDetails.length} repositories scanned.`,
  );
}

await main();
