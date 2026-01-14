/**
 * ExplorerSession (CORE)
 *
 * This class is the backbone of the Explorer feature.
 * It owns the entire exploration state and enforces the domain invariants.
 *
 * Key principles:
 * - UI and Electron must NOT implement chess rules or session state logic.
 * - UI should only call this session (via a facade later) and render derived state.
 * - The session is modeled as a tree of positions (nodes) with variations.
 *
 * In V0.1.3 we only implement:
 * - Session initialization (resetToInitial)
 * - Read-only getters and tree traversal helpers
 *
 * Move application and navigation will be implemented in V0.1.4 / V0.1.5.
 */

import { Chess, type Square } from 'chess.js';

import type {
	ExplorerMode,
	ExplorerApplyMoveResult,
	ExplorerError,
	ExplorerErrorCode,
	ExplorerMoveAttempt,
	ExplorerSessionSource,
	ExplorerPgnMeta,
	ExplorerResult,
	PromotionPiece,
	PromotionRequiredDetails,
	ExplorerDbGameMeta,
} from './types';

import { parse } from '@mliebelt/pgn-parser';

import type { ExplorerNodeId } from './ids';
import { createExplorerIdFactory, type ExplorerIdFactory } from './ids';
import type { ExplorerNode, ExplorerMove, ExplorerTree } from './model';

/**
 * Minimal PGN parser shape (CORE)
 *
 * We intentionally define a minimal subset of the parsed PGN structure
 * to avoid leaking parser-specific types throughout the codebase.
 */
type ParsedPgnMove = {
	notation?: {
		notation?: string;
	};
};

type ParsedPgnGame = {
	moves?: ParsedPgnMove[];
};

export class ExplorerSession {
	private mode: ExplorerMode = 'CASE1_FREE';
	private source: ExplorerSessionSource = { kind: 'FREE' };
	private idFactory: ExplorerIdFactory = createExplorerIdFactory();
	private tree: ExplorerTree = { rootId: 'n0', nodesById: {} };
	private currentNodeId: ExplorerNodeId = 'n0';

	constructor() {
		this.resetToInitial();
	}

	/**
	 * Resets the session to the initial state (CASE1).
	 * This creates a brand new tree with a fresh root node.
	 */
	resetToInitial(): void {
		this.mode = 'CASE1_FREE';

		// Recreate the ID factory so ids are stable and session-scoped.
		this.idFactory = createExplorerIdFactory();

		// Use chess.js to obtain the canonical initial FEN.
		const initialFen = new Chess().fen();

		const rootId = this.idFactory.nextNodeId();

		const rootNode: ExplorerNode = {
			id: rootId,
			ply: 0,
			fen: initialFen,
			childIds: [],
		};

		this.tree = {
			rootId,
			nodesById: {
				[rootId]: rootNode,
			},
		};

		this.currentNodeId = rootId;

		this.source = { kind: 'FREE' };
	}

	/**
	 * Loads the initial (starting) session state.
	 *
	 * This is an explicit alias for resetToInitial().
	 * UI code should prefer calling loadInitial() when the intention is to start a fresh exploration,
	 * and resetToInitial() when the intention is to force a hard reset.
	 */
	loadInitial(): void {
		this.resetToInitial();
	}

