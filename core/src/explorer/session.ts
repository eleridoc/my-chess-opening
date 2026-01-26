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

import { Chess, type Square } from 'chess.js';

import type {
	ExplorerApplyMoveResult,
	ExplorerDbGameMeta,
	ExplorerError,
	ExplorerErrorCode,
	ExplorerGameSnapshot,
	ExplorerMode,
	ExplorerMoveAttempt,
	ExplorerPgnMeta,
	ExplorerResult,
	ExplorerSessionSource,
	PromotionPiece,
	PromotionRequiredDetails,
} from './types';

import type { ExplorerNodeId } from './ids';
import { createExplorerIdFactory, type ExplorerIdFactory } from './ids';
import type {
	ExplorerMove,
	ExplorerNode,
	ExplorerTree,
	ExplorerMainlineMove,
	ExplorerMoveToken,
	ExplorerVariationLine,
	ExplorerMoveListRow,
	ExplorerMoveListViewModel,
} from './model';

export class ExplorerSession {
	// ---------------------------------------------------------------------------
	// Internal state
	// ---------------------------------------------------------------------------

	private mode: ExplorerMode = 'CASE1_FREE';
	private source: ExplorerSessionSource = { kind: 'FREE' };

	private idFactory: ExplorerIdFactory = createExplorerIdFactory();
	private tree: ExplorerTree = { rootId: 'n0', nodesById: {} };
	private currentNodeId: ExplorerNodeId = 'n0';

	private dbSnapshot: ExplorerGameSnapshot | null = null;

	constructor() {
		this.resetToInitial();
	}

	// ---------------------------------------------------------------------------
	// Public API — Lifecycle / Loaders
	// ---------------------------------------------------------------------------

	/**
	 * Hard reset to an empty CASE1 session using the canonical initial position.
	 *
	 * Effects:
	 * - recreate node id factory (stable ids per session)
	 * - recreate a fresh root node at initial position
	 * - move cursor to root
	 * - reset mode/source to FREE
	 */
	resetToInitial(): void {
		this.mode = 'CASE1_FREE';
		this.source = { kind: 'FREE' };
		this.dbSnapshot = null;

		this.idFactory = createExplorerIdFactory();
		const initialFen = new Chess().fen();

		const rootId = this.idFactory.nextNodeId();
		const rootIdentity = this.computePositionIdentity(initialFen);
		const rootNode: ExplorerNode = {
			id: rootId,
			ply: 0,
			fen: initialFen,
			normalizedFen: rootIdentity.normalizedFen,
			positionKey: rootIdentity.positionKey,
			childIds: [],
		};

		this.tree = { rootId, nodesById: { [rootId]: rootNode } };
		this.currentNodeId = rootId;
	}

	/**
	 * Semantic alias for resetToInitial().
	 * Use when the intent is “start a new exploration”.
	 */
	loadInitial(): void {
		this.resetToInitial();
	}

	/**
	 * Loads a FEN position into a fresh CASE1 session.
	 *
	 * Rules:
	 * - Only allowed in CASE1_FREE (otherwise RESET_REQUIRED)
	 * - Replaces the root position (hard reset)
	 */
	loadFenForCase1(fen: string): ExplorerResult {
		if (this.mode !== 'CASE1_FREE') {
			return {
				ok: false,
				error: this.makeError(
					'RESET_REQUIRED',
					'Loading a FEN position is only allowed in CASE1. Please reset the session first.',
				),
			};
		}

		let chess: Chess;
		try {
			chess = new Chess(fen);
		} catch {
			return { ok: false, error: this.makeError('INVALID_FEN', 'Invalid FEN.', { fen }) };
		}

		const normalizedFen = chess.fen();
		this.resetTreeToRootFen(normalizedFen);

		this.mode = 'CASE1_FREE';
		this.source = { kind: 'FEN', fen: normalizedFen };

		return { ok: true };
	}

	/**
	 * Loads a PGN into the session (CASE2_PGN).
	 *
	 * Notes:
	 * - Relies on chess.js parsing.
	 * - For now, only imports the mainline (no variations/comments).
	 *
	 * Rules:
	 * - Only allowed from CASE1_FREE (otherwise RESET_REQUIRED)
	 */
	loadPgn(pgn: string, meta?: ExplorerPgnMeta): ExplorerResult {
		if (this.mode !== 'CASE1_FREE') {
			return {
				ok: false,
				error: this.makeError(
					'RESET_REQUIRED',
					'Loading a PGN is only allowed from CASE1. Please reset the session first.',
				),
			};
		}

		const trimmed = (pgn ?? '').trim();
		if (trimmed.length === 0) {
			return { ok: false, error: this.makeError('INVALID_PGN', 'PGN is empty.') };
		}

		const normalized = this.normalizePgnText(trimmed);

		const chessForParsing = new Chess();
		const loadAttempt = this.tryLoadPgn(chessForParsing, normalized);

		if (!loadAttempt.ok) {
			return {
				ok: false,
				error: this.makeError('INVALID_PGN', 'Failed to parse PGN.', {
					reason: loadAttempt.reason,
					preview: normalized.slice(0, 200),
				}),
			};
		}

		const movesSan = chessForParsing.history();
		if (!Array.isArray(movesSan) || movesSan.length === 0) {
			return { ok: false, error: this.makeError('INVALID_PGN', 'PGN contains no moves.') };
		}

		const rebuild = this.rebuildTreeFromSanMoves(movesSan);
		if (!rebuild.ok) return rebuild;

		this.mode = 'CASE2_PGN';
		this.source = { kind: 'PGN', name: meta?.name };

		return { ok: true };
	}

