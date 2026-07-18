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
  memory: `<path d="M4 3h8v10H4zM2 5h2M2 8h2M2 11h2M12 5h2M12 8h2M12 11h2M6 1v2M10 1v2M6 13v2M10 13v2"/>`,
  runtime: `<path d="M2 8h3l2-4 3 8 2-4h2M3 14h10M4 2h8"/>`,
  route: `<circle cx="3" cy="3" r="2"/><circle cx="13" cy="13" r="2"/><path d="M5 3h3a3 3 0 0 1 3 3v2a3 3 0 0 0 2 3"/>`,
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
  "memory.json",
  "memory.yaml",
  "memory.yml",
  "promptfooconfig.yaml",
  "promptfooconfig.yml",
]);

const AI_FILE_EXTENSIONS = new Set([
  ".json", ".jsonc", ".md", ".mjs", ".js", ".jsx", ".ts", ".tsx",
  ".py", ".toml", ".yaml", ".yml", ".sh", ".kt", ".kts", ".java",
  ".go", ".rs",
]);

const CAPABILITY_COLORS = Object.freeze({
  "Agentic Development": THEME.purple,
  "Multi-Agent Orchestration": THEME.pink,
  "MCP Servers": THEME.green,
  "Tool Calling": THEME.cyan,
  "Advanced RAG": THEME.orange,
  Embeddings: THEME.yellow,
  "Vector Databases": THEME.blue,
  Evaluation: THEME.green,
  Guardrails: THEME.red,
  "Prompt Engineering": THEME.purple,
  "Context Engineering": THEME.cyan,
  "AI Automation": THEME.orange,
  "AI-Assisted Documentation": THEME.blue,
  "Local AI / On-device ML": THEME.yellow,
  "LLM API Integration": THEME.green,
  "AI Security & Governance": THEME.red,
});

function normalizedPath(value) {
  return String(value ?? "").replaceAll("\\", "/").toLowerCase();
}

function basename(value) {
  return normalizedPath(value).split("/").at(-1) ?? "";
}

function pathHasSegment(value, segment) {
  const padded = `/${normalizedPath(value)}/`;
  return padded.includes(`/${segment.toLowerCase()}/`);
}

function pathHasAnySegment(value, segments) {
  return segments.some((segment) => pathHasSegment(value, segment));
}

function extensionOf(value) {
  const base = basename(value);
  const dot = base.lastIndexOf(".");
  return dot >= 0 ? base.slice(dot) : "";
}

export function isAiEvidencePath(filePath) {
  const lower = normalizedPath(filePath);
  const base = basename(lower);

  if (AI_FILE_BASENAMES.has(base)) return true;
  if (base.startsWith("claude") && base.endsWith(".md")) return true;
  if (base.startsWith("agents") && base.endsWith(".md")) return true;
  if (/^mcp(?:[._-].+)?\.(json|jsonc|toml|ya?ml|ts|js|mjs|py)$/.test(base)) return true;
  if (/^(system[-_ ]?)?prompt(?:[._-].+)?\.(md|json|toml|ya?ml|ts|js|py)$/.test(base)) return true;
  if (/^(memory|checkpoint|guardrail|eval|trace|telemetry|harness|runner)(?:[._-].+)?\.(md|json|toml|ya?ml|ts|js|py|kt|java)$/.test(base)) return true;

  const aiDirectories = [
    ".claude", ".codex", "agents", "agent", "subagents", "prompts",
    "prompt", "commands", "skills", "hooks", "evals", "evaluations",
    "benchmarks", "guardrails", "mcp", "tools", "tooling", "ai", "rag",
    "retrieval", "embeddings", "memory", "memories", "checkpoints",
    "checkpoint", "state", "sessions", "context", "context-store",
    "harness", "runtime", "runners", "runner", "orchestration",
    "workflows", "tracing", "telemetry", "observability",
    "structured-output", "schemas",
  ];

  if (pathHasAnySegment(lower, aiDirectories)) return true;

  return /(^|\/)(ai|agentic|llm|rag|mcp|memory|prompt|context|harness|eval|observability)[-_].+\.(md|json|toml|ya?ml|ts|js|py|kt|java)$/.test(lower);
}

export function isAiEvidenceCandidatePath(filePath) {
  if (!isAiEvidencePath(filePath)) return false;
  return AI_FILE_BASENAMES.has(basename(filePath)) ||
    AI_FILE_EXTENSIONS.has(extensionOf(filePath));
}

