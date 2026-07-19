# Version 1 release checklist

1. Complete local frozen installation, lint, tests, build, distribution
   verification, config validation, offline self-tests, asset validation, and
   `git diff --check`.
2. Review the committed `dist/index.js`, workflow permissions, full-SHA
   third-party Action pins, secret names, path allowlists, and generated-file
   staging.
3. Complete every sandbox scenario in `SANDBOX_VALIDATION.md`.
4. Confirm the live profile README/cards are unchanged before enabling the
   migrated owner workflow.
5. Manually create immutable `v1.0.0` from the reviewed commit.
6. Manually create or move `v1` to that commit. Move `v1` only for compatible
   version 1 releases; breaking changes require `v2`.
7. Optionally publish the Action to GitHub Marketplace and add repository
   topics after reviewing Marketplace metadata.

No script or workflow in this repository creates releases or tags.
