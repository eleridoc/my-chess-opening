import { prisma } from '../db/prisma';
import { ImportStatus, Prisma } from '@prisma/client';

import {
	ImportOrchestrator,
	ChessComImporter,
	LichessImporter,
	type ImportEvent,
	type ImportRunStatus,
} from 'my-chess-opening-core';

import { getEcoOpeningsCatalog } from '../eco/ecoOpeningsCatalog';

import type {
	ImportAllAccountsParams,
	ImportBatchSummary,
	ImportEventPayload,
} from './importAllAccounts.types';

import { logImport } from './persistence/importLogger';

import { runAccountImport } from './runner/runAccountImport';

export type { ImportBatchSummary } from './importAllAccounts.types';

/**
 * How often we persist progress + emit UI progress updates during per-account processing.
 * This reduces DB writes and UI chatter while still providing a smooth progress signal.
 */
const PROGRESS_COMMIT_EVERY = 25;

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

		const result = await runAccountImport({
			account,
			since,
			importService,
			ecoCatalog,
			maxGamesPerAccount,
			isLimitedRun,
			commitEvery: PROGRESS_COMMIT_EVERY,
			emit,
			nowIso,
			accountsToUpdateLastSyncAt,
		});

		totalGamesFound += result.gamesFound;
		totalInserted += result.inserted;
		totalSkipped += result.skipped;
		totalFailed += result.failed;
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