	/**
	 * Loads a FEN position into a fresh CASE1 session.
	 *
	 * Rules:
	 * - Only allowed in CASE1_FREE.
	 * - This performs a hard reset of the current exploration and replaces the root position.
	 * - The resulting session remains in CASE1_FREE mode.
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
			return {
				ok: false,
				error: this.makeError('INVALID_FEN', 'Invalid FEN.', { fen }),
			};
		}

		// chess.js normalizes the FEN; use the canonical form to keep consistency.
		const normalizedFen = chess.fen();

		// Hard reset but keep the session in CASE1.
		this.idFactory = createExplorerIdFactory();

		const rootId = this.idFactory.nextNodeId();

		const rootNode: ExplorerNode = {
			id: rootId,
			ply: 0,
			fen: normalizedFen,
			childIds: [],
		};

		this.tree = {
			rootId,
			nodesById: {
				[rootId]: rootNode,
			},
		};

		this.currentNodeId = rootId;
		this.mode = 'CASE1_FREE';
		this.source = { kind: 'FEN', fen: normalizedFen };

		return { ok: true };
	}

	/**
	 * Loads a PGN into the session (CASE2_PGN).
	 *
	 * Rules:
	 * - Only allowed when the session is in CASE1_FREE.
	 *   If the session is already in CASE2_DB or CASE2_PGN, callers must reset first.
	 * - The PGN is loaded as a single mainline (no variations for now).
	 * - The tree is rebuilt from scratch:
	 *   root = initial position, then one node per ply.
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

		const trimmed = pgn?.trim() ?? '';
		if (trimmed.length === 0) {
			return {
				ok: false,
				error: this.makeError('INVALID_PGN', 'PGN is empty.'),
			};
		}

		let parsed: unknown;
		try {
			parsed = parse(trimmed, { startRule: 'games' });
		} catch (e) {
			return {
				ok: false,
				error: this.makeError('INVALID_PGN', 'Failed to parse PGN.', {
					reason: e instanceof Error ? e.message : String(e),
				}),
			};
		}

		const extracted = this.extractSanMovesFromParsedPgn(parsed);
		if (!extracted.ok) {
			return { ok: false, error: extracted.error };
		}

		const movesSan = extracted.moves;

		// Build a fresh tree from the initial position.
		this.idFactory = createExplorerIdFactory();
		const chess = new Chess(); // initial position

		const rootId = this.idFactory.nextNodeId();
		const rootNode: ExplorerNode = {
			id: rootId,
			ply: 0,
			fen: chess.fen(),
			childIds: [],
		};

		this.tree = {
			rootId,
			nodesById: {
				[rootId]: rootNode,
			},
		};

		let parentId = rootId;

		for (const san of movesSan) {
			const moveResult = chess.move(san);

			if (!moveResult) {
				// The PGN was parsed, but a move cannot be applied => treat as invalid PGN.
				this.resetToInitial();
				return {
					ok: false,
					error: this.makeError('INVALID_PGN', 'PGN contains an illegal move.', { san }),
				};
			}

			const from = (moveResult as any).from as string;
			const to = (moveResult as any).to as string;

			const promotionRaw = (
				(moveResult as any).promotion as string | undefined
			)?.toLowerCase();
			const promotion =
				promotionRaw === 'q' ||
				promotionRaw === 'r' ||
				promotionRaw === 'b' ||
				promotionRaw === 'n'
					? (promotionRaw as PromotionPiece)
					: undefined;

			const uci = this.buildUci(from, to, promotion);

			const newId = this.idFactory.nextNodeId();
			const parent = this.tree.nodesById[parentId];

			this.tree.nodesById[newId] = {
				id: newId,
				parentId,
				ply: this.tree.nodesById[parentId].ply + 1,
				fen: chess.fen(),
				incomingMove: {
					uci,
					san: (moveResult as any).san as string,
					from,
					to,
					promotion,
				},
				childIds: [],
			};

			parent.childIds.push(newId);
			parent.activeChildId = newId;

			parentId = newId;
		}

		this.currentNodeId = parentId;
		this.mode = 'CASE2_PGN';
		this.source = { kind: 'PGN', name: meta?.name };

		return { ok: true };
	}

	/**
	 * Loads a game from a list of SAN moves (CASE2_DB).
	 *
	 * This is the "DB loading" equivalent of loadPgn(), but the moves are provided directly
	 * (e.g. coming from Prisma/Electron).
	 *
	 * Rules:
	 * - Only allowed when the session is in CASE1_FREE.
	 * - The game is loaded as a single mainline (no variations for now).
	 * - The tree is rebuilt from scratch:
	 *   root = initial position, then one node per ply.
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

		// Fresh tree from the initial position.
		this.idFactory = createExplorerIdFactory();
		const chess = new Chess();

		const rootId = this.idFactory.nextNodeId();
		const rootNode: ExplorerNode = {
			id: rootId,
			ply: 0,
			fen: chess.fen(),
			childIds: [],
		};

		this.tree = {
			rootId,
			nodesById: {
				[rootId]: rootNode,
			},
		};

		let parentId = rootId;

		for (const sanRaw of movesSan) {
			const san = sanRaw?.trim();
			if (!san) continue;

			const moveResult = chess.move(san);

			if (!moveResult) {
				this.resetToInitial();
				return {
					ok: false,
					error: this.makeError('INVALID_PGN', 'DB game contains an illegal move.', {
						san,
					}),
				};
			}

			const from = (moveResult as any).from as string;
			const to = (moveResult as any).to as string;

			const promotionRaw = (
				(moveResult as any).promotion as string | undefined
			)?.toLowerCase();
			const promotion =
				promotionRaw === 'q' ||
				promotionRaw === 'r' ||
				promotionRaw === 'b' ||
				promotionRaw === 'n'
					? (promotionRaw as PromotionPiece)
					: undefined;

			const uci = this.buildUci(from, to, promotion);

			const newId = this.idFactory.nextNodeId();
			const parent = this.tree.nodesById[parentId];

			this.tree.nodesById[newId] = {
				id: newId,
				parentId,
				ply: this.tree.nodesById[parentId].ply + 1,
				fen: chess.fen(),
				incomingMove: {
					uci,
					san: (moveResult as any).san as string,
					from,
					to,
					promotion,
				},
				childIds: [],
			};

			parent.childIds.push(newId);
			parent.activeChildId = newId;

			parentId = newId;
		}

		this.currentNodeId = parentId;
		this.mode = 'CASE2_DB';
		this.source = { kind: 'DB', gameId: meta.gameId };

		return { ok: true };
	}

	private extractSanMovesFromParsedPgn(
		parsed: unknown,
	): { ok: true; moves: string[] } | { ok: false; error: ExplorerError } {
		const games = Array.isArray(parsed) ? (parsed as ParsedPgnGame[]) : [];

		const firstGame = games[0];
		if (!firstGame) {
			return {
				ok: false,
				error: this.makeError('INVALID_PGN', 'No game found in PGN.'),
			};
		}

		const rawMoves = Array.isArray(firstGame.moves) ? firstGame.moves : [];
		if (rawMoves.length === 0) {
			return {
				ok: false,
				error: this.makeError('INVALID_PGN', 'PGN contains no moves.'),
			};
		}

		const movesSan: string[] = [];

		for (const m of rawMoves) {
			const san = m?.notation?.notation;
			if (typeof san === 'string' && san.trim().length > 0) {
				movesSan.push(san.trim());
			}
		}

		if (movesSan.length === 0) {
			return {
				ok: false,
				error: this.makeError('INVALID_PGN', 'PGN contains no valid SAN moves.'),
			};
		}

		return { ok: true, moves: movesSan };
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

	private getPromotionOptions(chess: Chess, from: Square, to: Square): PromotionPiece[] | null {
		// We rely on verbose legal moves to detect promotion possibilities.
		// chess.js returns 4 separate promotion moves (q/r/b/n) in most versions.
		type VerboseMove = {
			from: string;
			to: string;
			promotion?: string;
			flags?: string;
		};

		const moves = chess.moves({ square: from, verbose: true }) as VerboseMove[];

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

		// Fallback: if promotion is detected but specific pieces are not reported,
		// expose the standard four options.
		if (options.size === 0) return ['q', 'r', 'b', 'n'];

		return Array.from(options);
	}

	private isSquare(value: string): value is Square {
		return /^[a-h][1-8]$/.test(value);
	}

	// ---------------------------------------------------------------------------
	// Basic getters (public API)
	// ---------------------------------------------------------------------------

	getMode(): ExplorerMode {
		return this.mode;
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

	getCurrentPly(): number {
		return this.getCurrentNode().ply;
	}

	getSource(): ExplorerSessionSource {
		return this.source;
	}

	/**
	 * Returns a readonly snapshot of the internal tree.
	 * NOTE: This is not a deep freeze. Do not mutate the returned object.
	 */
	getTreeSnapshot(): Readonly<ExplorerTree> {
		return this.tree;
	}

