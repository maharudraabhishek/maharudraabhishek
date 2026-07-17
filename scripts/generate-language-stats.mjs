import fs from "node:fs/promises";
import path from "node:path";

const token = process.env.PRIVATE_STATS_TOKEN?.trim();
const username = process.env.GITHUB_USERNAME?.trim();
const maxRepositories = Number(process.env.MAX_REPOSITORIES ?? 200);
const concurrency = Math.max(1, Number(process.env.REPOSITORY_CONCURRENCY ?? 5));

if (!token) throw new Error("PRIVATE_STATS_TOKEN is missing.");
if (!username) throw new Error("GITHUB_USERNAME is missing.");

const API_VERSION = "2022-11-28";
const REST_HEADERS = {
  Accept: "application/vnd.github+json",
  Authorization: `Bearer ${token}`,
  "X-GitHub-Api-Version": API_VERSION,
  "User-Agent": `${username}-private-readme-analytics`,
};

const THEME = {
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
};

const LANGUAGE_COLORS = {
  Kotlin: "#A97BFF",
  Dart: "#00B4AB",
  Java: "#B07219",
  JavaScript: "#F1E05A",
  TypeScript: "#3178C6",
  Python: "#3572A5",
  Swift: "#F05138",
  "Objective-C": "#438EFF",
  "C++": "#F34B7D",
  C: "#555555",
  "C#": "#178600",
  Shell: "#89E051",
  PowerShell: "#012456",
  HTML: "#E34C26",
  CSS: "#563D7C",
  SCSS: "#C6538C",
  Vue: "#41B883",
  Go: "#00ADD8",
  Rust: "#DEA584",
  Ruby: "#701516",
  PHP: "#4F5D95",
  Dockerfile: "#384D54",
  HCL: "#844FBA",
  Makefile: "#427819",
  Groovy: "#4298B8",
  "Jupyter Notebook": "#DA5B0B",
  MDX: "#FCB32C",
  Lua: "#000080",
  R: "#198CE7",
  Scala: "#C22D40",
  ObjectiveC: "#438EFF",
};

const TECHNOLOGY_COLORS = {
  Android: "#3DDC84",
  "Jetpack Compose": "#4285F4",
  Flutter: "#02569B",
  React: "#61DAFB",
  "React Native": "#61DAFB",
  "Node.js": "#339933",
  Express: "#F0F6FC",
  Vite: "#646CFF",
  Strapi: "#4945FF",
  Supabase: "#3ECF8E",
  Firebase: "#FFCA28",
  PostgreSQL: "#4169E1",
  MongoDB: "#47A248",
  Docker: "#2496ED",
  "GitHub Actions": "#2088FF",
  AWS: "#FF9900",
  "Google Cloud": "#4285F4",
  DigitalOcean: "#0080FF",
  GraphQL: "#E10098",
  TensorFlow: "#FF6F00",
  PyTorch: "#EE4C2C",
  OpenAI: "#10A37F",
  LangChain: "#1C3C3C",
  Next.js: "#F0F6FC",
  TailwindCSS: "#38BDF8",
  "Spring Boot": "#6DB33F",
  Ktor: "#7F52FF",
  "GitHub Copilot": "#58A6FF",
};

const ICONS = {
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
};

function escapeXml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function number(value) {
  return new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(value ?? 0);
}

function icon(name, x, y, color, size = 16) {
  const content = ICONS[name] ?? ICONS.activity;
  return `<g transform="translate(${x} ${y}) scale(${size / 16})" fill="none" stroke="${color}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${content}</g>`;
}