/**
 * Prioritizes high-signal AI configuration and runtime files when a repository
 * contains more candidate files than the configured scan limit.
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
  if (pathHasAnySegment(lower, ["guardrails", "security"])) return 88;
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
  const date = new Date(`${value.slice(0, 10)}T00:00:00Z`);
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

function countMatchingPaths(paths, predicate) {
  return paths.reduce((count, value) => count + (predicate(value) ? 1 : 0), 0);
}

function addCapability(capabilities, name, evidenceCount = 1) {
  const current = capabilities.get(name) ?? 0;
  capabilities.set(name, current + Math.max(1, evidenceCount));
}

function parsePackageNames(manifests) {
  const packageNames = new Set();
  for (const manifest of manifests) {
    if (!normalizedPath(manifest.path).endsWith("package.json")) continue;
    try {
      const parsed = JSON.parse(manifest.content ?? "{}");
      for (const group of [parsed.dependencies, parsed.devDependencies, parsed.peerDependencies, parsed.optionalDependencies]) {
        for (const name of Object.keys(group ?? {})) packageNames.add(name.toLowerCase());
      }
    } catch {
      // Invalid manifests do not invalidate repository-level AI evidence.
    }
  }
  return packageNames;
}

function analyseRepository(detail) {
  const paths = (detail.paths ?? []).map(normalizedPath);
  const manifests = detail.manifests ?? [];
  const content = manifests.map((item) => `${normalizedPath(item.path)}\n${String(item.content ?? "").toLowerCase()}`).join("\n");
  const packages = parsePackageNames(manifests);
  const hasPackage = (name) => packages.has(name.toLowerCase());
  const packagePrefix = (prefix) => [...packages].some((name) => name.startsWith(prefix.toLowerCase()));
  const packageIncludes = (value) => [...packages].some((name) => name.includes(value.toLowerCase()));
  const anyPath = (predicate) => paths.some(predicate);
  const pathContains = (value) => anyPath((item) => item.includes(value.toLowerCase()));
  const pathEndsWith = (value) => anyPath((item) => item.endsWith(value.toLowerCase()));
  const contentMatches = (expression) => expression.test(content);
  const countPath = (predicate) => countMatchingPaths(paths, predicate);
  const segmentCount = (...segments) =>
    countPath((item) => pathHasAnySegment(item, segments));
  const pathRegexCount = (expression) =>
    countPath((item) => expression.test(item));

  const claude = paths.some(
    (item) => pathHasSegment(item, ".claude") || basename(item) === "claude.md",
  );
  const codex = paths.some(
    (item) =>
      pathHasSegment(item, ".codex") ||
      basename(item) === "agents.md" ||
      basename(item) === "codex.toml",
  );
  const mcpConfigs = countMatchingPaths(paths, (item) => basename(item).includes("mcp") || pathHasSegment(item, "mcp"));
  const agentFiles = countMatchingPaths(paths, (item) =>
    (pathHasSegment(item, "agents") || pathHasSegment(item, "agent") || pathHasSegment(item, "subagents")) && AI_FILE_EXTENSIONS.has(`.${basename(item).split(".").at(-1)}`),
  );
  const promptFiles = countMatchingPaths(paths, (item) => pathHasSegment(item, "prompts") || pathHasSegment(item, "commands"));
  const skillFiles = countMatchingPaths(paths, (item) => pathHasSegment(item, "skills"));
  const hookFiles = countMatchingPaths(paths, (item) => pathHasSegment(item, "hooks") || basename(item).includes("hook"));
  const evalFiles = countMatchingPaths(paths, (item) => pathHasSegment(item, "evals") || pathHasSegment(item, "evaluations") || basename(item).includes("eval"));
  const guardrailFiles = countMatchingPaths(paths, (item) => pathHasSegment(item, "guardrails") || basename(item).includes("guardrail"));
  const instructionFiles = countMatchingPaths(paths, (item) => ["claude.md", "agents.md"].includes(basename(item)));
  const moduleInstructionFiles = countMatchingPaths(paths, (item) => ["claude.md", "agents.md"].includes(basename(item)) && item.includes("/"));
  const handoverFiles = countMatchingPaths(paths, (item) => /(^|\/)(handover|session[-_ ]?handover|engineering[-_ ]?journal|proof[-_ ]?of[-_ ]?work)/.test(item));

  const dependencies = {
    openai: hasPackage("openai") || contentMatches(/\bopenai\b/),
    anthropic: hasPackage("@anthropic-ai/sdk") || hasPackage("anthropic") || contentMatches(/\banthropic\b|\bclaude[-_ ]?(api|sdk)\b/),
    langchain: hasPackage("langchain") || packagePrefix("@langchain/") || contentMatches(/\blangchain\b/),
    langgraph: hasPackage("@langchain/langgraph") || contentMatches(/\blanggraph\b/),
    llamaIndex: hasPackage("llamaindex") || contentMatches(/\bllamaindex\b|\bllama_index\b/),
    transformers: hasPackage("@huggingface/transformers") || contentMatches(/\btransformers\b|sentence[-_]transformers/),
    tensorflow: contentMatches(/\btensorflow\b|tensorflow[-_]lite|\btflite\b/),
    pytorch: contentMatches(/\bpytorch\b|\btorch\b/),
    mlkit: contentMatches(/\bmlkit\b|ml[-_ ]kit/),
    ollama: contentMatches(/\bollama\b/),
  };

  const vectorSignals = ["chromadb", "pinecone", "weaviate", "qdrant", "pgvector", "faiss", "milvus", "vector store", "vector database"]
    .filter((term) => content.includes(term) || [...packages].some((name) => name.includes(term.replaceAll(" ", ""))));
  const rag = contentMatches(/\badvanced[-_ ]?rag\b|\bretrieval[-_ ]augmented\b|\brag pipeline\b|\bretriever\b/) || pathHasSegment(paths.join("/"), "rag");
  const embeddings = contentMatches(/\bembedding(s)?\b|sentence[-_]transformers/) || vectorSignals.length > 0;
  const toolCalling = contentMatches(/\btool[-_ ]?calling\b|\bfunction[-_ ]?calling\b|allowedtools|allowed_tools|tool_choice|tool registry/);
  const multiAgent = agentFiles >= 2 || contentMatches(/\bmulti[-_ ]agent\b|\bsubagent(s)?\b|\bdirector agent\b|\brouter agent\b|agent orchestration/);
  const aiAutomation = hookFiles > 0 || contentMatches(/userpromptsubmit|posttooluse|pretooluse|automatic routing|auto[-_ ]routing|generate.*documentation|automated.*review/);
  const aiDocs = contentMatches(/ai[-_ ]assisted documentation|documentation agent|generate.*readme|engineering journal|proof of work/) || handoverFiles > 0;

  /**
   * Focused disciplines used by the four compact cards.
   *
   * Generic AI/LLM keywords do not activate these disciplines. Evidence must
   * come from repository structure, implementation terminology, or recognized
   * frameworks/configuration.
   */
  const contextEngineering = {
    instructionHierarchy:
      instructionFiles +
      moduleInstructionFiles +
      segmentCount(".claude", ".codex"),
    decisions:
      segmentCount("adr", "adrs", "decisions", "architecture") +
      pathRegexCount(/(^|\/)(adr|decision|architecture)[-_ ].*\.md$/),
    handovers:
      handoverFiles +
      pathRegexCount(/(^|\/)(session[-_ ]?summary|session[-_ ]?handover)/),
    selectionBudget:
      Number(contentMatches(/context selection|context budget|context window|token budget|context routing|context packing/)),
    compression:
      Number(contentMatches(/context compression|compress.*context|conversation summar(y|ization)|summari[sz]e.*context/)),
    retrievalInjection:
      Number(contentMatches(/context injection|retrieve.*context|retrieval context|dynamic context|context provider/)),
  };
  contextEngineering.enabled = Object.values(contextEngineering)
    .some((value) => typeof value === "number" && value > 0);

  const memoryFrameworkSignals = [
    packageIncludes("mem0"),
    packageIncludes("zep"),
    packageIncludes("langgraph") &&
      contentMatches(/checkpointer|memorysaver|sqlite?saver|postgres?saver/),
    contentMatches(/redis.*memory|memory.*redis|vector memory|semantic memory store/),
  ].filter(Boolean).length;

  const memoryEngineering = {
    files:
      segmentCount(
        "memory",
        "memories",
        "semantic-memory",
        "episodic-memory",
        "long-term-memory",
        "short-term-memory",
      ),
    checkpoints:
      segmentCount("checkpoint", "checkpoints", "savers") +
      Number(contentMatches(/checkpointer|memorysaver|sqlite?saver|postgres?saver|checkpoint_id/)),
    stateStores:
      segmentCount("state", "state-store", "snapshots") +
      Number(contentMatches(/persistent state|state store|agent state|workflow state/)),
    sessions:
      segmentCount("sessions", "session", "threads", "conversations") +
      Number(contentMatches(/conversation memory|session memory|thread memory|session store/)),
    persistent:
      Number(contentMatches(/persistent memory|long[-_ ]term memory|durable memory|memory persistence/)),
    semantic:
      Number(contentMatches(/semantic memory|episodic memory|procedural memory|memory retrieval/)),
    frameworks: memoryFrameworkSignals,
  };
  memoryEngineering.enabled = Object.values(memoryEngineering)
    .some((value) => typeof value === "number" && value > 0);

  const harnessEngineering = {
    runners:
      segmentCount("harness", "runtime", "runners", "runner", "executor", "execution-loop") +
      Number(contentMatches(/agent runtime|agent loop|execution loop|run agent|task runner/)),
    toolRegistry:
      segmentCount("tool-registry", "tools", "tooling", "functions") +
      Number(contentMatches(/tool registry|register tool|tool dispatch|tool executor/)),
    retriesRecovery:
      Number(contentMatches(/retry|backoff|error recovery|fallback on error|circuit breaker/)),
    timeoutsBudgets:
      Number(contentMatches(/timeout|token budget|cost budget|max tokens|max_steps|max iterations/)),
    routingFallback:
      Number(contentMatches(/model routing|model router|fallback model|provider fallback|route.*model/)),
    concurrency:
      Number(contentMatches(/parallel agents?|concurrency|semaphore|promise\.all|asyncio\.gather|worker pool/)),
    sandboxing:
      Number(contentMatches(/sandbox|isolated execution|containerized tool|restricted filesystem/)),
    structuredOutput:
      Number(contentMatches(/structured output|response_format|json schema|output schema|zod schema|pydantic.*schema/)),
    hooks:
      hookFiles +
      Number(contentMatches(/pretooluse|posttooluse|userpromptsubmit|before tool|after tool/)),
    tracing:
      segmentCount("tracing", "telemetry", "observability") +
      Number(contentMatches(/trace_id|distributed tracing|opentelemetry|langsmith|phoenix/)),
    ciValidation:
      pathRegexCount(/\.github\/workflows\/.*(ai|agent|prompt|eval|rag|mcp).*\.ya?ml$/) +
      Number(contentMatches(/ci validation|validate.*agent|validate.*prompt|run.*eval/)),
  };
  harnessEngineering.enabled = Object.values(harnessEngineering)
    .some((value) => typeof value === "number" && value > 0);

  const orchestrationEngineering = {
    agentFiles:
      agentFiles +
      pathRegexCount(/(^|\/)(agent|subagent)[-_ ].*\.(md|json|toml|ya?ml|ts|js|py)$/),
    multiAgent:
      Number(contentMatches(/multi[-_ ]agent|multiple agents|agent team|subagents?/)) +
      Number(segmentCount("subagents") > 0),
    routersDirectors:
      Number(contentMatches(/router agent|director agent|supervisor agent|agent router|orchestrator/)),
    planningDelegation:
      Number(contentMatches(/planner agent|task planning|delegate.*agent|agent delegation/)),
    handoffs:
      Number(contentMatches(/agent handoff|handoff_to|transfer.*agent|handover.*agent/)),
    parallelSequential:
      Number(contentMatches(/parallel agents?|sequential agents?|fan[-_ ]out|fan[-_ ]in|map[-_ ]reduce agents?/)),
    humanInLoop:
      Number(contentMatches(/human[-_ ]in[-_ ]the[-_ ]loop|human approval|interrupt_before|approval checkpoint/)),
  };
  orchestrationEngineering.enabled = Object.values(orchestrationEngineering)
    .some((value) => typeof value === "number" && value > 0);

  const governance = {
    secretProtection: contentMatches(/do not (print|expose|commit).*secret|secret[-_ ]protection|never.*token|redact.*secret|credentials? must not/),
    approval: contentMatches(/human approval|requires? approval|approval checkpoint|ask.*before|explicit approval/),
    productionSafeguards: contentMatches(/no production writes|prod(uction)?[-_ ]write|do not deploy.*production|deny.*production|staging before production/),
    restrictedCommands: contentMatches(/restricted commands|denylist|deny[-_ ]by[-_ ]default|allowlist|allowed commands|forbidden commands/),
    outputValidation: contentMatches(/validate generated|output validation|self[-_ ]review|run tests|verification checkpoint|smoke test/),
    auditability: contentMatches(/audit log|engineering journal|proof[-_ ]of[-_ ]work|atomic changelog|session log/),
  };
  const governanceCount = Object.values(governance).filter(Boolean).length;

  const toolCategories = new Set();
  if (contentMatches(/github|gitlab|pull request|repository tool/)) toolCategories.add("Git hosting");
  if (contentMatches(/filesystem|file system|read_file|write_file|directory/)) toolCategories.add("Filesystem");
  if (contentMatches(/browser|playwright|puppeteer|web search|fetch url/)) toolCategories.add("Browser & web");
  if (contentMatches(/postgres|supabase|mongodb|database|sql tool/)) toolCategories.add("Databases");
  if (contentMatches(/deploy|vercel|cloudflare|aws|gcp|digitalocean|docker/)) toolCategories.add("Cloud & deployment");
  if (contentMatches(/gmail|email|calendar|slack|jira/)) toolCategories.add("Productivity");
  if (contentMatches(/custom tool|tool schema|api tool|openapi|custom server/)) toolCategories.add("Custom APIs");

  const capabilities = new Map();
  if (claude || codex || agentFiles > 0 || aiAutomation) addCapability(capabilities, "Agentic Development", 1 + agentFiles + hookFiles);
  if (multiAgent) addCapability(capabilities, "Multi-Agent Orchestration", Math.max(2, agentFiles));
  if (mcpConfigs > 0 || contentMatches(/model context protocol|@modelcontextprotocol|\bmcp server\b|\bmcp client\b/)) addCapability(capabilities, "MCP Servers", Math.max(1, mcpConfigs));
  if (toolCalling || toolCategories.size > 0) addCapability(capabilities, "Tool Calling", 1 + toolCategories.size);
  if (rag) addCapability(capabilities, "Advanced RAG", 2);
  if (embeddings) addCapability(capabilities, "Embeddings", 1);
  if (vectorSignals.length > 0) addCapability(capabilities, "Vector Databases", vectorSignals.length);
  if (evalFiles > 0 || contentMatches(/\bevals?\b|evaluation harness|golden dataset|benchmark suite/)) addCapability(capabilities, "Evaluation", Math.max(1, evalFiles));
  if (guardrailFiles > 0 || contentMatches(/guardrails?|safety policy|content safety|prompt injection/)) addCapability(capabilities, "Guardrails", Math.max(1, guardrailFiles));
  if (promptFiles > 0) addCapability(capabilities, "Prompt Engineering", promptFiles);
  if (instructionFiles > 0 || moduleInstructionFiles > 0 || handoverFiles > 0) addCapability(capabilities, "Context Engineering", instructionFiles + moduleInstructionFiles + handoverFiles);
  if (aiAutomation) addCapability(capabilities, "AI Automation", 1 + hookFiles);
  if (aiDocs) addCapability(capabilities, "AI-Assisted Documentation", Math.max(1, handoverFiles));
  if (dependencies.tensorflow || dependencies.pytorch || dependencies.mlkit || dependencies.ollama) addCapability(capabilities, "Local AI / On-device ML", 1);
  if (dependencies.openai || dependencies.anthropic || dependencies.langchain || dependencies.langgraph || dependencies.llamaIndex || dependencies.transformers) addCapability(capabilities, "LLM API Integration", 1);
  if (governanceCount > 0) addCapability(capabilities, "AI Security & Governance", governanceCount);

  const strongEvidence =
    mcpConfigs +
    agentFiles +
    hookFiles +
    evalFiles +
    guardrailFiles +
    memoryEngineering.checkpoints +
    memoryEngineering.stateStores +
    harnessEngineering.runners +
    harnessEngineering.toolRegistry +
    orchestrationEngineering.agentFiles +
    Object.values(dependencies).filter(Boolean).length;
  const mediumEvidence =
    instructionFiles +
    promptFiles +
    skillFiles +
    moduleInstructionFiles +
    handoverFiles +
    contextEngineering.decisions +
    contextEngineering.selectionBudget +
    memoryEngineering.files +
    harnessEngineering.hooks;
  const weakEvidence = Number(contentMatches(/\bai\b|\bllm\b|\bagent\b/));
  const enabled = claude || codex || strongEvidence > 0 || mediumEvidence > 0;

  let maturity = enabled ? 1 : 0;
  if (enabled && (promptFiles + skillFiles + instructionFiles + moduleInstructionFiles >= 2)) maturity = 2;
  if (enabled && (agentFiles > 0 || mcpConfigs > 0 || hookFiles > 0 || multiAgent || toolCalling)) maturity = 3;
  if (maturity >= 3 && governanceCount >= 3 && governance.outputValidation) maturity = 4;

  return {
    scope: detail.scope,
    private: Boolean(detail.repository.private),
    enabled,
    claude,
    codex,
    both: claude && codex,
    mcpConfigs,
    agentFiles,
    promptFiles,
    skillFiles,
    hookFiles,
    evalFiles,
    guardrailFiles,
    instructionFiles,
    moduleInstructionFiles,
    handoverFiles,
    governance,
    governanceCount,
    contextEngineering,
    memoryEngineering,
    harnessEngineering,
    orchestrationEngineering,
    toolCategories,
    capabilities,
    maturity,
    strongEvidence,
    mediumEvidence,
    weakEvidence,
  };
}

