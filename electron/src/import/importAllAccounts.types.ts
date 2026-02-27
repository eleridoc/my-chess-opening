import type { ImportEvent, ImportRunStatus } from 'my-chess-opening-core';

/**
 * Summary returned by importAllAccounts().
 * Used by IPC/UI to display the final batch outcome.
 */
export type ImportBatchSummary = {
	status: ImportRunStatus;
	totalGamesFound: number;
	totalInserted: number;
	totalSkipped: number;
	totalFailed: number;
};

/**
 * Input parameters for importAllAccounts().
 *
 * Notes:
 * - `batchId` must be provided when `onEvent` is provided, so the UI can correlate events.
 * - Dates are passed as JS Date objects (DB stores ISO 8601; not handled here).
 */
export type ImportAllAccountsParams = {
	/**
	 * Optional override for all accounts in the batch.
	 * When omitted, each account uses its own `lastSyncAt` watermark (or FULL if null).
	 */
	sinceOverride?: Date | null;

	/**
	 * Optional cap mainly used for development/testing.
	 * When set, the batch should not update `lastSyncAt` to avoid skipping games.
	 */
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
};

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

export type ImportEventPayload = WithoutBase<ImportEvent>;
