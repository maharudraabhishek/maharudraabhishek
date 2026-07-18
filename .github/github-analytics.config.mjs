/**
 * GitHub Analytics user configuration.
 *
 * This is the only runtime file where GitHub usernames should be
 * declared. The workflow and generator scripts load these values at
 * runtime, so they remain reusable across different GitHub profiles.
 *
 * Security:
 * - Do not place tokens, email addresses, or other secrets here.
 * - Only public historical GitHub usernames belong in aliases.
 */
export default {
  profile: {
    /**
     * GitHub profile whose README and private repository analytics are
     * generated. PRIVATE_STATS_TOKEN must authenticate as this user.
     */
    username: "maharudraabhishek",
  },

  publicContributions: {
    /**
     * Historical or alternate GitHub usernames used for public work.
     *
     * The generator searches public commits, pull requests, reviews,
     * issues, and contributed-repository relationships for each alias.
     * The primary profile username is included automatically.
     */
    aliases: [
      "abkumar",
    ],
  },

  repositories: {
    /**
     * Exclude the profile README repository from engineering metrics.
     * For a profile named "octocat", this excludes "octocat/octocat".
     */
    excludeProfileRepository: true,

    /**
     * Additional repositories to exclude, written as "owner/name".
     * Matching is case-insensitive.
     */
    exclude: [],
  },
};
