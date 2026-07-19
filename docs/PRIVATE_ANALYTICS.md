# Private analytics

Public mode needs only the caller repository's automatic `GITHUB_TOKEN`.
Private mode is opt-in because a repository token cannot read a person's other
private repositories.

Create a caller-owned fine-grained personal access token scoped to only the
repositories you want analyzed. Grant read access required for repository
metadata, contents/commits, issues, and pull requests. Organization policies
or contribution queries may require additional approval; add access only when
GitHub reports a specific missing permission. Avoid a broadly scoped classic
`repo` token when a fine-grained token can cover the selected repositories.

Store it in the caller profile repository as an Actions secret named
`PRIVATE_STATS_TOKEN`, then use:

```yaml
jobs:
  analytics:
    uses: maharudraabhishek/maharudraabhishek/.github/workflows/generate-analytics.yml@v1
    with:
      github-username: ${{ github.repository_owner }}
      include-private: true
    secrets:
      private-stats-token: ${{ secrets.PRIVATE_STATS_TOKEN }}
```

The workflow passes this named secret only to the Action. The Action validates
its presence before discovery and verifies, where practical, that the token's
authenticated login matches the primary username. It uses the private token
for profile-owned accessible repositories and the caller `GITHUB_TOKEN` for
external public discovery. Tokens are masked, never written to output, never
stored after the process, and never sent anywhere except GitHub. Private
repository names are not logged by default or placed in outputs.

Rotate the token according to your security policy, remove access to retired
repositories, and rerun the manual workflow after rotation. A missing token,
bad credentials, identity mismatch, organization SSO restriction, or
insufficient repository permission fails before publication. Test private mode
first in a temporary profile-style sandbox, not on a live profile.
