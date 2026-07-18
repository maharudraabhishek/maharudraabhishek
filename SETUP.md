# GitHub Analytics v10

GitHub identities are now configured in one reusable file:

```text
.github/github-analytics.config.mjs
```

Change only that file when another person reuses the analytics system.

Runtime files added or updated:

```text
.github/github-analytics.config.mjs
.github/workflows/update-engineering-analytics.yml
scripts/github-analytics-config.mjs
scripts/generate-engineering-analytics.mjs
scripts/update-readme-analytics.mjs
```

Existing AI analytics remain unchanged.

`PRIVATE_STATS_TOKEN` must authenticate as the username declared under
`profile.username`. Historical usernames belong under
`publicContributions.aliases`.

No username is hardcoded in the workflow or runtime scripts.
