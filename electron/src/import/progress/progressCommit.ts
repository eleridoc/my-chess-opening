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

type UpdateRunCountersFn = (args: {
	runId: string;
	inserted: number;
	skipped: number;
	failed: number;
}) => Promise<void>;

/**
 * Commit throttled per-account progress:
 * - Persists counters to the DB every N processed games
 * - Emits `accountProgress` events at the same cadence
 *
 * IMPORTANT:
 * This is refactor-only: keep the throttle rule identical to the legacy inline implementation.
 */
export function createAccountProgressCommitter(params: {
	commitEvery: number;
	runId: string;
	accountId: string;
	gamesFound: number;
	emit: (payload: ImportEventPayload) => void;
	updateRunCounters: UpdateRunCountersFn;
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

	function emitSnapshot(snapshot: {
		processed: number;
		gamesFound: number;
		inserted: number;
		skipped: number;
		failed: number;
	}): void {
		emit({
			type: 'accountProgress',
			accountId,
			...snapshot,
		});
	}

	return {
		emitInitial() {
			emitSnapshot({
				processed: 0,
				gamesFound,
				inserted: 0,
				skipped: 0,
				failed: 0,
			});
		},

		async maybeCommit(counters: ImportRunCounters): Promise<void> {
			const snapshot = buildSnapshot(counters);

			// Keep the exact rule from the original implementation:
			// - only commit when processed > 0
			// - commit every N processed games
			if (snapshot.processed > 0 && snapshot.processed % commitEvery === 0) {
				await updateRunCounters({
					runId,
					inserted: snapshot.inserted,
					skipped: snapshot.skipped,
					failed: snapshot.failed,
				});

				emitSnapshot(snapshot);
			}
		},

		async commitFinal(counters: ImportRunCounters): Promise<void> {
			const snapshot = buildSnapshot(counters);

			// Final counters are always persisted (even if 0).
			await updateRunCounters({
				runId,
				inserted: snapshot.inserted,
				skipped: snapshot.skipped,
				failed: snapshot.failed,
			});

			emitSnapshot(snapshot);
		},
	};
}