	getRootId(): ExplorerNodeId {
		return this.tree.rootId;
	}

	getNode(id: ExplorerNodeId): ExplorerNode {
		const node = this.tree.nodesById[id];
		if (!node) {
			throw new Error(`ExplorerSession invariant violated: missing node "${id}".`);
		}
		return node;
	}

	/**
	 * Applies a user move attempt from the current position.
	 *
	 * Behavior:
	 * - If the move is illegal => returns { ok:false, error: ILLEGAL_MOVE }
	 * - If the move is a promotion and no promotion is provided => PROMOTION_REQUIRED
	 * - If the move is legal:
	 *   - Reuse an existing child node if the same UCI move already exists
	 *   - Otherwise create a new child node (variation)
	 *   - Update parent's activeChildId and currentNodeId
	 */
	applyMoveUci(attempt: ExplorerMoveAttempt): ExplorerApplyMoveResult {
		const from = attempt.from.toLowerCase();
		const to = attempt.to.toLowerCase();

		if (!this.isSquare(from) || !this.isSquare(to)) {
			return {
				ok: false,
				error: this.makeError('ILLEGAL_MOVE', 'Invalid square coordinates.', { from, to }),
			};
		}

		const promotion = attempt.promotion;

		let chess: Chess;
		try {
			chess = new Chess(this.getCurrentFen());
		} catch {
			return {
				ok: false,
				error: this.makeError(
					'INTERNAL_ERROR',
					'Failed to initialize chess engine from current FEN.',
				),
			};
		}

		// Detect whether this (from -> to) requires promotion.
		const promotionOptions = this.getPromotionOptions(chess, from, to);
		if (promotionOptions === null) {
			return {
				ok: false,
				error: this.makeError('ILLEGAL_MOVE', 'Illegal move.', { from, to }),
			};
		}

		const requiresPromotion = promotionOptions.length > 0;

		if (requiresPromotion && !promotion) {
			const details: PromotionRequiredDetails = {
				from,
				to,
				options: promotionOptions,
			};

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

		// Apply the move to chess.js
		const moveResult = chess.move({ from, to, promotion }) as { san: string } | null;

		if (!moveResult) {
			return {
				ok: false,
				error: this.makeError('ILLEGAL_MOVE', 'Illegal move.', { from, to, promotion }),
			};
		}

		const san = moveResult.san;
		const uci = this.buildUci(from, to, promotion);
		const fenAfter = chess.fen();

		// Tree update: reuse or create a child node for this move.
		const parent = this.getCurrentNode();

		const existingChildId = parent.childIds.find((id) => {
			const child = this.tree.nodesById[id];
			return child?.incomingMove?.uci === uci;
		});

		if (existingChildId) {
			parent.activeChildId = existingChildId;
			this.currentNodeId = existingChildId;

			const child = this.getNode(existingChildId);
			return {
				ok: true,
				newNodeId: existingChildId,
				fen: child.fen,
				san: child.incomingMove?.san ?? san,
				uci,
			};
		}

		const newId = this.idFactory.nextNodeId();

		this.tree.nodesById[newId] = {
			id: newId,
			parentId: parent.id,
			ply: parent.ply + 1,
			fen: fenAfter,
			incomingMove: {
				uci,
				san,
				from,
				to,
				promotion,
			},
			childIds: [],
		};

		parent.childIds.push(newId);
		parent.activeChildId = newId;
		this.currentNodeId = newId;

		return {
			ok: true,
			newNodeId: newId,
			fen: fenAfter,
			san,
			uci,
		};
	}

	// ---------------------------------------------------------------------------
	// Derived getters (useful for UI)
	// ---------------------------------------------------------------------------

	/**
	 * Returns the moves of the active line (root excluded).
	 * Index 0 corresponds to ply 1.
	 */
	getActiveLineMoves(): ExplorerMove[] {
		const ids = this.getActiveLineNodeIds();
		// ids[0] is root => skip it
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

	// ---------------------------------------------------------------------------
	// Navigation helpers
	// ---------------------------------------------------------------------------

	canGoPrev(): boolean {
		return this.currentNodeId !== this.tree.rootId;
	}

	canGoNext(): boolean {
		const node = this.getCurrentNode();
		return Boolean(node.activeChildId);
	}

	goStart(): void {
		this.currentNodeId = this.tree.rootId;
	}

	goEnd(): void {
		const line = this.getActiveLineNodeIds();
		this.currentNodeId = line[line.length - 1] ?? this.tree.rootId;
	}

	/**
	 * Moves the cursor to the parent node.
	 * Does nothing if already at root.
	 */
	goPrev(): void {
		const node = this.getCurrentNode();
		if (!node.parentId) return;
		this.currentNodeId = node.parentId;
	}

	/**
	 * Moves the cursor forward following activeChildId.
	 * Does nothing if there is no active continuation.
	 */
	goNext(): void {
		const node = this.getCurrentNode();
		if (!node.activeChildId) return;
		this.currentNodeId = node.activeChildId;
	}

	/**
	 * Moves the cursor to a given ply on the active line.
	 *
	 * Ply semantics:
	 * - ply 0 => root position
	 * - ply 1 => after White's first move
	 * - ply 2 => after Black's first move
	 */
	goToPly(ply: number): void {
		const safePly = Number.isFinite(ply) ? Math.max(0, Math.floor(ply)) : 0;

		const line = this.getActiveLineNodeIds();
		// line[0] is ply 0, line[1] is ply 1, etc.
		const targetIndex = Math.min(safePly, line.length - 1);

		this.currentNodeId = line[targetIndex] ?? this.tree.rootId;
	}

	// ---------------------------------------------------------------------------
	// Tree traversal helpers (used by UI and by upcoming navigation tasks)
	// ---------------------------------------------------------------------------

	/**
	 * Returns the path from the root to the current node (inclusive).
	 * This is the canonical "cursor path" even when the current node is inside a variation.
	 */
	getCurrentPathNodeIds(): ExplorerNodeId[] {
		const path: ExplorerNodeId[] = [];
		let cursor: ExplorerNodeId | undefined = this.currentNodeId;

		while (cursor) {
			path.push(cursor);
			cursor = this.tree.nodesById[cursor]?.parentId;
		}

		path.reverse(); // root -> current
		return path;
	}

	/**
	 * Returns the "active line" node ids, starting at the root and following activeChildId.
	 * This represents the currently selected mainline for linear navigation.
	 */
	getActiveLineNodeIds(): ExplorerNodeId[] {
		const line: ExplorerNodeId[] = [];
		let cursor: ExplorerNodeId | undefined = this.tree.rootId;

		while (cursor) {
			line.push(cursor);
			const node = this.getNode(cursor);
			cursor = node.activeChildId;
		}

		return line;
	}
}
