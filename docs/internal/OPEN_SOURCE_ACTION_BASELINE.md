# Open-source Action baseline

Captured locally on 2026-07-19 before the reusable Action migration. No
credentialed GitHub request or generated-asset publication was performed.

## Current architecture and entry points

- `.github/github-analytics.config.mjs` is the only runtime owner-identity
  configuration.
- `scripts/generate-engineering-analytics.mjs` is the production generator. It
  owns GitHub REST/GraphQL collection, contribution verification, calculations,
  and SVG rendering.
- `scripts/ai-engineering-analytics.mjs` supplies the existing AI evidence
  analysis and renderers.
- `scripts/manage-analytics-assets.mjs` resets, validates, and publishes the
  generated asset set.
- `scripts/update-readme-analytics.mjs` renders the profile analytics Markdown.
- `.github/workflows/update-engineering-analytics.yml` is the only production
  workflow. It runs daily at `17 2 * * *` and on manual dispatch.

The production flow is configuration and two GitHub credentials, followed by
repository discovery, strict evidence verification, bounded scanning,
calculation/rendering into `generated-analytics`, exact-set validation,
replacement of `assets`, marker-managed README rendering, and an allowlisted
commit.

## Identity, credentials, and repository policy

- The primary owner login and historical alias are present only in the personal
  config, profile README/generated data, and owner-specific documentation.
- `PRIVATE_STATS_TOKEN` is used for profile-owned public/private repositories.
- `PUBLIC_GITHUB_TOKEN` is used for external public discovery and GraphQL;
  anonymous fallback is limited to eligible public REST requests.
- The profile repository is excluded by configuration. Forks and disabled
  repositories are excluded; archived repositories are currently included.
- External repositories require verified default-branch commits, authored pull
  requests, or submitted reviews. Failed or incomplete verification is not
  converted to numeric zero.

## Network and correctness behavior

The generator uses paginated REST and GraphQL requests, bounded concurrency,
credential-scoped Search queues, request timeouts, and bounded retries. Generic
HTTP 422 responses are not rate limits. Retries are limited to network errors,
explicit 403/429 rate limits, and HTTP 502/503/504 failures. Language footprint
uses GitHub Linguist bytes; personal-code impact uses GitHub-attributed changed
lines. Existing AI analytics remain evidence-based repository signals.

## Workflow permissions and validation

The production workflow has `contents: write`, pins `actions/checkout` and
`actions/setup-node` to full commit SHAs, and performs syntax validation,
semantic config validation, two offline self-tests, exact-set SVG validation,
README validation, and explicit `assets`/`README.md` staging. There was no
package manifest, dependency installation, standalone test runner, reusable
workflow, or distributable Action at baseline.

Baseline commands and results:

```text
node --check scripts/*.mjs                         PASS
node scripts/github-analytics-config.mjs --validate PASS
node scripts/generate-engineering-analytics.mjs --self-test-summary-cards PASS
node scripts/generate-engineering-analytics.mjs --self-test-data-pipeline PASS
node scripts/manage-analytics-assets.mjs validate-assets PASS
```

## Generated output contract

The fixed contract is 22 named SVG cards plus
`open-source-projects.json`. The manifest currently describes six dynamic
project SVGs, producing 29 files total (28 SVGs plus the manifest). The README
contains exactly one `ENGINEERING_ANALYTICS` marker pair and references every
current SVG once.

