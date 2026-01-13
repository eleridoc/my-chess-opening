export interface ImportRunNowInput {
	/**
	 * If provided, overrides per-account lastSyncAt.
	 * ISO string (e.g. new Date().toISOString()).
	 */
	sinceOverrideIso?: string | null;

	/**
	 * If provided (>0), limits imported games per account (debug/dev).
	 */
	maxGamesPerAccount?: number | null;
}

export interface ImportRunNowResult {
	ok: true;
	message: string;
}

export interface ImportApi {
	runNow: (input?: ImportRunNowInput) => Promise<ImportRunNowResult>;
}
