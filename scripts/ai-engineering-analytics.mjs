/**
 * AI engineering analytics
 *
 * This module derives evidence-based AI engineering disciplines from
 * repository paths and a bounded set of configuration/source files already
 * fetched by the main generator. It never estimates the percentage of code
 * produced by AI and never renders private repository names or file contents.
 */

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

const ICONS = Object.freeze({
  brain: `<path d="M6 2.2A2.8 2.8 0 0 0 3.4 5a2.8 2.8 0 0 0 .7 5.4A2.7 2.7 0 0 0 8 13V3.5A2 2 0 0 0 6 1.5M10 2.2A2.8 2.8 0 0 1 12.6 5a2.8 2.8 0 0 1-.7 5.4A2.7 2.7 0 0 1 8 13V3.5a2 2 0 0 1 2-2M4.2 6.2h2M9.8 6.2h2M5 9h1.5M9.5 9H11"/>`,
  bot: `<rect x="2" y="4" width="12" height="9" rx="2"/><path d="M8 1v3M5 8h.01M11 8h.01M5 11h6M1 7h1M14 7h1"/>`,
  network: `<circle cx="8" cy="3" r="2"/><circle cx="3" cy="12" r="2"/><circle cx="13" cy="12" r="2"/><path d="M7 5 4 10M9 5l3 5M5 12h6"/>`,
  tool: `<path d="M10.5 2.2a3.5 3.5 0 0 0-4.2 4.5L2 11l3 3 4.3-4.3a3.5 3.5 0 0 0 4.5-4.2l-2.2 2.2-2.3-.6-.6-2.3 1.8-2.6z"/>`,
  shield: `<path d="M8 1.5 14 4v4c0 3.4-2.2 5.8-6 7-3.8-1.2-6-3.6-6-7V4l6-2.5zM5.5 8l1.6 1.6L11 5.7"/>`,
  docs: `<path d="M3 1h7l3 3v11H3zM10 1v4h3M5 8h6M5 11h6"/>`,
  activity: `<path d="M1 8h3l2-5 4 10 2-5h3"/>`,
  calendar: `<rect x="2" y="3" width="12" height="11" rx="2"/><path d="M5 1v4M11 1v4M2 7h12"/>`,
  trophy: `<path d="M5 2h6v3a3 3 0 0 1-6 0V2zM6 10h4M8 8v5M5 14h6M3 3H1v1a3 3 0 0 0 3 3M13 3h2v1a3 3 0 0 1-3 3"/>`,
  layers: `<path d="M8 1l7 4-7 4-7-4 7-4zM1 8l7 4 7-4M1 11l7 4 7-4"/>`,
  lock: `<rect x="3" y="7" width="10" height="8" rx="2"/><path d="M5 7V5a3 3 0 0 1 6 0v2"/>`,
  code: `<path d="M6 3L1 8l5 5M10 3l5 5-5 5"/>`,
  spark: `<path d="M8 1l1.4 4.6L14 7l-4.6 1.4L8 13l-1.4-4.6L2 7l4.6-1.4L8 1z"/>`,
  prompt: `<path d="M2 2h12v9H7l-3 3v-3H2zM5 5h6M5 8h4"/>`,
  memory: `<path d="M4 3h8v10H4zM2 5h2M2 8h2M2 11h2M12 5h2M12 8h2M12 11h2M6 1v2M10 1v2M6 13v2M10 13v2"/>`,
  runtime: `<path d="M2 8h3l2-4 3 8 2-4h2M3 14h10M4 2h8"/>`,
  search: `<circle cx="7" cy="7" r="5"/><path d="m11 11 4 4"/>`,
  eye: `<path d="M1 8s2.5-4 7-4 7 4 7 4-2.5 4-7 4-7-4-7-4z"/><circle cx="8" cy="8" r="2"/>`,
  route: `<circle cx="3" cy="3" r="2"/><circle cx="13" cy="13" r="2"/><path d="M5 3h3a3 3 0 0 1 3 3v2a3 3 0 0 0 2 3"/>`,
  database: `<ellipse cx="8" cy="3" rx="5" ry="2"/><path d="M3 3v8c0 1.1 2.2 2 5 2s5-.9 5-2V3M3 7c0 1.1 2.2 2 5 2s5-.9 5-2"/>`,
  test: `<path d="M5 1h6M6 1v5l-4 7a1.5 1.5 0 0 0 1.3 2h9.4a1.5 1.5 0 0 0 1.3-2l-4-7V1M5 10h6"/>`,
});

const AI_FILE_BASENAMES = new Set([
  ".mcp.json",
  "agents.md",
  "claude.md",
  "codex.toml",
  "mcp.json",
  "mcp.config.json",
  "mcp.config.yaml",
  "mcp.config.yml",
  "prompt.md",
  "prompts.md",
  "system-prompt.md",
  "memory.json",
  "memory.yaml",
  "memory.yml",
  "promptfooconfig.yaml",
  "promptfooconfig.yml",
]);

const AI_FILE_EXTENSIONS = new Set([
  ".json",
  ".jsonc",
  ".md",
  ".mjs",
  ".js",
  ".jsx",
  ".ts",
  ".tsx",
  ".py",
  ".toml",
  ".yaml",
  ".yml",
  ".sh",
  ".kt",
  ".kts",
  ".java",
  ".go",
  ".rs",
]);

const AI_PATH_SEGMENTS = Object.freeze([
  ".claude",
  ".codex",
  "agent",
  "agents",
  "subagents",
  "prompts",
  "prompt",
  "commands",
  "skills",
  "hooks",
  "evals",
  "evaluations",
  "benchmarks",
  "guardrails",
  "mcp",
  "tools",
  "tooling",
  "ai",
  "rag",
  "retrieval",
  "embeddings",
  "memory",
  "memories",
  "checkpoints",
  "checkpoint",
  "state",
  "sessions",
  "context",
  "context-store",
  "harness",
  "runtime",
  "runners",
  "runner",
  "orchestration",
  "workflows",
  "tracing",
  "telemetry",
  "observability",
  "structured-output",
  "schemas",
]);

function normalizedPath(value) {
  return String(value ?? "").replaceAll("\\", "/").toLowerCase();
}

function basename(value) {
  return normalizedPath(value).split("/").at(-1) ?? "";
}

function extensionOf(value) {
  const base = basename(value);
  const dot = base.lastIndexOf(".");
  return dot >= 0 ? base.slice(dot) : "";
}

function pathHasSegment(value, segment) {
  const padded = `/${normalizedPath(value)}/`;
  return padded.includes(`/${segment.toLowerCase()}/`);
}

function pathHasAnySegment(value, segments) {
  return segments.some((segment) => pathHasSegment(value, segment));
}

/**
 * Returns true when a path can provide evidence for an AI engineering
 * discipline. This function is also used when classifying AI workflow commits.
 */
