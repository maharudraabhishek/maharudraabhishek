# Public contribution accuracy

## Inclusion rule

External public repositories are not whitelisted by owner or name. They are
discovered globally for every configured GitHub identity and included only
after verified engineering activity is found.

A repository qualifies when any configured identity has at least one:

1. default-branch commit reported by GitHub's contributors data;
2. authored pull request;
3. submitted pull-request review or approval.

Issue-only activity and a repository relationship with zero supporting
engineering activity do not qualify.


Both organization-owned and user-owned public repositories are eligible.
Repositories owned by the primary profile are handled through the personal
repository collection and are filtered from external discovery to prevent
duplicate scope classification.

## Language footprint

The Engineering Language Footprint uses only:

- personal repositories available to the authenticated profile; and
- verified external public contribution repositories.

The card aggregates the raw code-byte totals returned by GitHub's Languages
endpoint across every verified repository. This is one consistent GitHub
Linguist unit: repositories are not assigned equal weight, and file counts are
never mixed into byte totals. A legitimate empty Linguist response remains
empty; an API failure fails the repository scan.


## Credential isolation for collaboration totals

All profile-owned repositories, public and private, are queried through
PAT-authenticated `repo:` scopes. The external public query excludes the primary
owner with `-user:<primary>` and uses the workflow token first, then anonymous
REST. Both configured identities run through both disjoint scopes, and results
are unioned by `owner/repository#number`.

## Pull-request reviews

Repository-scoped search uses the workflow token first and anonymous public
access second. The fine-grained private PAT is never selected merely because
the searched identity is the primary username.

Search returns identifiers rather than only `total_count`, allowing results
from historical aliases to be unioned by `owner/repository#number`. A failed
search is unavailable, not zero. The generator then uses bounded direct PR and
review inspection; if neither route can produce complete evidence, generation
fails before any card is published.

## Known API boundaries

GitHub contributor data can be cached. Very large repositories can also exceed
configured historical scan limits. Contributor pagination is bounded by
`MAX_PUBLIC_CONTRIBUTORS_PER_REPOSITORY`; a full final page fails the workflow
because another contributor page may exist. Reaching any discovery or history
limit fails with a corrective setting name instead of rendering a partial
count.

Generic HTTP 422 responses are not treated as rate limits. The generator keeps
GitHub's structured `errors`, request ID, documentation URL, rate-limit
resource, remaining quota, reset time, and retry-after metadata in safe
diagnostics. Only 403/429 responses with rate-limit evidence use backoff.


## SVG layout and readability

The public-contribution card uses precomputed vertical layout rather than
relying on SVG browser text wrapping. Repository identities and evidence
are wrapped with `<tspan>` lines, while project and personal metrics are
rendered as fixed-width metric tiles.

Pull-request reviews, approvals, and review submissions use emphasized
borders, larger values, and dedicated labels. Card height is calculated
from the number of language rows and framework rows, preventing the final
line or badge row from being clipped.


## Project-card separation and adaptive sizing

Every verified public repository is rendered as a separate project card
with its own accent strip, border, shadow and project number.

Each card contains separate panels for:

- repository identity and verification evidence;
- full-project composition;
- verified personal commits, pull requests, reviews and approvals;
- language composition;
- frameworks and platforms.

The generator calculates card height from wrapped metadata, language rows,
framework rows and overflow notes. A 30-pixel gap separates consecutive
project cards, so repositories do not clip or visually merge.

Up to 12 language legend entries and 16 framework/platform badges are shown
per repository. Remaining signals stay included in aggregate analytics and
are reported through an explicit overflow note.