	/**
	 * Loads a game from a SAN moves list (CASE2_DB).
	 *
	 * Rules:
	 * - Only allowed from CASE1_FREE (otherwise RESET_REQUIRED)
	 * - Requires meta.gameId (traceability)
	 */
	loadGameMovesSan(movesSan: string[], meta: ExplorerDbGameMeta): ExplorerResult {
		if (this.mode !== 'CASE1_FREE') {
			return {
				ok: false,
				error: this.makeError(
					'RESET_REQUIRED',
					'Loading a DB game is only allowed from CASE1. Please reset the session first.',
				),
			};
		}

		if (!meta?.gameId || meta.gameId.trim().length === 0) {
			return {
				ok: false,
				error: this.makeError('INTERNAL_ERROR', 'Missing gameId for DB load.'),
			};
		}

		if (!Array.isArray(movesSan) || movesSan.length === 0) {
			return {
				ok: false,
				error: this.makeError('INVALID_PGN', 'DB game contains no moves.'),
			};
		}

		const rebuild = this.rebuildTreeFromSanMoves(movesSan);
		if (!rebuild.ok) return rebuild;

		this.mode = 'CASE2_DB';
		this.source = { kind: 'DB', gameId: meta.gameId };

		return { ok: true };
	}

	/**
	 * Loads a DB-backed game snapshot (CASE2_DB).
	 *
	 * Rules:
	 * - Only allowed from CASE1_FREE (otherwise RESET_REQUIRED)
	 * - snapshot must be schemaVersion=1 and kind='DB'
	 * - snapshot.gameId is required
	 * - snapshot.movesSan must contain at least one move
	 */
	loadDbGameSnapshot(snapshot: ExplorerGameSnapshot): ExplorerResult {
		if (this.mode !== 'CASE1_FREE') {
			return {
				ok: false,
				error: this.makeError(
					'RESET_REQUIRED',
					'Loading a DB game snapshot is only allowed from CASE1. Please reset the session first.',
				),
			};
		}

		if (!snapshot || snapshot.schemaVersion !== 1 || snapshot.kind !== 'DB') {
			return {
				ok: false,
				error: this.makeError('INTERNAL_ERROR', 'Invalid DB game snapshot.', {
					schemaVersion: (snapshot as any)?.schemaVersion,
					kind: (snapshot as any)?.kind,
				}),
			};
		}

		const gameId = (snapshot.gameId ?? '').trim();
		if (gameId.length === 0) {
			return {
				ok: false,
				error: this.makeError('INTERNAL_ERROR', 'Missing gameId for DB snapshot load.'),
			};
		}

		if (!snapshot.headers || typeof snapshot.headers !== 'object') {
			return {
				ok: false,
				error: this.makeError('INTERNAL_ERROR', 'Missing headers for DB snapshot load.'),
			};
		}

		if (!Array.isArray(snapshot.movesSan) || snapshot.movesSan.length === 0) {
			return {
				ok: false,
				error: this.makeError('INVALID_PGN', 'DB game snapshot contains no moves.'),
			};
		}

		const rebuild = this.rebuildTreeFromSanMoves(snapshot.movesSan);
		if (!rebuild.ok) return rebuild;

		this.mode = 'CASE2_DB';
		this.source = { kind: 'DB', gameId };

		this.dbSnapshot = this.cloneDbGameSnapshot({ ...snapshot, gameId });

		return { ok: true };
	}

	// ---------------------------------------------------------------------------
	// Public API — Move application
	// ---------------------------------------------------------------------------

