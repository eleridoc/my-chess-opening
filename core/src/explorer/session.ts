/**
 * ExplorerSession (CORE)
 *
 * Backbone of the Explorer feature.
 * Owns the full exploration state and enforces domain invariants.
 *
 * Key principles:
 * - UI (Angular) and desktop shell (Electron) MUST NOT implement chess rules.
 * - UI sends intents (load / move attempt / navigation) and renders derived state.
 * - The session is modeled as a tree of positions (nodes) with variations.
 *
 * This file contains core-domain code only:
 * - No Angular, no Electron, no persistence, no UI concerns.
 * - Only deterministic state transitions and read-only selectors.
 */

import type {
	ExplorerApplyMoveResult,
	ExplorerDbGameMeta,
	ExplorerGameSnapshot,
	ExplorerMoveAttempt,
	ExplorerPgnMeta,
	ExplorerResult,
	ExplorerSessionSource,
	ExplorerMode,
	CapturedPiecesAtCursor,
	MaterialAtCursor,
} from './types';

import type { ExplorerNodeId } from './ids';
import type {
	ExplorerMove,
	ExplorerNode,
	ExplorerTree,
	ExplorerMainlineMove,
	ExplorerMoveListViewModel,
} from './model';

import { createExplorerSessionState, type ExplorerSessionState } from './session.state';

import * as loaders from './session.loaders';
import * as moves from './session.moves';
import * as nav from './session.navigation';
import * as sel from './session.selectors';

export class ExplorerSession {
	// ---------------------------------------------------------------------------
	// Internal state
	// ---------------------------------------------------------------------------

	/**
	 * Single mutable state bag.
	 * Keeping it as one object makes it easy to delegate behaviors to small modules
	 * (loaders/moves/navigation/selectors) without spreading fields everywhere.
	 */
	private readonly state: ExplorerSessionState;

	constructor() {
		this.state = createExplorerSessionState();
		this.resetToInitial();
	}

	// ---------------------------------------------------------------------------
	// Public API — Lifecycle / Loaders
	// ---------------------------------------------------------------------------

	/**
	 * Hard reset to the initial explorer state (CASE1_FREE).
	 * Clears the tree and resets the cursor to the root.
	 */
	resetToInitial(): void {
		loaders.resetToInitial(this.state);
	}

	/**
	 * Alias kept for UI readability.
	 * Equivalent to resetToInitial().
	 */
	loadInitial(): void {
		this.resetToInitial();
	}

	/**
	 * Loads a FEN into CASE1 (only allowed when the core is in CASE1_FREE).
	 * Returns an error result when invalid or not allowed by case rules.
	 */
	loadFenForCase1(fen: string): ExplorerResult {
		return loaders.loadFenForCase1(this.state, fen);
	}

	/**
	 * Loads a PGN into CASE2_PGN (only allowed when the core is in CASE1_FREE).
	 * PGN may include variations, which become branches in the exploration tree.
	 */
	loadPgn(pgn: string, meta?: ExplorerPgnMeta): ExplorerResult {
		return loaders.loadPgn(this.state, pgn, meta);
	}

	/**
	 * Legacy DB loader: SAN move list + meta.
	 * Prefer `loadDbGameSnapshot()` for an all-in-one payload when possible.
	 */
	loadGameMovesSan(movesSan: string[], meta: ExplorerDbGameMeta): ExplorerResult {
		return loaders.loadGameMovesSan(this.state, movesSan, meta);
	}

	/**
	 * Loads a DB game snapshot into CASE2_DB (only allowed when the core is in CASE1_FREE).
	 * Snapshot contains headers + moves (and optionally perspective color).
	 */
	loadDbGameSnapshot(snapshot: ExplorerGameSnapshot): ExplorerResult {
		return loaders.loadDbGameSnapshot(this.state, snapshot);
	}

	// ---------------------------------------------------------------------------
	// Public API — Move application
	// ---------------------------------------------------------------------------

	/**
	 * Attempts to apply a move (UCI-like: from/to + optional promotion).
	 * Returns either:
	 * - ok result (move applied, cursor moved / node created)
	 * - error result (illegal move, promotion required, etc.)
	 */
	applyMoveUci(attempt: ExplorerMoveAttempt): ExplorerApplyMoveResult {
		return moves.applyMoveUci(this.state, attempt);
	}

	// ---------------------------------------------------------------------------
	// Public API — Navigation
	// ---------------------------------------------------------------------------

	canGoPrev(): boolean {
		return nav.canGoPrev(this.state);
	}

	canGoNext(): boolean {
		return nav.canGoNext(this.state);
	}

	goStart(): void {
		nav.goStart(this.state);
	}

	goEnd(): void {
		nav.goEnd(this.state);
	}

	goPrev(): void {
		nav.goPrev(this.state);
	}

	goNext(): void {
		nav.goNext(this.state);
	}