function aggregateAnalyses(repositoryDetails) {
  const analyses = repositoryDetails.map(analyseRepository);
  const enabled = analyses.filter((item) => item.enabled);
  const capabilityMap = new Map();
  const toolCategoryMap = new Map();

  for (const analysis of enabled) {
    for (const [name, evidence] of analysis.capabilities) {
      const current = capabilityMap.get(name) ?? { name, repositories: 0, evidence: 0 };
      current.repositories += 1;
      current.evidence += evidence;
      capabilityMap.set(name, current);
    }
    for (const category of analysis.toolCategories) {
      toolCategoryMap.set(category, (toolCategoryMap.get(category) ?? 0) + 1);
    }
  }

  const maturityCounts = [0, 0, 0, 0, 0];
  for (const analysis of analyses) maturityCounts[analysis.maturity] += 1;
  const averageMaturity = enabled.length
    ? enabled.reduce((sum, item) => sum + item.maturity, 0) / enabled.length
    : 0;

  const sum = (field) => enabled.reduce((total, item) => total + Number(item[field] ?? 0), 0);
  const governanceCount = (field) => enabled.filter((item) => item.governance[field]).length;
  const nestedSum = (group, field) =>
    enabled.reduce(
      (total, item) => total + Number(item[group]?.[field] ?? 0),
      0,
    );
  const disciplineRepositoryCount = (group) =>
    enabled.filter((item) => item[group]?.enabled).length;

  return {
    analyses,
    enabled,
    totalRepositories: repositoryDetails.length,
    publicEnabled: enabled.filter((item) => !item.private).length,
    privateEnabled: enabled.filter((item) => item.private).length,
    claudeRepositories: enabled.filter((item) => item.claude).length,
    codexRepositories: enabled.filter((item) => item.codex).length,
    bothRepositories: enabled.filter((item) => item.both).length,
    mcpRepositories: enabled.filter((item) => item.mcpConfigs > 0 || item.capabilities.has("MCP Servers")).length,
    agentRepositories: enabled.filter((item) => item.agentFiles > 0).length,
    automationRepositories: enabled.filter((item) => item.hookFiles > 0 || item.capabilities.has("AI Automation")).length,
    governedRepositories: enabled.filter((item) => item.maturity === 4).length,
    maturityCounts,
    averageMaturity,
    highestMaturity: Math.max(0, ...enabled.map((item) => item.maturity)),
    capabilities: [...capabilityMap.values()].sort((a, b) => b.repositories - a.repositories || b.evidence - a.evidence || a.name.localeCompare(b.name)),
    toolCategories: [...toolCategoryMap.entries()].map(([name, repositories]) => ({ name, repositories })).sort((a, b) => b.repositories - a.repositories || a.name.localeCompare(b.name)),
    totals: {
      mcpConfigs: sum("mcpConfigs"),
      agentFiles: sum("agentFiles"),
      promptFiles: sum("promptFiles"),
      skillFiles: sum("skillFiles"),
      hookFiles: sum("hookFiles"),
      evalFiles: sum("evalFiles"),
      guardrailFiles: sum("guardrailFiles"),
      instructionFiles: sum("instructionFiles"),
      moduleInstructionFiles: sum("moduleInstructionFiles"),
      handoverFiles: sum("handoverFiles"),
      strongEvidence: sum("strongEvidence"),
      mediumEvidence: sum("mediumEvidence"),
    },
    specialized: {
      context: {
        repositories: disciplineRepositoryCount("contextEngineering"),
        instructionHierarchy: nestedSum("contextEngineering", "instructionHierarchy"),
        decisions: nestedSum("contextEngineering", "decisions"),
        handovers: nestedSum("contextEngineering", "handovers"),
        selectionBudget: nestedSum("contextEngineering", "selectionBudget"),
        compression: nestedSum("contextEngineering", "compression"),
        retrievalInjection: nestedSum("contextEngineering", "retrievalInjection"),
      },
      memory: {
        repositories: disciplineRepositoryCount("memoryEngineering"),
        files: nestedSum("memoryEngineering", "files"),
        checkpoints: nestedSum("memoryEngineering", "checkpoints"),
        stateStores: nestedSum("memoryEngineering", "stateStores"),
        sessions: nestedSum("memoryEngineering", "sessions"),
        persistent: nestedSum("memoryEngineering", "persistent"),
        semantic: nestedSum("memoryEngineering", "semantic"),
        frameworks: nestedSum("memoryEngineering", "frameworks"),
      },
      harness: {
        repositories: disciplineRepositoryCount("harnessEngineering"),
        runners: nestedSum("harnessEngineering", "runners"),
        toolRegistry: nestedSum("harnessEngineering", "toolRegistry"),
        retriesRecovery: nestedSum("harnessEngineering", "retriesRecovery"),
        timeoutsBudgets: nestedSum("harnessEngineering", "timeoutsBudgets"),
        routingFallback: nestedSum("harnessEngineering", "routingFallback"),
        concurrency: nestedSum("harnessEngineering", "concurrency"),
        sandboxing: nestedSum("harnessEngineering", "sandboxing"),
        structuredOutput: nestedSum("harnessEngineering", "structuredOutput"),
        hooks: nestedSum("harnessEngineering", "hooks"),
        tracing: nestedSum("harnessEngineering", "tracing"),
        ciValidation: nestedSum("harnessEngineering", "ciValidation"),
      },
      orchestration: {
        repositories: disciplineRepositoryCount("orchestrationEngineering"),
        agentFiles: nestedSum("orchestrationEngineering", "agentFiles"),
        multiAgent: nestedSum("orchestrationEngineering", "multiAgent"),
        routersDirectors: nestedSum("orchestrationEngineering", "routersDirectors"),
        planningDelegation: nestedSum("orchestrationEngineering", "planningDelegation"),
        handoffs: nestedSum("orchestrationEngineering", "handoffs"),
        parallelSequential: nestedSum("orchestrationEngineering", "parallelSequential"),
        humanInLoop: nestedSum("orchestrationEngineering", "humanInLoop"),
      },
    },
    governance: {
      secretProtection: governanceCount("secretProtection"),
      approval: governanceCount("approval"),
      productionSafeguards: governanceCount("productionSafeguards"),
      restrictedCommands: governanceCount("restrictedCommands"),
      outputValidation: governanceCount("outputValidation"),
      auditability: governanceCount("auditability"),
    },
  };
}

