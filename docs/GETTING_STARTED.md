# Getting started

GitHub Engineering Analytics generates the same evidence-based SVG cards used
on this profile inside your own GitHub Actions runner. Your repository, Actions
quota, `GITHUB_TOKEN`, API quota, storage, and optional private token remain
yours; the Action has no hosted service, telemetry, or external data sink.

## Requirements

Create a public repository whose name exactly matches your GitHub username and
add a `README.md`. In that README, add one managed block where the cards should
appear:

```html
<!-- github-engineering-analytics:start -->

<!-- github-engineering-analytics:end -->
```

Create `.github/workflows/update-analytics.yml`:

```yaml
name: Update GitHub Analytics

on:
  workflow_dispatch:
  schedule:
    - cron: "17 2 * * *"

permissions:
  contents: write

jobs:
  analytics:
    uses: maharudraabhishek/maharudraabhishek/.github/workflows/generate-analytics.yml@v1
    with:
      github-username: ${{ github.repository_owner }}
      include-private: false
```

Run the workflow manually once from the Actions tab. Subsequent scheduled runs
regenerate the cards and commit only when assets or managed README content
change. The default directory contains 22 fixed analytics SVG types, a JSON
project manifest, and zero or more verified open-source project SVGs.

The reusable workflow updates the marker block for you; do not manually paste
every image. If you intentionally start without markers, set
`insert-readme-markers: true` to append one block at the end, then keep or
remove that input after the first successful run.

Use `@v1` for compatible version 1 upgrades. For stronger supply-chain control,
pin the reusable workflow or direct Action to an immutable release commit and
update it deliberately. Production workflow files in this repository pin all
third-party Actions to full commit SHAs; examples use `@v1` for this project's
documented upgrade channel.

See [configuration](CONFIGURATION.md),
[private analytics](PRIVATE_ANALYTICS.md), and
[troubleshooting](TROUBLESHOOTING.md). Complete workflows are under
[`examples/`](../examples/).
