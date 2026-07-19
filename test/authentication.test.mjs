import assert from "node:assert/strict";
import test from "node:test";
import { validateGitHubAuthentication } from "../scripts/generate-engineering-analytics.mjs";
import { selectGitHubTokens } from "../src/github/authentication.mjs";
import { redactSecrets } from "../src/shared/errors.mjs";

test("public mode uses only the caller GITHUB_TOKEN", () => {
  const tokens = selectGitHubTokens({
    includePrivate: false,
    githubToken: "public-token",
    privateToken: "ignored-private-token",
  });
  assert.equal(tokens.publicToken, "public-token");
  assert.equal(tokens.privateToken, null);
});

test("private mode requires and selects caller-owned private token", () => {
  assert.throws(() => selectGitHubTokens({
    includePrivate: true,
    githubToken: "public-token",
    privateToken: "",
  }), /no caller-owned private token/);
  assert.equal(selectGitHubTokens({
    includePrivate: true,
    githubToken: "public-token",
    privateToken: "private-token",
  }).privateToken, "private-token");
});

test("missing public token fails in either mode", () => {
  assert.throws(() => selectGitHubTokens({
    includePrivate: false,
    githubToken: "",
  }), /GITHUB_TOKEN is required/);
});

test("known and supplied token formats are redacted", () => {
  const supplied = "custom-secret-value";
  const redacted = redactSecrets(
    `Bearer abc.def github_pat_example ghp_example ${supplied}`,
    [supplied],
  );
  assert.equal(redacted.includes(supplied), false);
  assert.equal(redacted.includes("github_pat_example"), false);
  assert.equal(redacted.includes("ghp_example"), false);
});

test("public mode validates an installation token without calling /user", async () => {
  const calls = [];
  const result = await validateGitHubAuthentication({
    includePrivateMode: false,
    profileUsername: "example-user",
    publicHeaders: { Authorization: "Bearer test-public" },
    request: async (endpoint, options) => {
      calls.push({ endpoint, options });
      return { resources: { core: { remaining: 5000 } } };
    },
  });

  assert.equal(result.mode, "public");
  assert.deepEqual(calls.map(({ endpoint }) => endpoint), ["/rate_limit"]);
  assert.equal(calls[0].options.label, "GITHUB_TOKEN authentication request");
});

test("private mode retains PAT identity verification through /user", async () => {
  const calls = [];
  const result = await validateGitHubAuthentication({
    includePrivateMode: true,
    profileUsername: "example-user",
    request: async (endpoint) => {
      calls.push(endpoint);
      return { login: "Example-User" };
    },
  });

  assert.equal(result.login, "Example-User");
  assert.deepEqual(calls, ["/user"]);
  await assert.rejects(
    validateGitHubAuthentication({
      includePrivateMode: true,
      profileUsername: "example-user",
      request: async () => ({ login: "different-user" }),
    }),
    /belongs to 'different-user', not 'example-user'/,
  );
});
