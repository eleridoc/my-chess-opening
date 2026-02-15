import { prisma } from '../db/prisma';
import {
	ImportStatus,
	ExternalSite as PrismaExternalSite,
	GameSpeed as PrismaGameSpeed,
	PlayerColor as PrismaPlayerColor,
	Prisma,
} from '@prisma/client';

import { createHash } from 'node:crypto';

import {
	ImportOrchestrator,
	ChessComImporter,
	LichessImporter,
	ExternalSite as CoreExternalSite,
	type ImportOptions,
	type ImportedGameRaw,
	type ImportEvent,
	type ImportRunStatus,
} from 'my-chess-opening-core';

import { getEcoOpeningsCatalog, type EcoOpeningsCatalog } from '../eco/ecoOpeningsCatalog';
import {
	findBestEcoOpeningMatch,
	findBestEcoOpeningMatchGlobal,
	DEFAULT_MIN_GLOBAL_MATCH_PLY,
} from '../eco/ecoOpeningMatcher';

/**
 * How often we persist progress + emit UI progress updates during per-account processing.
 * This reduces DB writes and UI chatter while still providing a smooth progress signal.
 */
const PROGRESS_COMMIT_EVERY = 25;

/**
 * Debug flag for ECO enrichment diagnostics.
 * Enable by setting: MCO_ECO_DEBUG=1
 */
const ECO_DEBUG = process.env.MCO_ECO_DEBUG === '1';

// -----------------------------------------------------------------------------
// Small helpers
// -----------------------------------------------------------------------------

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
			// Defensive fallback: treat unknown values as classical.
			return PrismaGameSpeed.CLASSICAL;
	}
}

function mapColor(color: 'white' | 'black'): PrismaPlayerColor {
	return color === 'white' ? PrismaPlayerColor.WHITE : PrismaPlayerColor.BLACK;
}

/**
 * Map Prisma enum -> Core enum for orchestrator calls and UI events.
 */
function mapSite(site: PrismaExternalSite): CoreExternalSite {
	return site === PrismaExternalSite.CHESSCOM
		? CoreExternalSite.CHESSCOM
		: CoreExternalSite.LICHESS;
}

/**
 * Map Core enum -> Prisma enum for DB persistence.
 * This avoids unsafe casts (`as unknown as`) at write-time.
 */
function mapPrismaSite(site: CoreExternalSite): PrismaExternalSite {
	return site === CoreExternalSite.CHESSCOM
		? PrismaExternalSite.CHESSCOM
		: PrismaExternalSite.LICHESS;
}

export type ImportBatchSummary = {
	status: ImportRunStatus;
	totalGamesFound: number;
	totalInserted: number;
	totalSkipped: number;
	totalFailed: number;
};

function mapRunStatus(status: ImportStatus): ImportRunStatus {
	switch (status) {
		case ImportStatus.SUCCESS:
			return 'SUCCESS';
		case ImportStatus.FAILED:
			return 'FAILED';
		default:
			return 'PARTIAL';
	}
}

/**
 * Marks "running" ImportRuns left in an unfinished state as aborted.
 *
 * This typically happens when the app is closed while an import is running.
 * We use ImportStatus.PARTIAL as a "RUNNING" surrogate in our minimal enum set.
 */
export async function cleanupAbortedImportRuns(): Promise<number> {
	const abortedRuns = await prisma.importRun.findMany({
		where: {
			status: ImportStatus.PARTIAL,
			finishedAt: null,
		},
		select: {
			id: true,
			accountConfigId: true,
		},
	});

	if (abortedRuns.length === 0) {
		return 0;
	}

	const now = new Date();
	const message = 'Aborted (app closed)';

	// Update runs in bulk.
	await prisma.importRun.updateMany({
		where: { id: { in: abortedRuns.map((r) => r.id) } },
		data: {
			status: ImportStatus.FAILED,
			finishedAt: now,
			errorMessage: message,
		},
	});

	// Add one log line per run to preserve per-account traceability.
	for (const run of abortedRuns) {
		await logImport({
			importRunId: run.id,
			level: 'WARN',
			scope: 'RUN',
			message,
		});
	}

	console.warn('[IMPORT] Aborted import runs cleaned up:', abortedRuns.length);
	return abortedRuns.length;
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
}): Promise<void> {
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
	ecoCatalog: EcoOpeningsCatalog;
}): Promise<{ inserted: boolean }> {
	const { accountConfigId, game, ecoCatalog } = params;

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
		// Prisma unique constraint error code (P2002) => duplicate.
		if (e?.code === 'P2002') {
			return { inserted: false };
		}
		throw e;
	}
}

// -----------------------------------------------------------------------------
// Import batch runner
// -----------------------------------------------------------------------------

/**
 * A "payload" is an ImportEvent without base fields.
 *
 * IMPORTANT:
 * `ImportEvent` is a discriminated union. Using `Omit<ImportEvent, ...>` directly would
 * collapse the union and drop fields that are not common to all variants (e.g. `accountId`).
 *
 * The conditional type below distributes over the union, keeping the per-variant fields intact.
 */
