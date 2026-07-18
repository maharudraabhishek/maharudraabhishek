# Contributor identity configuration

## Single source of truth

GitHub profile names and historical public contributor aliases are
configured only in:

```text
.github/github-analytics.config.mjs
```

The workflow, analytics generator, and README updater load that file
through `scripts/github-analytics-config.mjs`. They do not contain a
profile-specific username.

## Configuration fields

```js
export default {
  profile: {
    username: "your-primary-github-username",
  },
  publicContributions: {
    aliases: [
      "historical-work-username",
    ],
  },
  repositories: {
    excludeProfileRepository: true,
    exclude: [],
  },
};
```

### `profile.username`

The primary GitHub profile:

- owns the profile README repository;
- must match the account authenticated by `PRIVATE_STATS_TOKEN`;
- is used for private/personal repository analytics;
- is included automatically in public-contribution discovery.

### `publicContributions.aliases`

Optional historical or alternate GitHub usernames used only for
public contribution attribution.

For every configured identity, the generator searches:

- contributed-repository relationships;
- commit contribution collections;
- authored pull requests;
- submitted pull-request reviews;
- authored issues;
- public default-branch commits.

Values are case-insensitively deduplicated. Repeating the primary
username in the alias list has no effect.

### `repositories`

`excludeProfileRepository: true` automatically excludes the
`username/username` profile repository.

`exclude` accepts additional `owner/repository` values that should
not affect analytics.

## Accuracy boundaries

Full language and framework composition describes a public project as
a whole. Personally attributed commits, changed lines, files, pull
requests, and reviews count only activity GitHub associates with the
configured identities.

A single commit found through multiple identity queries is deduplicated
by SHA. A repository found through multiple discovery routes is merged
by case-insensitive `owner/name`.

## Privacy

- Never put tokens or email addresses in the config.
- Private repository names are not rendered.
- Commit messages and private file paths are not rendered.
- Aliases are used only for public contribution discovery.
