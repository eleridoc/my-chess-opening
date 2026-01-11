import { prisma } from '../db/prisma';
import {
	ImportStatus,
	ExternalSite as PrismaExternalSite,
	GameSpeed as PrismaGameSpeed,
	PlayerColor as PrismaPlayerColor,
} from '@prisma/client';

import {
	ImportOrchestrator,
	ChessComImporter,
	LichessImporter,
	ExternalSite as CoreExternalSite,
	type ImportOptions,
	type ImportedGameRaw,
} from 'my-chess-opening-core';

import { createHash } from 'node:crypto';

function sha256Hex(input: string): string {
	return createHash('sha256').update(input).digest('hex');
}

function mapSpeed(speed: ImportedGameRaw['speed']): PrismaGameSpeed {
	switch (speed) {
		case 'bullet':
			return PrismaGameSpeed.BULLET;
		case 'blitz':
			return PrismaGameSpeed.BLITZ;
		case 'rapid':
			return PrismaGameSpeed.RAPID;
		default:
			return PrismaGameSpeed.CLASSICAL;
	}
}

function mapColor(color: 'white' | 'black'): PrismaPlayerColor {
	return color === 'white' ? PrismaPlayerColor.WHITE : PrismaPlayerColor.BLACK;
}

function mapSite(site: PrismaExternalSite): CoreExternalSite {
	return site === PrismaExternalSite.CHESSCOM
		? CoreExternalSite.CHESSCOM
		: CoreExternalSite.LICHESS;
}

async function logImport(params: {
	importRunId: string;
	level: 'INFO' | 'WARN' | 'ERROR';
	message: string;
	scope?: string;
	site?: PrismaExternalSite;
	username?: string;
	externalId?: string;
	url?: string;
	data?: unknown;
}) {
	const { data, level, ...rest } = params;
	await prisma.importLogEntry.create({
		data: {
			...rest,
			level,
			data: data ? JSON.stringify(data) : null,
		},
	});
}

/**
 * Persist one imported game:
 * - Creates Game (unique per accountConfigId+site+externalId)
 * - Creates 2 GamePlayers
 * - Creates N GameMoves
 *
 * Returns:
 * - inserted: true if created, false if duplicate
 */
