# GitHub network calls and recovery behavior

This document explains the network requests made by the analytics generator.
It is intended to make workflow logs, credentials, rate limits, and retries
easy to understand. No token values are logged or stored in the repository.

## Credentials and request scopes

| Request scope | Credential | Purpose |
|---|---|---|
| Profile-owned public and private repositories | `PRIVATE_STATS_TOKEN` | Lists personal repositories, scans them, and counts personal collaboration activity. |
| External public repositories | `${{ github.token }}` / `PUBLIC_GITHUB_TOKEN` | Discovers and verifies open-source contributions. |
| External public REST fallback | No credential | Reads public data only when the workflow token cannot access it. |

The configured identities `maharudraabhishek` and `abkumar` are both used for
external public/open-source discovery and collaboration searches. They remain
separate search identities, and result identifiers are deduplicated.

## What the generator requests from GitHub

| Area | API type | Main requests | Why it is needed |
|---|---|---|---|
| Authentication | REST | `GET /user` | Confirms that `PRIVATE_STATS_TOKEN` belongs to the configured profile. |
| Repository inventory | REST | `GET /user/repos` | Lists profile-accessible repositories before selecting analytics candidates. |
| Public contribution discovery | GraphQL and REST Search | `repositoriesContributedTo`, yearly contribution collections, `/search/issues` | Finds external public repositories with commits, authored PRs, or reviews from either configured identity. |
| Public repository verification | REST and GraphQL | `GET /repos/{owner}/{repo}`, lifecycle queries | Confirms candidate metadata and contribution evidence. |
| Repository scanning | REST and raw GitHub content | Languages, Git trees, contents, raw manifests | Measures languages, files, manifests, and project signals. |
| Contribution history | GraphQL | Contribution years and yearly calendars | Builds contribution, streak, and activity metrics. |
| Collaboration totals | REST Search | `/search/issues` | Counts PRs, merged PRs, and closed issues across personal and external public scopes. |
| Code contribution impact | REST | Commit listings and commit details | Finds authored commits and changed files for contribution analysis. |

## Collaboration Search calls

For each configured identity, the generator performs three searches:

1. Pull requests authored by that identity.
2. Merged pull requests authored by that identity.
3. Closed non-PR issues authored by that identity.

Personal repositories are searched with `PRIVATE_STATS_TOKEN`. External public
searches exclude the primary profile owner and use the workflow token, followed
by anonymous public REST fallback when appropriate.

Every result is identified as `owner/repository#number`. Results from aliases,
credentials, and split searches are merged into a set, so the same PR or issue
is counted only once.

## Why a repository group may be subdivided

GitHub can occasionally reject a valid combined repository Search scope, even
when each repository works by itself. The current example is a combined search
containing `TestApp OR WebApp`.

When this exact GitHub response is received:

```text
HTTP 422, Search/q/invalid,
"The listed users and repositories cannot be searched..."
```

the generator does the following:

1. Splits the rejected repository group into two smaller groups.
2. Retries the same author and state qualifiers for each group.
3. Repeats splitting only if a smaller combined group is rejected.
4. Uses a normal singleton query for one repository.
5. Unions the normal Search results without duplicates.

Example:

```text
Search: TestApp OR WebApp  -> GitHub rejects the combined scope
Search: TestApp            -> succeeds
Search: WebApp             -> succeeds
Result: merge both identifier sets
```

This does not remove a repository, change a metric, or stop either configured
identity from being used for public open-source projects. If even a single
repository query is rejected, the generator fails with permission/access
guidance instead of silently publishing an incomplete count.

## Rate limits, pacing, and retries

All GitHub calls have a request timeout and bounded retries for temporary
network errors and GitHub rate limits.

Search requests are queued separately by credential:

- Authenticated Search requests have a minimum **2.1 second** gap.
- Anonymous Search fallback requests have a minimum **6.1 second** gap.
- If GitHub sends a `Retry-After` header, the server-provided wait time wins.
- If the primary quota is exhausted, the script waits until GitHub's
  `x-ratelimit-reset` time.

A message such as this is a controlled wait, not a deadlock:

```text
Pull-request search (...) was rate-limited; retrying in 54s.
```

The GitHub REST `search` bucket is separate from the normal `core` bucket.
`GET /rate_limit` reports primary quotas, but GitHub does not expose a current
secondary-limit balance. A secondary limit can therefore occur while Search
quota still appears available.

## Checking quota safely

Run this inside GitHub Actions, where the secrets exist. It prints quota data,
not token values:

```bash
curl --silent --show-error \
  --header "Authorization: Bearer $PRIVATE_STATS_TOKEN" \
  --header "Accept: application/vnd.github+json" \
  https://api.github.com/rate_limit |
  jq '.resources | {core, search, graphql}'
```

Important fields:

| Field | Meaning |
|---|---|
| `limit` | Maximum requests in the current bucket window. |
| `used` | Requests already used in that window. |
| `remaining` | Requests still available. |
| `reset` | UTC Unix timestamp at which the primary bucket resets. |

For this project, check `PRIVATE_STATS_TOKEN` and `PUBLIC_GITHUB_TOKEN`
separately because they use different GitHub rate-limit contexts.

## Safety rules

- Never print, commit, or paste token values into logs or documentation.
- Never silently skip a repository after a Search failure.
- Do not replace a PAT merely to reset quota: a new PAT for the same account
  does not create a new account-level quota window.
- Keep the offline data-pipeline and summary-card tests passing before running
  the production workflow.
