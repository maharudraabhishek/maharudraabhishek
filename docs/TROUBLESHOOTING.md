# Troubleshooting

## Authentication and GitHub API

- **Bad credentials / invalid private token:** replace the caller secret and
  verify expiry, fine-grained repository selection, and organization approval.
- **Private token missing:** either set `include-private: false` or pass the
  named `private-stats-token` secret.
- **403:** inspect the safe error summary for a missing permission, SSO policy,
  or primary/secondary rate limit. Permission failures are not retried.
- **`Resource not accessible by integration` from `/user`:** update to a
  release containing the public installation-token authentication fix. Public
  mode validates `GITHUB_TOKEN` without requiring a user-only endpoint;
  private mode still verifies PAT identity through `/user`.
- **404:** GitHub often uses 404 for inaccessible repositories. Confirm the
  token's selected repositories; the Action does not treat it as zero data.
- **429 or explicit rate limit:** the engine honors bounded `Retry-After` or
  reset delays. Retry after quota resets if the bounded attempts expire.
- **Secondary rate limit:** reduce repeated manual dispatches. Search calls are
  already serialized by credential.
- **422:** correct the reported query/config validation issue. Generic 422
  responses are not classified as rate limiting.

## Files, README, and SVGs

- **README markers missing:** add the documented lowercase pair or use
  `insert-readme-markers: true` once.
- **Invalid markers:** keep exactly one complete pair and do not mix legacy and
  lowercase styles.
- **Empty/invalid SVG:** rerun after resolving the upstream API failure. HTML,
  JSON errors, placeholders, control characters, oversized files, and secret
  material are rejected before publication.
- **Images not rendering:** confirm the committed relative path and wait for
  GitHub's image cache. The README cache key changes with validated assets.
- **No changes detected:** this is successful idempotent behavior; no empty
  commit is created.
- **`dist/index.js` out of date:** run `pnpm build`, then
  `pnpm verify:dist`, and commit the rebuilt bundle.

## Git writes

The reusable workflow needs `contents: write` and repository Actions settings
that allow its `GITHUB_TOKEN` to write. Branch protection, "Require pull request
before merging", or "Restrict updates" may block direct analytics commits. Use
a permitted bot or a separate pull-request-based process if your rules require
one; the Action does not bypass protection or force-push.
