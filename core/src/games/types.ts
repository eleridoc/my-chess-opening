import type { ExternalSite, GameSpeed, PlayerColor } from '../import/types';

/**
 * Result key encoding used for fast filtering/aggregations.
 *
 * Conventions:
 * - resultKey (objective, White POV):
 *   1 = White win, 0 = draw/unknown, -1 = Black win
 * - myResultKey (owner POV):
 *   1 = owner win, 0 = draw/unknown, -1 = owner loss
 */
export type ResultKey = 1 | 0 | -1;

export interface GamesListFilters {
	/** Limit to specific sources (e.g. CHESSCOM, LICHESS). */
	sites?: ExternalSite[] | null;

	/** Free-text search (player, opening, ECO, external id...). */
	search?: string | null;

	/** PlayedAt lower bound (ISO string, UTC). */
	playedAtGteIso?: string | null;

	/** PlayedAt upper bound (ISO string, UTC). */
	playedAtLteIso?: string | null;

	/** Filter by the owner's color. */
	myColor?: PlayerColor[] | null;

	/**
	 * Filter by the objective result (White POV).
	 * This maps to DB column `resultKey`.
	 *
	 * Keep this for stats like "White wins" regardless of the owner.
	 */
	resultKeys?: ResultKey[] | null;

	/**
	 * Filter by the owner result.
	 * This maps to DB column `myResultKey`.
	 *
	 * Use this for "my wins / my losses / my draws".
	 */
	myResultKeys?: ResultKey[] | null;
}

export interface GamesListInput {
	/** 1-based page index. */
	page?: number;

	/** Page size (default: 50). */
	pageSize?: number;

	filters?: GamesListFilters;
}

export interface GamesListItem {
	id: string;
	playedAtIso: string;

	site: ExternalSite;
	rated: boolean;
	speed: GameSpeed;
	timeControl: string;

	/** Raw PGN header result: "1-0" | "0-1" | "1/2-1/2" | "*" */
	result: string;

	/** Owner POV result key: 1 win, 0 draw/unknown, -1 loss */
	myResultKey: ResultKey;

	myColor: PlayerColor;
	myUsername: string;
	opponentUsername: string;

	whiteUsername: string;
	blackUsername: string;
	whiteElo: number | null;
	blackElo: number | null;

	eco: string | null;
	opening: string | null;

	/** Number of half-moves (plies) or moves count depending on your query convention. */
	movesCount: number;

	/** External game URL when available (lichess/chess.com). */
	externalUrl: string | null;
}

export interface GamesListResult {
	items: GamesListItem[];
	total: number;
	page: number;
	pageSize: number;
}

export interface GamesApi {
	list: (input?: GamesListInput) => Promise<GamesListResult>;
}
