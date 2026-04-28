import type { SharedGameFilter } from '../../filters';
import type { ExternalSite, GameSpeed, PlayerColor, ResultKey } from '../../import/types';

/**
 * Sort order used by paginated game list queries.
 */
export type SortOrder = 'asc' | 'desc';

/**
 * Legacy Games page filters.
 *
 * @deprecated V1.13 introduces the shared game filter through
 * `GamesListInput.filter`. Keep this type temporarily to preserve the current
 * Games page behavior while the backend and UI are migrated step by step.
 */
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

	/**
	 * Shared reusable game filter snapshot coming from the Games page.
	 *
	 * The backend is responsible for:
	 * - normalizing it
	 * - stripping fields that are not supported by the Games context
	 * - mapping it to the database query
	 *
	 * This is the V1.13 target input and should replace `filters`.
	 */
	filter?: SharedGameFilter | null;

	/**
	 * Legacy Games filters.
	 *
	 * @deprecated Use `filter` instead. This field is kept temporarily so the
	 * current Games page can continue to compile and behave exactly as before
	 * until the V1.13 backend and UI migration is complete.
	 */
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

	/**
	 * Canonical shared filter snapshot actually applied by the backend.
	 *
	 * This is optional during the V1.13 migration because the current backend
	 * still supports the legacy `filters` input. It should become the reference
	 * once the Games page fully uses `GamesListInput.filter`.
	 */
	appliedFilter?: SharedGameFilter | null;
}

export interface GamesApi {
	list: (input?: GamesListInput) => Promise<GamesListResult>;
}