async function persistGame(params: {
	accountConfigId: string;
	game: ImportedGameRaw;
	importRunId: string;
}): Promise<{ inserted: boolean }> {
	const { accountConfigId, game } = params;

	// Perspective must be applied by the importer layer (applyOwnerPerspective).
	if (!game.myColor || !game.myUsername || !game.opponentUsername) {
		throw new Error(
			`Missing owner perspective fields for ${game.site}:${game.externalId}. Did you forget applyOwnerPerspective()?`,
		);
	}

	// Capture non-null values to prevent TS losing narrowing inside callbacks.
	const myColor = game.myColor;
	const myUsername = game.myUsername;
	const opponentUsername = game.opponentUsername;

	const pgnHash = sha256Hex(game.pgn);

	try {
		await prisma.$transaction(async (tx) => {
			const created = await tx.game.create({
				data: {
					accountConfigId,

					site: game.site as unknown as PrismaExternalSite,
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
					opening: game.opening ?? null,

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
				},
				select: { id: true },
			});

			// Players (2 rows)
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

			// Moves (N rows) - only if includeMoves was enabled
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
		// Prisma unique constraint error code (P2002) => duplicate
		if (e?.code === 'P2002') {
			return { inserted: false };
		}
		throw e;
	}
}

export async function importAllAccounts(params?: {
	sinceOverride?: Date | null;
	maxGamesPerAccount?: number | null;
}) {
	const maxGamesPerAccount = params?.maxGamesPerAccount ?? null;
	const isLimitedRun = typeof maxGamesPerAccount === 'number' && maxGamesPerAccount > 0;

	const sinceOverride = params?.sinceOverride ?? null;

	const accounts = await prisma.accountConfig.findMany({
		where: { isEnabled: true },
		orderBy: [{ site: 'asc' }, { username: 'asc' }],
	});

	// Register importers from core
	const importService = new ImportOrchestrator([new ChessComImporter(), new LichessImporter()]);

	for (const account of accounts) {
		const since = sinceOverride ?? account.lastSyncAt ?? null;

		// Create per-account ImportRun
		const run = await prisma.importRun.create({
			data: {
				accountConfigId: account.id,
				status: ImportStatus.PARTIAL, // used as "RUNNING" in our minimal enum set
				gamesFound: 0,
				gamesInserted: 0,
				gamesSkipped: 0,
				gamesFailed: 0,
			},
		});

		await logImport({
			importRunId: run.id,
			level: 'INFO',
			scope: 'RUN',
			site: account.site,
			username: account.username,
			message: `Import started (since=${since ? since.toISOString() : 'FULL'}${isLimitedRun ? `, maxGames=${maxGamesPerAccount}` : ''})`,
		});

		let gamesFound = 0;
		let gamesInserted = 0;
		let gamesSkipped = 0;
		let gamesFailed = 0;

		let maxPlayedAtInserted: Date | null = null;

		try {
			const options: ImportOptions = {
				username: account.username,
				since,
				ratedOnly: true,
				speeds: ['bullet', 'blitz', 'rapid'],
				includeMoves: true,
				maxGames: maxGamesPerAccount ?? undefined,
			};

			const games = await importService.importGames(mapSite(account.site), options);
			gamesFound = games.length;

			await prisma.importRun.update({
				where: { id: run.id },
				data: { gamesFound },
			});

			for (const g of games) {
				try {
					const { inserted } = await persistGame({
						accountConfigId: account.id,
						game: g,
						importRunId: run.id,
					});

					if (inserted) {
						gamesInserted += 1;
						if (!maxPlayedAtInserted || g.playedAt > maxPlayedAtInserted) {
							maxPlayedAtInserted = g.playedAt;
						}
					} else {
						gamesSkipped += 1;
					}

					// Batch updates to avoid writing too often
					if ((gamesInserted + gamesSkipped + gamesFailed) % 25 === 0) {
						await prisma.importRun.update({
							where: { id: run.id },
							data: {
								gamesInserted,
								gamesSkipped,
								gamesFailed,
							},
						});
					}
				} catch (err: any) {
					gamesFailed += 1;

					await logImport({
						importRunId: run.id,
						level: 'ERROR',
						scope: 'PERSIST',
						site: account.site,
						username: account.username,
						externalId: g.externalId,
						message: `Failed to persist game`,
						data: {
							error: String(err?.message ?? err),
						},
					});
				}
			}

			// Final counters
			await prisma.importRun.update({
				where: { id: run.id },
				data: {
					gamesInserted,
					gamesSkipped,
					gamesFailed,
				},
			});

			// Decide final status
			const status =
				gamesFailed === 0
					? ImportStatus.SUCCESS
					: gamesInserted > 0
						? ImportStatus.PARTIAL
						: ImportStatus.FAILED;

			// Update lastSyncAt only on full success (avoid skipping games on next run)
			if (!isLimitedRun && status === ImportStatus.SUCCESS && maxPlayedAtInserted) {
				await prisma.accountConfig.update({
					where: { id: account.id },
					data: { lastSyncAt: maxPlayedAtInserted },
				});
			}

			await prisma.importRun.update({
				where: { id: run.id },
				data: {
					status,
					finishedAt: new Date(),
					errorMessage: gamesFailed ? `Some games failed (${gamesFailed}).` : null,
				},
			});

			await logImport({
				importRunId: run.id,
				level: status === ImportStatus.SUCCESS ? 'INFO' : 'WARN',
				scope: 'RUN',
				site: account.site,
				username: account.username,
				message: `Import finished: found=${gamesFound} inserted=${gamesInserted} skipped=${gamesSkipped} failed=${gamesFailed} status=${status}`,
			});
		} catch (err: any) {
			// Import crashed at a higher level (network/parsing in bulk, etc.)
			gamesFailed = Math.max(gamesFailed, 1);

			await prisma.importRun.update({
				where: { id: run.id },
				data: {
					status: ImportStatus.FAILED,
					finishedAt: new Date(),
					errorMessage: String(err?.message ?? err),
					gamesFound,
					gamesInserted,
					gamesSkipped,
					gamesFailed,
				},
			});

			await logImport({
				importRunId: run.id,
				level: 'ERROR',
				scope: 'RUN',
				site: account.site,
				username: account.username,
				message: `Import failed: ${String(err?.message ?? err)}`,
				data: { error: String(err?.stack ?? err) },
			});
		}
	}
}
