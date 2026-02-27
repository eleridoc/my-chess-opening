import { prisma } from '../../db/prisma';

import { PlayerColor as PrismaPlayerColor } from '@prisma/client';

import type { ImportedGameRaw } from 'my-chess-opening-core';

import type { EcoOpeningsCatalog } from '../../eco/ecoOpeningsCatalog';
import {
	findBestEcoOpeningMatch,
	findBestEcoOpeningMatchGlobal,
	DEFAULT_MIN_GLOBAL_MATCH_PLY,
} from '../../eco/ecoOpeningMatcher';

import { sha256Hex, mapSpeed, mapColor, mapPrismaSite } from '../importAllAccounts.helpers';

/**
 * Debug flag for ECO enrichment diagnostics.
 * Enable by setting: MCO_ECO_DEBUG=1
 */
const ECO_DEBUG = process.env.MCO_ECO_DEBUG === '1';

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

	// Optional enrichment computed by the app using the bundled openings dataset.
	// IMPORTANT:
	// - We never overwrite `opening` (PGN/header/source-provided).
	// - We store our best-effort deduction in ecoOpening* fields.
	// - This must NEVER break imports (best-effort only).
	let ecoOpeningName: string | null = null;
	let ecoOpeningLinePgn: string | null = null;
	let ecoOpeningMatchPly: number | null = null;

	// ECO determined by the app.
	// - `eco` remains the provider value from import (Chess.com/Lichess PGN).
	// - `ecoDetermined` may differ when the provider ECO is inconsistent with the move sequence,
	//   or when the provider did not provide an ECO.
	let ecoDetermined: string | null = null;

	try {
		const providerEcoRaw = typeof game.eco === 'string' ? game.eco.trim() : '';
		const providerEco = providerEcoRaw.length > 0 ? providerEcoRaw : null;

		// Default:
		// - if provider ECO exists: keep it
		// - else: null until proven by a global match
		ecoDetermined = providerEco;

		const hasMoves = Boolean(game.moves?.length);

		if (!hasMoves) {
			if (ECO_DEBUG) {
				console.warn('[ECO][debug] Determine ECO skipped (no moves).', {
					gameRef: `${game.site}:${game.externalId}`,
					providerEco,
					hasOpeningHeader: Boolean(game.opening),
				});
			}
		} else {
			const gameMovesSan = (game.moves ?? []).map((m) => m.san);

			// -----------------------------------------------------------------------------
			// Step 1: Try to match within provider ECO bucket (fast path).
			// If it matches, ecoDetermined stays equal to provider eco.
			// -----------------------------------------------------------------------------
			if (providerEco) {
				const candidates = ecoCatalog.getCandidatesByEco(providerEco);

				if (ECO_DEBUG) {
					console.warn('[ECO][debug] Provider ECO bucket check', {
						gameRef: `${game.site}:${game.externalId}`,
						providerEco,
						movesCount: gameMovesSan.length,
						candidatesCount: candidates.length,
						hasOpeningHeader: Boolean(game.opening),
					});
				}

				const providerMatch =
					candidates.length > 0
						? findBestEcoOpeningMatch(gameMovesSan, candidates)
						: null;

				if (providerMatch) {
					ecoDetermined = providerEco;
					ecoOpeningName = providerMatch.name;
					ecoOpeningLinePgn = providerMatch.linePgn;
					ecoOpeningMatchPly = providerMatch.matchPly;

					if (ECO_DEBUG) {
						console.warn('[ECO][debug] Provider ECO match OK', {
							gameRef: `${game.site}:${game.externalId}`,
							providerEco,
							ecoDetermined,
							name: ecoOpeningName,
							matchPly: ecoOpeningMatchPly,
						});
					}
				} else {
					// -----------------------------------------------------------------------------
					// Step 2: Global scan fallback (more expensive but more accurate).
					// Used when provider ECO seems wrong / too coarse / not in dataset.
					// -----------------------------------------------------------------------------
					const allCandidates =
						// Safe fallback if the catalog type is not yet updated in some branch.
						(((ecoCatalog as any).getAllCandidates?.() as unknown[]) ?? []) as any[];

					if (ECO_DEBUG) {
						console.warn('[ECO][debug] Provider ECO no match -> global scan', {
							gameRef: `${game.site}:${game.externalId}`,
							providerEco,
							allCandidatesCount: allCandidates.length,
							minMatchPly: DEFAULT_MIN_GLOBAL_MATCH_PLY,
						});
					}

					const globalMatch =
						allCandidates.length > 0
							? findBestEcoOpeningMatchGlobal(gameMovesSan, allCandidates as any, {
									minMatchPly: DEFAULT_MIN_GLOBAL_MATCH_PLY,
								})
							: null;

					if (globalMatch) {
						ecoDetermined = globalMatch.eco;
						ecoOpeningName = globalMatch.name;
						ecoOpeningLinePgn = globalMatch.linePgn;
						ecoOpeningMatchPly = globalMatch.matchPly;

						if (ECO_DEBUG) {
							console.warn('[ECO][debug] Global match found (provider mismatch)', {
								gameRef: `${game.site}:${game.externalId}`,
								providerEco,
								ecoDetermined,
								name: ecoOpeningName,
								matchPly: ecoOpeningMatchPly,
							});
						}
					} else if (ECO_DEBUG) {
						// Keep provider ECO as determined when global match failed.
						console.warn('[ECO][debug] Global scan failed, keep provider ECO', {
							gameRef: `${game.site}:${game.externalId}`,
							providerEco,
							ecoDetermined,
							sampleMoves: gameMovesSan.slice(0, 16),
						});
					}
				}
			} else {
				// -----------------------------------------------------------------------------
				// No provider ECO: directly global scan (optional, but you asked for max coverage).
				// -----------------------------------------------------------------------------
				const allCandidates =
					// Safe fallback if the catalog type is not yet updated in some branch.
					(((ecoCatalog as any).getAllCandidates?.() as unknown[]) ?? []) as any[];

				if (ECO_DEBUG) {
					console.warn('[ECO][debug] No provider ECO -> global scan', {
						gameRef: `${game.site}:${game.externalId}`,
						allCandidatesCount: allCandidates.length,
						minMatchPly: DEFAULT_MIN_GLOBAL_MATCH_PLY,
						movesCount: gameMovesSan.length,
					});
				}

				const globalMatch =
					allCandidates.length > 0
						? findBestEcoOpeningMatchGlobal(gameMovesSan, allCandidates as any, {
								minMatchPly: DEFAULT_MIN_GLOBAL_MATCH_PLY,
							})
						: null;

				if (globalMatch) {
					ecoDetermined = globalMatch.eco;
					ecoOpeningName = globalMatch.name;
					ecoOpeningLinePgn = globalMatch.linePgn;
					ecoOpeningMatchPly = globalMatch.matchPly;

					if (ECO_DEBUG) {
						console.warn('[ECO][debug] Global match found (no provider ECO)', {
							gameRef: `${game.site}:${game.externalId}`,
							ecoDetermined,
							name: ecoOpeningName,
							matchPly: ecoOpeningMatchPly,
						});
					}
				} else if (ECO_DEBUG) {
					console.warn('[ECO][debug] Global scan failed (no provider ECO)', {
						gameRef: `${game.site}:${game.externalId}`,
						sampleMoves: gameMovesSan.slice(0, 16),
					});
				}
			}
		}
	} catch {
		// Intentionally ignore: enrichment is best-effort and must never break imports.
		const providerEcoRaw = typeof game.eco === 'string' ? game.eco.trim() : '';
		ecoDetermined = providerEcoRaw.length > 0 ? providerEcoRaw : null;
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
		// SUBSECTION: Duplicate handling (unique constraint => skipped).
	} catch (e: any) {
		// Prisma unique constraint error code (P2002) => duplicate.
		if (e?.code === 'P2002') {
			return { inserted: false };
		}
		throw e;
	}
}
