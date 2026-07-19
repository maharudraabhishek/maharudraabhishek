# Sandbox validation plan

Use a separate temporary public profile-style repository. Do not use the
owner's live profile for the first release integration test.

1. Add valid README markers and run the public reusable workflow with automatic
   username resolution.
2. Repeat with an explicit username and one alias.
3. Verify every committed SVG renders and only the managed README block changes.
4. Run the same commit again and confirm no empty commit is created.
5. Replace the workflow with direct Action usage and repeat public generation.
6. Verify `dist/index.js` executes without installing dependencies in the
   sandbox repository.
7. Add a sandbox-owned minimum-access private token and run private mode.
8. Replace it with an invalid token, then omit it, and confirm both fail without
   output publication or token text in logs.
9. Test incomplete, reversed, and duplicate README markers.
10. Enable branch protection that blocks the bot and confirm the push step gives
    the documented failure without bypass or force push.
11. Inspect the job summary, output counts, generated file allowlist, commit
    author, commit contents, and Actions permissions.
12. Remove the sandbox secret and delete the temporary repository manually when
    validation is complete.