	/**
	 * Applies a user move attempt from the current cursor position.
	 *
	 * Behavior:
	 * - Invalid coordinates => ILLEGAL_MOVE
	 * - Illegal move => ILLEGAL_MOVE
	 * - Promotion required but missing => PROMOTION_REQUIRED (+ details)
	 * - Legal move:
	 *   - Reuse an existing child node if same UCI already exists (variation reuse)
	 *   - Otherwise create a new node as a new variation
	 *   - Update activeChildId and move cursor to the resulting node
	 */
	applyMoveUci(attempt: ExplorerMoveAttempt): ExplorerApplyMoveResult {
		const from = (attempt.from ?? '').toLowerCase();
		const to = (attempt.to ?? '').toLowerCase();

		if (!this.isSquare(from) || !this.isSquare(to)) {
			return {
				ok: false,
				error: this.makeError('ILLEGAL_MOVE', 'Invalid square coordinates.', { from, to }),
			};
		}

		const chess = this.tryCreateChessFromCurrentFen();
		if (!chess) {
			return {
				ok: false,
				error: this.makeError(
					'INTERNAL_ERROR',
					'Failed to initialize chess engine from current FEN.',
				),
			};
		}

		// Promotion detection BEFORE applying the move:
		// - null => (from->to) is not a legal move at all
		// - [] => legal and NOT a promotion
		// - ['q','r','b','n'] (or subset) => legal AND promotion is available
		const promotionOptions = this.getPromotionOptions(chess, from, to);
		if (promotionOptions === null) {
			return {
				ok: false,
				error: this.makeError('ILLEGAL_MOVE', 'Illegal move.', {
					from,
					to,
					promotion: attempt.promotion,
				}),
			};
		}

		const requiresPromotion = promotionOptions.length > 0;
		const promotion = attempt.promotion;

		if (requiresPromotion && !promotion) {
			const details: PromotionRequiredDetails = { from, to, options: promotionOptions };
			return {
				ok: false,
				error: this.makeError(
					'PROMOTION_REQUIRED',
					'Promotion piece is required.',
					details,
				),
			};
		}

		if (requiresPromotion && promotion && !promotionOptions.includes(promotion)) {
			return {
				ok: false,
				error: this.makeError('ILLEGAL_MOVE', 'Invalid promotion piece.', {
					from,
					to,
					promotion,
					allowed: promotionOptions,
				}),
			};
		}

		// IMPORTANT:
		// Only pass `promotion` to chess.js if the move is actually a promotion.
		// Some chess.js builds may reject unexpected `promotion` fields.
		const moveResult = requiresPromotion
			? chess.move({ from, to, promotion })
			: chess.move({ from, to });

		if (!moveResult) {
			return {
				ok: false,
				error: this.makeError('ILLEGAL_MOVE', 'Illegal move.', {
					from,
					to,
					promotion: requiresPromotion ? promotion : undefined,
				}),
			};
		}

		const san = moveResult.san;

		// Canonical promotion applied (if any) comes from chess.js result.
		const promotionApplied = this.normalizePromotionPiece((moveResult as any).promotion);
		const uci = this.buildUci(from, to, promotionApplied);
		const fenAfter = chess.fen();

		return this.upsertChildFromAppliedMove({
			from,
			to,
			fenAfter,
			uci,
			san,
			promotionApplied,
		});
	}

	// ---------------------------------------------------------------------------
	// Public API — Navigation
	// ---------------------------------------------------------------------------

	/** True when the cursor is not at root. */
	canGoPrev(): boolean {
		return this.currentNodeId !== this.tree.rootId;
	}

	/**
	 * True when cursor has a next step according to navigation rules:
	 * - On mainline: next follows childIds[0]
	 * - In variation: next follows activeChildId (fallback childIds[0])
	 */
	canGoNext(): boolean {
		const node = this.getCurrentNode();

		const isOnMainline = this.getMainlineNodeIds().includes(this.currentNodeId);

		if (isOnMainline) {
			return (node.childIds?.length ?? 0) > 0;
		}

		return Boolean(node.activeChildId ?? node.childIds?.[0]);
	}

	/** Moves cursor to root (ply 0). */
	goStart(): void {
		this.currentNodeId = this.tree.rootId;
	}

	/** Moves cursor to the last node on the mainline. */
	goEnd(): void {
		const line = this.getMainlineNodeIds();
		this.currentNodeId = line[line.length - 1] ?? this.tree.rootId;
	}

	/** Moves cursor to parent node (no-op at root). */
	goPrev(): void {
		const node = this.getCurrentNode();
		if (!node.parentId) return;
		this.currentNodeId = node.parentId;
	}

	/**
	 * Moves cursor to next node according to navigation rules:
	 * - If cursor is on mainline: always follow childIds[0] (stay on mainline)
	 * - If cursor is in a variation: follow activeChildId (fallback childIds[0])
	 */
	goNext(): void {
		const node = this.getCurrentNode();
		const isOnMainline = this.getMainlineNodeIds().includes(this.currentNodeId);

		const nextId = isOnMainline
			? node.childIds?.[0]
			: (node.activeChildId ?? node.childIds?.[0]);
		if (!nextId) return;

		this.currentNodeId = nextId;
	}

	/** True when the current ply has more than one sibling continuation (variations exist). */
	canGoPrevVariation(): boolean {
		return this.getVariationContextAtCurrentPly() !== null;
	}

	/** True when the current ply has more than one sibling continuation (variations exist). */
	canGoNextVariation(): boolean {
		return this.getVariationContextAtCurrentPly() !== null;
	}

