/**
 * GitHub Analytics user configuration.
 *
 * This is the only runtime file containing profile-specific GitHub names.
 * The workflow and scripts remain reusable for any GitHub profile.
 *
 * Security:
 * - Never place tokens, email addresses, or private repository names here.
 * - Add only GitHub accounts that belong to the same person.
 */
export default {
  profile: {
    /**
     * Primary GitHub profile. PRIVATE_STATS_TOKEN must authenticate as this
     * account because it is used for private/personal repository analytics.
     */
    username: "maharudraabhishek",
  },

  publicContributions: {
    /**
     * Historical or alternate GitHub usernames owned by the same person.
     *
     * Every identity is used for authored-commit attribution in all selected
     * personal/private and verified public repositories. Every identity is
     * also searched globally across public repositories for:
     * - default-branch commits;
     * - authored pull requests;
     * - submitted pull-request reviews and approvals;
     * - GitHub contributed-repository relationships.
     *
     * A repository is included only after the generator verifies at least one
     * commit, authored pull request, or submitted review from these identities.
     */
    aliases: [
      "abkumar",
    ],
  },

  repositories: {
    /** Exclude the username/username profile README repository. */
    excludeProfileRepository: true,

    /**
     * Optional public or personal repositories to exclude explicitly.
     * Values use case-insensitive "owner/repository" format.
     */
    exclude: [],
  },

  readme: {
    // Keeps the owner's established managed-section title during refreshes.
    analyticsHeading: "## 📊 GitHub Realtime Engineering Analytics",
  },
};
