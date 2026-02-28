import type { ImportAccountPhaseVm } from '../../../services/import/import-state.service';

/**
 * Import page table view-models.
 *
 * Note:
 * - UI-only types, meant to be shared between ImportPage and extracted presentational components.
 * - Keep this file free of runtime code (types only).
 */
export type ImportAccountRowBaseVm = {
	id: string;
	site: 'LICHESS' | 'CHESSCOM';
	username: string;
	isEnabled: boolean;
	lastSyncAt: string | null;

	/**
	 * Total games stored locally for this account.
	 * Note: not currently used by the template, but kept for future UX (e.g. "Imported: N").
	 */
	gamesTotal: number;
};

export type ImportAccountErrorVm = {
	externalId: string | null;
	message: string;
};

export type ImportAccountRowVm = ImportAccountRowBaseVm & {
	siteLabel: string;

	/**
	 * Tooltip for the per-account import action (null means "no special reason").
	 * Only used when the account is not enabled.
	 */
	disabledReason: string | null;

	// Live import state (streamed by Electron -> ImportStateService)
	isWaiting: boolean;
	gamesFound: number | null;
	processed: number | null;
	inserted: number | null;
	skipped: number | null;
	failed: number | null;
	status: string | null; // RUNNING / SUCCESS / FAILED / PARTIAL etc.
	errors: ImportAccountErrorVm[];
	phase: ImportAccountPhaseVm | null;
};
