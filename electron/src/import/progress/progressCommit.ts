import type { ImportEventPayload } from '../importAllAccounts.types';

/**
 * Counters tracked during per-account import.
 */
export type ImportRunCounters = {
	inserted: number;
	skipped: number;
	failed: number;
};

export type AccountProgressCommitter = {
	emitInitial: () => void;
	maybeCommit: (counters: ImportRunCounters) => Promise<void>;
	commitFinal: (counters: ImportRunCounters) => Promise<void>;
};

export function createAccountProgressCommitter(params: {
	commitEvery: number;
	runId: string;
	accountId: string;
	gamesFound: number;
	emit: (payload: ImportEventPayload) => void;
	updateRunCounters: (args: {
		runId: string;
		inserted: number;
		skipped: number;
		failed: number;
	}) => Promise<void>;
}): AccountProgressCommitter {
	const { commitEvery, runId, accountId, gamesFound, emit, updateRunCounters } = params;

	function buildSnapshot(counters: ImportRunCounters) {
		const processed = counters.inserted + counters.skipped + counters.failed;

		return {
			processed,
			gamesFound,
			inserted: counters.inserted,
			skipped: counters.skipped,
			failed: counters.failed,
		};
	}

	return {
		emitInitial() {
			emit({
				type: 'accountProgress',
				accountId,
				processed: 0,
				gamesFound,
				inserted: 0,
				skipped: 0,
				failed: 0,
			});
		},

		async maybeCommit(counters: ImportRunCounters): Promise<void> {
			const { processed, inserted, skipped, failed } = buildSnapshot(counters);

			// Keep the exact rule from the original implementation:
			// - only commit when processed > 0
			// - commit every N processed games
			if (processed > 0 && processed % commitEvery === 0) {
				await updateRunCounters({ runId, inserted, skipped, failed });

				emit({
					type: 'accountProgress',
					accountId,
					processed,
					gamesFound,
					inserted,
					skipped,
					failed,
				});
			}
		},

		async commitFinal(counters: ImportRunCounters): Promise<void> {
			const { processed, inserted, skipped, failed } = buildSnapshot(counters);

			// Final counters are always persisted (even if 0).
			await updateRunCounters({ runId, inserted, skipped, failed });

			emit({
				type: 'accountProgress',
				accountId,
				processed,
				gamesFound,
				inserted,
				skipped,
				failed,
			});
		},
	};
}