	/** Cycle to previous variation at the current ply (wraps around). */
	goPrevVariation(): void {
		this.shiftVariationAtCurrentPly(-1);
	}

	/** Cycle to next variation at the current ply (wraps around). */
	goNextVariation(): void {
		this.shiftVariationAtCurrentPly(1);
	}

	goToPly(ply: number): void {
		const safePly = Number.isFinite(ply) ? Math.max(0, Math.floor(ply)) : 0;
		const line = this.getMainlineNodeIds();
		const targetIndex = Math.min(safePly, line.length - 1);
		this.currentNodeId = line[targetIndex] ?? this.tree.rootId;
	}

	/** Moves cursor to a specific node id (no-op if unknown). */
	goToNode(nodeId: ExplorerNodeId): void {
		const n = this.tree.nodesById[nodeId];
		if (!n) return;
		this.currentNodeId = nodeId;
	}

	// ---------------------------------------------------------------------------
	// Public API — Read-only selectors
	// ---------------------------------------------------------------------------

	getMode(): ExplorerMode {
		return this.mode;
	}

	getSource(): ExplorerSessionSource {
		return this.source;
	}

	getDbGameSnapshot(): ExplorerGameSnapshot | null {
		return this.dbSnapshot ? this.cloneDbGameSnapshot(this.dbSnapshot) : null;
	}

	getRootId(): ExplorerNodeId {
		return this.tree.rootId;
	}

	getCurrentNodeId(): ExplorerNodeId {
		return this.currentNodeId;
	}

	getCurrentNode(): ExplorerNode {
		return this.getNode(this.currentNodeId);
	}

	getCurrentFen(): string {
		return this.getCurrentNode().fen;
	}

	getCurrentNormalizedFen(): string {
		return this.getCurrentNode().normalizedFen;
	}

	getCurrentPositionKey(): string {
		return this.getCurrentNode().positionKey;
	}

	getCurrentPly(): number {
		return this.getCurrentNode().ply;
	}

	/**
	 * Returns a readonly snapshot of the internal tree.
	 * NOTE: This is not a deep freeze. Do not mutate the returned object.
	 */
	getTreeSnapshot(): Readonly<ExplorerTree> {
		return this.tree;
	}

	/**
	 * Returns active line moves (root excluded).
	 * Index 0 corresponds to ply 1.
	 */
	getActiveLineMoves(): ExplorerMove[] {
		const ids = this.getActiveLineNodeIds();
		return ids
			.slice(1)
			.map((id) => this.getNode(id).incomingMove)
			.filter((m): m is ExplorerMove => Boolean(m));
	}

	/**
	 * Returns the moves on the current cursor path (root excluded).
	 * Useful when the cursor is inside a variation.
	 */
	getCurrentPathMoves(): ExplorerMove[] {
		const ids = this.getCurrentPathNodeIds();
		return ids
			.slice(1)
			.map((id) => this.getNode(id).incomingMove)
			.filter((m): m is ExplorerMove => Boolean(m));
	}

	/**
	 * Returns the path from root to current node (inclusive).
	 * This is the canonical "cursor path" even inside variations.
	 */
	getCurrentPathNodeIds(): ExplorerNodeId[] {
		const path: ExplorerNodeId[] = [];
		let cursor: ExplorerNodeId | undefined = this.currentNodeId;

		while (cursor) {
			path.push(cursor);
			cursor = this.tree.nodesById[cursor]?.parentId;
		}

		path.reverse();
		return path;
	}

	/**
	 * Returns the "active line" node ids, starting at root and following activeChildId.
	 * This represents the currently selected mainline for linear navigation.
	 */
	getActiveLineNodeIds(): ExplorerNodeId[] {
		const line: ExplorerNodeId[] = [];
		let cursor: ExplorerNodeId | undefined = this.tree.rootId;

		while (cursor) {
			line.push(cursor);
			cursor = this.getNode(cursor).activeChildId;
		}

		return line;
	}

	/**
	 * Returns the "mainline" node ids, starting at root and following childIds[0].
	 *
	 * Definition:
	 * - Mainline is defined by insertion order: the first child in childIds is the mainline continuation.
	 * - This is independent from activeChildId (which represents the currently selected variation).
	 */
	getMainlineNodeIds(): ExplorerNodeId[] {
		const line: ExplorerNodeId[] = [];
		let currentId: ExplorerNodeId = this.tree.rootId;

		while (true) {
			line.push(currentId);

			const currentNode = this.tree.nodesById[currentId] as ExplorerNode | undefined;
			if (!currentNode) break;

			const children = currentNode.childIds as ExplorerNodeId[] | undefined;
			if (!children || children.length === 0) break;

			const nextId = children[0] as ExplorerNodeId;

			// Defensive guard: stop if tree is inconsistent
			const nextNode = this.tree.nodesById[nextId] as ExplorerNode | undefined;
			if (!nextNode) break;

			currentId = nextId;
		}

		return line;
	}

