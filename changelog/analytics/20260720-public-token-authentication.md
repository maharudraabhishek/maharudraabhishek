# Public GitHub Actions token authentication

Public analytics mode now validates the caller's repository-scoped
`GITHUB_TOKEN` through a GitHub endpoint supported by installation tokens.
Private analytics mode continues to validate the caller-owned PAT identity
through `/user`.

This fixes `HTTP 403: Resource not accessible by integration` before public
repository discovery without changing analytics calculations, SVG design, or
private-mode behavior.