function cardShell({ width, height, title, iconName, accent, body, subtitle = "" }) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeXml(title)}">
  <style>
    .title{fill:${THEME.title};font:600 18px -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
    .subtitle{fill:${THEME.muted};font:400 11px -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
    .label{fill:${THEME.muted};font:400 12px -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
    .value{fill:${THEME.text};font:600 18px -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
    .small{fill:${THEME.text};font:500 12px -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
    .tiny{fill:${THEME.muted};font:400 10px -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
  </style>
  <rect x=".5" y=".5" width="${width - 1}" height="${height - 1}" rx="12" fill="${THEME.background}" stroke="${THEME.border}"/>
  ${icon(iconName, 20, 17, accent, 18)}
  <text x="48" y="31" class="title">${escapeXml(title)}</text>
  ${subtitle ? `<text x="48" y="49" class="subtitle">${escapeXml(subtitle)}</text>` : ""}
  ${body}
</svg>`;
}

async function rest(url) {
  const response = await fetch(url, { headers: REST_HEADERS });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`GitHub REST request failed (${response.status}) for ${url}: ${body}`);
  }
  return response.json();
}

async function graphql(query, variables) {
  const response = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: { ...REST_HEADERS, "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables }),
  });
  const payload = await response.json();
  if (!response.ok || payload.errors) {
    throw new Error(`GitHub GraphQL request failed: ${JSON.stringify(payload.errors ?? payload)}`);
  }
  return payload.data;
}

async function fetchAllRepositories() {
  const repositories = [];
  for (let page = 1; repositories.length < maxRepositories; page += 1) {
    const pageItems = await rest(
      `https://api.github.com/user/repos?visibility=all&affiliation=owner,collaborator,organization_member&sort=updated&per_page=100&page=${page}`,
    );
    repositories.push(...pageItems);
    if (pageItems.length < 100) break;
  }
  return repositories.slice(0, maxRepositories);
}

async function mapLimit(items, limit, worker) {
  const results = new Array(items.length);
  let index = 0;
  async function run() {
    while (index < items.length) {
      const current = index++;
      try {
        results[current] = await worker(items[current], current);
      } catch (error) {
        console.warn(`Skipped ${items[current]?.full_name ?? "item"}: ${error.message}`);
        results[current] = null;
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length || 1) }, run));
  return results;
}

function isEligibleRepository(repo) {
  return !repo.fork && !repo.archived && !repo.disabled;
}

async function fetchRepoDetails(repo) {
  const [languages, tree] = await Promise.all([
    rest(repo.languages_url),
    rest(`https://api.github.com/repos/${repo.full_name}/git/trees/${encodeURIComponent(repo.default_branch)}?recursive=1`),
  ]);

  const paths = new Set((tree.tree ?? []).filter((item) => item.type === "blob").map((item) => item.path.toLowerCase()));
  return { repo, languages, paths };
}

async function fetchContributionData() {
  const to = new Date();
  const from = new Date(to);
  from.setUTCFullYear(from.getUTCFullYear() - 1);

  const query = `
    query($login:String!, $from:DateTime!, $to:DateTime!) {
      user(login:$login) {
        contributionsCollection(from:$from, to:$to) {
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
    }`;

  const data = await graphql(query, {
    login: username,
    from: from.toISOString(),
    to: to.toISOString(),
  });
  return data.user.contributionsCollection;
}

async function searchCount(query) {
  const result = await rest(`https://api.github.com/search/issues?q=${encodeURIComponent(query)}&per_page=1`);
  return result.total_count ?? 0;
}

function aggregateLanguages(details) {
  const totals = new Map();
  const repoCounts = new Map();

  for (const detail of details.filter(Boolean)) {
    for (const [language, bytes] of Object.entries(detail.languages)) {
      totals.set(language, (totals.get(language) ?? 0) + bytes);
      repoCounts.set(language, (repoCounts.get(language) ?? 0) + 1);
    }
  }

  return [...totals.entries()]
    .map(([language, bytes]) => ({
      language,
      bytes,
      repositories: repoCounts.get(language) ?? 0,
      color: LANGUAGE_COLORS[language] ?? fallbackColor(language),
    }))
    .sort((a, b) => b.bytes - a.bytes);
}

function fallbackColor(seed) {
  const palette = [THEME.blue, THEME.green, THEME.purple, THEME.orange, THEME.yellow, THEME.pink, THEME.cyan, THEME.red];
  let hash = 0;
  for (const char of seed) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return palette[hash % palette.length];
}

function detectTechnologies(paths) {
  const found = new Set();
  const has = (value) => paths.has(value);
  const any = (predicate) => [...paths].some(predicate);

  if (has("settings.gradle.kts") || has("settings.gradle") || has("gradlew")) found.add("Android");
  if (has("gradle/libs.versions.toml") && any((p) => p.endsWith(".kt"))) found.add("Jetpack Compose");
  if (has("pubspec.yaml")) found.add("Flutter");
  if (has("package.json")) found.add("Node.js");
  if (has("vite.config.ts") || has("vite.config.js")) found.add("Vite");
  if (has("next.config.js") || has("next.config.mjs") || has("next.config.ts")) found.add("Next.js");
  if (any((p) => p.includes("src/") && (p.endsWith(".tsx") || p.endsWith(".jsx")))) found.add("React");
  if (has("android/app/build.gradle") && has("ios/podfile") && has("package.json")) found.add("React Native");
  if (any((p) => p.endsWith("tailwind.config.js") || p.endsWith("tailwind.config.ts"))) found.add("TailwindCSS");
  if (has("config/database.ts") || has("config/database.js")) found.add("Strapi");
  if (has("supabase/config.toml") || any((p) => p.startsWith("supabase/migrations/"))) found.add("Supabase");
  if (has("firebase.json") || has(".firebaserc")) found.add("Firebase");
  if (has("dockerfile") || any((p) => p.endsWith("/dockerfile")) || has("docker-compose.yml") || has("compose.yml")) found.add("Docker");
  if (any((p) => p.startsWith(".github/workflows/") && (p.endsWith(".yml") || p.endsWith(".yaml")))) found.add("GitHub Actions");
  if (has("serverless.yml") || any((p) => p.includes("aws"))) found.add("AWS");
  if (has("app.yaml") || any((p) => p.includes("google-cloud"))) found.add("Google Cloud");
  if (any((p) => p.includes("digitalocean"))) found.add("DigitalOcean");
  if (any((p) => p.endsWith(".graphql") || p.endsWith(".gql"))) found.add("GraphQL");
  if (has("requirements.txt") || has("pyproject.toml")) {
    if (any((p) => p.includes("tensorflow"))) found.add("TensorFlow");
    if (any((p) => p.includes("torch"))) found.add("PyTorch");
  }
  if (any((p) => p.endsWith("build.gradle.kts") || p.endsWith("build.gradle"))) {
    if (any((p) => p.includes("ktor"))) found.add("Ktor");
    if (any((p) => p.includes("spring"))) found.add("Spring Boot");
  }

  return found;
}

function classifyDomains(technologies, languages) {
  const scores = new Map([
    ["Mobile Engineering", 0],
    ["Full-Stack Development", 0],
    ["Backend & APIs", 0],
    ["AI/ML & RAG", 0],
    ["Cloud & DevOps", 0],
    ["Developer Tooling", 0],
    ["Data Engineering", 0],
  ]);

  const add = (domain, value) => scores.set(domain, (scores.get(domain) ?? 0) + value);

  for (const tech of technologies) {
    if (["Android", "Jetpack Compose", "Flutter", "React Native"].includes(tech)) add("Mobile Engineering", 3);
    if (["React", "Vite", "Next.js", "Strapi"].includes(tech)) add("Full-Stack Development", 2);
    if (["Node.js", "Express", "Ktor", "Spring Boot", "GraphQL"].includes(tech)) add("Backend & APIs", 2);
    if (["TensorFlow", "PyTorch", "OpenAI", "LangChain"].includes(tech)) add("AI/ML & RAG", 3);
    if (["Docker", "GitHub Actions", "AWS", "Google Cloud", "DigitalOcean"].includes(tech)) add("Cloud & DevOps", 2);
    if (["GitHub Actions", "GitHub Copilot"].includes(tech)) add("Developer Tooling", 1);
    if (["PostgreSQL", "MongoDB", "Supabase"].includes(tech)) add("Data Engineering", 1);
  }

  for (const item of languages.slice(0, 10)) {
    if (["Kotlin", "Dart", "Swift", "Objective-C", "Java"].includes(item.language)) add("Mobile Engineering", 1);
    if (["JavaScript", "TypeScript", "HTML", "CSS", "SCSS"].includes(item.language)) add("Full-Stack Development", 1);
    if (["Python", "Jupyter Notebook", "R"].includes(item.language)) add("AI/ML & RAG", 1);
    if (["Shell", "PowerShell", "Dockerfile", "HCL"].includes(item.language)) add("Cloud & DevOps", 1);
  }

  return [...scores.entries()]
    .map(([name, score]) => ({ name, score }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score);
}

function calculateStreak(days) {
  const sorted = [...days].sort((a, b) => a.date.localeCompare(b.date));
  let longest = 0;
  let running = 0;
  let current = 0;
  let activeDays = 0;
  let first = null;
  let latest = null;
  const weekdayCounts = Array(7).fill(0);

  for (const day of sorted) {
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

  for (let index = sorted.length - 1; index >= 0; index -= 1) {
    if (sorted[index].contributionCount > 0) current += 1;
    else break;
  }

  const weekdayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const mostActiveWeekday = weekdayNames[weekdayCounts.indexOf(Math.max(...weekdayCounts))];

  return { current, longest, activeDays, first, latest, mostActiveWeekday };
}

function metricGrid(metrics, startY = 72, columns = 2, width = 520) {
  const cellWidth = (width - 40) / columns;
  return metrics.map((metric, index) => {
    const column = index % columns;
    const row = Math.floor(index / columns);
    const x = 20 + column * cellWidth;
    const y = startY + row * 62;
    return `${icon(metric.icon, x, y - 13, metric.color, 16)}
      <text x="${x + 26}" y="${y}" class="value">${escapeXml(metric.value)}</text>
      <text x="${x + 26}" y="${y + 18}" class="label">${escapeXml(metric.label)}</text>`;
  }).join("");
}

function renderOverview(data) {
  const metrics = [
    { icon: "repo", color: THEME.blue, value: number(data.repositories), label: "Accessible repositories" },
    { icon: "star", color: THEME.yellow, value: number(data.stars), label: "Stars received" },
    { icon: "commit", color: THEME.cyan, value: number(data.yearContributions), label: "Contributions · 12 months" },
    { icon: "pull", color: THEME.purple, value: number(data.pullRequests), label: "Pull requests opened" },
    { icon: "issue", color: THEME.orange, value: number(data.issues), label: "Issues opened" },
    { icon: "people", color: THEME.pink, value: number(data.followers), label: "Followers" },
  ];
  return cardShell({
    width: 520, height: 280, title: "GitHub Overview", iconName: "star", accent: THEME.yellow,
    subtitle: "Public + token-accessible private activity",
    body: metricGrid(metrics, 78, 2, 520),
  });
}

function renderStreak(streak) {
  const metrics = [
    { icon: "flame", color: THEME.orange, value: `${streak.current} days`, label: "Current streak" },
    { icon: "star", color: THEME.yellow, value: `${streak.longest} days`, label: "Longest streak · 12 months" },
    { icon: "activity", color: THEME.green, value: number(streak.activeDays), label: "Active days · 12 months" },
    { icon: "commit", color: THEME.cyan, value: streak.mostActiveWeekday, label: "Most active weekday" },
  ];
  return cardShell({
    width: 520, height: 230, title: "Contribution Streak", iconName: "flame", accent: THEME.orange,
    subtitle: "Based on GitHub contribution calendar data",
    body: metricGrid(metrics, 80, 2, 520),
  });
}

function renderActivity(days) {
  const width = 780;
  const height = 210;
  const chartX = 28;
  const chartY = 70;
  const chartW = width - 56;
  const chartH = 95;
  const recent = days.slice(-365);
  const max = Math.max(1, ...recent.map((d) => d.contributionCount));
  const points = recent.map((day, i) => {
    const x = chartX + (i / Math.max(1, recent.length - 1)) * chartW;
    const y = chartY + chartH - (day.contributionCount / max) * chartH;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
  const area = `${chartX},${chartY + chartH} ${points} ${chartX + chartW},${chartY + chartH}`;
  const monthTotals = new Map();
  for (const day of recent) {
    const month = day.date.slice(0, 7);
    monthTotals.set(month, (monthTotals.get(month) ?? 0) + day.contributionCount);
  }
  const months = [...monthTotals.entries()].slice(-12);
  const labels = months.map(([month], i) => {
    const x = chartX + (i / Math.max(1, months.length - 1)) * chartW;
    return `<text x="${x}" y="190" text-anchor="${i === 0 ? "start" : i === months.length - 1 ? "end" : "middle"}" class="tiny">${escapeXml(month)}</text>`;
  }).join("");

  return cardShell({
    width, height, title: "Activity Timeline", iconName: "activity", accent: THEME.green,
    subtitle: "Daily contributions across the last 12 months",
    body: `
      <defs><linearGradient id="area" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${THEME.blue}" stop-opacity=".45"/><stop offset="1" stop-color="${THEME.blue}" stop-opacity="0"/></linearGradient></defs>
      <line x1="${chartX}" y1="${chartY + chartH}" x2="${chartX + chartW}" y2="${chartY + chartH}" stroke="${THEME.border}"/>
      <polygon points="${area}" fill="url(#area)"/>
      <polyline points="${points}" fill="none" stroke="${THEME.blue}" stroke-width="2"/>
      ${labels}
    `,
  });
}

function renderLanguages(languages) {
  const width = 780;
  const top = languages.slice(0, 18);
  const total = languages.reduce((sum, item) => sum + item.bytes, 0);
  const columns = 2;
  const rows = Math.ceil(top.length / columns);
  const height = 118 + rows * 34;
  let currentX = 28;
  const barWidth = width - 56;
  const segments = top.map((item) => {
    const segmentWidth = total ? (item.bytes / total) * barWidth : 0;
    const rect = `<rect x="${currentX.toFixed(2)}" y="67" width="${Math.max(.8, segmentWidth).toFixed(2)}" height="13" fill="${item.color}"/>`;
    currentX += segmentWidth;
    return rect;
  }).join("");

  const legend = top.map((item, index) => {
    const column = index % columns;
    const row = Math.floor(index / columns);
    const x = 28 + column * 376;
    const y = 108 + row * 34;
    const percentage = total ? (item.bytes / total) * 100 : 0;
    return `<circle cx="${x + 5}" cy="${y - 4}" r="5" fill="${item.color}"/>
      <text x="${x + 18}" y="${y}" class="small">${escapeXml(item.language)}</text>
      <text x="${x + 190}" y="${y}" class="label">${percentage.toFixed(1)}%</text>
      <text x="${x + 262}" y="${y}" class="tiny">${item.repositories} repos</text>`;
  }).join("");

  return cardShell({
    width, height, title: "Language Spectrum", iconName: "code", accent: THEME.cyan,
    subtitle: "GitHub Linguist bytes across selected public + private repositories",
    body: `<defs><clipPath id="langbar"><rect x="28" y="67" width="${barWidth}" height="13" rx="6.5"/></clipPath></defs>
      <rect x="28" y="67" width="${barWidth}" height="13" rx="6.5" fill="${THEME.track}"/>
      <g clip-path="url(#langbar)">${segments}</g>
      ${legend}`,
  });
}

function renderTechnologies(technologyCounts) {
  const width = 780;
  const items = [...technologyCounts.entries()]
    .map(([name, count]) => ({ name, count, color: TECHNOLOGY_COLORS[name] ?? fallbackColor(name) }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 24);
  const columns = 3;
  const rows = Math.ceil(items.length / columns);
  const height = 92 + rows * 42;
  const max = Math.max(1, ...items.map((item) => item.count));

  const body = items.map((item, index) => {
    const column = index % columns;
    const row = Math.floor(index / columns);
    const x = 24 + column * 250;
    const y = 78 + row * 42;
    const w = (item.count / max) * 116;
    return `<circle cx="${x + 5}" cy="${y - 5}" r="5" fill="${item.color}"/>
      <text x="${x + 18}" y="${y}" class="small">${escapeXml(item.name)}</text>
      <rect x="${x + 118}" y="${y - 12}" width="116" height="7" rx="3.5" fill="${THEME.track}"/>
      <rect x="${x + 118}" y="${y - 12}" width="${w.toFixed(1)}" height="7" rx="3.5" fill="${item.color}"/>
      <text x="${x + 238}" y="${y}" text-anchor="end" class="tiny">${item.count}</text>`;
  }).join("");

  return cardShell({
    width, height, title: "Frameworks & Platforms", iconName: "package", accent: THEME.purple,
    subtitle: "Detected from repository manifests, configuration and project structure",
    body,
  });
}

function renderDomains(domains) {
  const width = 620;
  const total = domains.reduce((sum, item) => sum + item.score, 0);
  const height = 90 + domains.length * 45;
  const colors = [THEME.blue, THEME.purple, THEME.green, THEME.orange, THEME.cyan, THEME.yellow, THEME.pink];

  const body = domains.map((item, index) => {
    const y = 80 + index * 45;
    const percentage = total ? (item.score / total) * 100 : 0;
    const w = (percentage / 100) * 300;
    const color = colors[index % colors.length];
    return `${icon(index === 0 ? "layers" : "code", 24, y - 17, color, 15)}
      <text x="50" y="${y}" class="small">${escapeXml(item.name)}</text>
      <rect x="260" y="${y - 12}" width="300" height="9" rx="4.5" fill="${THEME.track}"/>
      <rect x="260" y="${y - 12}" width="${w.toFixed(1)}" height="9" rx="4.5" fill="${color}"/>
      <text x="590" y="${y}" text-anchor="end" class="label">${percentage.toFixed(0)}%</text>`;
  }).join("");

  return cardShell({
    width, height, title: "Engineering Domains", iconName: "layers", accent: THEME.blue,
    subtitle: "Derived from detected technologies and language composition",
    body,
  });
}

function renderDelivery(data) {
  const metrics = [
    { icon: "pull", color: THEME.purple, value: number(data.pullRequests), label: "Pull requests opened" },
    { icon: "pull", color: THEME.green, value: number(data.mergedPullRequests), label: "Pull requests merged" },
    { icon: "people", color: THEME.cyan, value: number(data.reviews), label: "Reviews submitted" },
    { icon: "issue", color: THEME.orange, value: number(data.closedIssues), label: "Issues closed" },
    { icon: "workflow", color: THEME.blue, value: number(data.ciRepositories), label: "Repositories with CI/CD" },
    { icon: "activity", color: THEME.yellow, value: number(data.activeRepositories), label: "Updated in last 90 days" },
  ];
  return cardShell({
    width: 520, height: 280, title: "Delivery & Collaboration", iconName: "rocket", accent: THEME.green,
    subtitle: "Personal contribution and repository-delivery signals",
    body: metricGrid(metrics, 78, 2, 520),
  });
}

function renderPortfolio(data) {
  const metrics = [
    { icon: "repo", color: THEME.blue, value: number(data.total), label: "Total repositories" },
    { icon: "unlock", color: THEME.green, value: number(data.public), label: "Public repositories" },
    { icon: "lock", color: THEME.purple, value: number(data.private), label: "Private repositories" },
    { icon: "activity", color: THEME.orange, value: number(data.active), label: "Updated in last 90 days" },
    { icon: "docs", color: THEME.cyan, value: number(data.documented), label: "Repositories with README" },
    { icon: "test", color: THEME.green, value: number(data.withTests), label: "Repositories with tests" },
    { icon: "workflow", color: THEME.blue, value: number(data.withCi), label: "Repositories with CI/CD" },
    { icon: "repo", color: THEME.muted, value: number(data.archived), label: "Archived repositories" },
  ];
  return cardShell({
    width: 520, height: 340, title: "Repository Portfolio", iconName: "repo", accent: THEME.blue,
    subtitle: "Aggregate-only view; private repository names are never rendered",
    body: metricGrid(metrics, 78, 2, 520),
  });
}

function hasReadme(paths) {
  return [...paths].some((p) => /^readme(\.[a-z0-9]+)?$/.test(p) || p.endsWith("/readme.md"));
}

function hasTests(paths) {
  return [...paths].some((p) =>
    p.includes("/test/") ||
    p.includes("/tests/") ||
    p.includes("/androidtest/") ||
    p.endsWith(".test.js") ||
    p.endsWith(".test.ts") ||
    p.endsWith(".spec.js") ||
    p.endsWith(".spec.ts") ||
    p.endsWith("_test.dart") ||
    p.endsWith("test.kt"),
  );
}

function hasCi(paths) {
  return [...paths].some((p) => p.startsWith(".github/workflows/") && (p.endsWith(".yml") || p.endsWith(".yaml")));
}

const outputDirectory = path.resolve("assets");
await fs.mkdir(outputDirectory, { recursive: true });

console.log("Fetching repositories...");
const repositories = await fetchAllRepositories();
const eligible = repositories.filter(isEligibleRepository);
console.log(`Accessible repositories: ${repositories.length}; eligible for deep scan: ${eligible.length}`);

const details = await mapLimit(eligible, concurrency, fetchRepoDetails);
const validDetails = details.filter(Boolean);

console.log("Fetching contribution and collaboration analytics...");
const [
  contributions,
  pullRequests,
  mergedPullRequests,
  issues,
  closedIssues,
  reviews,
  authenticatedUser,
] = await Promise.all([
  fetchContributionData(),
  searchCount(`author:${username} type:pr`),
  searchCount(`author:${username} type:pr is:merged`),
  searchCount(`author:${username} type:issue`),
  searchCount(`author:${username} type:issue is:closed`),
  searchCount(`reviewed-by:${username} type:pr`),
  rest("https://api.github.com/user"),
]);

const days = contributions.contributionCalendar.weeks.flatMap((week) => week.contributionDays);
const streak = calculateStreak(days);
const languages = aggregateLanguages(validDetails);

const technologyCounts = new Map();
for (const detail of validDetails) {
  for (const technology of detectTechnologies(detail.paths)) {
    technologyCounts.set(technology, (technologyCounts.get(technology) ?? 0) + 1);
  }
}

const domains = classifyDomains(new Set(technologyCounts.keys()), languages);
const ninetyDaysAgo = Date.now() - 90 * 24 * 60 * 60 * 1000;
const activeRepositories = eligible.filter((repo) => new Date(repo.pushed_at).getTime() >= ninetyDaysAgo).length;
const stars = repositories.reduce((sum, repo) => sum + (repo.stargazers_count ?? 0), 0);

const portfolio = {
  total: repositories.length,
  public: repositories.filter((repo) => !repo.private).length,
  private: repositories.filter((repo) => repo.private).length,
  active: activeRepositories,
  archived: repositories.filter((repo) => repo.archived).length,
  documented: validDetails.filter((detail) => hasReadme(detail.paths)).length,
  withTests: validDetails.filter((detail) => hasTests(detail.paths)).length,
  withCi: validDetails.filter((detail) => hasCi(detail.paths)).length,
};

const overview = {
  repositories: repositories.length,
  stars,
  yearContributions: contributions.contributionCalendar.totalContributions,
  pullRequests,
  issues,
  followers: authenticatedUser.followers ?? 0,
};

const delivery = {
  pullRequests,
  mergedPullRequests,
  reviews,
  closedIssues,
  ciRepositories: portfolio.withCi,
  activeRepositories,
};

const cards = {
  "github-overview.svg": renderOverview(overview),
  "contribution-streak.svg": renderStreak(streak),
  "activity-timeline.svg": renderActivity(days),
  "language-spectrum.svg": renderLanguages(languages),
  "frameworks-platforms.svg": renderTechnologies(technologyCounts),
  "engineering-domains.svg": renderDomains(domains),
  "delivery-collaboration.svg": renderDelivery(delivery),
  "repository-portfolio.svg": renderPortfolio(portfolio),
};

for (const [filename, svg] of Object.entries(cards)) {
  await fs.writeFile(path.join(outputDirectory, filename), svg.trim(), "utf8");
  console.log(`Generated assets/${filename}`);
}

console.log("Engineering analytics generation completed.");