function metricGrid(metrics, width, startY = 78, columns = 2) {
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
    { icon: "brain", color: THEME.purple, value: compactNumber(data.enabled.length), label: "AI-enabled repositories" },
    { icon: "bot", color: THEME.orange, value: compactNumber(data.claudeRepositories), label: "Claude-configured repositories" },
    { icon: "code", color: THEME.blue, value: compactNumber(data.codexRepositories), label: "Codex-configured repositories" },
    { icon: "layers", color: THEME.pink, value: compactNumber(data.bothRepositories), label: "Claude + Codex repositories" },
    { icon: "network", color: THEME.green, value: compactNumber(data.mcpRepositories), label: "MCP-enabled repositories" },
    { icon: "bot", color: THEME.cyan, value: compactNumber(data.agentRepositories), label: "Repositories with agents" },
    { icon: "activity", color: THEME.yellow, value: compactNumber(data.automationRepositories), label: "Repositories with AI automation" },
    { icon: "shield", color: THEME.red, value: compactNumber(data.governedRepositories), label: "Governed AI repositories" },
  ];
  return cardShell({ width: 720, height: 342, title: "AI Engineering Overview", iconName: "brain", accent: THEME.purple, subtitle: `${data.publicEnabled} public + ${data.privateEnabled} private AI-enabled repositories · configuration evidence, not AI-generated-code claims`, body: metricGrid(metrics, 720, 82, 2) });
}

