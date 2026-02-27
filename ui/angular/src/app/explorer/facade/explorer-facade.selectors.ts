import { computed } from '@angular/core';

import type {
	ExplorerError,
	ExplorerGameSnapshot,
	ExplorerMainlineMove,
	ExplorerMode,
	ExplorerMoveListRow,
	ExplorerSessionSource,
	ExplorerVariationLine,
} from 'my-chess-opening-core/explorer';

import { mapPgnTagsToExplorerHeaders } from 'my-chess-opening-core/explorer';
import type { ExplorerSession, ExplorerGameHeaders, PgnTags } from 'my-chess-opening-core/explorer';

import type { BoardOrientation } from '../board/board-adapter';
import type {
	GameInfoHeaderVm,
	GameInfoPlayerVm,
	PlayerSide,
} from '../view-models/game-info-header.vm';

import * as gameInfoBuilders from './explorer-facade.game-info.builders';
import {
	getPerspectiveColor,
	type LastMoveSquares,
	type PromotionPending,
} from './explorer-facade.internal';

type Getter<T> = () => T;

export type ExplorerFacadeSelectorDeps = {
	// Core
	session: ExplorerSession;

	// Tick for cursor-dependent selectors
	rev: Getter<number>;

	// Core-mirrored UI state
	mode: Getter<ExplorerMode>;
	source: Getter<ExplorerSessionSource>;
	fen: Getter<string>;
	ply: Getter<number>;
	currentNodeId: Getter<string>;

	moveListRows: Getter<ExplorerMoveListRow[]>;
	variationsByNodeId: Getter<Record<string, ExplorerVariationLine[]>>;

	// legacy
	moves: Getter<ExplorerMainlineMove[]>;

	canPrev: Getter<boolean>;
	canNext: Getter<boolean>;

	normalizedFen: Getter<string>;
	positionKey: Getter<string>;
	dbGameSnapshot: Getter<ExplorerGameSnapshot | null>;

	// UI-only state
	pendingDbGameId: Getter<string | null>;
	boardOrientation: Getter<BoardOrientation>;
	ephemeralPgnTags: Getter<PgnTags | null>;

	// transient/errors
	lastError: Getter<ExplorerError | null>;
	importFenError: Getter<ExplorerError | null>;
	importPgnError: Getter<ExplorerError | null>;
	promotionPending: Getter<PromotionPending | null>;
	lastMoveSquares: Getter<LastMoveSquares>;
};

/**
 * Creates the computed selectors used by ExplorerFacade.
 *
 * Goals:
 * - Keep ExplorerFacade focused on orchestration + public API.
 * - Keep computed blocks centralized, readable, and easier to test/maintain.
 * - Preserve behavior: code here is a direct extraction from ExplorerFacade.
 */
export function createExplorerFacadeSelectors(d: ExplorerFacadeSelectorDeps) {
	const canStart = computed(() => d.canPrev());
	const canEnd = computed(() => d.canNext());

	const importRequiresReset = computed(() => d.mode() !== 'CASE1_FREE');

	const canPrevVariation = computed(() => {
		d.rev();
		return d.session.canGoPrevVariation();
	});

	const canNextVariation = computed(() => {
		d.rev();
		return d.session.canGoNextVariation();
	});

	const variationInfo = computed(() => {
		d.rev();
		return d.session.getVariationInfoAtCurrentPly();
	});

	const gameHeaders = computed<ExplorerGameHeaders | null>(() => {
		const db = d.dbGameSnapshot();
		if (db?.headers) return db.headers;

		const src = d.source();
		const tags = d.ephemeralPgnTags();
		if (src.kind === 'PGN' && tags) return mapPgnTagsToExplorerHeaders(tags);

		return null;
	});

	const gameInfoHeaderVm = computed<GameInfoHeaderVm>(() => {
		// Recompute when cursor-dependent selectors change (navigation, variations, etc.).
		d.rev();

		const headers = gameHeaders();
		const myColor = getPerspectiveColor(d.dbGameSnapshot());
		const boardOrientation = d.boardOrientation();

		// Cursor-dependent core selectors.
		const captured = d.session.getCapturedPiecesAtCursor();
		const material = d.session.getMaterialAtCursor();

		const timeControlVm = gameInfoBuilders.buildTimeControlVm(headers);
		const playedAtIso = (headers?.playedAtIso ?? '').trim() || undefined;

		const meta = {
			...(timeControlVm ? { timeControl: timeControlVm } : {}),
			ratedKey: gameInfoBuilders.toRatedKey(headers?.rated),
			speedKey: gameInfoBuilders.toSpeedKey(headers?.speed),
			...(playedAtIso ? { playedAtIso } : {}),
		};

		const players: Record<PlayerSide, GameInfoPlayerVm> = {
			white: gameInfoBuilders.buildGameInfoPlayerVm('white', headers, myColor),
			black: gameInfoBuilders.buildGameInfoPlayerVm('black', headers, myColor),
		};

		const site = gameInfoBuilders.buildSiteVm(headers);
		const result = gameInfoBuilders.buildResultVm(
			(headers?.result ?? '').trim() || undefined,
			myColor,
		);
		const opening = gameInfoBuilders.buildOpeningVm(headers);

		return {
			boardOrientation,
			...(myColor ? { myColor } : {}),
			meta,
			players,
			...(site ? { site } : {}),
			result,
			...(opening ? { opening } : {}),
			captured,
			material,
		};
	});

	const snapshot = computed(() => ({
		mode: d.mode(),
		source: d.source(),
		fen: d.fen(),
		ply: d.ply(),

		currentNodeId: d.currentNodeId(),
		moveListRows: d.moveListRows(),
		variationsByNodeId: d.variationsByNodeId(),

		// legacy
		moves: d.moves(),

		canPrev: d.canPrev(),
		canNext: d.canNext(),

		variationInfo: variationInfo(),
		canPrevVariation: canPrevVariation(),
		canNextVariation: canNextVariation(),

		lastError: d.lastError(),
		promotionPending: d.promotionPending(),
		lastMoveSquares: d.lastMoveSquares(),

		normalizedFen: d.normalizedFen(),
		positionKey: d.positionKey(),
		dbGameSnapshot: d.dbGameSnapshot(),
		pendingDbGameId: d.pendingDbGameId(),
		boardOrientation: d.boardOrientation(),

		// UI helpers / derived state (useful for diagnostics)
		canStart: canStart(),
		canEnd: canEnd(),
		importRequiresReset: importRequiresReset(),

		importFenError: d.importFenError(),
		importPgnError: d.importPgnError(),
		ephemeralPgnTags: d.ephemeralPgnTags(),

		gameHeaders: gameHeaders(),
		gameInfoHeaderVm: gameInfoHeaderVm(),

		rev: d.rev(),
	}));

	return {
		canStart,
		canEnd,
		importRequiresReset,
		canPrevVariation,
		canNextVariation,
		variationInfo,
		gameHeaders,
		gameInfoHeaderVm,
		snapshot,
	};
}
