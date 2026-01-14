/**
 * Explorer data model (CORE)
 *
 * The Explorer session is modeled as a tree of positions (nodes).
 * - Each node represents a chess position identified by its FEN.
 * - A node (except root) has an "incomingMove" describing the move played from its parent.
 * - Each node can have multiple children => variations.
 * - "activeChildId" defines which continuation is currently selected as the active line.
 *
 * UI should never implement tree logic directly; it will consume a derived "active line"
 * provided by ExplorerSession (next tasks).
 */

import type { PromotionPiece } from './types';
import type { ExplorerNodeId } from './ids';

export type ExplorerUci = string; // e.g. "e2e4", "e7e8q"

export type ExplorerMove = {
	/**
	 * UCI move string, used as a stable, engine-friendly representation.
	 * Examples: "e2e4", "e7e8q"
	 */
	uci: ExplorerUci;

	/** Human-friendly notation produced by the chess rules engine. Example: "Nf3" */
	san: string;

	/** Convenience fields for UI or debugging. */
	from: string; // e.g. "e2"
	to: string; // e.g. "e4"
	promotion?: PromotionPiece;
};

export type ExplorerNode = {
	/** Unique id inside the session */
	id: ExplorerNodeId;

	/** Parent node id. Root has no parent. */
	parentId?: ExplorerNodeId;

	/**
	 * Ply index (half-move count) from the root.
	 * Root is always ply = 0.
	 * After 1 white move => ply 1, after black reply => ply 2, etc.
	 */
	ply: number;

	/**
	 * FEN of the position represented by this node.
	 * Root is typically the initial position, but in CASE1 it might be set from a loaded FEN later.
	 */
	fen: string;

	/**
	 * Move played from parent -> this node.
	 * Undefined for root.
	 */
	incomingMove?: ExplorerMove;

	/**
	 * Children represent continuations from this position.
	 * We store only ids to keep the node lightweight.
	 */
	childIds: ExplorerNodeId[];

	/**
	 * Which child is currently considered the active continuation for navigation.
	 * This allows us to represent a mainline/variation selection without changing the tree.
	 */
	activeChildId?: ExplorerNodeId;
};

export type ExplorerTree = {
	/** Root node id */
	rootId: ExplorerNodeId;

	/** Node storage */
	nodesById: Record<ExplorerNodeId, ExplorerNode>;
};