function renderMaturity(data) {
  const labels = ["No AI evidence", "AI Assisted", "Structured Workflow", "Agentic Automation", "Governed AI Engineering"];
  const colors = [THEME.muted, THEME.blue, THEME.purple, THEME.orange, THEME.green];
  const maximum = Math.max(1, ...data.maturityCounts);
  const rows = data.maturityCounts.map((count, level) => {
    const y = 82 + level * 43;
    const barWidth = (count / maximum) * 330;
    const levelIcon = level === 4 ? "shield" : level >= 3 ? "bot" : "layers";
    return `${icon(levelIcon, 24, y - 16, colors[level], 15)}
      <text x="50" y="${y}" class="small">Level ${level} · ${escapeXml(labels[level])}</text>
      <rect x="290" y="${y - 12}" width="330" height="9" rx="4.5" fill="${THEME.track}"/>
      <rect x="290" y="${y - 12}" width="${barWidth.toFixed(1)}" height="9" rx="4.5" fill="${colors[level]}"/>
      <text x="650" y="${y}" text-anchor="end" class="label">${count} repos</text>`;
  }).join("");
  return cardShell({ width: 680, height: 326, title: "Agentic Workflow Maturity", iconName: "layers", accent: THEME.orange, subtitle: `Average ${data.averageMaturity.toFixed(1)}/4 · highest detected level ${data.highestMaturity}/4`, body: rows });
}