	/**
	 * Returns mainline moves (root excluded), enriched with variationCount.
	 *
	 * variationCount is computed on the PARENT node:
	 * - parent.childIds includes [mainline, ...variations]
	 * - variationCount = max(0, parent.childIds.length - 1)
	 */
	getMainlineMovesWithMeta(): ExplorerMainlineMove[] {
		const ids = this.getMainlineNodeIds();

		return ids
			.slice(1) // exclude root
			.map((id) => {
				const node = this.getNode(id);

				// For non-root nodes, parentId should exist
				const parent = node.parentId ? this.getNode(node.parentId) : undefined;
				const variationCount = Math.max(0, (parent?.childIds?.length ?? 0) - 1);

				const move = node.incomingMove;
				if (!move) return null;

				return {
					...move,
					variationCount,
				};
			})
			.filter((m): m is ExplorerMainlineMove => Boolean(m));
	}

	/**
	 * Returns variation info for the current ply (siblings under the parent node).
	 * - null if root or if there is no alternative at this ply.
	 * - index is 0-based in parent.childIds order (0 = mainline).
	 */
	getVariationInfoAtCurrentPly(): { index: number; count: number } | null {
		const ctx = this.getVariationContextAtCurrentPly();
		if (!ctx) return null;
		return { index: ctx.index, count: ctx.siblings.length };
	}

	getMoveListViewModel(): ExplorerMoveListViewModel {
		const vmRows = this.buildMainlineRows();
		const variationsByNodeId: Record<string, ExplorerVariationLine[]> = {};

		// Build variation lines for every node (small tree => OK and simpler)
		for (const id of Object.keys(this.tree.nodesById)) {
			variationsByNodeId[id] = this.buildVariationLinesFromNode(id as ExplorerNodeId);
		}

		return {
			rows: vmRows,
			variationsByNodeId,
		};
	}

	// ---------------------------------------------------------------------------
	// Public API — Read-only helpers for UI hinting (V1.2.5)
	// ---------------------------------------------------------------------------

	/**
	 * Returns all legal destination squares for a given origin square,
	 * for the side to move in the current position.
	 *
	 * Rules:
	 * - Returns [] when "from" is invalid, empty, opponent piece, or has no legal moves.
	 * - Promotions can generate multiple moves to the same target square; duplicates are removed.
	 */
	getLegalDestinationsFrom(fromSquare: string): string[] {
		const from = (fromSquare ?? '').toLowerCase();
		if (!this.isSquare(from)) return [];

		const chess = this.tryCreateChessFromCurrentFen();
		if (!chess) return [];

		const moves = chess.moves({ square: from, verbose: true }) as Array<{ to: string }>;

		const dests = new Set<string>();
		for (const m of moves) {
			const to = (m?.to ?? '').toLowerCase();
			if (this.isSquare(to)) dests.add(to);
		}

		// Stable order helps avoid UI flicker when rendering markers.
		return Array.from(dests).sort();
	}

	/**
	 * Returns all legal destination squares from `fromSquare` that are captures.
	 *
	 * Notes:
	 * - Includes en passant captures (target square might be empty in board representation).
	 * - Duplicates are removed (promotion captures may generate multiple moves to same "to").
	 */
	getLegalCaptureDestinationsFrom(fromSquare: string): string[] {
		const from = (fromSquare ?? '').toLowerCase();
		if (!this.isSquare(from)) return [];

		const chess = this.tryCreateChessFromCurrentFen();
		if (!chess) return [];

		const moves = chess.moves({ square: from, verbose: true }) as Array<{
			to: string;
			flags?: string;
			captured?: string;
		}>;

		const captures = new Set<string>();
		for (const m of moves) {
			const flags = typeof m.flags === 'string' ? m.flags : '';
			const isCapture = !!m.captured || flags.includes('c') || flags.includes('e'); // 'e' = en passant
			if (!isCapture) continue;

			const to = (m?.to ?? '').toLowerCase();
			if (this.isSquare(to)) captures.add(to);
		}

		return Array.from(captures).sort();
	}

	// ---------------------------------------------------------------------------
	// Private helpers — Tree resets / building
	// ---------------------------------------------------------------------------

	/**
	 * Hard resets the tree so that the provided FEN becomes the new root.
	 * Callers decide mode/source changes.
	 */
	private resetTreeToRootFen(rootFen: string): void {
		this.idFactory = createExplorerIdFactory();

		const rootId = this.idFactory.nextNodeId();
		const rootIdentity = this.computePositionIdentity(rootFen);
		const rootNode: ExplorerNode = {
			id: rootId,
			ply: 0,
			fen: rootFen,
			normalizedFen: rootIdentity.normalizedFen,
			positionKey: rootIdentity.positionKey,
			childIds: [],
		};

		this.tree = { rootId, nodesById: { [rootId]: rootNode } };
		this.currentNodeId = rootId;
	}

