import { app, ipcMain } from 'electron';
import { randomUUID } from 'node:crypto';
import type {
	ImportEvent,
	ImportStartInput,
	ImportStartResult,
	ImportRunStatus,
} from 'my-chess-opening-core';

import { cleanupAbortedImportRuns, importAllAccounts } from './importAllAccounts';

export type EmitImportEvent = (event: ImportEvent) => void;

/**
 * In-app guard to prevent concurrent imports from being triggered via IPC.
 * This is intentionally kept in-memory (not persisted).
 */
let isImportRunning = false;

/**
 * Current import batch id (used to provide idempotent `import:start` responses).
 */
let currentImportBatchId: string | null = null;

/**
 * Register import-related IPC handlers.
 *
 * This keeps `main.ts` lean and follows the same pattern as other domain IPC modules.
 */
export function registerImportIpc(opts: { emitImportEvent: EmitImportEvent }): void {
	const { emitImportEvent } = opts;

	ipcMain.handle(
		'import:start',
		async (_event, input?: ImportStartInput): Promise<ImportStartResult> => {
			// Idempotent behavior: do not start a second import.
			if (isImportRunning) {
				return {
					ok: true,
					batchId: currentImportBatchId ?? 'unknown',
					message: 'Import already running',
				};
			}

			// Cleanup any unfinished runs before starting a new import.
			try {
				await cleanupAbortedImportRuns();
			} catch (err) {
				console.error(
					'[IMPORT] Failed to cleanup aborted runs before starting a new import',
					err,
				);
			}

			const batchId = randomUUID();
			currentImportBatchId = batchId;
			isImportRunning = true;

			const sinceOverrideIso = input?.sinceOverrideIso ?? null;
			let maxGamesPerAccount =
				typeof input?.maxGamesPerAccount === 'number' ? input.maxGamesPerAccount : null;

			/**
			 * DEV cap (opt-in):
			 * - By default, dev runs are UNBOUNDED (no cap).
			 * - Enable a cap only when explicitly requested:
			 *   - via ImportStartInput.maxGamesPerAccount (renderer), OR
			 *   - via env var MCO_IMPORT_DEV_MAX_GAMES_PER_ACCOUNT=<N>
			 *
			 * Notes:
			 * - 0 / empty / invalid values disable the cap.
			 */
			if (!app.isPackaged && maxGamesPerAccount == null) {
				const raw = process.env['MCO_IMPORT_DEV_MAX_GAMES_PER_ACCOUNT'];

				if (raw != null && raw.trim().length > 0) {
					const devCap = Number(raw);

					if (Number.isFinite(devCap) && devCap > 0) {
						console.warn('[IPC] import:start dev cap enabled via env', { devCap });
						maxGamesPerAccount = devCap;
					}
				}
			}

			const accountIds = input?.accountIds ?? null;
			const startedAtIso = new Date().toISOString();

			emitImportEvent({
				type: 'runStarted',
				batchId,
				emittedAtIso: startedAtIso,
				sinceOverrideIso,
				maxGamesPerAccount,
				accountIds,
			});

			console.log('[IPC] import:start triggered', {
				batchId,
				sinceOverrideIso,
				maxGamesPerAccount,
				accountIds,
			});

			// Fire-and-forget: the UI will track progress through streaming events.
			void (async () => {
				const finishNowIso = () => new Date().toISOString();

				try {
					const sinceOverride = sinceOverrideIso ? new Date(sinceOverrideIso) : null;

					// Streams per-account events and returns batch totals.
					const summary = await importAllAccounts({
						sinceOverride,
						maxGamesPerAccount,
						accountIds,
						batchId,
						batchStartedAtIso: startedAtIso, // <-- NEW
						onEvent: emitImportEvent,
					});

					console.log('[IPC] import:start completed', { batchId, summary });

					const endIso = finishNowIso();

					emitImportEvent({
						type: 'batchFinished',
						batchId,
						emittedAtIso: endIso,
						status: summary.status,
						totalGamesFound: summary.totalGamesFound,
						totalInserted: summary.totalInserted,
						totalSkipped: summary.totalSkipped,
						totalFailed: summary.totalFailed,
						finishedAtIso: endIso,
					});
				} catch (err) {
					console.error('[IPC] import:start failed', err);

					const endIso = finishNowIso();
					const status: ImportRunStatus = 'FAILED';

					emitImportEvent({
						type: 'batchFinished',
						batchId,
						emittedAtIso: endIso,
						status,
						totalGamesFound: 0,
						totalInserted: 0,
						totalSkipped: 0,
						totalFailed: 0,
						finishedAtIso: endIso,
					});
				} finally {
					isImportRunning = false;
					currentImportBatchId = null;
				}
			})();

			return { ok: true, batchId, message: 'Import started' };
		},
	);
}
