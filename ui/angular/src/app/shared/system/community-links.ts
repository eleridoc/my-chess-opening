/**
 * Community & project URLs used by the UI.
 *
 * Keep these in one place so the Help menu and the About page stay consistent.
 */
const GITHUB_REPO_URL = 'https://github.com/eleridoc/my-chess-opening';

export const COMMUNITY_LINKS = {
	discordInvite: 'https://discord.gg/WemAGmXQZR',

	githubRepo: GITHUB_REPO_URL,
	githubReleases: `${GITHUB_REPO_URL}/releases`,
	githubDiscussions: `${GITHUB_REPO_URL}/discussions`,
	githubIssues: `${GITHUB_REPO_URL}/issues`,
} as const;
