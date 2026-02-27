import { prisma } from '../../db/prisma';
import { PlayerColor as PrismaPlayerColor } from '@prisma/client';
import type { ImportedGameRaw } from 'my-chess-opening-core';
import type { EcoOpeningsCatalog } from '../../eco/ecoOpeningsCatalog';
import { sha256Hex, mapSpeed, mapColor, mapPrismaSite } from '../importAllAccounts.helpers';
import { enrichEcoFields } from '../eco/ecoEnricher';

/**
 * Persist one imported game:
 * - Creates Game (unique per accountConfigId+site+externalId)
 * - Creates 2 GamePlayers
 * - Creates N GameMoves
 *
 * Returns:
 * - inserted: true if created, false if duplicate
 */
export async function persistGame(params: {
	accountConfigId: string;
	game: ImportedGameRaw;
	ecoCatalog: EcoOpeningsCatalog;
}): Promise<{ inserted: boolean }> {
	const { accountConfigId, game, ecoCatalog } = params;

	// SUBSECTION: Validate required owner-perspective fields (must be provided by core).

	// Perspective must be applied by the importer layer (applyOwnerPerspective).
	if (!game.myColor || !game.myUsername || !game.opponentUsername || game.myResultKey == null) {
		throw new Error(
			`Missing owner perspective fields for ${game.site}:${game.externalId}. Did you forget applyOwnerPerspective()?`,
		);
	}

	// Capture non-null values to prevent TS losing narrowing inside callbacks.
	const myColor = game.myColor;
	const myUsername = game.myUsername;
	const opponentUsername = game.opponentUsername;

	const pgnHash = sha256Hex(game.pgn);

	// SUBSECTION: ECO enrichment (best-effort, must never fail the import).

	const { ecoDetermined, ecoOpeningName, ecoOpeningLinePgn, ecoOpeningMatchPly } =
		enrichEcoFields({
			game,
			ecoCatalog,
		});

	if (!Array.isArray(game.players) || game.players.length !== 2) {
		throw new Error(
			`Invalid players array for ${game.site}:${game.externalId}. Expected 2 players.`,
		);
	}

	// SUBSECTION: Transactional insert (game + players + moves).

	try {
		await prisma.$transaction(async (tx) => {
			const created = await tx.game.create({
				data: {
					accountConfigId,

					site: mapPrismaSite(game.site),
					externalId: game.externalId,
					siteUrl: game.siteUrl ?? null,

					playedAt: game.playedAt,
					rated: game.rated,
					variant: game.variant,
					speed: mapSpeed(game.speed),
					timeControl: game.timeControl,
					initialSeconds: game.initialSeconds,
					incrementSeconds: game.incrementSeconds,

					result: game.result,
					resultKey: game.resultKey,
					termination: game.termination ?? null,
					eco: game.eco ?? null,
					ecoDetermined,
					opening: game.opening ?? null,
					ecoOpeningName,
					ecoOpeningLinePgn,
					ecoOpeningMatchPly,

					pgn: game.pgn,
					pgnHash,

					// Snapshot (objective)
					whiteUsername: game.whiteUsername,
					blackUsername: game.blackUsername,
					whiteElo: game.whiteElo ?? null,
					blackElo: game.blackElo ?? null,
					whiteRatingDiff: game.whiteRatingDiff ?? null,
					blackRatingDiff: game.blackRatingDiff ?? null,

					// Perspective (relative to owner account)
					myColor: mapColor(myColor),
					myUsername,
					opponentUsername,
					myElo: game.myElo ?? null,
					opponentElo: game.opponentElo ?? null,
					myRatingDiff: game.myRatingDiff ?? null,
					opponentRatingDiff: game.opponentRatingDiff ?? null,
					myResultKey: game.myResultKey,
				},
				select: { id: true },
			});

			// Players (2 rows).
			await tx.gamePlayer.createMany({
				data: [
					{
						gameId: created.id,
						color: PrismaPlayerColor.WHITE,
						username: game.players[0].username,
						elo: game.players[0].elo ?? null,
						ratingDiff: game.players[0].ratingDiff ?? null,
					},
					{
						gameId: created.id,
						color: PrismaPlayerColor.BLACK,
						username: game.players[1].username,
						elo: game.players[1].elo ?? null,
						ratingDiff: game.players[1].ratingDiff ?? null,
					},
				],
			});

			// Moves (N rows) - only if includeMoves was enabled.
			if (game.moves?.length) {
				await tx.gameMove.createMany({
					data: game.moves.map((m) => ({
						gameId: created.id,
						ply: m.ply,
						san: m.san,
						uci: m.uci ?? null,

						// These should exist when includeMoves=true.
						// We keep a defensive fallback to avoid Prisma rejecting null,
						// but if you see empty strings in DB, it means move enrichment failed upstream.
						fen: m.fen ?? '',
						positionHash: m.positionHash ?? '',
						positionHashBefore: m.positionHashBefore ?? '',
						fenBefore: m.fenBefore ?? null,

						clockMs: m.clockMs ?? null,
					})),
				});
			}
		});

		return { inserted: true };
	} catch (e: any) {
		// SUBSECTION: Duplicate handling (unique constraint => skipped).
		// Prisma unique constraint error code (P2002) => duplicate.
		if (e?.code === 'P2002') {
			return { inserted: false };
		}
		throw e;
	}
}
