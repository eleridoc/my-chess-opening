import { ImportStatus } from '@prisma/client';

import { prisma } from '../db/prisma';

import type { ImportAllAccountsParams, ImportBatchSummary } from './importAllAccounts.types';
export type { ImportBatchSummary } from './importAllAccounts.types';

import { logImport } from './persistence/importLogger';
import { runImportBatch } from './runner/runImportBatch';

/**
 * Marks "running" ImportRuns left in an unfinished state as aborted.
 *
 * This typically happens when the app is closed while an import is running.
 *
 * Note:
 * We use ImportStatus.PARTIAL as a "RUNNING" surrogate in our minimal enum set.
 * Any run with `status=PARTIAL` and `finishedAt=null` is considered aborted.
 */
export async function cleanupAbortedImportRuns(): Promise<number> {
	const abortedRuns = await prisma.importRun.findMany({
		where: {
			status: ImportStatus.PARTIAL,
			finishedAt: null,
		},
		select: {
			id: true,
		},
	});

	if (abortedRuns.length === 0) return 0;

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
	// This is intentionally best-effort: logging failures should not prevent cleanup.
	for (const run of abortedRuns) {
		try {
			await logImport({
				importRunId: run.id,
				level: 'WARN',
				scope: 'RUN',
				message,
			});
		} catch {
			// Ignore logging failures.
		}
	}

	console.warn('[IMPORT] Aborted import runs cleaned up:', abortedRuns.length);
	return abortedRuns.length;
}

/**
 * Import games for all enabled accounts (or a filtered subset) using the batch runner.
 *
 * IMPORTANT: This function is an entrypoint and must keep stable contracts (IPC/UI).
 */
export async function importAllAccounts(
	params?: ImportAllAccountsParams,
): Promise<ImportBatchSummary> {
	return runImportBatch(params);
}
