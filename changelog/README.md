# Changelog

This directory records only user-visible GitHub profile, analytics-output, or
externally observable automation changes.

Do not add internal work or workflow records here. This hard boundary excludes
agent configuration, Claude/Codex setup, instructions, skills, handoffs,
validation runs, process changes, and other development-flow housekeeping. If
the change is not externally observable, do not create a changelog entry.

## Entry format

Create focused Markdown entries under a meaningful category folder:

```text
changelog/<category>/YYYYMMDD-HHMMSS-<short-slug>.md
```

For an eligible external change, each entry should include:

- Summary of the change.
- Files or systems affected.
- Validation performed.
- Any validation intentionally not run.
- Follow-up or approval needed, if applicable.

Do not include token values, private repository names, or other sensitive
information in change records.
