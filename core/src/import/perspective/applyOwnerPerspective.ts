import type { ImportedGameRaw } from '../types';

/**
 * Adds "owner perspective" fields to a normalized game.
 * The owner is the account username currently being imported (AccountConfig.username).
 *
 * This solves multi-accounts / multi-usernames without any global alias mapping:
 * - Each imported game is linked to a specific account (username + site).
 * - We compute myColor/opponent fields relative to that owner username.
 */
export function applyOwnerPerspective(
	game: ImportedGameRaw,
	ownerUsername: string,
): ImportedGameRaw {
	const owner = ownerUsername.toLowerCase();

	const white = game.players[0];
	const black = game.players[1];

	const isWhite = white.username.toLowerCase() === owner;
	const isBlack = black.username.toLowerCase() === owner;

	if (!isWhite && !isBlack) {
		throw new Error(
			`[applyOwnerPerspective] Owner is not a player in this game: owner=${ownerUsername} game=${game.site}:${game.externalId}`,
		);
	}

	const myColor = isWhite ? 'white' : 'black';

	const my = isWhite ? white : black;
	const opp = isWhite ? black : white;

	return {
		...game,

		// Objective snapshot (from PGN)
		whiteUsername: white.username,
		blackUsername: black.username,
		whiteElo: white.elo,
		blackElo: black.elo,
		whiteRatingDiff: white.ratingDiff,
		blackRatingDiff: black.ratingDiff,

		// Owner perspective (relative to the imported account)
		myColor,
		myUsername: my.username,
		opponentUsername: opp.username,
		myElo: my.elo,
		opponentElo: opp.elo,
		myRatingDiff: my.ratingDiff,
		opponentRatingDiff: opp.ratingDiff,
	};
}
