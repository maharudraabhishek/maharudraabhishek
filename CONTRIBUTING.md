# Contributing

External contributors should fork the public repository and open a pull
request. Do not commit directly, include credentials, call live private APIs in
tests, change analytics formulas without a documented defect and regression
test, or regenerate owner assets as part of an unrelated change.

Use Node.js 24 and pnpm. Run:

```text
pnpm install --frozen-lockfile
pnpm lint
pnpm test
pnpm build
pnpm verify:dist
```

Changes to the Action, workflows, scripts, configuration, or profile README
require owner review. CODEOWNERS supports review routing but does not replace
branch protection or repository permissions.
