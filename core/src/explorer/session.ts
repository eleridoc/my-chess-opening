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
	// Internal state (single bag => easier to split into modules)
	// ---------------------------------------------------------------------------

	private readonly state: ExplorerSessionState;

	constructor() {
		this.state = createExplorerSessionState();
		this.resetToInitial();
	}

	// ---------------------------------------------------------------------------
	// Public API — Lifecycle / Loaders
	// ---------------------------------------------------------------------------

	resetToInitial(): void {
		loaders.resetToInitial(this.state);
	}

	loadInitial(): void {
		this.resetToInitial();
	}

	loadFenForCase1(fen: string): ExplorerResult {
		return loaders.loadFenForCase1(this.state, fen);
	}

	loadPgn(pgn: string, meta?: ExplorerPgnMeta): ExplorerResult {
		return loaders.loadPgn(this.state, pgn, meta);
	}

	loadGameMovesSan(movesSan: string[], meta: ExplorerDbGameMeta): ExplorerResult {
		return loaders.loadGameMovesSan(this.state, movesSan, meta);
	}

	loadDbGameSnapshot(snapshot: ExplorerGameSnapshot): ExplorerResult {
		return loaders.loadDbGameSnapshot(this.state, snapshot);
	}

	// ---------------------------------------------------------------------------
	// Public API — Move application
	// ---------------------------------------------------------------------------

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

	goToPly(ply: number): void {
		nav.goToPly(this.state, ply);
	}

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

	getCurrentNormalizedFen(): string {
		return sel.getCurrentNormalizedFen(this.state);
	}

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

	// ---------------------------------------------------------------------------
	// Public API — Read-only helpers for UI hinting (V1.2.5)
	// ---------------------------------------------------------------------------

	getLegalDestinationsFrom(fromSquare: string): string[] {
		return sel.getLegalDestinationsFrom(this.state, fromSquare);
	}

	getLegalCaptureDestinationsFrom(fromSquare: string): string[] {
		return sel.getLegalCaptureDestinationsFrom(this.state, fromSquare);
	}
}
