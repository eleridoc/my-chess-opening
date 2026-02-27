import { prisma } from '../db/prisma';
import { ImportStatus } from '@prisma/client';

import type { ImportAllAccountsParams, ImportBatchSummary } from './importAllAccounts.types';

import { logImport } from './persistence/importLogger';

import { runImportBatch } from './runner/runImportBatch';

export type { ImportBatchSummary } from './importAllAccounts.types';

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
	return runImportBatch(params);
}