function renderCapabilities(data) {
  const items = data.capabilities;
  const width = 920;
  const columns = 2;
  const rows = Math.max(1, Math.ceil(items.length / columns));
  const height = 100 + rows * 47;
  const maximum = Math.max(1, ...items.map((item) => item.repositories));
  const body = items.length ? items.map((item, index) => {
    const column = index % columns;
    const row = Math.floor(index / columns);
    const x = 24 + column * 450;
    const y = 82 + row * 47;
    const color = CAPABILITY_COLORS[item.name] ?? THEME.blue;
    const barWidth = (item.repositories / maximum) * 140;
    return `<circle cx="${x + 5}" cy="${y - 5}" r="5" fill="${color}"/>
      <text x="${x + 18}" y="${y}" class="small">${escapeXml(item.name)}</text>
      <rect x="${x + 235}" y="${y - 12}" width="140" height="8" rx="4" fill="${THEME.track}"/>
      <rect x="${x + 235}" y="${y - 12}" width="${barWidth.toFixed(1)}" height="8" rx="4" fill="${color}"/>
      <text x="${x + 430}" y="${y}" text-anchor="end" class="tiny">${item.repositories} repos · ${item.evidence} signals</text>`;
  }).join("") : `<text x="28" y="88" class="empty">No strong or medium AI engineering capabilities were detected.</text>`;
  return cardShell({ width, height, title: "AI Engineering Capabilities", iconName: "spark", accent: THEME.cyan, subtitle: "Repository coverage plus evidence signals · weak keyword mentions cannot independently award capabilities", body });
}

function renderMcpTools(data) {
  const width = 760;
  const categoryRows = data.toolCategories.length ? data.toolCategories.map((item, index) => {
    const y = 184 + index * 37;
    const barWidth = Math.min(300, item.repositories * 48);
    return `${icon("tool", 28, y - 16, THEME.cyan, 14)}
      <text x="52" y="${y}" class="small">${escapeXml(item.name)}</text>
      <rect x="300" y="${y - 11}" width="300" height="8" rx="4" fill="${THEME.track}"/>
      <rect x="300" y="${y - 11}" width="${barWidth}" height="8" rx="4" fill="${THEME.cyan}"/>
      <text x="700" y="${y}" text-anchor="end" class="label">${item.repositories} repos</text>`;
  }).join("") : `<text x="28" y="194" class="empty">No generic MCP tool categories were identified.</text>`;
  const height = 218 + Math.max(1, data.toolCategories.length) * 37;
  const metrics = [
    { icon: "network", color: THEME.green, value: compactNumber(data.mcpRepositories), label: "MCP-enabled repositories" },
    { icon: "docs", color: THEME.blue, value: compactNumber(data.totals.mcpConfigs), label: "MCP configuration signals" },
    { icon: "bot", color: THEME.purple, value: compactNumber(data.totals.agentFiles), label: "Agent definition files" },
    { icon: "tool", color: THEME.cyan, value: compactNumber(data.toolCategories.length), label: "Connected tool categories" },
  ];
  return cardShell({ width, height, title: "MCP & Tool Integration", iconName: "network", accent: THEME.green, subtitle: "Aggregate tool categories only · private server names, URLs and credentials are never rendered", body: `${metricGrid(metrics, width, 80, 2)}<text x="28" y="164" class="title" style="font-size:14px">Detected tool categories</text>${categoryRows}` });
}

function renderContextGovernance(data) {
  const width = 820;
  const metrics = [
    { icon: "docs", color: THEME.blue, value: compactNumber(data.totals.instructionFiles), label: "Repository instruction files" },
    { icon: "layers", color: THEME.purple, value: compactNumber(data.totals.moduleInstructionFiles), label: "Module-level instruction files" },
    { icon: "spark", color: THEME.cyan, value: compactNumber(data.totals.promptFiles), label: "Reusable prompt/command files" },
    { icon: "tool", color: THEME.orange, value: compactNumber(data.totals.skillFiles), label: "Reusable skill definitions" },
    { icon: "activity", color: THEME.yellow, value: compactNumber(data.totals.handoverFiles), label: "Handover and journal signals" },
    { icon: "lock", color: THEME.red, value: compactNumber(data.governance.secretProtection), label: "Repositories with secret protection" },
    { icon: "shield", color: THEME.green, value: compactNumber(data.governance.outputValidation), label: "Repositories with output validation" },
    { icon: "shield", color: THEME.orange, value: compactNumber(data.governance.productionSafeguards), label: "Repositories with production safeguards" },
    { icon: "shield", color: THEME.pink, value: compactNumber(data.governance.approval), label: "Human-approval checkpoints" },
    { icon: "lock", color: THEME.cyan, value: compactNumber(data.governance.restrictedCommands), label: "Restricted-command policies" },
  ];
  return cardShell({ width, height: 402, title: "Context Engineering & Governance", iconName: "shield", accent: THEME.red, subtitle: "Structured context, human control, secret safety and validation evidence", body: metricGrid(metrics, width, 80, 2) });
}

