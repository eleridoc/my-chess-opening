import type { ImportedGameRaw, ResultKey } from '../types';

/**
 * Adds "owner perspective" fields to a normalized game.
 *
 * The owner is the account username currently being imported (AccountConfig.username).
 * We compute "my*" fields (myColor, myUsername, myResultKey, etc.) relative to that owner.
 *
 * This enables multi-accounts / multi-usernames without any global alias mapping:
 * - Each imported game is linked to a specific account (username + site).
 * - We compute owner-relative fields purely from the PGN player names.
 *
 * IMPORTANT:
 * - `game.resultKey` remains the objective result key from White's perspective:
 *    1 = White win, 0 = draw/unknown, -1 = Black win
 * - `game.myResultKey` is the owner perspective:
 *    1 = owner win, 0 = draw/unknown, -1 = owner loss
 */
export function applyOwnerPerspective(
	game: ImportedGameRaw,
	ownerUsername: string,
): ImportedGameRaw {
	const owner = ownerUsername.trim().toLowerCase();

	const [white, black] = game.players;

	const isWhiteOwner = white.username.trim().toLowerCase() === owner;
	const isBlackOwner = black.username.trim().toLowerCase() === owner;

	if (!isWhiteOwner && !isBlackOwner) {
		throw new Error(
			`[applyOwnerPerspective] Owner is not a player in this game: owner=${ownerUsername} game=${game.site}:${game.externalId}`,
		);
	}

	const myColor = isWhiteOwner ? 'white' : 'black';
	const my = isWhiteOwner ? white : black;
	const opp = isWhiteOwner ? black : white;

	const myResultKey = toOwnerResultKey(game.resultKey, isWhiteOwner);

	return {
		...game,

		// Objective snapshot (from PGN headers)
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
		myResultKey,
	};
}

/**
 * Convert a result key from White's perspective to the owner's perspective.
 *
 * White POV:
 *  1 = White win, 0 = draw/unknown, -1 = Black win
 *
 * Owner POV:
 *  1 = owner win, 0 = draw/unknown, -1 = owner loss
 */
function toOwnerResultKey(resultKey: ResultKey, ownerIsWhite: boolean): ResultKey {
	if (resultKey === 0) return 0;
	if (ownerIsWhite) return resultKey;

	// Owner is Black: invert non-zero keys
	return (resultKey === 1 ? -1 : 1) as ResultKey;
}