export function isAiEvidencePath(filePath) {
  const lower = normalizedPath(filePath);
  const base = basename(lower);

  if (AI_FILE_BASENAMES.has(base)) return true;
  if (base.startsWith("claude") && base.endsWith(".md")) return true;
  if (base.startsWith("agents") && base.endsWith(".md")) return true;
  if (/^mcp(?:[._-].+)?\.(json|jsonc|toml|ya?ml|ts|js|mjs|py)$/.test(base)) return true;
  if (/^(system[-_ ]?)?prompt(?:[._-].+)?\.(md|json|toml|ya?ml|ts|js|py)$/.test(base)) return true;
  if (/^(memory|checkpoint|guardrail|eval|trace|telemetry|harness|runner)(?:[._-].+)?\.(md|json|toml|ya?ml|ts|js|py|kt|java)$/.test(base)) return true;
  if (pathHasAnySegment(lower, AI_PATH_SEGMENTS)) return true;

  return /(^|\/)(ai|agentic|llm|rag|mcp|memory|prompt|context|harness|eval|observability)[-_].+\.(md|json|toml|ya?ml|ts|js|py|kt|java)$/.test(lower);
}

/**
 * Limits downloaded evidence to readable configuration, documentation, and
 * source files. The main generator already applies a file-size ceiling.
 */
export function isAiEvidenceCandidatePath(filePath) {
  if (!isAiEvidencePath(filePath)) return false;
  return AI_FILE_BASENAMES.has(basename(filePath)) ||
    AI_FILE_EXTENSIONS.has(extensionOf(filePath));
}

/**
 * Prioritizes high-signal files when a repository contains more AI evidence
 * candidates than the configured manifest-download limit.
 */
export function aiEvidencePriority(filePath) {
  const lower = normalizedPath(filePath);
  const base = basename(lower);

  if (["claude.md", "agents.md", ".mcp.json", "mcp.json", "codex.toml"].includes(base)) return 120;
  if (pathHasSegment(lower, ".claude") || pathHasSegment(lower, ".codex")) return 115;
  if (pathHasAnySegment(lower, ["memory", "memories", "checkpoints", "harness", "runtime"])) return 105;
  if (pathHasSegment(lower, "mcp") || base.includes("mcp")) return 100;
  if (pathHasAnySegment(lower, ["agents", "subagents", "orchestration"])) return 95;
  if (pathHasAnySegment(lower, ["evals", "evaluations", "benchmarks", "observability", "tracing"])) return 90;
  if (pathHasAnySegment(lower, ["guardrails", "policies", "security"])) return 88;
  if (pathHasAnySegment(lower, ["hooks", "skills", "tools", "tooling"])) return 85;
  if (pathHasAnySegment(lower, ["prompts", "prompt", "commands", "structured-output", "schemas"])) return 80;
  if (pathHasAnySegment(lower, ["rag", "retrieval", "embeddings", "context"])) return 75;
  return 50;
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
  }).format(Number(value) || 0);
}

