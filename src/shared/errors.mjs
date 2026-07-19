export class AnalyticsError extends Error {
  constructor(message, { code = "ANALYTICS_ERROR", cause } = {}) {
    super(message, { cause });
    this.name = new.target.name;
    this.code = code;
  }
}

export class ConfigurationError extends AnalyticsError {
  constructor(message, options = {}) {
    super(message, { code: "CONFIGURATION_ERROR", ...options });
  }
}

export class AuthenticationError extends AnalyticsError {
  constructor(message, options = {}) {
    super(message, { code: "AUTHENTICATION_ERROR", ...options });
  }
}

export class AuthorizationError extends AnalyticsError {
  constructor(message, options = {}) {
    super(message, { code: "AUTHORIZATION_ERROR", ...options });
  }
}

export class RateLimitError extends AnalyticsError {
  constructor(message, options = {}) {
    super(message, { code: "RATE_LIMIT_ERROR", ...options });
  }
}

export class GitHubApiError extends AnalyticsError {
  constructor(message, options = {}) {
    super(message, { code: "GITHUB_API_ERROR", ...options });
  }
}

export class RetryableNetworkError extends AnalyticsError {
  constructor(message, options = {}) {
    super(message, { code: "RETRYABLE_NETWORK_ERROR", ...options });
  }
}

export class RepositoryDiscoveryError extends AnalyticsError {
  constructor(message, options = {}) {
    super(message, { code: "REPOSITORY_DISCOVERY_ERROR", ...options });
  }
}

export class GenerationError extends AnalyticsError {
  constructor(message, options = {}) {
    super(message, { code: "GENERATION_ERROR", ...options });
  }
}

export class SvgValidationError extends AnalyticsError {
  constructor(message, options = {}) {
    super(message, { code: "SVG_VALIDATION_ERROR", ...options });
  }
}

export class ReadmeUpdateError extends AnalyticsError {
  constructor(message, options = {}) {
    super(message, { code: "README_UPDATE_ERROR", ...options });
  }
}

export class FileSystemSafetyError extends AnalyticsError {
  constructor(message, options = {}) {
    super(message, { code: "FILESYSTEM_SAFETY_ERROR", ...options });
  }
}

const TOKEN_LIKE_PATTERNS = [
  /\bgithub_pat_[A-Za-z0-9_]+\b/g,
  /\bgh[oprsu]_[A-Za-z0-9_]+\b/g,
  /\bBearer\s+[A-Za-z0-9._~-]+/gi,
];

/** Redacts known tokens plus caller-provided secret values from diagnostics. */
export function redactSecrets(value, secrets = []) {
  let result = String(value ?? "");
  for (const pattern of TOKEN_LIKE_PATTERNS) {
    result = result.replace(pattern, "[REDACTED]");
  }
  for (const secret of secrets) {
    const normalized = String(secret ?? "");
    if (normalized) result = result.replaceAll(normalized, "[REDACTED]");
  }
  return result;
}

export function safeErrorMessage(error, secrets = []) {
  return redactSecrets(
    error instanceof Error ? error.message : String(error),
    secrets,
  );
}
