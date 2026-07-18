# Contributor identity attribution

## Purpose

GitHub activity can be split across multiple usernames when an engineer changes employers or accounts. The analytics generator therefore supports one primary profile and optional historical contributor aliases.

For this repository:

```text
Primary profile: maharudraabhishek
Public alias:    abkumar
```

The workflow supplies the alias through:

```yaml
CONTRIBUTOR_ALIASES: abkumar
```

Additional aliases can be added later as a comma-separated list.

## What aliases affect

Aliases are used only for public contribution attribution. For every configured identity, the generator checks:

- GitHub's `repositoriesContributedTo` relationship;
- yearly commit, pull-request, review, and issue contribution collections;
- pull requests authored by the identity;
- pull requests reviewed by the identity;
- issues authored by the identity;
- default-branch commits filtered by the identity.

This allows organization repositories such as `heremaps/here-sdk-examples` to be discovered through the historical username while the profile repository remains owned by `maharudraabhishek`.

## Accuracy rules

The generator keeps two concepts separate:

1. **Full public project composition**  
   Languages, frameworks, source files, releases, stars, forks, and total project commits describe the repository as a whole.

2. **Personally attributed activity**  
   Commits, changed lines, files touched, authored pull requests, and reviewed pull requests are counted only when GitHub associates them with the primary username or a configured alias.

The analytics never claims that the entire public repository was authored by one person.

## Deduplication

A commit may be returned by more than one identity query. The generator merges commit results by SHA before calculating totals, so the same commit cannot be counted twice.

Repositories are merged by case-insensitive `owner/name`, and their contribution evidence and attributed identities are combined.

## Privacy and scope

- Aliases are queried only for public contribution repositories.
- Private personal repositories use only the authenticated primary profile.
- Private organization repository names are not published.
- Commit messages, email addresses, prompts, and private file paths are not rendered.
- The public contribution card shows the identities GitHub used for attribution.

## Limitations

GitHub must be able to resolve an alias as a GitHub username for relationship and contribution-collection discovery. If an old commit contains only an unlinked author name or email, GitHub may show it in repository history without exposing a searchable account relationship. Such activity cannot be safely attributed automatically without an explicit repository declaration.
