/**
 * UI view model for a chess account row.
 * This is temporary for V1.5.8.2 (mock UI); it will later be replaced by IPC DTOs.
 */
export type ChessAccountRowVm = {
	id: string;
	site: 'LICHESS' | 'CHESSCOM';
	username: string;
	isEnabled: boolean;
	lastSyncAt: string | null; // Keep raw ISO string from DB later; no formatting here.
	gamesTotal: number;
};
