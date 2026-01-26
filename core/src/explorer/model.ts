/**
 * Explorer data model (CORE)
 *
 * The Explorer session is modeled as a tree of positions (nodes).
 *
 * Concepts:
 * - A node represents a chess position identified by its FEN.
 * - Root node has no `parentId` and no `incomingMove`.
 * - Non-root nodes have an `incomingMove` describing the move played from the parent position.
 * - A node can have multiple children => variations.
 * - `activeChildId` on a node defines which continuation is currently selected as the "active line".
 *
 * Important:
 * - UI must not implement tree logic.
 * - UI consumes read-only selectors / view models derived by ExplorerSession.
 */

import type { ExplorerNodeId } from './ids';
import type { PromotionPiece } from './types';

/**
 * UCI move string.
 * Examples: "e2e4", "e7e8q"
 *
 * Note:
 * - We keep it as a string for simplicity; validation is done in ExplorerSession.
 */
export type ExplorerUci = string;

/**
 * Move representation used across the Explorer.
 * - `uci` is the canonical and stable representation used for identity matching (reuse nodes).
 * - `san` is produced by the rules engine and displayed in UI.
 */
export type ExplorerMove = {
	/** UCI move string. */
	uci: ExplorerUci;

	/** SAN notation (human-friendly). Example: "Nf3", "O-O", "exd5". */
	san: string;

	/** Convenience fields (also used for highlights on the board). */
	from: string; // e.g. "e2"
	to: string; // e.g. "e4"

	/** Present only for promotions. */
	promotion?: PromotionPiece;
};

/**
 * A position node in the exploration tree.
 */
export type ExplorerNode = {
	/** Unique node id inside the session. */
	id: ExplorerNodeId;

	/** Parent node id. Root has no parent. */
	parentId?: ExplorerNodeId;

	/**
	 * Ply index (half-move count) from the root.
	 * - root = 0
	 * - after White's first move = 1
	 * - after Black's first reply = 2
	 * etc.
	 */
	ply: number;

	/**
	 * FEN for the position represented by this node.
	 * - Root is usually the initial position.
	 * - In CASE1, root may be replaced by a loaded FEN.
	 */
	fen: string;

	/**
	 * Normalized FEN used for position identity and DB lookups.
	 * Format: first 4 fields of a FEN (board, side to move, castling, en-passant).
	 * (Halfmove/fullmove counters are intentionally excluded.)
	 */
	normalizedFen: string;

	/**
	 * Stable position key derived from normalizedFen.
	 * Used to query DB for "next moves from this position" (opening-book style).
	 */
	positionKey: string;

	/**
	 * Move played from parent -> this node.
	 * Undefined for root.
	 */
	incomingMove?: ExplorerMove;

	/**
	 * Child nodes represent continuations from this position.
	 *
	 * Convention / invariant used by the Explorer:
	 * - childIds[0] is the "mainline" continuation (insertion order).
	 * - childIds[1..] are alternative continuations (variations).
	 */
	childIds: ExplorerNodeId[];

	/**
	 * Currently selected continuation from this position for "active line" navigation.
	 * This is independent from `childIds[0]` mainline definition.
	 */
	activeChildId?: ExplorerNodeId;
};

/**
 * Tree container for all nodes in a session.
 */
export type ExplorerTree = {
	/** Root node id. */
	rootId: ExplorerNodeId;

	/** Storage for nodes. */
	nodesById: Record<ExplorerNodeId, ExplorerNode>;
};

/**
 * Mainline move enriched with meta computed on its PARENT node.
 * Used for the simple mainline MoveList (pre-variations).
 */
export type ExplorerMainlineMove = ExplorerMove & {
	/**
	 * Number of alternative moves available from the parent position.
	 * Computed as: max(0, parent.childIds.length - 1).
	 */
	variationCount: number;
};

/**
 * UI token for a move inside the MoveList view model.
 * This is node-based (nodeId), so UI can navigate to any branch reliably.
 */
export type ExplorerMoveToken = ExplorerMove & {
	/** Node reached after playing this move (the node that owns this incomingMove). */
	nodeId: ExplorerNodeId;

	/** Ply of that node. */
	ply: number;

	/**
	 * Display label used in variation lines.
	 * Examples:
	 * - "5.O-O" (white move at ply=9)
	 * - "5...c5" (black move at ply=10 when the line starts on black)
	 * - "d5" (subsequent moves inside the same variation line)
	 */
	label: string;

	/**
	 * Number of alternative continuations from the position AFTER this move (i.e., from this node).
	 * Computed as: max(0, node.childIds.length - 1).
	 */
	variationCount: number;

	/**
	 * True when the node's active child currently points to the mainline continuation (childIds[0]).
	 * This is useful for UI hints like "..."/branch indicators.
	 */
	activeChildIsMainline: boolean;
};

/**
 * A single variation "line" displayed under a move.
 * - `startNodeId` is the first node of that line (the alternative continuation child).
 * - `tokens` contains the moves along the variation's own mainline (following childIds[0]).
 */
export type ExplorerVariationLine = {
	startNodeId: ExplorerNodeId;
	tokens: ExplorerMoveToken[];
};

/**
 * One row in the main MoveList, grouped by full-move:
 * - row 1: white ply 1, black ply 2
 * - row 2: white ply 3, black ply 4
 * etc.
 */
export type ExplorerMoveListRow = {
	moveNumber: number;
	white?: ExplorerMoveToken;
	black?: ExplorerMoveToken;
};

/**
 * View model consumed by the UI MoveList component.
 *
 * `variationsByNodeId` maps a node (position after a move) to the list of
 * alternative lines that start from that position.
 *
 * Note:
 * - Keys are string for easy consumption in Angular templates and Record usage.
 * - Values are deterministic (no mutation expected from UI).
 */
export type ExplorerMoveListViewModel = {
	rows: ExplorerMoveListRow[];
	variationsByNodeId: Record<string, ExplorerVariationLine[]>;
};