type WithoutBase<T> = T extends unknown ? Omit<T, 'batchId' | 'emittedAtIso'> : never;
type ImportEventPayload = WithoutBase<ImportEvent>;

export async function importAllAccounts(params?: {
	sinceOverride?: Date | null;
	maxGamesPerAccount?: number | null;

	/**
	 * If provided, import only these enabled accounts.
	 * When null/undefined, imports all enabled accounts.
	 */
	accountIds?: string[] | null;

	/**
	 * Required when `onEvent` is provided.
	 * Used to correlate all streamed events on the UI side.
	 */
	batchId?: string | null;

	/**
	 * When provided, used as the batch "started at" watermark.
	 * This is typically the timestamp emitted in the `runStarted` event.
	 */
	batchStartedAtIso?: string | null;

	/**
	 * Optional event callback for streaming progress to the UI.
	 * This should be wired by the Electron main process (webContents.send).
	 */
	onEvent?: (event: ImportEvent) => void;
}): Promise<ImportBatchSummary> {
	const maxGamesPerAccount = params?.maxGamesPerAccount ?? null;
	const isLimitedRun = typeof maxGamesPerAccount === 'number' && maxGamesPerAccount > 0;

	const sinceOverride = params?.sinceOverride ?? null;
	const accountIds = params?.accountIds ?? null;

	const batchIdRaw = params?.batchId ?? null;
	const batchId = typeof batchIdRaw === 'string' && batchIdRaw.length > 0 ? batchIdRaw : null;

	const onEvent = params?.onEvent ?? null;
	const shouldEmit = Boolean(onEvent && batchId);

	const batchStartedAtIso = params?.batchStartedAtIso ?? null;

	/**
	 * Timestamp used to update lastSyncAt after the batch is fully completed.
	 * We prefer the "runStarted" timestamp emitted by IPC to keep UI/DB consistent.
	 */
	const batchStartedAt = (() => {
		if (!batchStartedAtIso) return new Date();
		const d = new Date(batchStartedAtIso);
		return Number.isFinite(d.getTime()) ? d : new Date();
	})();

	function nowIso(): string {
		return new Date().toISOString();
	}

	/**
	 * Emit an event payload (without base fields).
	 * We attach `{ batchId, emittedAtIso }` here to keep call sites concise and consistent.
	 */
	function emit(payload: ImportEventPayload): void {
		if (!shouldEmit || !onEvent || !batchId) return;

		onEvent({
			...payload,
			batchId,
			emittedAtIso: nowIso(),
		} as ImportEvent);
	}

	const whereAccount: Prisma.AccountConfigWhereInput = { isEnabled: true };
	if (Array.isArray(accountIds) && accountIds.length > 0) {
		whereAccount.id = { in: accountIds };
	}

	const accounts = await prisma.accountConfig.findMany({
		where: whereAccount,
		orderBy: [{ site: 'asc' }, { username: 'asc' }],
	});

	// Register importers from core (pure orchestrator: no DB side effects).
	const importService = new ImportOrchestrator([new ChessComImporter(), new LichessImporter()]);

	// Load once per batch (cached in-memory). If the dataset is missing, the catalog returns no candidates.
	const ecoCatalog = await getEcoOpeningsCatalog();

	let totalGamesFound = 0;
	let totalInserted = 0;
	let totalSkipped = 0;
	let totalFailed = 0;

	/**
	 * lastSyncAt policy:
	 * - We treat lastSyncAt as a "watermark" timestamp (batch started at).
	 * - We update it only once, after the whole batch completes.
	 * - When importing one account: update only that account.
	 * - When importing all accounts: update all accounts that finished SUCCESS.
	 * - We never update lastSyncAt for limited runs (debug cap), to avoid skipping games.
	 */
	const accountsToUpdateLastSyncAt: string[] = [];

	for (const account of accounts) {
		const since = sinceOverride ?? account.lastSyncAt ?? null;

		// Create per-account ImportRun.
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

		emit({
			type: 'accountStarted',
			accountId: account.id,
			site: mapSite(account.site),
			username: account.username,
		});

		await logImport({
			importRunId: run.id,
			level: 'INFO',
			scope: 'RUN',
			site: account.site,
			username: account.username,
			message: `Import started (since=${since ? since.toISOString() : 'FULL'}${
				isLimitedRun ? `, maxGames=${maxGamesPerAccount}` : ''
			})`,
		});

		let gamesFound = 0;
		let gamesInserted = 0;
		let gamesSkipped = 0;
		let gamesFailed = 0;

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

			emit({
				type: 'accountNewGamesFound',
				accountId: account.id,
				gamesFound,
			});

			// Initial progress snapshot (0/X).
			emit({
				type: 'accountProgress',
				accountId: account.id,
				processed: 0,
				gamesFound,
				inserted: 0,
				skipped: 0,
				failed: 0,
			});

			for (const g of games) {
				try {
					const { inserted } = await persistGame({
						accountConfigId: account.id,
						game: g,
						ecoCatalog,
					});

					if (inserted) {
						gamesInserted += 1;
					} else {
						gamesSkipped += 1;
					}
				} catch (err: any) {
					gamesFailed += 1;

					const errorMessage = String(err?.message ?? err);

					await logImport({
						importRunId: run.id,
						level: 'ERROR',
						scope: 'PERSIST',
						site: account.site,
						username: account.username,
						externalId: g.externalId,
						message: 'Failed to persist game',
						data: { error: errorMessage },
					});

					emit({
						type: 'accountError',
						accountId: account.id,
						externalId: g.externalId ?? null,
						message: errorMessage,
					});
				}

				const processed = gamesInserted + gamesSkipped + gamesFailed;

				// Throttle DB writes + UI updates.
				if (processed > 0 && processed % PROGRESS_COMMIT_EVERY === 0) {
					await prisma.importRun.update({
						where: { id: run.id },
						data: {
							gamesInserted,
							gamesSkipped,
							gamesFailed,
						},
					});

					emit({
						type: 'accountProgress',
						accountId: account.id,
						processed,
						gamesFound,
						inserted: gamesInserted,
						skipped: gamesSkipped,
						failed: gamesFailed,
					});
				}
			}

			// Final counters.
			await prisma.importRun.update({
				where: { id: run.id },
				data: {
					gamesInserted,
					gamesSkipped,
					gamesFailed,
				},
			});

			// Final progress snapshot (X/X).
			emit({
				type: 'accountProgress',
				accountId: account.id,
				processed: gamesInserted + gamesSkipped + gamesFailed,
				gamesFound,
				inserted: gamesInserted,
				skipped: gamesSkipped,
				failed: gamesFailed,
			});

			// Decide final status.
			const status =
				gamesFailed === 0
					? ImportStatus.SUCCESS
					: gamesInserted > 0
						? ImportStatus.PARTIAL
						: ImportStatus.FAILED;

			// Defer lastSyncAt update to batch completion (watermark = batchStartedAt).
			// We only update accounts that finished SUCCESS, to avoid skipping games after failures.
			if (!isLimitedRun && status === ImportStatus.SUCCESS) {
				accountsToUpdateLastSyncAt.push(account.id);
			}

			const finishedAtIso = nowIso();

			await prisma.importRun.update({
				where: { id: run.id },
				data: {
					status,
					finishedAt: new Date(finishedAtIso),
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

			emit({
				type: 'accountFinished',
				accountId: account.id,
				status: mapRunStatus(status),
				gamesFound,
				inserted: gamesInserted,
				skipped: gamesSkipped,
				failed: gamesFailed,
				finishedAtIso,
			});
		} catch (err: any) {
			const errorMessage = String(err?.message ?? err);

			await prisma.importRun.update({
				where: { id: run.id },
				data: {
					status: ImportStatus.FAILED,
					finishedAt: new Date(),
					errorMessage,
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
				message: `Import failed: ${errorMessage}`,
				data: { error: String(err?.stack ?? err) },
			});

			emit({
				type: 'accountError',
				accountId: account.id,
				externalId: null,
				message: errorMessage,
			});

			emit({
				type: 'accountFinished',
				accountId: account.id,
				status: 'FAILED',
				gamesFound,
				inserted: gamesInserted,
				skipped: gamesSkipped,
				failed: gamesFailed,
				finishedAtIso: nowIso(),
			});
		}

		// Update batch totals from this account run.
		totalGamesFound += gamesFound;
		totalInserted += gamesInserted;
		totalSkipped += gamesSkipped;
		totalFailed += gamesFailed;
	}

	// Apply the batch-level watermark update once everything is finished.
	if (!isLimitedRun && accountsToUpdateLastSyncAt.length > 0) {
		await prisma.accountConfig.updateMany({
			where: { id: { in: accountsToUpdateLastSyncAt } },
			data: { lastSyncAt: batchStartedAt },
		});

		await logImport({
			importRunId:
				(
					await prisma.importRun.findFirst({
						where: { accountConfigId: { in: accountsToUpdateLastSyncAt } },
						select: { id: true },
						orderBy: { createdAt: 'desc' },
					})
				)?.id ?? '',
			level: 'INFO',
			scope: 'BATCH',
			message: `lastSyncAt updated after batch finished (watermark=${batchStartedAt.toISOString()}, updatedAccounts=${accountsToUpdateLastSyncAt.length})`,
		}).catch(() => {
			// Best-effort logging only; do not fail the whole import summary for this.
		});

		console.log('[IMPORT] lastSyncAt updated after batch finished', {
			batchStartedAtIso: batchStartedAt.toISOString(),
			updatedAccounts: accountsToUpdateLastSyncAt.length,
		});
	}

	const status: ImportRunStatus =
		totalFailed === 0 ? 'SUCCESS' : totalInserted > 0 ? 'PARTIAL' : 'FAILED';

	return {
		status,
		totalGamesFound,
		totalInserted,
		totalSkipped,
		totalFailed,
	};
}