	/**
	 * Rebuilds the whole tree from an initial position and a SAN mainline.
	 * On any illegal move, we reset to initial to keep invariants simple.
	 */
	private rebuildTreeFromSanMoves(movesSan: string[]): ExplorerResult {
		this.idFactory = createExplorerIdFactory();

		const chess = new Chess(); // initial position
		const rootId = this.idFactory.nextNodeId();
		const rootFen = chess.fen();
		const rootIdentity = this.computePositionIdentity(rootFen);
		this.tree = {
			rootId,
			nodesById: {
				[rootId]: {
					id: rootId,
					ply: 0,
					fen: rootFen,
					normalizedFen: rootIdentity.normalizedFen,
					positionKey: rootIdentity.positionKey,
					childIds: [],
				},
			},
		};

		let parentId = rootId;

		for (const sanRaw of movesSan) {
			const san = (sanRaw ?? '').trim();
			if (!san) continue;

			const moveResult = chess.move(san);
			if (!moveResult) {
				this.resetToInitial();
				return {
					ok: false,
					error: this.makeError('INVALID_PGN', 'Game contains an illegal move.', { san }),
				};
			}

			const from = moveResult.from;
			const to = moveResult.to;
			const promotionApplied = this.normalizePromotionPiece((moveResult as any).promotion);

			const uci = this.buildUci(from, to, promotionApplied);

			const newId = this.idFactory.nextNodeId();
			const parent = this.tree.nodesById[parentId];

			const fenAfter = chess.fen();
			const identity = this.computePositionIdentity(fenAfter);

			this.tree.nodesById[newId] = {
				id: newId,
				parentId,
				ply: this.tree.nodesById[parentId].ply + 1,
				fen: fenAfter,
				normalizedFen: identity.normalizedFen,
				positionKey: identity.positionKey,
				incomingMove: { uci, san: moveResult.san, from, to, promotion: promotionApplied },
				childIds: [],
			};

			parent.childIds.push(newId);
			parent.activeChildId = newId;

			parentId = newId;
		}

		this.currentNodeId = parentId;
		return { ok: true };
	}

	/**
	 * Upserts a child node for the applied move:
	 * - If a child with same UCI exists => reuse it (variation reuse)
	 * - Else => create a new child node
	 * Updates:
	 * - parent.activeChildId
	 * - currentNodeId
	 */
	private upsertChildFromAppliedMove(payload: {
		from: string;
		to: string;
		fenAfter: string;
		uci: string;
		san: string;
		promotionApplied?: PromotionPiece;
	}): ExplorerApplyMoveResult {
		const parent = this.getCurrentNode();

		const existingChildId = parent.childIds.find(
			(id) => this.tree.nodesById[id]?.incomingMove?.uci === payload.uci,
		);

		if (existingChildId) {
			parent.activeChildId = existingChildId;
			this.currentNodeId = existingChildId;

			const child = this.getNode(existingChildId);
			return {
				ok: true,
				newNodeId: existingChildId,
				fen: child.fen,
				san: child.incomingMove?.san ?? payload.san,
				uci: payload.uci,
			};
		}

		const newId = this.idFactory.nextNodeId();

		const identity = this.computePositionIdentity(payload.fenAfter);

		this.tree.nodesById[newId] = {
			id: newId,
			parentId: parent.id,
			ply: parent.ply + 1,
			fen: payload.fenAfter,
			normalizedFen: identity.normalizedFen,
			positionKey: identity.positionKey,
			incomingMove: {
				uci: payload.uci,
				san: payload.san,
				from: payload.from,
				to: payload.to,
				promotion: payload.promotionApplied,
			},
			childIds: [],
		};

		parent.childIds.push(newId);
		parent.activeChildId = newId;
		this.currentNodeId = newId;

		return {
			ok: true,
			newNodeId: newId,
			fen: payload.fenAfter,
			san: payload.san,
			uci: payload.uci,
		};
	}

	private getVariationContextAtCurrentPly(): {
		parent: ExplorerNode;
		siblings: ExplorerNodeId[];
		index: number;
	} | null {
		const node = this.getCurrentNode();
		if (!node.parentId) return null;

		const parent = this.getNode(node.parentId);

		const siblings = (parent.childIds ?? []) as ExplorerNodeId[];

		if (siblings.length <= 1) return null;

		// Prefer currentNodeId index, fallback to parent's activeChildId, then default to 0.
		let index = siblings.indexOf(this.currentNodeId);

		if (index === -1 && parent.activeChildId) {
			index = siblings.indexOf(parent.activeChildId);
		}

		if (index === -1) index = 0;

		return { parent, siblings, index };
	}

