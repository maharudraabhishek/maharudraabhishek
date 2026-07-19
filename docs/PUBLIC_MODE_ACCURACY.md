# Public mode accuracy boundary

Public mode lists only repositories and contribution evidence accessible with
the caller's automatic `GITHUB_TOKEN`. It does not infer a private repository
count. The Repository Portfolio card therefore displays private repositories
as `N/A` / not accessible in public mode, rather than a misleading numeric
zero. Private mode preserves the existing numeric count after caller-token
authentication succeeds.

All other public metrics are calculated only from successfully verified public
repositories. Inaccessible or failed repositories are not silently converted
to zero-contribution repositories. Systemic discovery, authentication,
pagination, scan, or validation incompleteness still stops publication.
