# GitHub Actions workflow guide

## Quick reference

| Workflow | What it does and when to use it |
| --- | --- |
| `continuous-integration.yml` | Automatically validates installs, lint, tests, builds, and committed `dist`; use its result as the merge/release quality gate. |
| `generate-analytics.yml` | Reusable caller-facing workflow that generates, validates, commits, and pushes analytics in the caller repository; use it from other profile repositories after a release ref exists. |
| `test-analytics.yml` | Manually generates public analytics only into `README-test.md` and `assets/github-analytics-test`; use it for isolated owner testing before touching the live profile. |
| `update-engineering-analytics.yml` | Scheduled and manual owner production refresh using private analytics into `README.md` and `assets`; use it only when intentionally updating the live profile. |

## Post-CI validation sequence

1. Manually run **Test GitHub Analytics** on `main`.
2. Confirm only `README-test.md` and `assets/github-analytics-test/` were committed.
3. Confirm the test README renders every generated SVG correctly.
4. Run **Test GitHub Analytics** again and confirm it creates no empty commit when data is unchanged.
5. Only after the isolated test passes, manually run **Update GitHub Analytics** if a live private-profile refresh is intended.
6. Complete the sandbox and release checklists before creating `v1.0.0` and `v1` manually.

Neither CI nor the reusable workflow should be manually dispatched from this repository: CI is event-driven, and the reusable workflow is invoked by a caller workflow.