	canGoPrevVariation(): boolean {
		return nav.canGoPrevVariation(this.state);
	}

	canGoNextVariation(): boolean {
		return nav.canGoNextVariation(this.state);
	}

	goPrevVariation(): void {
		nav.goPrevVariation(this.state);
	}

	goNextVariation(): void {
		nav.goNextVariation(this.state);
	}

	/**
	 * Mainline-only navigation by ply.
	 * For variations, prefer goToNode(nodeId).
	 */
	goToPly(ply: number): void {
		nav.goToPly(this.state, ply);
	}

	/**
	 * Cursor navigation by node id (works for mainline and variations).
	 */
	goToNode(nodeId: ExplorerNodeId): void {
		nav.goToNode(this.state, nodeId);
	}

	// ---------------------------------------------------------------------------
	// Public API — Read-only selectors
	// ---------------------------------------------------------------------------

	getMode(): ExplorerMode {
		return sel.getMode(this.state);
	}

	getSource(): ExplorerSessionSource {
		return sel.getSource(this.state);
	}

	getDbGameSnapshot(): ExplorerGameSnapshot | null {
		return sel.getDbGameSnapshot(this.state);
	}

	getRootId(): ExplorerNodeId {
		return sel.getRootId(this.state);
	}

	getCurrentNodeId(): ExplorerNodeId {
		return sel.getCurrentNodeId(this.state);
	}

	getCurrentNode(): ExplorerNode {
		return sel.getCurrentNodeSelector(this.state);
	}

	getCurrentFen(): string {
		return sel.getCurrentFenSelector(this.state);
	}

	/**
	 * Normalized FEN (first 4 fields) for stable position identity.
	 * Useful for caching and for any UI/DB feature that needs a position key.
	 */
	getCurrentNormalizedFen(): string {
		return sel.getCurrentNormalizedFen(this.state);
	}

	/**
	 * Stable hash derived from normalized FEN (position identity).
	 */
	getCurrentPositionKey(): string {
		return sel.getCurrentPositionKey(this.state);
	}

	getCurrentPly(): number {
		return sel.getCurrentPly(this.state);
	}

	getTreeSnapshot(): Readonly<ExplorerTree> {
		return sel.getTreeSnapshot(this.state);
	}

	getActiveLineMoves(): ExplorerMove[] {
		return sel.getActiveLineMoves(this.state);
	}

	getCurrentPathMoves(): ExplorerMove[] {
		return sel.getCurrentPathMoves(this.state);
	}

	getCurrentPathNodeIds(): ExplorerNodeId[] {
		return sel.getCurrentPathNodeIds(this.state);
	}

	getActiveLineNodeIds(): ExplorerNodeId[] {
		return sel.getActiveLineNodeIds(this.state);
	}

	getMainlineNodeIds(): ExplorerNodeId[] {
		return sel.getMainlineNodeIds(this.state);
	}

	getMainlineMovesWithMeta(): ExplorerMainlineMove[] {
		return sel.getMainlineMovesWithMeta(this.state);
	}

	getVariationInfoAtCurrentPly(): { index: number; count: number } | null {
		return sel.getVariationInfoAtCurrentPly(this.state);
	}

	getMoveListViewModel(): ExplorerMoveListViewModel {
		return sel.getMoveListViewModel(this.state);
	}

	/**
	 * Captured pieces computed at the current cursor position.
	 *
	 * Availability rules:
	 * - FEN source => "not_applicable" (no move history)
	 * - PGN/DB/FREE => "available" (computed by replaying the current path from the root)
	 */
	getCapturedPiecesAtCursor(): CapturedPiecesAtCursor {
		return sel.getCapturedPiecesAtCursor(this.state);
	}

	/**
	 * Material state computed at the current cursor position from the current FEN placement.
	 *
	 * Why this exists:
	 * - Capture-only scoring breaks with promotions (a promoted piece can be captured later).
	 * - Material computed from the position is promotion-safe and matches user expectation.
	 */
	getMaterialAtCursor(): MaterialAtCursor {
		return sel.getMaterialAtCursor(this.state);
	}

	// ---------------------------------------------------------------------------
	// Public API — Read-only helpers for UI hinting (V1.2.5)
	// ---------------------------------------------------------------------------

	/**
	 * Legal destinations from a square at the current cursor position.
	 * Used for "dots" and drag/drop guidance.
	 */
	getLegalDestinationsFrom(fromSquare: string): string[] {
		return sel.getLegalDestinationsFrom(this.state, fromSquare);
	}

	/**
	 * Legal capture destinations from a square at the current cursor position.
	 * Used for "capture markers" / capture-only UI hints.
	 */
	getLegalCaptureDestinationsFrom(fromSquare: string): string[] {
		return sel.getLegalCaptureDestinationsFrom(this.state, fromSquare);
	}
}
