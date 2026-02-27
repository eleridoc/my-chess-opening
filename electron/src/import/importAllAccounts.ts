import { prisma } from '../db/prisma';
import { ImportStatus, Prisma } from '@prisma/client';

import {
	ImportOrchestrator,
	ChessComImporter,
	LichessImporter,
	type ImportOptions,
	type ImportEvent,
	type ImportRunStatus,
} from 'my-chess-opening-core';

import { getEcoOpeningsCatalog } from '../eco/ecoOpeningsCatalog';

import type {
	ImportAllAccountsParams,
	ImportBatchSummary,
	ImportEventPayload,
} from './importAllAccounts.types';

export type { ImportBatchSummary } from './importAllAccounts.types';

import { mapSite, mapRunStatus } from './importAllAccounts.helpers';

import { createAccountProgressCommitter, type ImportRunCounters } from './progress/progressCommit';

import { persistGame } from './persistence/persistGame';

import { logImport } from './persistence/importLogger';

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
// REFACTOR MAP (V1.6.13.8.x)
// -----------------------------------------------------------------------------
// This file is intentionally split into clear sections to enable safe extraction
// without changing runtime behavior.
//
// Planned extractions:
// - types:      importAllAccounts.types.ts
// - pure utils: importAllAccounts.helpers.ts
// - progress:   progressCommit.ts
// - persistence: persistGame.ts / persistImportRun.ts
// - eco:        ecoEnricher.ts
// - runner:     runAccountImport.ts + runImportBatch.ts
//
// IMPORTANT: Refactor-only. Do not change IPC/core contracts, event payloads,
// throttling policy, or lastSyncAt watermark rules.
// -----------------------------------------------------------------------------

// -----------------------------------------------------------------------------
// SECTION: Import run recovery (DB writes)
// -----------------------------------------------------------------------------

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

// -----------------------------------------------------------------------------
// SECTION: Import batch runner (entrypoint)
// -----------------------------------------------------------------------------

export async function importAllAccounts(
	params?: ImportAllAccountsParams,
): Promise<ImportBatchSummary> {
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

	// SECTION: Event emitter (IPC streaming)
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

	// SECTION: Load enabled accounts (DB reads)
	const whereAccount: Prisma.AccountConfigWhereInput = { isEnabled: true };
	if (Array.isArray(accountIds) && accountIds.length > 0) {
		whereAccount.id = { in: accountIds };
	}

	const accounts = await prisma.accountConfig.findMany({
		where: whereAccount,
		orderBy: [{ site: 'asc' }, { username: 'asc' }],
	});

	// SECTION: Initialize orchestrator + ECO catalog (in-memory)
	// Register importers from core (pure orchestrator: no DB side effects).
	const importService = new ImportOrchestrator([new ChessComImporter(), new LichessImporter()]);

	// Load once per batch (cached in-memory). If the dataset is missing, the catalog returns no candidates.
	const ecoCatalog = await getEcoOpeningsCatalog();

	// SECTION: Batch totals + lastSyncAt watermark policy
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

	// SECTION: Per-account import loop
	for (const account of accounts) {
		const since = sinceOverride ?? account.lastSyncAt ?? null;

		// SUBSECTION: Create ImportRun + emit accountStarted
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
			// SUBSECTION: Import from provider (core orchestrator)
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

			const progress = createAccountProgressCommitter({
				commitEvery: PROGRESS_COMMIT_EVERY,
				runId: run.id,
				accountId: account.id,
				gamesFound,
				emit,
				updateRunCounters: async ({ runId, inserted, skipped, failed }) => {
					await prisma.importRun.update({
						where: { id: runId },
						data: {
							gamesInserted: inserted,
							gamesSkipped: skipped,
							gamesFailed: failed,
						},
					});
				},
			});

			progress.emitInitial();

			// SUBSECTION: Persist games (DB writes) + emit progress/errors
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

				const counters: ImportRunCounters = {
					inserted: gamesInserted,
					skipped: gamesSkipped,
					failed: gamesFailed,
				};

				await progress.maybeCommit(counters);
			}

			// Final counters.
			await progress.commitFinal({
				inserted: gamesInserted,
				skipped: gamesSkipped,
				failed: gamesFailed,
			});

			// SUBSECTION: Finalize run status + emit accountFinished
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
			// SUBSECTION: Run-level failure handling (DB writes + emit failed)
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

		// SUBSECTION: Accumulate batch totals
		// Update batch totals from this account run.
		totalGamesFound += gamesFound;
		totalInserted += gamesInserted;
		totalSkipped += gamesSkipped;
		totalFailed += gamesFailed;
	}

	// SECTION: Apply lastSyncAt watermark update (batch-level)
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

	// SECTION: Return batch summary
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