	private shiftVariationAtCurrentPly(delta: number): void {
		const ctx = this.getVariationContextAtCurrentPly();
		if (!ctx) return;

		const count = ctx.siblings.length;
		const nextIndex = (ctx.index + delta + count) % count;
		const nextId = ctx.siblings[nextIndex];

		// Selecting a variation means: update parent activeChildId + move cursor to the selected sibling.
		ctx.parent.activeChildId = nextId;
		this.currentNodeId = nextId;
	}

	private buildMainlineRows(): ExplorerMoveListRow[] {
		const ids = this.getMainlineNodeIds().slice(1); // exclude root
		const tokens: ExplorerMoveToken[] = ids
			.map((id) => this.nodeToToken(id, /*isLineStart*/ false))
			.filter((t): t is ExplorerMoveToken => Boolean(t));

		// Group by full-move number (white/black)
		const rows: ExplorerMoveListRow[] = [];
		for (let i = 0; i < tokens.length; i += 2) {
			const moveNumber = Math.floor(i / 2) + 1;
			rows.push({
				moveNumber,
				white: tokens[i],
				black: tokens[i + 1],
			});
		}
		return rows;
	}

	private buildVariationLinesFromNode(nodeId: ExplorerNodeId): ExplorerVariationLine[] {
		const node = this.getNode(nodeId);
		const children = node.childIds ?? [];
		if (children.length <= 1) return [];

		// Variations = all children except the mainline continuation (index 0)
		const variationStarts = children.slice(1);

		return variationStarts.map((startId) => this.buildVariationLine(startId));
	}

	private buildVariationLine(startNodeId: ExplorerNodeId): ExplorerVariationLine {
		const tokens: ExplorerMoveToken[] = [];

		let cursor: ExplorerNodeId | undefined = startNodeId;
		let isLineStart = true;

		while (cursor) {
			const t = this.nodeToToken(cursor, isLineStart);
			if (!t) break;
			tokens.push(t);

			const n = this.getNode(cursor);
			const next = (n.childIds?.[0] as ExplorerNodeId | undefined) ?? undefined;
			cursor = next;

			isLineStart = false;
		}

		return { startNodeId, tokens };
	}

	private nodeToToken(nodeId: ExplorerNodeId, isLineStart: boolean): ExplorerMoveToken | null {
		const node = this.getNode(nodeId);
		const move = node.incomingMove;
		if (!move) return null;

		// variations AFTER this move = variations from the position AFTER this move
		const variationCount = Math.max(0, (node.childIds?.length ?? 0) - 1);

		const mainlineChildId = (node.childIds?.[0] as ExplorerNodeId | undefined) ?? undefined;
		const activeChildId = (node.activeChildId as ExplorerNodeId | undefined) ?? undefined;

		// If there is no active child or no mainline child, treat as mainline (nothing to split)
		const activeChildIsMainline =
			!activeChildId || !mainlineChildId ? true : activeChildId === mainlineChildId;

		return {
			nodeId,
			ply: node.ply,
			...move,
			variationCount,
			activeChildIsMainline,
			label: this.formatVariationLabel(node.ply, move.san, isLineStart),
		};
	}

	private formatVariationLabel(ply: number, san: string, isLineStart: boolean): string {
		const fullMove = Math.floor((ply + 1) / 2);

		// White move => always show move number (like "5.O-O")
		if (ply % 2 === 1) return `${fullMove}.${san}`;

		// Black move => show "5...c5" only if line starts on black
		return isLineStart ? `${fullMove}...${san}` : san;
	}

	// ---------------------------------------------------------------------------
	// Private helpers — PGN loading (chess.js)
	// ---------------------------------------------------------------------------

	/**
	 * Normalizes PGN text for chess.js:
	 * - normalize newlines
	 * - ensure blank line between headers and movetext
	 * - ensure trailing newline (some builds parse more reliably)
	 */
	private normalizePgnText(pgn: string): string {
		let text = (pgn ?? '').replace(/\r\n/g, '\n').trim();

		if (text.startsWith('[')) {
			const lines = text.split('\n');
			let i = 0;
			while (i < lines.length && lines[i].startsWith('[')) i++;
			if (i < lines.length && lines[i] !== '') lines.splice(i, 0, '');
			text = lines.join('\n');
		}

		return `${text}\n`;
	}

	/**
	 * Tries to load PGN using chess.js, supporting different method names depending on versions.
	 */
	private tryLoadPgn(chess: Chess, pgn: string): { ok: true } | { ok: false; reason: string } {
		const anyChess = chess as any;
		const loadFn: unknown = anyChess.loadPgn ?? anyChess.load_pgn;

		if (typeof loadFn !== 'function') {
			return {
				ok: false,
				reason: 'No PGN loader method found (expected loadPgn or load_pgn).',
			};
		}

		try {
			const res = loadFn.call(chess, pgn, { strict: false, newlineChar: '\n' });
			if (typeof res === 'boolean' && res === false) {
				return { ok: false, reason: 'PGN loader returned false.' };
			}
			return { ok: true };
		} catch (e) {
			return { ok: false, reason: e instanceof Error ? e.message : String(e) };
		}
	}

