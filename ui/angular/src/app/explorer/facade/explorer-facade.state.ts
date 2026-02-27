import { signal } from '@angular/core';

import type { ExplorerSession, PgnTags } from 'my-chess-opening-core/explorer';
import type {
	ExplorerError,
	ExplorerGameSnapshot,
	ExplorerMainlineMove,
	ExplorerMode,
	ExplorerMoveListRow,
	ExplorerSessionSource,
	ExplorerVariationLine,
} from 'my-chess-opening-core/explorer';

import type { BoardOrientation } from '../board/board-adapter';

import type {
	CoreSyncSignals,
	LastMoveSquares,
	PromotionPending,
	TransientSignals,
} from './explorer-facade.internal';

import {
	createExplorerFacadeSelectors,
	type ExplorerFacadeSelectorDeps,
} from './explorer-facade.selectors';

/**
 * ExplorerFacade state factory.
 *
 * Goals:
 * - Centralize writable signals + computed selectors wiring.
 * - Keep ExplorerFacade focused on the public imperative API.
 * - Avoid class field initialization order issues with `session`.
 *
 * Notes:
 * - The returned object exposes:
 *   - a few writable signals for facade-only mutations (prefixed with `_`)
 *   - readonly signals for UI consumption
 *   - `coreSync` and `transient` bundles for internal helpers
 */
export function createExplorerFacadeState(session: ExplorerSession) {
	// -------------------------------------------------------------------------
	// Writable signals (source of truth)
	// -------------------------------------------------------------------------

	const _pendingDbGameId = signal<string | null>(null);
	const _boardOrientation = signal<BoardOrientation>('white');

	const _mode = signal<ExplorerMode>(session.getMode());
	const _source = signal<ExplorerSessionSource>(session.getSource());

	const _fen = signal<string>(session.getCurrentFen());
	const _ply = signal<number>(session.getCurrentPly());
	const _currentNodeId = signal<string>(session.getCurrentNodeId());

	const _moveListRows = signal<ExplorerMoveListRow[]>([]);
	const _variationsByNodeId = signal<Record<string, ExplorerVariationLine[]>>({});

	// Legacy (remove later if unused)
	const _moves = signal<ExplorerMainlineMove[]>(session.getMainlineMovesWithMeta());

	const _canPrev = signal<boolean>(session.canGoPrev());
	const _canNext = signal<boolean>(session.canGoNext());

	const _lastError = signal<ExplorerError | null>(null);
	const _importFenError = signal<ExplorerError | null>(null);
	const _importPgnError = signal<ExplorerError | null>(null);

	const _promotionPending = signal<PromotionPending | null>(null);
	const _lastMoveSquares = signal<LastMoveSquares>(null);

	/**
	 * Tick used by selectors that call into session cursor-dependent methods.
	 * Refreshed by `refreshFromCore()` after each successful core mutation.
	 */
	const _rev = signal(0);

	const _normalizedFen = signal<string>(session.getCurrentNormalizedFen());
	const _positionKey = signal<string>(session.getCurrentPositionKey());

	const _dbGameSnapshot = signal<ExplorerGameSnapshot | null>(session.getDbGameSnapshot());

	/** PGN headers parsed from an ephemeral import (UI-side cache). */
	const _ephemeralPgnTags = signal<PgnTags | null>(null);

	// -------------------------------------------------------------------------
	// Bundles for internal helpers
	// -------------------------------------------------------------------------

	const coreSync: CoreSyncSignals = {
		mode: _mode,
		source: _source,
		fen: _fen,
		ply: _ply,
		currentNodeId: _currentNodeId,

		moveListRows: _moveListRows,
		variationsByNodeId: _variationsByNodeId,

		moves: _moves,

		canPrev: _canPrev,
		canNext: _canNext,

		normalizedFen: _normalizedFen,
		positionKey: _positionKey,
		dbGameSnapshot: _dbGameSnapshot,

		lastMoveSquares: _lastMoveSquares,
		rev: _rev,
	};

	const transient: TransientSignals = {
		lastError: _lastError,
		importFenError: _importFenError,
		importPgnError: _importPgnError,
		promotionPending: _promotionPending,
	};

	// -------------------------------------------------------------------------
	// Computed selectors
	// -------------------------------------------------------------------------

	const selectors = createExplorerFacadeSelectors({
		session,

		rev: _rev,

		mode: _mode,
		source: _source,
		fen: _fen,
		ply: _ply,
		currentNodeId: _currentNodeId,

		moveListRows: _moveListRows,
		variationsByNodeId: _variationsByNodeId,

		moves: _moves,

		canPrev: _canPrev,
		canNext: _canNext,

		normalizedFen: _normalizedFen,
		positionKey: _positionKey,
		dbGameSnapshot: _dbGameSnapshot,

		pendingDbGameId: _pendingDbGameId,
		boardOrientation: _boardOrientation,
		ephemeralPgnTags: _ephemeralPgnTags,

		lastError: _lastError,
		importFenError: _importFenError,
		importPgnError: _importPgnError,
		promotionPending: _promotionPending,
		lastMoveSquares: _lastMoveSquares,
	} satisfies ExplorerFacadeSelectorDeps);

	// -------------------------------------------------------------------------
	// Public API (readonly signals + a few writable internals for the facade)
	// -------------------------------------------------------------------------

	return {
		// Writable internals (facade-only)
		_pendingDbGameId,
		_boardOrientation,
		_lastError,
		_promotionPending,
		_ephemeralPgnTags,

		// Bundles for helpers
		coreSync,
		transient,

		// Readonly signals
		pendingDbGameId: _pendingDbGameId.asReadonly(),
		boardOrientation: _boardOrientation.asReadonly(),

		mode: _mode.asReadonly(),
		source: _source.asReadonly(),
		fen: _fen.asReadonly(),
		ply: _ply.asReadonly(),

		currentNodeId: _currentNodeId.asReadonly(),
		moveListRows: _moveListRows.asReadonly(),
		variationsByNodeId: _variationsByNodeId.asReadonly(),

		// legacy
		moves: _moves.asReadonly(),

		canPrev: _canPrev.asReadonly(),
		canNext: _canNext.asReadonly(),

		lastError: _lastError.asReadonly(),
		importFenError: _importFenError.asReadonly(),
		importPgnError: _importPgnError.asReadonly(),
		promotionPending: _promotionPending.asReadonly(),
		lastMoveSquares: _lastMoveSquares.asReadonly(),

		normalizedFen: _normalizedFen.asReadonly(),
		positionKey: _positionKey.asReadonly(),
		dbGameSnapshot: _dbGameSnapshot.asReadonly(),

		// Selectors
		canStart: selectors.canStart,
		canEnd: selectors.canEnd,
		importRequiresReset: selectors.importRequiresReset,

		canPrevVariation: selectors.canPrevVariation,
		canNextVariation: selectors.canNextVariation,
		variationInfo: selectors.variationInfo,

		gameHeaders: selectors.gameHeaders,
		gameInfoHeaderVm: selectors.gameInfoHeaderVm,

		snapshot: selectors.snapshot,
	};
}
