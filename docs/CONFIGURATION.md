# Configuration

Resolution order is explicit Action/workflow inputs, an optional caller config
file, `GITHUB_REPOSITORY_OWNER`, then safe defaults. Input aliases replace
config aliases when the input is non-empty. Repository exclusions remain in
the config file because version 1 intentionally does not expose every internal
policy as an Action input.

## Inputs

| Input | Default | Purpose |
| --- | --- | --- |
| `github-username` | `GITHUB_REPOSITORY_OWNER` | Primary GitHub identity. |
| `aliases` | empty | Comma-separated historical identities. |
| `config-path` | empty | Workspace-relative optional `.mjs` config. |
| `include-private` | `false` | Require and use the caller private token. |
| `output-directory` | `assets/github-analytics` | Generated file directory. |
| `readme-path` | `README.md` | Managed Markdown file. |
| `update-readme` | `true` | Replace the marker-bounded analytics block. |
| `insert-readme-markers` | `false` | Append markers when absent. |
| `attribution` | `true` | Add one opt-out project attribution below the block. |
| `strict-mode` | `true` | Require complete, trustworthy core output. |
| `commit-message` | `chore: update GitHub analytics` | Reusable workflow only. |

Booleans passed directly to the Action must be exactly `true` or `false`.
Typed reusable-workflow booleans are converted to those values. Non-strict mode
does not turn unavailable data into zero or relax SVG/path safety; version 1
still stops when a metric cannot be represented honestly.

Public mode labels inaccessible private repository data as `N/A`, not zero.
See [the public accuracy boundary](PUBLIC_MODE_ACCURACY.md).

The reusable workflow interface supplies its documented path and boolean
defaults to the Action. A caller config is therefore primarily useful for
identity aliases and repository exclusions when using the reusable workflow;
pass workflow inputs to override paths or modes.

## Optional config file

```javascript
export default {
  profile: {
    username: "your-github-login",
  },
  publicContributions: {
    aliases: ["your-old-login"],
  },
  repositories: {
    excludeProfileRepository: true,
    exclude: ["your-github-login/example-repository"],
  },
  output: {
    directory: "assets/github-analytics",
    readmePath: "README.md",
  },
  readme: {
    // Optional config-only customization of the managed block heading.
    analyticsHeading: "## 📊 GitHub Engineering Analytics",
  },
};
```

Aliases are trimmed, empty entries are removed, duplicates are removed
case-insensitively, and the primary username is excluded while first-seen
order is preserved.

`readme.analyticsHeading` is optional and must be one single Markdown heading.
It lets a profile preserve an established managed-section title without adding
another Action input. The default is `## 📊 GitHub Analytics`.

## Path and README rules

Paths resolve against `GITHUB_WORKSPACE`. Workspace escapes, symlink escapes,
the workspace root, `.git`, `.github/workflows`, `action.yml`, reusable source,
scripts, and `dist` are rejected. The output directory is exclusively owned by
the Action: it is rebuilt in a sibling staging directory and replaced only
after every validated asset is copied. This removes stale files, placeholders,
and nested entries while preserving the prior output when staging cannot be
prepared.

The updater supports the documented lowercase markers and the legacy owner
`ENGINEERING_ANALYTICS` markers. Exactly one complete style may exist. Missing,
reversed, duplicate, incomplete, or mixed markers fail before README writes.
Everything outside the markers is preserved byte-for-byte, including Unicode,
whitespace, and LF/CRLF style.

## Action outputs

| Output | Format |
| --- | --- |
| `generated-files` | JSON array of sorted workspace-relative paths. |
| `generated-card-count` | Decimal integer. |
| `repositories-analyzed` | Decimal integer. |
| `repositories-skipped` | Decimal integer. |
| `readme-updated` | `true` or `false`. |
| `changes-detected` | `true` or `false`. |
| `output-directory` | Validated workspace-relative directory path. |
| `readme-path` | Validated workspace-relative README path. |

Outputs never include tokens or private repository names. Version 1 preserves
the existing card selection and does not expose per-card or formula controls.
