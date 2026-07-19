# v20 data accuracy contract

## Credential boundaries

Only `PRIVATE_STATS_TOKEN` is a user-managed secret. GitHub Actions creates
`${{ github.token }}` automatically for each workflow run and passes it as
`PUBLIC_GITHUB_TOKEN`.

| Scope | Preferred credential | Fallback |
|---|---|---|
| Authenticated account and selected private/personal repositories | `PRIVATE_STATS_TOKEN` | None |
| External public repository search and REST inspection | `${{ github.token }}` | Anonymous public REST |
| External public repository GraphQL lifecycle data | `${{ github.token }}` | None; failure stops publication |

Credential choice follows repository scope, not the username being searched.
This prevents a fine-grained PAT's repository selection or organization policy
from breaking valid searches in unrelated public organizations.

## Public pull-request and review verification

Repository-scoped authored-PR and reviewed-PR searches have three properties:

1. each configured identity is queried;
2. result identifiers are unioned as `owner/repository#number`;
3. a failed or incomplete search is `unavailable`, never numeric zero.

When search is unavailable, reports review activity, or cannot explain a known
repository relationship, the generator lists PRs and submitted reviews
directly. The direct scan is bounded to protect workflow time and GitHub API
quota. Reaching that boundary, failing a review request, or retrieving only a
partial search result stops generation rather than publishing a lower count.

HTTP 422 is not automatically retried. GitHub's structured diagnostic payload
and safe response metadata are retained. Rate-limit backoff is limited to 429
or 403 responses with explicit primary/secondary rate-limit evidence.

## Personal Code Contribution

This card measures GitHub-attributed changes on each selected repository's
default branch over `CODE_ACTIVITY_YEARS` (10 by default):

- authored commits are queried for every configured current or historical
  identity and deduplicated by SHA;
- each commit's changed files are paginated and classified by extension;
- `.py` is classified as Python;
- `.ipynb` is classified as Jupyter Notebook;
- additions plus deletions form the changed-line total;
- generated/vendor/build output and lock files remain excluded.

For notebooks, GitHub reports changes to the notebook JSON document. Therefore
"changed lines" represents GitHub's diff lines, not a count of executable
Python statements or notebook cells.

The card is an authored-change view, not a repository-size view. Any failed
listing/detail request, changed-file pagination boundary, per-repository cap,
or global cap stops the run.

## Engineering Language Footprint

This card is a repository-composition view. It adds the raw language byte totals
from GitHub's Languages endpoint across:

- selected personal repositories; and
- external public repositories that passed contribution verification.

Percentages are calculated once from those combined bytes. This is different
from Personal Code Contribution: the footprint describes the full verified
projects, while the personal card describes only changes attributed to the
configured identities.

GitHub Linguist may classify notebooks as `Jupyter Notebook` and source files
as `Python`. Both are preserved as separate, truthful categories.

## Publication guarantees

Generation is staged. The workflow publishes only after syntax checks, config
validation, renderer tests, data-pipeline invariant tests, full repository scan
success, and exact validation of all 23 expected SVG files. The approved GitHub
Overview and Contribution Streak renderer layouts remain locked at 760×360.
