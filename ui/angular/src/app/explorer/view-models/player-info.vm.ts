/**
 * Explorer "Players" view-model types (UI)
 *
 * Purpose:
 * - Provide a stable, UI-friendly representation for player cards.
 * - Avoid leaking core/domain types into templates and presentation components.
 *
 * Notes:
 * - `isMe` is currently DB-only (derived from snapshot.myColor).
 *   For ephemeral PGN/FEN sessions it is typically undefined.
 * - Names/ELO are strings because sources vary (DB numbers, PGN tag strings, etc.).
 * - The "top/bottom" layout is intentionally separate from "white/black":
 *   UI decides ordering based on board orientation (who is at the bottom).
 */

export type PlayerSide = 'white' | 'black';

export type PlayerInfoVm = {
	/** Logical side in the game (independent from where the card is rendered). */
	side: PlayerSide;

	/** Display name (already sanitized/fallback handled by the VM builder). */
	name: string;

	/** Optional ELO (string to preserve original source formatting). */
	elo?: string;

	/**
	 * Whether this player represents the local user (DB only).
	 * When true, UI can display a dedicated icon/badge.
	 */
	isMe?: boolean;
};

export type PlayersPanelVm = {
	/** Player rendered on top of the left column (depends on board orientation). */
	top: PlayerInfoVm;

	/** Player rendered on bottom of the left column (depends on board orientation). */
	bottom: PlayerInfoVm;
};