function formatDate(value) {
  if (!value) return "—";
  const date = new Date(`${String(value).slice(0, 10)}T00:00:00Z`);
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

function icon(name, x, y, color, size = 16) {
  const content = ICONS[name] ?? ICONS.spark;
  return `<g transform="translate(${x} ${y}) scale(${size / 16})" fill="none" stroke="${color}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${content}</g>`;
}

function cardShell({ width, height, title, iconName, accent, subtitle = "", body }) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeXml(title)}">
  <style>
    .title{fill:${THEME.title};font:600 18px -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
    .subtitle{fill:${THEME.muted};font:400 11px -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
    .label{fill:${THEME.muted};font:500 11px -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
    .value{fill:${THEME.text};font:700 20px -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
    .small{fill:${THEME.text};font:600 12px -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
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

function wrapWords(value, maximumCharactersPerLine, maximumLines = 2) {
  const words = String(value ?? "").trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];

  const lines = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length <= maximumCharactersPerLine || !current) {
      current = candidate;
      continue;
    }
    lines.push(current);
    current = word;
    if (lines.length === maximumLines - 1) break;
  }

  if (current && lines.length < maximumLines) {
    const consumed = lines.join(" ").split(/\s+/).filter(Boolean).length;
    const rest = words.slice(consumed).join(" ");
    lines.push(
      rest.length <= maximumCharactersPerLine
        ? rest
        : `${rest.slice(0, Math.max(1, maximumCharactersPerLine - 1))}…`,
    );
  }
  return lines.slice(0, maximumLines);
}

function svgTextLines({ lines, x, y, className, lineHeight = 14, anchor = "start" }) {
  if (!lines.length) return "";
  const tspans = lines.map((line, index) =>
    `<tspan x="${x}" dy="${index === 0 ? 0 : lineHeight}">${escapeXml(line)}</tspan>`,
  ).join("");
  return `<text x="${x}" y="${y}" text-anchor="${anchor}" class="${className}">${tspans}</text>`;
}

/**
 * Produces adaptive, fixed-width metric tiles. Labels are pre-wrapped and the
 * card height is calculated from the number of rows, preventing SVG clipping.
 */
function metricCard({
  title,
  subtitle,
  iconName,
  accent,
  metrics,
  width = 900,
  columns = 3,
  footer = "",
}) {
  const outerX = 20;
  const gap = 12;
  const tileWidth = (width - outerX * 2 - gap * (columns - 1)) / columns;
  const tileHeight = 82;
  const startY = 72;
  const rows = Math.max(1, Math.ceil(metrics.length / columns));
  const footerHeight = footer ? 34 : 10;
  const height = startY + rows * tileHeight + (rows - 1) * gap + footerHeight;

  const body = metrics.map((metric, index) => {
    const column = index % columns;
    const row = Math.floor(index / columns);
    const x = outerX + column * (tileWidth + gap);
    const y = startY + row * (tileHeight + gap);
    const color = metric.color ?? accent;
    const lines = wrapWords(metric.label, columns >= 3 ? 28 : 40, 2);

    return `<rect x="${x}" y="${y}" width="${tileWidth}" height="${tileHeight}" rx="10" fill="${color}" fill-opacity=".09" stroke="${color}" stroke-opacity=".55"/>
      ${icon(metric.icon ?? iconName, x + 13, y + 13, color, 17)}
      <text x="${x + 42}" y="${y + 31}" class="value">${escapeXml(metric.value)}</text>
      ${svgTextLines({ lines, x: x + 13, y: y + 56, className: "label", lineHeight: 14 })}
      ${metric.note ? `<text x="${x + tileWidth - 10}" y="${y + 14}" text-anchor="end" class="tiny">${escapeXml(metric.note)}</text>` : ""}`;
  }).join("");

  const footerMarkup = footer
    ? `<text x="${outerX}" y="${height - 14}" class="tiny">${escapeXml(footer)}</text>`
    : "";

  return cardShell({ width, height, title, subtitle, iconName, accent, body: `${body}${footerMarkup}` });
}

function countMatchingPaths(paths, predicate) {
  return paths.reduce((count, value) => count + (predicate(value) ? 1 : 0), 0);
}

function parsePackageNames(manifests) {
  const packageNames = new Set();
  for (const manifest of manifests) {
    if (!normalizedPath(manifest.path).endsWith("package.json")) continue;
    try {
      const parsed = JSON.parse(manifest.content ?? "{}");
      for (const group of [
        parsed.dependencies,
        parsed.devDependencies,
        parsed.peerDependencies,
        parsed.optionalDependencies,
      ]) {
        for (const name of Object.keys(group ?? {})) {
          packageNames.add(name.toLowerCase());
        }
      }
    } catch {
      // One invalid package.json must not invalidate repository evidence.
    }
  }
  return packageNames;
}

function analyseRepository(detail) {
  const paths = (detail.paths ?? []).map(normalizedPath);
  const manifests = detail.manifests ?? [];
  const content = manifests
    .map((item) => `${normalizedPath(item.path)}\n${String(item.content ?? "").toLowerCase()}`)
    .join("\n");
  const packages = parsePackageNames(manifests);

  const hasPackage = (name) => packages.has(name.toLowerCase());
  const packageIncludes = (value) => [...packages].some((name) => name.includes(value.toLowerCase()));
  const anyPath = (predicate) => paths.some(predicate);
  const countPath = (predicate) => countMatchingPaths(paths, predicate);
  const segmentCount = (...segments) => countPath((item) => pathHasAnySegment(item, segments));
  const pathRegexCount = (expression) => countPath((item) => expression.test(item));
  const contentMatches = (expression) => expression.test(content);

  const claude = anyPath((item) => pathHasSegment(item, ".claude") || basename(item) === "claude.md");
  const codex = anyPath((item) => pathHasSegment(item, ".codex") || basename(item) === "agents.md" || basename(item) === "codex.toml");

  const prompt = {
    files: segmentCount("prompts", "prompt", "commands", "system-prompts", "prompt-templates") +
      pathRegexCount(/(^|\/)(system[-_ ]?)?prompt[^/]*\.(md|json|toml|ya?ml|ts|js|py)$/),
    systemPrompts: pathRegexCount(/system[-_ ]?prompt/) + Number(contentMatches(/\bsystem prompt\b|role\s*[:=]\s*["']system["']|system_message/)),
    fewShot: segmentCount("few-shot", "fewshot", "examples") + Number(contentMatches(/few[-_ ]shot|few shot examples?/)),
    structuredOutput: segmentCount("structured-output", "schemas", "output-schema") + Number(contentMatches(/structured output|response_format|json schema|output schema|zod schema|pydantic.*schema/)),
    versioning: segmentCount("prompt-versions", "versions") + Number(contentMatches(/prompt version|versioned prompt|prompt registry|prompt revision/)),
    tests: pathRegexCount(/(^|\/)(test|tests|evals?|evaluations?)\/.*prompt|prompt.*(test|spec|eval)/) + Number(contentMatches(/prompt regression|prompt test|evaluate.*prompt/)),
  };
  prompt.enabled = Object.values(prompt).some((value) => typeof value === "number" && value > 0);

  const context = {
    instructionFiles: countPath((item) => ["claude.md", "agents.md", "codex.toml"].includes(basename(item))) + segmentCount(".claude", ".codex"),
    moduleInstructions: countPath((item) => ["claude.md", "agents.md"].includes(basename(item)) && item.split("/").length > 1),
    decisions: segmentCount("adr", "adrs", "decisions", "architecture") + pathRegexCount(/(^|\/)(adr|decision|architecture)[-_ ].*\.md$/),
    handovers: pathRegexCount(/(^|\/)(handover|session[-_ ]?handover|engineering[-_ ]?journal|proof[-_ ]?of[-_ ]work|session[-_ ]?summary)/),
    selectionBudget: Number(contentMatches(/context selection|context budget|context window|token budget|context routing/)),
    compression: Number(contentMatches(/context compression|compress.*context|conversation summar(y|ization)|summari[sz]e.*context/)),
    retrievalInjection: Number(contentMatches(/context injection|retrieve.*context|retrieval context|dynamic context|context provider/)),
  };
  context.enabled = Object.values(context).some((value) => typeof value === "number" && value > 0);

  const memoryFrameworkSignals = [
    hasPackage("mem0ai") || packageIncludes("mem0"),
    hasPackage("zep-cloud") || packageIncludes("zep"),
    packageIncludes("langgraph") && contentMatches(/checkpointer|memorysaver|sqlite?saver|postgres?saver/),
    contentMatches(/redis.*memory|memory.*redis|vector memory|semantic memory store/),
  ].filter(Boolean).length;

  const memory = {
    files: segmentCount("memory", "memories", "semantic-memory", "episodic-memory", "long-term-memory", "short-term-memory"),
    checkpoints: segmentCount("checkpoint", "checkpoints", "savers") + Number(contentMatches(/checkpointer|memorysaver|sqlite?saver|postgres?saver|checkpoint_id/)),
    stateStores: segmentCount("state", "state-store", "snapshots") + Number(contentMatches(/persistent state|state store|agent state|workflow state/)),
    sessions: segmentCount("sessions", "session", "threads", "conversations") + Number(contentMatches(/conversation memory|session memory|thread memory|session store/)),
    persistent: Number(contentMatches(/persistent memory|long[-_ ]term memory|durable memory|memory persistence/)),
    semantic: Number(contentMatches(/semantic memory|episodic memory|procedural memory|memory retrieval/)),
    frameworks: memoryFrameworkSignals,
  };
  memory.enabled = Object.values(memory).some((value) => typeof value === "number" && value > 0);

  const harness = {
    runners: segmentCount("harness", "runtime", "runners", "runner", "executor", "execution-loop") + Number(contentMatches(/agent runtime|agent loop|execution loop|run agent|task runner/)),
    toolRegistry: segmentCount("tool-registry", "tools", "tooling", "functions") + Number(contentMatches(/tool registry|register tool|tool dispatch|tool executor/)),
    retriesRecovery: Number(contentMatches(/retry|backoff|error recovery|fallback on error|circuit breaker/)),
    timeoutsBudgets: Number(contentMatches(/timeout|token budget|cost budget|max tokens|max_steps|max iterations/)),
    routingFallback: Number(contentMatches(/model routing|model router|fallback model|provider fallback|route.*model/)),
    concurrency: Number(contentMatches(/parallel agents?|concurrency|semaphore|promise\.all|asyncio\.gather|worker pool/)),
    sandboxing: Number(contentMatches(/sandbox|isolated execution|containerized tool|restricted filesystem/)),
    structuredOutput: prompt.structuredOutput,
    hooks: segmentCount("hooks") + pathRegexCount(/hook\.(ts|js|mjs|py|sh)$/) + Number(contentMatches(/pretooluse|posttooluse|userpromptsubmit|before tool|after tool/)),
    tracing: segmentCount("tracing", "telemetry", "observability") + Number(contentMatches(/trace_id|distributed tracing|opentelemetry|langsmith|phoenix/)),
    ciValidation: pathRegexCount(/\.github\/workflows\/.*(ai|agent|prompt|eval|rag|mcp).*\.ya?ml$/) + Number(contentMatches(/ci validation|validate.*agent|validate.*prompt|run.*eval/)),
  };
  harness.enabled = Object.values(harness).some((value) => typeof value === "number" && value > 0);

  const orchestration = {
    agentFiles: segmentCount("agents", "agent", "subagents") + pathRegexCount(/(^|\/)(agent|subagent)[-_ ].*\.(md|json|toml|ya?ml|ts|js|py)$/),
    multiAgent: Number(contentMatches(/multi[-_ ]agent|multiple agents|agent team|subagents?/)) + Number(segmentCount("subagents") > 0),
    routersDirectors: Number(contentMatches(/router agent|director agent|supervisor agent|agent router|orchestrator/)),
    planningDelegation: Number(contentMatches(/planner agent|task planning|delegate.*agent|agent delegation/)),
    handoffs: Number(contentMatches(/agent handoff|handoff_to|transfer.*agent|handover.*agent/)),
    parallelSequential: Number(contentMatches(/parallel agents?|sequential agents?|fan[-_ ]out|fan[-_ ]in|map[-_ ]reduce agents?/)),
    humanInLoop: Number(contentMatches(/human[-_ ]in[-_ ]the[-_ ]loop|human approval|interrupt_before|approval checkpoint/)),
  };
  orchestration.enabled = Object.values(orchestration).some((value) => typeof value === "number" && value > 0);

  const mcpConfigs = countPath((item) => basename(item).includes("mcp") || pathHasSegment(item, "mcp"));
  const customToolFiles = segmentCount("tools", "tooling", "functions") + Number(contentMatches(/custom tool|tool schema|function tool|tool definition/));
  const toolCategories = new Set();
  if (/github|gitlab|pull request|repository tool/.test(content)) toolCategories.add("Git hosting");
  if (/filesystem|file system|read_file|write_file|directory tool/.test(content)) toolCategories.add("Filesystem");
  if (/browser|playwright|puppeteer|web search|fetch url/.test(content)) toolCategories.add("Browser & web");
  if (/postgres|supabase|mongodb|database|sql tool/.test(content)) toolCategories.add("Databases");
  if (/deploy|vercel|cloudflare|aws|gcp|digitalocean|docker/.test(content)) toolCategories.add("Cloud & deployment");
  if (/gmail|email|calendar|slack|jira/.test(content)) toolCategories.add("Productivity");
  if (/custom tool|tool schema|api tool|openapi|custom server/.test(content)) toolCategories.add("Custom APIs");
  const mcp = {
    configs: mcpConfigs,
    customTools: customToolFiles,
    categories: toolCategories,
    enabled: mcpConfigs > 0 || customToolFiles > 0 || contentMatches(/model context protocol|@modelcontextprotocol|\bmcp server\b|\bmcp client\b/),
  };

  const vectorSignals = [
    "chromadb", "pinecone", "weaviate", "qdrant", "pgvector", "faiss", "milvus", "lancedb", "vector store", "vector database",
  ].filter((term) => content.includes(term) || packageIncludes(term.replaceAll(" ", ""))).length;
  const rag = {
    files: segmentCount("rag", "retrieval", "retrievers", "embeddings", "vector-store"),
    retrieval: Number(contentMatches(/retrieval[-_ ]augmented|retriever|hybrid search|semantic search|document retrieval/)),
    embeddings: Number(contentMatches(/\bembeddings?\b|sentence[-_]transformers|embedding model/)),
    vectorDatabases: vectorSignals,
    chunking: Number(contentMatches(/chunking|text splitter|recursivecharactertextsplitter|document chunks?/)),
    reranking: Number(contentMatches(/rerank|cross[-_ ]encoder|reciprocal rank fusion|rrf/)),
    contextInjection: context.retrievalInjection,
  };
  rag.enabled = Object.values(rag).some((value) => typeof value === "number" && value > 0);

  const evaluation = {
    files: segmentCount("evals", "evaluations") + pathRegexCount(/(^|\/).*eval.*\.(json|ya?ml|md|ts|js|py)$/),
    goldenDatasets: segmentCount("golden", "fixtures", "datasets") + Number(contentMatches(/golden dataset|golden set|reference answers?|expected outputs?/)),
    benchmarks: segmentCount("benchmarks", "benchmark") + Number(contentMatches(/benchmark suite|benchmark cases?/)),
    regression: Number(contentMatches(/prompt regression|model regression|evaluation regression|regression test.*ai/)),
    tracing: segmentCount("tracing", "traces") + Number(contentMatches(/langsmith|arize phoenix|opentelemetry|trace_id|llm tracing/)),
    telemetry: segmentCount("telemetry", "observability", "metrics") + Number(contentMatches(/telemetry|observability|llm metrics|agent metrics/)),
    latencyTokens: Number(contentMatches(/latency|token usage|prompt tokens|completion tokens|tokens consumed/)),
    costMonitoring: Number(contentMatches(/cost tracking|cost monitoring|llm cost|model cost|usage cost/)),
    toolSuccess: Number(contentMatches(/tool[-_ ]call success|tool success rate|failed tool calls?|tool error rate/)),
  };
  evaluation.enabled = Object.values(evaluation).some((value) => typeof value === "number" && value > 0);

  const governance = {
    secretProtection: Number(contentMatches(/do not (print|expose|commit).*secret|secret[-_ ]protection|never.*token|redact.*secret|credentials? must not/)),
    restrictedTools: Number(contentMatches(/restricted commands|denylist|deny[-_ ]by[-_ ]default|allowlist|allowed tools?|forbidden commands|tool permissions?/)),
    approval: Number(contentMatches(/human approval|requires? approval|approval checkpoint|ask.*before|explicit approval/)),
    productionSafeguards: Number(contentMatches(/no production writes|prod(uction)?[-_ ]write|do not deploy.*production|deny.*production|staging before production/)),
    outputValidation: Number(contentMatches(/validate generated|output validation|self[-_ ]review|run tests|verification checkpoint|smoke test|schema validation/)),
    promptInjection: Number(contentMatches(/prompt injection|jailbreak|untrusted input|indirect injection/)),
    privacyPii: Number(contentMatches(/pii|personally identifiable|data privacy|data minimization|redact.*user data/)),
    auditability: Number(contentMatches(/audit log|engineering journal|proof[-_ ]of[-_ ]work|atomic changelog|session log|traceability/)),
  };
  governance.enabled = Object.values(governance).some((value) => typeof value === "number" && value > 0);

  const dependencySignals = [
    hasPackage("openai"),
    hasPackage("@anthropic-ai/sdk"),
    hasPackage("anthropic"),
    packageIncludes("langchain"),
    packageIncludes("langgraph"),
    packageIncludes("llamaindex"),
    packageIncludes("semantic-kernel"),
    packageIncludes("autogen"),
    packageIncludes("crewai"),
    packageIncludes("mastra"),
    packageIncludes("ai"),
    contentMatches(/\bopenai\b|\banthropic\b|\bclaude api\b|\bllamaindex\b|\btransformers\b|\btensorflow lite\b|\bmlkit\b|\bollama\b/),
  ].filter(Boolean).length;

  const disciplineEvidence = [
    prompt.enabled,
    context.enabled,
    memory.enabled,
    harness.enabled,
    orchestration.enabled,
    mcp.enabled,
    rag.enabled,
    evaluation.enabled,
    governance.enabled,
  ].filter(Boolean).length;

  const strongEvidence =
    memory.checkpoints +
    harness.runners +
    orchestration.agentFiles +
    mcp.configs +
    evaluation.files +
    dependencySignals;
  const mediumEvidence =
    prompt.files +
    context.instructionFiles +
    context.decisions +
    harness.hooks +
    rag.files +
    governance.outputValidation;
  const enabled = claude || codex || disciplineEvidence > 0 || dependencySignals > 0;

  let maturity = enabled ? 1 : 0;
  if (enabled && disciplineEvidence >= 2) maturity = 2;
  if (enabled && (harness.enabled || orchestration.enabled || mcp.enabled)) maturity = 3;
  if (maturity >= 3 && governance.enabled && evaluation.enabled) maturity = 4;

  return {
    private: Boolean(detail.repository?.private),
    enabled,
    claude,
    codex,
    prompt,
    context,
    memory,
    harness,
    orchestration,
    mcp,
    rag,
    evaluation,
    governance,
    dependencySignals,
    strongEvidence,
    mediumEvidence,
    maturity,
  };
}

function aggregateAnalyses(repositoryDetails) {
  const analyses = repositoryDetails.map(analyseRepository);
  const enabled = analyses.filter((item) => item.enabled);

  const sumNested = (group, field) => enabled.reduce(
    (total, item) => total + Number(item[group]?.[field] ?? 0),
    0,
  );
  const repoCount = (group) => enabled.filter((item) => Boolean(item[group]?.enabled)).length;
  const governanceRepoCount = (field) => enabled.filter((item) => Number(item.governance?.[field] ?? 0) > 0).length;

  const toolCategoryMap = new Map();
  for (const analysis of enabled) {
    for (const category of analysis.mcp.categories) {
      toolCategoryMap.set(category, (toolCategoryMap.get(category) ?? 0) + 1);
    }
  }

  return {
    enabled,
    publicEnabled: enabled.filter((item) => !item.private).length,
    privateEnabled: enabled.filter((item) => item.private).length,
    claudeRepositories: enabled.filter((item) => item.claude).length,
    codexRepositories: enabled.filter((item) => item.codex).length,
    bothRepositories: enabled.filter((item) => item.claude && item.codex).length,
    promptRepositories: repoCount("prompt"),
    contextRepositories: repoCount("context"),
    memoryRepositories: repoCount("memory"),
    harnessRepositories: repoCount("harness"),
    orchestrationRepositories: repoCount("orchestration"),
    mcpRepositories: repoCount("mcp"),
    ragRepositories: repoCount("rag"),
    evaluationRepositories: repoCount("evaluation"),
    governanceRepositories: repoCount("governance"),
    governedMaturityRepositories: enabled.filter((item) => item.maturity === 4).length,
    prompt: {
      files: sumNested("prompt", "files"),
      systemPrompts: sumNested("prompt", "systemPrompts"),
      fewShot: sumNested("prompt", "fewShot"),
      structuredOutput: sumNested("prompt", "structuredOutput"),
      versioning: sumNested("prompt", "versioning"),
      tests: sumNested("prompt", "tests"),
    },
    context: {
      instructionFiles: sumNested("context", "instructionFiles"),
      moduleInstructions: sumNested("context", "moduleInstructions"),
      decisions: sumNested("context", "decisions"),
      handovers: sumNested("context", "handovers"),
      selectionBudget: sumNested("context", "selectionBudget"),
      compression: sumNested("context", "compression"),
      retrievalInjection: sumNested("context", "retrievalInjection"),
    },
    memory: {
      files: sumNested("memory", "files"),
      checkpoints: sumNested("memory", "checkpoints"),
      stateStores: sumNested("memory", "stateStores"),
      sessions: sumNested("memory", "sessions"),
      persistent: sumNested("memory", "persistent"),
      semantic: sumNested("memory", "semantic"),
      frameworks: sumNested("memory", "frameworks"),
    },
    harness: {
      runners: sumNested("harness", "runners"),
      toolRegistry: sumNested("harness", "toolRegistry"),
      retriesRecovery: sumNested("harness", "retriesRecovery"),
      timeoutsBudgets: sumNested("harness", "timeoutsBudgets"),
      routingFallback: sumNested("harness", "routingFallback"),
      concurrency: sumNested("harness", "concurrency"),
      sandboxing: sumNested("harness", "sandboxing"),
      structuredOutput: sumNested("harness", "structuredOutput"),
      hooks: sumNested("harness", "hooks"),
      tracing: sumNested("harness", "tracing"),
      ciValidation: sumNested("harness", "ciValidation"),
    },
    orchestration: {
      agentFiles: sumNested("orchestration", "agentFiles"),
      multiAgent: sumNested("orchestration", "multiAgent"),
      routersDirectors: sumNested("orchestration", "routersDirectors"),
      planningDelegation: sumNested("orchestration", "planningDelegation"),
      handoffs: sumNested("orchestration", "handoffs"),
      parallelSequential: sumNested("orchestration", "parallelSequential"),
      humanInLoop: sumNested("orchestration", "humanInLoop"),
    },
    mcp: {
      configs: sumNested("mcp", "configs"),
      customTools: sumNested("mcp", "customTools"),
    },
    rag: {
      files: sumNested("rag", "files"),
      retrieval: sumNested("rag", "retrieval"),
      embeddings: sumNested("rag", "embeddings"),
      vectorDatabases: sumNested("rag", "vectorDatabases"),
      chunking: sumNested("rag", "chunking"),
      reranking: sumNested("rag", "reranking"),
      contextInjection: sumNested("rag", "contextInjection"),
    },
    evaluation: {
      files: sumNested("evaluation", "files"),
      goldenDatasets: sumNested("evaluation", "goldenDatasets"),
      benchmarks: sumNested("evaluation", "benchmarks"),
      regression: sumNested("evaluation", "regression"),
      tracing: sumNested("evaluation", "tracing"),
      telemetry: sumNested("evaluation", "telemetry"),
      latencyTokens: sumNested("evaluation", "latencyTokens"),
      costMonitoring: sumNested("evaluation", "costMonitoring"),
      toolSuccess: sumNested("evaluation", "toolSuccess"),
    },
    governance: {
      secretProtection: governanceRepoCount("secretProtection"),
      restrictedTools: governanceRepoCount("restrictedTools"),
      approval: governanceRepoCount("approval"),
      productionSafeguards: governanceRepoCount("productionSafeguards"),
      outputValidation: governanceRepoCount("outputValidation"),
      promptInjection: governanceRepoCount("promptInjection"),
      privacyPii: governanceRepoCount("privacyPii"),
      auditability: governanceRepoCount("auditability"),
    },
    toolCategories: [...toolCategoryMap.entries()]
      .map(([name, repositories]) => ({ name, repositories }))
      .sort((a, b) => b.repositories - a.repositories || a.name.localeCompare(b.name)),
  };
}

function renderOverview(data) {
  return metricCard({
    title: "AI Engineering Overview",
    subtitle: `${data.publicEnabled} public + ${data.privateEnabled} private AI-enabled repositories · evidence-based disciplines, not AI-generated-code claims`,
    iconName: "brain",
    accent: THEME.purple,
    width: 960,
    columns: 3,
    metrics: [
      { icon: "brain", color: THEME.purple, value: compactNumber(data.enabled.length), label: "AI-enabled repositories" },
      { icon: "prompt", color: THEME.pink, value: compactNumber(data.promptRepositories), label: "Prompt engineering repositories" },
      { icon: "docs", color: THEME.cyan, value: compactNumber(data.contextRepositories), label: "Context engineering repositories" },
      { icon: "memory", color: THEME.yellow, value: compactNumber(data.memoryRepositories), label: "Memory engineering repositories" },
      { icon: "runtime", color: THEME.orange, value: compactNumber(data.harnessRepositories), label: "AI harness engineering repositories" },
      { icon: "route", color: THEME.purple, value: compactNumber(data.orchestrationRepositories), label: "Agentic orchestration repositories" },
      { icon: "network", color: THEME.green, value: compactNumber(data.mcpRepositories), label: "MCP and tool integration repositories" },
      { icon: "search", color: THEME.blue, value: compactNumber(data.ragRepositories), label: "RAG and retrieval repositories" },
      { icon: "eye", color: THEME.cyan, value: compactNumber(data.evaluationRepositories), label: "Evaluation and observability repositories" },
      { icon: "shield", color: THEME.red, value: compactNumber(data.governanceRepositories), label: "Governance and safety repositories" },
      { icon: "bot", color: THEME.orange, value: compactNumber(data.claudeRepositories), label: "Claude-configured repositories" },
      { icon: "code", color: THEME.blue, value: compactNumber(data.codexRepositories), label: "Codex-configured repositories" },
    ],
  });
}

function renderPromptEngineering(data) {
  return metricCard({
    title: "Prompt Engineering",
    subtitle: "Reusable prompts, system instructions, few-shot patterns, structured outputs and prompt validation",
    iconName: "prompt",
    accent: THEME.pink,
    metrics: [
      { icon: "prompt", value: compactNumber(data.promptRepositories), label: "Repositories with prompt engineering" },
      { icon: "docs", value: compactNumber(data.prompt.files), label: "Prompt and command files" },
      { icon: "bot", value: compactNumber(data.prompt.systemPrompts), label: "System-prompt signals" },
      { icon: "layers", value: compactNumber(data.prompt.fewShot), label: "Few-shot and example signals" },
      { icon: "code", value: compactNumber(data.prompt.structuredOutput), label: "Structured-output and schema signals" },
      { icon: "route", value: compactNumber(data.prompt.versioning), label: "Prompt versioning and registry signals" },
      { icon: "test", value: compactNumber(data.prompt.tests), label: "Prompt tests and regression signals" },
      { icon: "shield", value: compactNumber(data.governance.promptInjection), label: "Prompt-injection safeguards" },
    ],
    columns: 2,
  });
}

function renderContextEngineering(data) {
  return metricCard({
    title: "Context Engineering",
    subtitle: "Instruction hierarchy, architecture context, handovers, context selection and retrieval-based context injection",
    iconName: "docs",
    accent: THEME.cyan,
    metrics: [
      { icon: "docs", value: compactNumber(data.contextRepositories), label: "Repositories with context engineering" },
      { icon: "docs", value: compactNumber(data.context.instructionFiles), label: "Repository instruction signals" },
      { icon: "layers", value: compactNumber(data.context.moduleInstructions), label: "Module-level instruction files" },
      { icon: "route", value: compactNumber(data.context.decisions), label: "Architecture and decision context" },
      { icon: "activity", value: compactNumber(data.context.handovers), label: "Handovers, journals and session summaries" },
      { icon: "brain", value: compactNumber(data.context.selectionBudget), label: "Context selection and budget signals" },
      { icon: "layers", value: compactNumber(data.context.compression), label: "Context compression and summarization" },
      { icon: "search", value: compactNumber(data.context.retrievalInjection), label: "Retrieval-based context injection" },
    ],
    columns: 2,
  });
}

function renderMemoryEngineering(data) {
  return metricCard({
    title: "Memory Engineering",
    subtitle: "Short- and long-term memory, checkpoints, durable state, conversation sessions and semantic memory",
    iconName: "memory",
    accent: THEME.yellow,
    metrics: [
      { icon: "memory", value: compactNumber(data.memoryRepositories), label: "Repositories with memory engineering" },
      { icon: "memory", value: compactNumber(data.memory.files), label: "Memory implementation and configuration files" },
      { icon: "calendar", value: compactNumber(data.memory.checkpoints), label: "Checkpoint and saver signals" },
      { icon: "database", value: compactNumber(data.memory.stateStores), label: "Persistent state-store signals" },
      { icon: "layers", value: compactNumber(data.memory.sessions), label: "Session, thread and conversation memory" },
      { icon: "lock", value: compactNumber(data.memory.persistent), label: "Long-term and durable memory signals" },
      { icon: "brain", value: compactNumber(data.memory.semantic), label: "Semantic and episodic memory signals" },
      { icon: "tool", value: compactNumber(data.memory.frameworks), label: "Memory framework and backend signals" },
    ],
    columns: 2,
  });
}

function renderHarnessEngineering(data) {
  return metricCard({
    title: "AI Harness Engineering",
    subtitle: "Execution runtimes, tool dispatch, recovery, budgets, model routing, sandboxing, tracing and CI validation",
    iconName: "runtime",
    accent: THEME.orange,
    width: 960,
    columns: 3,
    metrics: [
      { icon: "runtime", value: compactNumber(data.harnessRepositories), label: "Repositories with AI harness engineering" },
      { icon: "runtime", value: compactNumber(data.harness.runners), label: "Agent runner and runtime signals" },
      { icon: "tool", value: compactNumber(data.harness.toolRegistry), label: "Tool registry and dispatch signals" },
      { icon: "activity", value: compactNumber(data.harness.retriesRecovery), label: "Retry and error-recovery controls" },
      { icon: "calendar", value: compactNumber(data.harness.timeoutsBudgets), label: "Timeout, token and cost budgets" },
      { icon: "route", value: compactNumber(data.harness.routingFallback), label: "Model routing and fallback signals" },
      { icon: "network", value: compactNumber(data.harness.concurrency), label: "Concurrency and parallel-execution controls" },
      { icon: "lock", value: compactNumber(data.harness.sandboxing), label: "Sandbox and isolated-execution controls" },
      { icon: "code", value: compactNumber(data.harness.structuredOutput), label: "Structured-output parsing and schemas" },
      { icon: "tool", value: compactNumber(data.harness.hooks), label: "Lifecycle hooks and automation" },
      { icon: "eye", value: compactNumber(data.harness.tracing), label: "Runtime tracing and telemetry" },
      { icon: "test", value: compactNumber(data.harness.ciValidation), label: "AI workflow CI validation" },
    ],
  });
}

function renderAgenticOrchestration(data) {
  return metricCard({
    title: "Agentic Orchestration",
    subtitle: "Specialist agents, routers, planning, delegation, handoffs, parallel workflows and human checkpoints",
    iconName: "route",
    accent: THEME.purple,
    metrics: [
      { icon: "route", value: compactNumber(data.orchestrationRepositories), label: "Repositories with agentic orchestration" },
      { icon: "bot", value: compactNumber(data.orchestration.agentFiles), label: "Agent and sub-agent definition signals" },
      { icon: "network", value: compactNumber(data.orchestration.multiAgent), label: "Multi-agent architecture signals" },
      { icon: "route", value: compactNumber(data.orchestration.routersDirectors), label: "Router, director and supervisor agents" },
      { icon: "brain", value: compactNumber(data.orchestration.planningDelegation), label: "Planning and delegation signals" },
      { icon: "layers", value: compactNumber(data.orchestration.handoffs), label: "Agent handoff and transfer signals" },
      { icon: "activity", value: compactNumber(data.orchestration.parallelSequential), label: "Parallel and sequential workflows" },
      { icon: "shield", value: compactNumber(data.orchestration.humanInLoop), label: "Human-in-the-loop checkpoints" },
    ],
    columns: 2,
  });
}

function renderMcpTools(data) {
  const width = 900;
  const metrics = [
    { icon: "network", color: THEME.green, value: compactNumber(data.mcpRepositories), label: "Repositories with MCP or tool integration" },
    { icon: "docs", color: THEME.blue, value: compactNumber(data.mcp.configs), label: "MCP configuration signals" },
    { icon: "tool", color: THEME.cyan, value: compactNumber(data.mcp.customTools), label: "Custom tool definition signals" },
    { icon: "layers", color: THEME.purple, value: compactNumber(data.toolCategories.length), label: "Generic connected-tool categories" },
  ];

  const metricColumns = 2;
  const tileHeight = 82;
  const gap = 12;
  const metricRows = Math.ceil(metrics.length / metricColumns);
  const metricHeight = metricRows * tileHeight + (metricRows - 1) * gap;
  const categoryStartY = 72 + metricHeight + 42;
  const categoryRows = Math.max(1, data.toolCategories.length);
  const height = categoryStartY + categoryRows * 38 + 24;
  const tileWidth = (width - 40 - gap) / 2;

  const metricMarkup = metrics.map((metric, index) => {
    const column = index % metricColumns;
    const row = Math.floor(index / metricColumns);
    const x = 20 + column * (tileWidth + gap);
    const y = 72 + row * (tileHeight + gap);
    const lines = wrapWords(metric.label, 40, 2);
    return `<rect x="${x}" y="${y}" width="${tileWidth}" height="${tileHeight}" rx="10" fill="${metric.color}" fill-opacity=".09" stroke="${metric.color}" stroke-opacity=".55"/>
      ${icon(metric.icon, x + 13, y + 13, metric.color, 17)}
      <text x="${x + 42}" y="${y + 31}" class="value">${escapeXml(metric.value)}</text>
      ${svgTextLines({ lines, x: x + 13, y: y + 56, className: "label", lineHeight: 14 })}`;
  }).join("");

  const categoryMarkup = data.toolCategories.length
    ? data.toolCategories.map((item, index) => {
      const y = categoryStartY + index * 38;
      const barWidth = Math.min(360, item.repositories * 52);
      return `${icon("tool", 28, y - 15, THEME.cyan, 14)}
        <text x="52" y="${y}" class="small">${escapeXml(item.name)}</text>
        <rect x="340" y="${y - 10}" width="360" height="8" rx="4" fill="${THEME.track}"/>
        <rect x="340" y="${y - 10}" width="${barWidth}" height="8" rx="4" fill="${THEME.cyan}"/>
        <text x="860" y="${y}" text-anchor="end" class="label">${item.repositories} repos</text>`;
    }).join("")
    : `<text x="28" y="${categoryStartY}" class="empty">No generic MCP tool categories were identified.</text>`;

  return cardShell({
    width,
    height,
    title: "MCP & Tool Integration",
    iconName: "network",
    accent: THEME.green,
    subtitle: "Aggregate tool categories only · private server names, URLs and credentials are never rendered",
    body: `${metricMarkup}<text x="28" y="${categoryStartY - 24}" class="title" style="font-size:14px">Detected tool categories</text>${categoryMarkup}`,
  });
}

function renderRagRetrieval(data) {
  return metricCard({
    title: "RAG & Retrieval Engineering",
    subtitle: "Retrieval pipelines, embeddings, vector stores, chunking, reranking and dynamic context injection",
    iconName: "search",
    accent: THEME.blue,
    metrics: [
      { icon: "search", value: compactNumber(data.ragRepositories), label: "Repositories with RAG or retrieval engineering" },
      { icon: "docs", value: compactNumber(data.rag.files), label: "RAG and retrieval implementation files" },
      { icon: "search", value: compactNumber(data.rag.retrieval), label: "Retriever and semantic-search signals" },
      { icon: "brain", value: compactNumber(data.rag.embeddings), label: "Embedding generation and model signals" },
      { icon: "database", value: compactNumber(data.rag.vectorDatabases), label: "Vector database and store signals" },
      { icon: "layers", value: compactNumber(data.rag.chunking), label: "Document chunking and splitting signals" },
      { icon: "route", value: compactNumber(data.rag.reranking), label: "Reranking and fusion signals" },
      { icon: "docs", value: compactNumber(data.rag.contextInjection), label: "Retrieved-context injection signals" },
    ],
    columns: 2,
  });
}

function renderEvaluationObservability(data) {
  return metricCard({
    title: "AI Evaluation & Observability",
    subtitle: "Evaluation harnesses, golden data, benchmarks, regression checks, traces, telemetry, latency and cost signals",
    iconName: "eye",
    accent: THEME.cyan,
    width: 960,
    columns: 3,
    metrics: [
      { icon: "eye", value: compactNumber(data.evaluationRepositories), label: "Repositories with evaluation or observability" },
      { icon: "test", value: compactNumber(data.evaluation.files), label: "Evaluation implementation files" },
      { icon: "docs", value: compactNumber(data.evaluation.goldenDatasets), label: "Golden dataset and expected-output signals" },
      { icon: "activity", value: compactNumber(data.evaluation.benchmarks), label: "Benchmark suite signals" },
      { icon: "test", value: compactNumber(data.evaluation.regression), label: "Prompt and model regression checks" },
      { icon: "eye", value: compactNumber(data.evaluation.tracing), label: "LLM and agent tracing signals" },
      { icon: "activity", value: compactNumber(data.evaluation.telemetry), label: "Telemetry and operational metrics" },
      { icon: "calendar", value: compactNumber(data.evaluation.latencyTokens), label: "Latency and token-usage monitoring" },
      { icon: "database", value: compactNumber(data.evaluation.costMonitoring), label: "Model cost and usage monitoring" },
      { icon: "tool", value: compactNumber(data.evaluation.toolSuccess), label: "Tool-call success and error metrics" },
    ],
  });
}

function renderGovernanceSafety(data) {
  return metricCard({
    title: "AI Governance & Safety",
    subtitle: "Secret protection, least privilege, approvals, production safeguards, validation, injection defence and auditability",
    iconName: "shield",
    accent: THEME.red,
    metrics: [
      { icon: "shield", value: compactNumber(data.governanceRepositories), label: "Repositories with AI governance evidence" },
      { icon: "lock", value: compactNumber(data.governance.secretProtection), label: "Repositories with secret-protection rules" },
      { icon: "tool", value: compactNumber(data.governance.restrictedTools), label: "Restricted-command and tool policies" },
      { icon: "shield", value: compactNumber(data.governance.approval), label: "Human-approval checkpoints" },
      { icon: "lock", value: compactNumber(data.governance.productionSafeguards), label: "Production-write safeguards" },
      { icon: "test", value: compactNumber(data.governance.outputValidation), label: "Generated-output validation requirements" },
      { icon: "shield", value: compactNumber(data.governance.promptInjection), label: "Prompt-injection defence signals" },
      { icon: "lock", value: compactNumber(data.governance.privacyPii), label: "Privacy and PII protection signals" },
      { icon: "activity", value: compactNumber(data.governance.auditability), label: "Audit, journal and traceability signals" },
    ],
    columns: 3,
    width: 960,
  });
}

function renderActivity(activity) {
  const width = 900;
  const height = 306;
  const chartX = 36;
  const chartY = 176;
  const chartWidth = width - 72;
  const chartHeight = 82;
  const months = activity.monthly?.slice(-12) ?? [];
  const maximum = Math.max(1, ...months.map((item) => Number(item.commits) || 0));
  const points = months.map((item, index) => {
    const x = chartX + (index / Math.max(1, months.length - 1)) * chartWidth;
    const y = chartY + chartHeight - ((Number(item.commits) || 0) / maximum) * chartHeight;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
  const labels = months.map((item, index) => {
    if (index % 2 !== 0 && index !== months.length - 1) return "";
    const x = chartX + (index / Math.max(1, months.length - 1)) * chartWidth;
    return `<text x="${x.toFixed(1)}" y="292" text-anchor="middle" class="tiny">${escapeXml(item.month)}</text>`;
  }).join("");
  const area = points
    ? `${chartX},${chartY + chartHeight} ${points} ${chartX + chartWidth},${chartY + chartHeight}`
    : "";

  const metrics = [
    { icon: "activity", color: THEME.green, value: compactNumber(activity.commits), label: "AI-workflow commits" },
    { icon: "docs", color: THEME.blue, value: compactNumber(activity.files), label: "AI evidence files touched" },
    { icon: "layers", color: THEME.purple, value: compactNumber(activity.repositories), label: "Repositories with AI evolution" },
    { icon: "calendar", color: THEME.orange, value: compactNumber(activity.activeMonths), label: "Active AI-engineering months" },
  ];
  const tileWidth = (width - 40 - 36) / 4;
  const metricMarkup = metrics.map((metric, index) => {
    const x = 20 + index * (tileWidth + 12);
    const y = 72;
    return `<rect x="${x}" y="${y}" width="${tileWidth}" height="76" rx="10" fill="${metric.color}" fill-opacity=".09" stroke="${metric.color}" stroke-opacity=".55"/>
      ${icon(metric.icon, x + 12, y + 12, metric.color, 16)}
      <text x="${x + 39}" y="${y + 29}" class="value">${escapeXml(metric.value)}</text>
      ${svgTextLines({ lines: wrapWords(metric.label, 24, 2), x: x + 12, y: y + 53, className: "label", lineHeight: 13 })}`;
  }).join("");

  return cardShell({
    width,
    height,
    title: "AI Workflow Activity",
    iconName: "activity",
    accent: THEME.green,
    subtitle: `First ${formatDate(activity.firstDate)} · latest ${formatDate(activity.latestDate)} · commits touching AI engineering evidence paths`,
    body: `${metricMarkup}<defs><linearGradient id="ai-activity-area" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${THEME.purple}" stop-opacity=".48"/><stop offset="1" stop-color="${THEME.purple}" stop-opacity="0"/></linearGradient></defs><line x1="${chartX}" y1="${chartY + chartHeight}" x2="${chartX + chartWidth}" y2="${chartY + chartHeight}" stroke="${THEME.border}"/>${area ? `<polygon points="${area}" fill="url(#ai-activity-area)"/><polyline points="${points}" fill="none" stroke="${THEME.purple}" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round"/>` : `<text x="${width / 2}" y="220" text-anchor="middle" class="empty">No GitHub-attributed AI workflow file changes were found in the analysed commit window.</text>`}${labels}`,
  });
}

function trophyLevel(score, thresholds) {
  if (score >= thresholds[3]) return { level: "Platinum", color: "#E5E4E2" };
  if (score >= thresholds[2]) return { level: "Gold", color: "#D29922" };
  if (score >= thresholds[1]) return { level: "Silver", color: "#C0C0C0" };
  if (score >= thresholds[0]) return { level: "Bronze", color: "#CD7F32" };
  return { level: "Locked", color: THEME.muted };
}

function renderTrophies(data, activity) {
  const definitions = [
    ["AI-Native Builder", data.enabled.length, [1, 3, 6, 10]],
    ["Prompt Engineer", data.promptRepositories, [1, 3, 6, 10]],
    ["Context Engineer", data.contextRepositories, [1, 3, 6, 10]],
    ["Memory Engineer", data.memoryRepositories, [1, 2, 4, 7]],
    ["AI Harness Engineer", data.harnessRepositories, [1, 2, 4, 7]],
    ["Agentic Orchestrator", data.orchestrationRepositories, [1, 2, 4, 7]],
    ["MCP Integrator", data.mcpRepositories, [1, 2, 4, 6]],
    ["RAG Engineer", data.ragRepositories, [1, 2, 4, 6]],
    ["Evaluation & Observability", data.evaluationRepositories, [1, 2, 4, 6]],
    ["AI Governance", data.governanceRepositories, [1, 2, 4, 6]],
    ["AI Workflow Evolution", activity.commits, [1, 10, 30, 75]],
  ];

  const width = 1000;
  const columns = 4;
  const gap = 12;
  const cellWidth = (width - 40 - gap * (columns - 1)) / columns;
  const cellHeight = 132;
  const rows = Math.ceil(definitions.length / columns);
  const height = 72 + rows * cellHeight + (rows - 1) * gap + 18;

  const body = definitions.map(([name, score, thresholds], index) => {
    const column = index % columns;
    const row = Math.floor(index / columns);
    const x = 20 + column * (cellWidth + gap);
    const y = 70 + row * (cellHeight + gap);
    const result = trophyLevel(score, thresholds);
    const titleLines = wrapWords(name, 25, 2);

    return `<rect x="${x}" y="${y}" width="${cellWidth}" height="${cellHeight}" rx="10" fill="${THEME.track}" stroke="${THEME.border}"/>
      ${icon("trophy", x + cellWidth / 2 - 12, y + 15, result.color, 24)}
      ${svgTextLines({ lines: titleLines, x: x + cellWidth / 2, y: y + 64, className: "small", lineHeight: 14, anchor: "middle" })}
      <text x="${x + cellWidth / 2}" y="${y + 101}" text-anchor="middle" style="fill:${result.color};font:700 12px -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">${result.level}</text>
      <text x="${x + cellWidth / 2}" y="${y + 120}" text-anchor="middle" class="tiny">Evidence score ${compactNumber(score)}</text>`;
  }).join("");

  return cardShell({
    width,
    height,
    title: "AI Engineering Trophies",
    iconName: "trophy",
    accent: THEME.yellow,
    subtitle: "Evidence-based discipline milestones with transparent repository and activity thresholds",
    body,
  });
}

/**
 * Builds the complete AI engineering card set.
 *
 * The returned filenames are part of the workflow/README contract. Keep this
 * list synchronized with update-readme-analytics.mjs and the workflow arrays.
 */
export function buildAiEngineeringCards(repositoryDetails, aiWorkflowActivity = {}) {
  const data = aggregateAnalyses(repositoryDetails);
  const activity = {
    commits: Number(aiWorkflowActivity.commits ?? 0),
    files: Number(aiWorkflowActivity.files ?? 0),
    repositories: Number(aiWorkflowActivity.repositories ?? 0),
    activeMonths: Number(aiWorkflowActivity.activeMonths ?? 0),
    firstDate: aiWorkflowActivity.firstDate ?? null,
    latestDate: aiWorkflowActivity.latestDate ?? null,
    monthly: Array.isArray(aiWorkflowActivity.monthly) ? aiWorkflowActivity.monthly : [],
  };

  return {
    "ai-engineering-overview.svg": renderOverview(data),
    "prompt-engineering.svg": renderPromptEngineering(data),
    "context-engineering.svg": renderContextEngineering(data),
    "memory-engineering.svg": renderMemoryEngineering(data),
    "ai-harness-engineering.svg": renderHarnessEngineering(data),
    "agentic-orchestration.svg": renderAgenticOrchestration(data),
    "mcp-tool-integration.svg": renderMcpTools(data),
    "rag-retrieval-engineering.svg": renderRagRetrieval(data),
    "ai-evaluation-observability.svg": renderEvaluationObservability(data),
    "ai-governance-safety.svg": renderGovernanceSafety(data),
    "ai-workflow-activity.svg": renderActivity(activity),
    "ai-engineering-trophies.svg": renderTrophies(data, activity),
  };
}
