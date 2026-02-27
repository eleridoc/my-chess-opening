import { prisma } from '../../db/prisma';
import { type Prisma } from '@prisma/client';

import {
	ImportOrchestrator,
	ChessComImporter,
	LichessImporter,
	type ImportEvent,
	type ImportRunStatus,
} from 'my-chess-opening-core';

import { getEcoOpeningsCatalog } from '../../eco/ecoOpeningsCatalog';

import type {
	ImportAllAccountsParams,
	ImportBatchSummary,
	ImportEventPayload,
} from '../importAllAccounts.types';

import { logImport } from '../persistence/importLogger';
import { runAccountImport } from './runAccountImport';

/**
 * How often we persist progress + emit UI progress updates during per-account processing.
 * This reduces DB writes and UI chatter while still providing a smooth progress signal.
 */
const PROGRESS_COMMIT_EVERY = 25;

/**
 * Run a full import batch (all enabled accounts or a filtered subset).
 *
 * IMPORTANT: Refactor-only. Do not change IPC/core contracts, event payloads,
 * throttling policy, or lastSyncAt watermark rules.
 */
export async function runImportBatch(
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

	// Load enabled accounts (DB reads)
	const whereAccount: Prisma.AccountConfigWhereInput = { isEnabled: true };
	if (Array.isArray(accountIds) && accountIds.length > 0) {
		whereAccount.id = { in: accountIds };
	}

	const accounts = await prisma.accountConfig.findMany({
		where: whereAccount,
		orderBy: [{ site: 'asc' }, { username: 'asc' }],
	});

	// Initialize orchestrator + ECO catalog (in-memory)
	const importService = new ImportOrchestrator([new ChessComImporter(), new LichessImporter()]);
	const ecoCatalog = await getEcoOpeningsCatalog();

	// Batch totals + lastSyncAt watermark policy
	let totalGamesFound = 0;
	let totalInserted = 0;
	let totalSkipped = 0;
	let totalFailed = 0;

	const accountsToUpdateLastSyncAt: string[] = [];

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

	// Apply lastSyncAt watermark update (batch-level)
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