| File | SHA-256 |
| --- | --- |
| agentic-orchestration.svg | `ba3bbf39604e85f28ccff2a619d3ee4dd8e9303ee9066528bda1e829906472cc` |
| agentic-workflow-maturity.svg | `5757c3b74b0b155730436d2b65b4abd950c11be2838e9bd7f73e5602b5443ed8` |
| ai-engineering-capabilities.svg | `dfd16c040db90358545d1c1470a25ac86258b33c734876e81607cecc3f397510` |
| ai-engineering-overview.svg | `125deda73befed1424fb3ffd6adee3387c4bd1d36aff2bce98e823e66133ad5f` |
| ai-engineering-trophies.svg | `6958df2f5af17c381772b71d263810e760cc970c0bfcb93726205b5213829b7b` |
| ai-harness-engineering.svg | `7da707503a7d3c47b293b9bf8b70ea8382b0285a960a7f793a09f0887b3b6bfd` |
| ai-workflow-activity.svg | `95bd994bea95060875d322503eade0381ce7f27daca0741e061da7edc0629d74` |
| context-engineering.svg | `3465a05825c91c30c6ab4bbe092ddcbffd3b6f03a23688f9876f4152eab241b2` |
| context-governance.svg | `1f5dedaf0fe356c50f80955cd415bab691d5b196e333c4da757d6b1da9386b64` |
| contribution-graph.svg | `04add9d3ab26efb66c9d02668c599cd6729871e879915af40fe90ae34f9b9070` |
| contribution-streak.svg | `6dbed1cda5c1e78eef0f8b73d0dc2bdfaec00fb56322958fd72128582a351c64` |
| delivery-collaboration.svg | `0c7988ee47581e883ab1871ff5a49826e7b9c01458c3cb8faa37972b5559c00e` |
| engineering-domains.svg | `41e197ed093f5cab1eb13f6f170652d8bbd31ef0f6e44e6518d98e88b235d68a` |
| frameworks-platforms.svg | `bdcf637dab466140c1b3cdd34db7a483391ac115d37bef4daa2257d15ebc6a01` |
| github-activity-graph.svg | `639c55a1c1cb4ec32bb6cdcc6d11b3a755b42874cc3235823e2aa91ea4564266` |
| github-overview.svg | `24196fbe3fc362998be89ad4b0c0aa1d7e9878cbd2d309da57e7d4372a708b69` |
| github-trophies.svg | `0282f4afd781ea398660a1b78dd0d0bc2fbeab5ac9525fc4b24887c795ec6003` |
| language-spectrum.svg | `304460d49ff60ed711327536d1770832ac7b69f20c084246cdf6e8fbb0e23ce2` |
| mcp-tool-integration.svg | `89fd2233eb57edb503ed8ad2c2acd294aea880a872d34c1bf1ee80b3eed75475` |
| memory-engineering.svg | `d1d85666ce3a3ab6c99e0f9e30bbf81280cde13487a497184b35816211db114e` |
| personal-code-contribution.svg | `bdc925c24f83a2964aedfc18569d7e9818609bfe6b4f35942faf1811180bd32a` |
| repository-portfolio.svg | `3d867625df6fcc37b3de80e625986630966f414d3f97fae33a69f6706eb90c7b` |
| open-source-projects.json | `a1645c5bb2ee4e964681518fd718b53dc2162b711f6844125d7bf7fed70cc11a` |

Dynamic project filenames are stable hashes of repository identities. Card
values, the dynamic project set, contribution date windows, and the README
cache hash change when GitHub data changes. Object iteration and repository
sorting are deterministic for the same input fixture; production output is not
expected to remain byte-identical across changing GitHub snapshots.

## Risks and minimal migration boundary

- Public-only operation is blocked because the generator always requires and
  identity-checks a private PAT.
- Configuration is loaded and credentials are resolved during module import,
  which prevents a clean Action adapter.
- The legacy README cleaner can remove analytics-looking content outside its
  managed block.
- Asset publication replaces an entire configured directory rather than only
  files known to the generator.

The migration therefore keeps all discovery, verification, calculation, and
renderer functions in the existing generator while adding one shared
`runAnalytics(options)` coordinator. Configuration/token selection, safe path
resolution, exact output validation, manifest-based stale-file removal, and
marker-bounded README replacement become testable reusable boundaries shared by
the CLI-compatible owner flow and the Action adapter.
