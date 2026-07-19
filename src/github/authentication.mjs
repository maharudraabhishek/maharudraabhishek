import { AuthenticationError } from "../shared/errors.mjs";

/** Selects caller-owned credentials without logging or persisting them. */
export function selectGitHubTokens({
  includePrivate,
  githubToken,
  privateToken,
}) {
  const publicToken = String(githubToken ?? "").trim();
  const selectedPrivateToken = String(privateToken ?? "").trim();
  if (!publicToken) {
    throw new AuthenticationError(
      "GITHUB_TOKEN is required. Pass the caller repository token to the Action environment.",
    );
  }
  if (includePrivate && !selectedPrivateToken) {
    throw new AuthenticationError(
      "Private analytics is enabled, but no caller-owned private token was supplied.",
    );
  }
  return Object.freeze({
    publicToken,
    privateToken: includePrivate ? selectedPrivateToken : null,
  });
}