function disciplineDepth(repositories, evidence) {
  if (repositories <= 0 || evidence <= 0) {
    return { label: "Not detected", color: THEME.muted, progress: 0 };
  }
  if (repositories >= 3 && evidence >= 16) {
    return { label: "Deep", color: THEME.green, progress: 100 };
  }
  if (repositories >= 2 && evidence >= 9) {
    return { label: "Advanced", color: THEME.purple, progress: 78 };
  }
  if (evidence >= 4) {
    return { label: "Structured", color: THEME.blue, progress: 55 };
  }
  return { label: "Detected", color: THEME.yellow, progress: 32 };
}

/**
 * Renders a compact, non-clipping discipline card.
 *
 * Labels are controlled strings and the 2×2 metric grid uses precomputed
 * coordinates. SVG engines never need to wrap text or guess card height.
 */
function renderCompactDiscipline({
  title,
  subtitle,
  iconName,
  accent,
  repositories,
  metrics,
}) {
  const width = 480;
  const height = 252;
  const evidence = metrics.reduce(
    (total, metric) => total + Number(metric.value ?? 0),
    0,
  );
  const depth = disciplineDepth(repositories, evidence);
  const tileWidth = 212;
  const tileHeight = 46;
  const startX = 20;
  const startY = 132;
  const gapX = 12;
  const gapY = 10;

  const metricTiles = metrics.slice(0, 4).map((metric, index) => {
    const column = index % 2;
    const row = Math.floor(index / 2);
    const x = startX + column * (tileWidth + gapX);
    const y = startY + row * (tileHeight + gapY);

    return `<rect x="${x}" y="${y}" width="${tileWidth}" height="${tileHeight}" rx="8" fill="${accent}" fill-opacity=".075" stroke="${accent}" stroke-opacity=".42"/>
      ${icon(metric.icon, x + 10, y + 10, accent, 14)}
      <text x="${x + 32}" y="${y + 21}" class="small">${escapeXml(compactNumber(metric.value))}</text>
      <text x="${x + 10}" y="${y + 38}" class="tiny">${escapeXml(metric.label)}</text>`;
  }).join("");

  return cardShell({
    width,
    height,
    title,
    iconName,
    accent,
    subtitle,
    body: `<text x="22" y="88" class="value">${escapeXml(compactNumber(repositories))}</text>
      <text x="22" y="106" class="label">repositories</text>
      <text x="164" y="88" class="value">${escapeXml(compactNumber(evidence))}</text>
      <text x="164" y="106" class="label">evidence signals</text>
      <rect x="304" y="75" width="150" height="10" rx="5" fill="${THEME.track}"/>
      <rect x="304" y="75" width="${(150 * depth.progress / 100).toFixed(1)}" height="10" rx="5" fill="${depth.color}"/>
      <text x="454" y="103" text-anchor="end" style="fill:${depth.color};font:600 11px -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">${escapeXml(depth.label)} depth</text>
      ${metricTiles}`,
  });
}

function renderCompactContext(data) {
  const item = data.specialized.context;
  return renderCompactDiscipline({
    title: "Context Engineering",
    subtitle: "Instructions, decisions, handovers and context shaping",
    iconName: "docs",
    accent: THEME.cyan,
    repositories: item.repositories,
    metrics: [
      { icon: "docs", value: item.instructionHierarchy, label: "Instruction hierarchy" },
      { icon: "layers", value: item.decisions + item.handovers, label: "Decisions & handovers" },
      { icon: "brain", value: item.selectionBudget, label: "Selection & budgets" },
      { icon: "spark", value: item.compression + item.retrievalInjection, label: "Compression & injection" },
    ],
  });
}

function renderCompactMemory(data) {
  const item = data.specialized.memory;
  return renderCompactDiscipline({
    title: "Memory Engineering",
    subtitle: "Persistent state, checkpoints, sessions and semantic memory",
    iconName: "memory",
    accent: THEME.yellow,
    repositories: item.repositories,
    metrics: [
      { icon: "memory", value: item.files, label: "Memory implementation files" },
      { icon: "activity", value: item.checkpoints + item.frameworks, label: "Checkpoints & frameworks" },
      { icon: "layers", value: item.stateStores + item.sessions, label: "State stores & sessions" },
      { icon: "brain", value: item.persistent + item.semantic, label: "Persistent & semantic" },
    ],
  });
}

function renderCompactHarness(data) {
  const item = data.specialized.harness;
  return renderCompactDiscipline({
    title: "AI Harness Engineering",
    subtitle: "Runtime control, reliability, routing and safeguards",
    iconName: "runtime",
    accent: THEME.orange,
    repositories: item.repositories,
    metrics: [
      { icon: "runtime", value: item.runners, label: "Runners & execution loops" },
      { icon: "tool", value: item.toolRegistry + item.hooks, label: "Tool registry & hooks" },
      {
        icon: "activity",
        value: item.retriesRecovery + item.timeoutsBudgets + item.routingFallback,
        label: "Retries, budgets & routing",
      },
      {
        icon: "shield",
        value: item.sandboxing + item.structuredOutput + item.tracing +
          item.ciValidation + item.concurrency,
        label: "Safety, traces & CI",
      },
    ],
  });
}

function renderCompactOrchestration(data) {
  const item = data.specialized.orchestration;
  return renderCompactDiscipline({
    title: "Agentic Orchestration",
    subtitle: "Planning, delegation, handoffs and human control",
    iconName: "route",
    accent: THEME.purple,
    repositories: item.repositories,
    metrics: [
      { icon: "bot", value: item.agentFiles, label: "Agent definitions" },
      { icon: "network", value: item.multiAgent + item.routersDirectors, label: "Multi-agent & routers" },
      { icon: "route", value: item.planningDelegation + item.handoffs, label: "Planning & handoffs" },
      { icon: "shield", value: item.parallelSequential + item.humanInLoop, label: "Flow & human control" },
    ],
  });
}

