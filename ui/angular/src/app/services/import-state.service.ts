import { Injectable, signal } from '@angular/core';
import type {
	ImportEvent,
	ImportEventSubscriptionId,
	ImportStartInput,
	ImportStartResult,
	ImportRunStatus,
} from 'my-chess-opening-core';

export type ImportAccountErrorVm = {
	externalId: string | null;
	message: string;
};

export type ImportAccountStateVm = {
	accountId: string;

	// Provided by `accountStarted`
	site: 'CHESSCOM' | 'LICHESS' | null;
	username: string | null;

	// Progress
	gamesFound: number;
	processed: number;

	inserted: number;
	skipped: number;
	failed: number;

	status: ImportRunStatus | 'RUNNING';
	finishedAtIso: string | null;

	errors: ImportAccountErrorVm[];
};

export type ImportBatchTotalsVm = {
	totalGamesFound: number;
	totalInserted: number;
	totalSkipped: number;
	totalFailed: number;
};

@Injectable({ providedIn: 'root' })
export class ImportStateService {
	/** True while an import batch is running. */
	readonly isImporting = signal(false);

	/** Current batch id (null when idle). */
	readonly batchId = signal<string | null>(null);

	/** Timestamp when the current batch started (ISO 8601). */
	readonly startedAtIso = signal<string | null>(null);

	/** Timestamp when the current batch finished (ISO 8601). */
	readonly finishedAtIso = signal<string | null>(null);

	/** Debug: import parameters. */
	readonly sinceOverrideIso = signal<string | null>(null);
	readonly maxGamesPerAccount = signal<number | null>(null);

	/** Per-account live states (keyed by accountId). */
	readonly accounts = signal<Record<string, ImportAccountStateVm>>({});

	/** Batch totals (available on batchFinished). */
	readonly totals = signal<ImportBatchTotalsVm | null>(null);

	/** Last service-level error (IPC unavailable, etc.). */
	readonly lastError = signal<string | null>(null);

	private subscriptionId: ImportEventSubscriptionId | null = null;
	private initialized = false;

	/**
	 * Ensure we are subscribed to Electron import events.
	 * Safe to call multiple times.
	 */
	ensureInitialized(): void {
		if (this.initialized) return;
		this.initialized = true;

		const isElectronRuntime =
			!!window.electron || navigator.userAgent.toLowerCase().includes('electron');

		// Browser mode: keep dev workflow simple (no IPC).
		if (!isElectronRuntime || !window.electron?.import?.onEvent) {
			this.lastError.set(null);
			return;
		}

		this.subscriptionId = window.electron.import.onEvent((event) => {
			this.handleEvent(event);
		});
	}

	/**
	 * Start an import for all enabled accounts.
	 * Returns the IPC result (batchId is included).
	 */
	async startAll(input?: Omit<ImportStartInput, 'accountIds'>): Promise<ImportStartResult> {
		this.ensureInitialized();

		if (!window.electron?.import?.start) {
			throw new Error('Electron import.start() is not available');
		}

		this.lastError.set(null);

		// Optimistic UI: mark as importing immediately (events will confirm).
		this.isImporting.set(true);

		try {
			return await window.electron.import.start({ ...(input ?? {}), accountIds: null });
		} catch (err) {
			this.isImporting.set(false);
			this.lastError.set(err instanceof Error ? err.message : 'Unknown error');
			throw err;
		}
	}

	/**
	 * Start an import for a single account id.
	 */
	async startOne(
		accountId: string,
		input?: Omit<ImportStartInput, 'accountIds'>,
	): Promise<ImportStartResult> {
		this.ensureInitialized();

		if (!window.electron?.import?.start) {
			throw new Error('Electron import.start() is not available');
		}

		this.lastError.set(null);
		this.isImporting.set(true);

		try {
			return await window.electron.import.start({
				...(input ?? {}),
				accountIds: [accountId],
			});
		} catch (err) {
			this.isImporting.set(false);
			this.lastError.set(err instanceof Error ? err.message : 'Unknown error');
			throw err;
		}
	}

	private handleEvent(event: ImportEvent): void {
		// TEMP (dev): debug IPC event stream
		//console.log('[ImportState] event', event);

		// If we already have a batchId and receive a different batch, ignore noise.
		// In our app, only one import should run at a time.
		const currentBatchId = this.batchId();

		if (currentBatchId && event.batchId !== currentBatchId && event.type !== 'runStarted') {
			return;
		}

		switch (event.type) {
			case 'runStarted': {
				// Start (or restart) a new batch.
				this.batchId.set(event.batchId);
				this.startedAtIso.set(event.emittedAtIso);
				this.finishedAtIso.set(null);

				this.sinceOverrideIso.set(event.sinceOverrideIso);
				this.maxGamesPerAccount.set(event.maxGamesPerAccount);

				this.totals.set(null);
				this.accounts.set({}); // Reset per-account state for the new batch
				this.isImporting.set(true);
				this.lastError.set(null);
				return;
			}

			case 'accountStarted': {
				this.upsertAccount(event.accountId, (prev) => ({
					...prev,
					accountId: event.accountId,
					site: event.site,
					username: event.username,
					status: 'RUNNING',
				}));
				return;
			}

			case 'accountNewGamesFound': {
				this.upsertAccount(event.accountId, (prev) => ({
					...prev,
					gamesFound: event.gamesFound,
				}));
				return;
			}

			case 'accountProgress': {
				this.upsertAccount(event.accountId, (prev) => ({
					...prev,
					processed: event.processed,
					gamesFound: event.gamesFound,
					inserted: event.inserted,
					skipped: event.skipped,
					failed: event.failed,
				}));
				return;
			}

			case 'accountError': {
				this.upsertAccount(event.accountId, (prev) => {
					const nextErrors = [
						...prev.errors,
						{ externalId: event.externalId, message: event.message },
					];

					// Keep memory bounded (UI will display the latest errors).
					const MAX_ERRORS = 200;

					return {
						...prev,
						errors: nextErrors.length > MAX_ERRORS ? nextErrors.slice(-MAX_ERRORS) : nextErrors,
					};
				});
				return;
			}

			case 'accountFinished': {
				this.upsertAccount(event.accountId, (prev) => ({
					...prev,
					status: event.status,
					finishedAtIso: event.finishedAtIso,
				}));
				return;
			}

			case 'batchFinished': {
				this.totals.set({
					totalGamesFound: event.totalGamesFound,
					totalInserted: event.totalInserted,
					totalSkipped: event.totalSkipped,
					totalFailed: event.totalFailed,
				});

				this.finishedAtIso.set(event.finishedAtIso);
				this.isImporting.set(false);

				// Keep batchId around for the UI to show "last run" details.
				return;
			}
		}
	}

	private upsertAccount(
		accountId: string,
		patcher: (prev: ImportAccountStateVm) => ImportAccountStateVm,
	): void {
		const current = this.accounts();
		const prev = current[accountId] ?? this.createEmptyAccountState(accountId);
		const next = patcher(prev);

		this.accounts.set({
			...current,
			[accountId]: next,
		});
	}

	private createEmptyAccountState(accountId: string): ImportAccountStateVm {
		return {
			accountId,
			site: null,
			username: null,
			gamesFound: 0,
			processed: 0,
			inserted: 0,
			skipped: 0,
			failed: 0,
			status: 'RUNNING',
			finishedAtIso: null,
			errors: [],
		};
	}
}
