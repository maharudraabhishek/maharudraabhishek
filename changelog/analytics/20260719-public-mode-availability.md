# Public mode private-data availability

- Public analytics now labels private repository counts as unavailable instead
  of displaying an apparent zero when the caller token cannot access them.
- Private analytics retains the existing verified numeric private repository
  count and card presentation.
- Covered by the public-mode renderer regression test and the existing owner
  compatibility suite.

Live GitHub generation and workflow publication were not run during local
implementation; the sandbox validation plan remains required before release.