function renderActivity(activity) {
  const width = 840;
  const height = 290;
  const chartX = 36;
  const chartY = 164;
  const chartWidth = width - 72;
  const chartHeight = 82;
  const months = activity.monthly?.slice(-12) ?? [];
  const maximum = Math.max(1, ...months.map((item) => item.commits));
  const points = months.map((item, index) => {
    const x = chartX + (index / Math.max(1, months.length - 1)) * chartWidth;
    const y = chartY + chartHeight - (item.commits / maximum) * chartHeight;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
  const labels = months.map((item, index) => {
    if (index % 2 !== 0 && index !== months.length - 1) return "";
    const x = chartX + (index / Math.max(1, months.length - 1)) * chartWidth;
    return `<text x="${x.toFixed(1)}" y="274" text-anchor="middle" class="tiny">${escapeXml(item.month)}</text>`;
  }).join("");
  const area = points ? `${chartX},${chartY + chartHeight} ${points} ${chartX + chartWidth},${chartY + chartHeight}` : "";
  const metrics = [
    { icon: "activity", color: THEME.green, value: compactNumber(activity.commits), label: "AI-workflow commits" },
    { icon: "docs", color: THEME.blue, value: compactNumber(activity.files), label: "AI configuration files touched" },
    { icon: "layers", color: THEME.purple, value: compactNumber(activity.repositories), label: "Repositories with AI evolution" },
    { icon: "calendar", color: THEME.orange, value: compactNumber(activity.activeMonths), label: "Active AI-engineering months" },
  ];
  return cardShell({ width, height, title: "AI Workflow Activity", iconName: "activity", accent: THEME.green, subtitle: `First ${formatDate(activity.firstDate)} · latest ${formatDate(activity.latestDate)} · GitHub-attributed commits touching AI workflow files`, body: `${metricGrid(metrics, width, 80, 4)}<defs><linearGradient id="ai-activity-area" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${THEME.purple}" stop-opacity=".48"/><stop offset="1" stop-color="${THEME.purple}" stop-opacity="0"/></linearGradient></defs><line x1="${chartX}" y1="${chartY + chartHeight}" x2="${chartX + chartWidth}" y2="${chartY + chartHeight}" stroke="${THEME.border}"/>${area ? `<polygon points="${area}" fill="url(#ai-activity-area)"/><polyline points="${points}" fill="none" stroke="${THEME.purple}" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round"/>` : `<text x="${width / 2}" y="210" text-anchor="middle" class="empty">No GitHub-attributed AI workflow file changes were found in the analysed commit window.</text>`}${labels}` });
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
    ["Agentic Architect", data.agentRepositories + data.automationRepositories, [1, 3, 6, 10]],
    ["Multi-Agent Engineer", data.capabilities.find((item) => item.name === "Multi-Agent Orchestration")?.repositories ?? 0, [1, 2, 4, 6]],
    ["MCP Integrator", data.mcpRepositories, [1, 2, 4, 6]],
    ["Context Engineer", data.capabilities.find((item) => item.name === "Context Engineering")?.repositories ?? 0, [1, 3, 6, 10]],
    ["AI Automation Builder", data.automationRepositories, [1, 2, 4, 7]],
    ["AI Governance", data.governedRepositories, [1, 2, 4, 6]],
    ["RAG Engineer", data.capabilities.find((item) => item.name === "Advanced RAG")?.repositories ?? 0, [1, 2, 4, 6]],
    ["Evaluation-Driven AI", data.capabilities.find((item) => item.name === "Evaluation")?.repositories ?? 0, [1, 2, 4, 6]],
    ["AI Workflow Evolution", activity.commits, [1, 10, 30, 75]],
  ];
  const width = 1000;
  const columns = 5;
  const rows = Math.ceil(definitions.length / columns);
  const height = 82 + rows * 130;
  const body = definitions.map(([name, score, thresholds], index) => {
    const column = index % columns;
    const row = Math.floor(index / columns);
    const x = 20 + column * 196;
    const y = 70 + row * 130;
    const result = trophyLevel(score, thresholds);
    return `<rect x="${x}" y="${y}" width="180" height="112" rx="10" fill="${THEME.track}" stroke="${THEME.border}"/>
      ${icon("trophy", x + 78, y + 15, result.color, 24)}
      <text x="${x + 90}" y="${y + 61}" text-anchor="middle" class="small">${escapeXml(name)}</text>
      <text x="${x + 90}" y="${y + 82}" text-anchor="middle" style="fill:${result.color};font:600 12px -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">${result.level}</text>
      <text x="${x + 90}" y="${y + 101}" text-anchor="middle" class="tiny">Evidence score ${compactNumber(score)}</text>`;
  }).join("");
  return cardShell({ width, height, title: "AI Engineering Trophies", iconName: "trophy", accent: THEME.yellow, subtitle: "Evidence-based milestones with transparent repository/activity thresholds", body });
}

export function buildAiEngineeringCards(repositoryDetails, aiWorkflowActivity = {}) {
  const data = aggregateAnalyses(repositoryDetails);
  const activity = {
    commits: Number(aiWorkflowActivity.commits ?? 0),
    files: Number(aiWorkflowActivity.files ?? 0),
    repositories: Number(aiWorkflowActivity.repositories ?? 0),
    changedLines: Number(aiWorkflowActivity.changedLines ?? 0),
    activeMonths: Number(aiWorkflowActivity.activeMonths ?? 0),
    firstDate: aiWorkflowActivity.firstDate ?? null,
    latestDate: aiWorkflowActivity.latestDate ?? null,
    monthly: Array.isArray(aiWorkflowActivity.monthly) ? aiWorkflowActivity.monthly : [],
  };

  return {
    "ai-engineering-overview.svg": renderOverview(data),
    "agentic-workflow-maturity.svg": renderMaturity(data),
    "ai-engineering-capabilities.svg": renderCapabilities(data),
    "mcp-tool-integration.svg": renderMcpTools(data),
    "context-governance.svg": renderContextGovernance(data),
    "ai-workflow-activity.svg": renderActivity(activity),
    "ai-engineering-trophies.svg": renderTrophies(data, activity),
    "context-engineering.svg": renderCompactContext(data),
    "memory-engineering.svg": renderCompactMemory(data),
    "ai-harness-engineering.svg": renderCompactHarness(data),
    "agentic-orchestration.svg": renderCompactOrchestration(data),
  };
}
