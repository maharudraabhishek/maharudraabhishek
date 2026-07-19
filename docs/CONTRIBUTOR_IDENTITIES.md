# Contributor identities

## Purpose

A person may have used more than one GitHub account during their career. The
analytics system treats the primary profile and every declared historical
username as identities belonging to the same engineer.

Configure identities only in:

```text
.github/github-analytics.config.mjs
```

```js
export default {
  profile: {
    username: "your-current-github-username",
  },
  publicContributions: {
    aliases: [
      "your-historical-work-username",
    ],
  },
};
```

## Discovery logic

Every configured identity is searched globally across public GitHub
repositories. The generator discovers candidates through:

- `repositoriesContributedTo` relationships;
- yearly commit contribution collections;
- yearly pull-request contribution collections;
- yearly pull-request-review contribution collections;
- authored pull-request search;
- reviewed pull-request search.

The generator then verifies each candidate repository. It is included only
when at least one configured identity has one or more of:

- default-branch commits;
- authored pull requests;
- submitted pull-request reviews or approvals.

A discovered repository showing zero verified activity is excluded from every
language, framework, domain, portfolio, trophy, and AI metric.

The same configured identities are also used when listing authored commits in
selected personal and private repositories. This is necessary because GitHub
can retain a historical login on commits after an account or employer change.

## Review accuracy

For repositories where GitHub reports review evidence, or where a contributed
repository relationship cannot be explained by commits or authored pull
requests, the generator reads the repository's historical pull requests and
submitted review records directly. This catches older approvals that may not
appear in issue-search totals.

## Accuracy boundaries

- Full language and framework composition describes each verified project as a
  whole.
- Personal commit, changed-line, PR, and review metrics count only activity
  attributed to configured identities.
- Commits returned through multiple identity routes are deduplicated by SHA.
- Pull requests and issues returned through multiple credentials or identity
  routes are deduplicated by repository and number.
- Repositories returned by multiple discovery routes are deduplicated by
  case-insensitive `owner/repository`.

## Privacy and security

- Never add tokens or email addresses to the configuration file.
- Add only GitHub usernames that actually belong to the same person.
- Private repository names and private file paths are never rendered.
