import type { ExternalSite, GameSpeed, PlayerColor } from '../../import/types';
import type { ResultKey } from '../../import/types';

// Add near other exported types (e.g. after ResultKey)
export type SortOrder = 'asc' | 'desc';

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

	/** Sort order for playedAt (default: 'desc' = newest first). */
	playedAtOrder?: SortOrder;

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

	/**
	 * Provider ECO code coming from the imported PGN (Chess.com/Lichess).
	 * This value must never be overwritten by the app.
	 */
	eco: string | null;

	/**
	 * ECO code determined by the app using the Lichess openings dataset (best-effort).
	 * - When the provider ECO is consistent, ecoDetermined === eco.
	 * - When inconsistent (e.g. provider ECO wrong), ecoDetermined may differ.
	 */
	ecoDetermined: string | null;

	/**
	 * Provider opening name coming from the imported PGN (Chess.com/Lichess).
	 * This value must never be overwritten by the app.
	 */
	opening: string | null;

	/**
	 * Opening name deduced by the app using ECO + moves (best-effort).
	 * This is separate from `opening` which comes from the PGN/header/source.
	 */
	ecoOpeningName: string | null;

	/** Dataset line used for the match (useful for tooltips/debug). */
	ecoOpeningLinePgn: string | null;

	/** Number of plies matched against the game mainline (diagnostic). */
	ecoOpeningMatchPly: number | null;

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