	// ---------------------------------------------------------------------------
	// Private helpers — Chess / ids / errors
	// ---------------------------------------------------------------------------

	/**
	 * Creates a chess.js instance from the current cursor FEN.
	 * Returns null if the FEN is invalid (should never happen if invariants are respected).
	 */
	private tryCreateChessFromCurrentFen(): Chess | null {
		try {
			return new Chess(this.getCurrentFen());
		} catch {
			return null;
		}
	}

	private getNode(id: ExplorerNodeId): ExplorerNode {
		const node = this.tree.nodesById[id];
		if (!node) {
			throw new Error(`ExplorerSession invariant violated: missing node "${id}".`);
		}
		return node;
	}

	private makeError<TCode extends ExplorerErrorCode, TDetails = unknown>(
		code: TCode,
		message: string,
		details?: TDetails,
	): ExplorerError<TDetails> & { code: TCode } {
		return { code, message, details };
	}

	private buildUci(from: string, to: string, promotion?: PromotionPiece): string {
		return promotion ? `${from}${to}${promotion}` : `${from}${to}`;
	}

	private isSquare(value: string): value is Square {
		return /^[a-h][1-8]$/.test(value);
	}

	private normalizePromotionPiece(value: unknown): PromotionPiece | undefined {
		if (typeof value !== 'string') return undefined;
		const p = value.toLowerCase();
		return p === 'q' || p === 'r' || p === 'b' || p === 'n' ? p : undefined;
	}

	/**
	 * Returns:
	 * - null if (from -> to) is not a legal move
	 * - [] if legal and NOT a promotion
	 * - ['q','r','b','n'] (or subset) if legal AND promotion is available
	 */
	private getPromotionOptions(chess: Chess, from: Square, to: Square): PromotionPiece[] | null {
		const moves = chess.moves({ square: from, verbose: true }) as Array<{
			from: string;
			to: string;
			promotion?: string;
			flags?: string;
		}>;

		const candidates = moves.filter((m) => m.from === from && m.to === to);
		if (candidates.length === 0) return null;

		const promoMoves = candidates.filter(
			(m) =>
				typeof m.promotion === 'string' ||
				(typeof m.flags === 'string' && m.flags.includes('p')),
		);

		if (promoMoves.length === 0) return [];

		const options = new Set<PromotionPiece>();
		for (const m of promoMoves) {
			const p = (m.promotion ?? '').toLowerCase();
			if (p === 'q' || p === 'r' || p === 'b' || p === 'n') options.add(p);
		}

		// Fallback: if promotion is detected but pieces are not reported, expose standard options.
		return options.size > 0 ? Array.from(options) : ['q', 'r', 'b', 'n'];
	}

	private cloneDbGameSnapshot(snapshot: ExplorerGameSnapshot): ExplorerGameSnapshot {
		return {
			schemaVersion: 1,
			kind: 'DB',
			gameId: snapshot.gameId,
			headers: { ...(snapshot.headers ?? {}) },
			pgnTags: snapshot.pgnTags ? { ...snapshot.pgnTags } : undefined,
			movesSan: Array.isArray(snapshot.movesSan) ? [...snapshot.movesSan] : [],
			analysis: snapshot.analysis
				? {
						version: 1,
						byPly: snapshot.analysis.byPly
							? snapshot.analysis.byPly.map((x) => ({ ...x }))
							: undefined,
					}
				: undefined,
			importMeta: snapshot.importMeta ? { ...snapshot.importMeta } : undefined,
		};
	}

	private computePositionIdentity(fen: string): { normalizedFen: string; positionKey: string } {
		const normalizedFen = this.normalizeFenForPositionIdentity(fen);
		const positionKey = this.fnv1a64Hex(normalizedFen);
		return { normalizedFen, positionKey };
	}

	private normalizeFenForPositionIdentity(fen: string): string {
		const parts = (fen ?? '').trim().split(/\s+/);
		// chess.js fen() always returns 6 fields, but keep it defensive.
		if (parts.length >= 4) return parts.slice(0, 4).join(' ');
		return (fen ?? '').trim();
	}

	/**
	 * FNV-1a 64-bit hash, returned as 16-hex lowercase string.
	 * Deterministic and cheap; good enough as a stable key for ASCII FEN strings.
	 */
	private fnv1a64Hex(text: string): string {
		let hash = 14695981039346656037n; // offset basis
		const prime = 1099511628211n;
		const mask = 0xffffffffffffffffn;

		for (let i = 0; i < text.length; i++) {
			hash ^= BigInt(text.charCodeAt(i)); // FEN is ASCII => safe/deterministic
			hash = (hash * prime) & mask;
		}

		return hash.toString(16).padStart(16, '0');
	}
}
