# v22 lead engineering and DevOps review

## Review conclusion

v21 was materially safer than v20, but it still had correctness and delivery
gaps that could exclude legitimate open-source work or publish incomplete
totals. v22 closes those gaps without changing the approved card renderers,
README order, or 23-asset publication contract.

## Repository ownership policy

Credential routing remains:

| Scope | Primary credential | Fallback |
|---|---|---|
| Repositories owned by the primary profile, public or private | `PRIVATE_STATS_TOKEN` | None |
| External public REST/Search requests (`-user:<primary>`) | `${{ github.token }}` | Anonymous public REST |
| External public GraphQL queries | `${{ github.token }}` | None |
| External private/internal repositories | Excluded | None |

External public contribution discovery now accepts both organization-owned and
user-owned repositories. The contributed-repository relationship query includes
user-owned repositories so a historical alias can surface repositories it
owned. Inclusion still requires verified contribution evidence from
`maharudraabhishek`, `abkumar`, or any future configured alias. Repositories
owned by the primary profile are filtered from external discovery because they
already enter through the PAT-backed personal repository collection.

## Correctness fixes

### Complete evidence propagation

A repository found by both authored-PR and reviewed-PR searches previously kept
only the first evidence value during metadata resolution. That could suppress a
required direct review scan. v22 passes and deduplicates the complete evidence
set.

### Relationship-only verification

A `repositoriesContributedTo` relationship can represent a commit, pull
request, or pull-request review. When commit and Search evidence do not explain
that relationship, v22 inspects both pull-request authorship and submitted
reviews. v21 inspected authorship only in this narrow fallback path.

### Strict pagination boundaries

The following limits now fail instead of truncating:

- `MAX_REPOSITORIES`;
- `MAX_PUBLIC_CONTRIBUTED_REPOSITORIES` while GraphQL reports another page;
- `MAX_PUBLIC_CONTRIBUTORS_PER_REPOSITORY`.

A full final contributor page is treated as incomplete because another page may
exist.

## Network resilience

Every GitHub REST, GraphQL, and raw-content request uses
`GITHUB_REQUEST_TIMEOUT_MS` (60 seconds in the workflow). Timeouts enter the
existing bounded transient-retry policy. This prevents an individual stalled
request from consuming the entire 45-minute workflow budget.

`PUBLIC_GITHUB_TOKEN` is required for production runs because GitHub GraphQL
requires authentication. Anonymous fallback remains limited to public REST
requests.

## Collaboration search isolation

All repositories owned by the primary profile are queried with the PAT through
explicit, bounded `repo:` groups, whether those repositories are public or
private. The public query excludes the primary owner with `-user:<primary>` and
therefore covers only external public repositories. Historical identities are
queried in both scopes and identifiers are deduplicated after union.

## Workflow supply-chain hardening

The two GitHub-authored actions are pinned to immutable full commit SHAs:

- `actions/checkout` v6.0.2;
- `actions/setup-node` v6.4.0.

Version comments remain beside the SHAs for maintainability. The setup action's
package-manager cache is explicitly disabled because this project has no
dependency installation step. The PAT preflight uses bounded connection, total,
and retry timeouts.

## Unchanged behavior

- all profile-owned public/private repository scans and collaboration
  searches use `PRIVATE_STATS_TOKEN`;
- external public repository searches exclude the primary owner and use the
  workflow token plus anonymous REST fallback;
- external private/internal repositories remain excluded;
- both configured identities are used and deduplicated;
- failed or incomplete verification never becomes numeric zero;
- assets are generated in staging and replace the complete `assets/` directory;
- all 23 SVG cards and README ordering are unchanged.
