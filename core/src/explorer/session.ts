/**
 * ExplorerSession (CORE)
 *
 * This class is the backbone of the Explorer feature.
 * It owns the whole exploration state and enforces domain invariants.
 *
 * Key principles:
 * - The UI (Angular) and desktop shell (Electron) must NOT implement chess rules.
 * - The UI only sends intents (load / move attempt / navigation) and renders derived state.
 * - The session is modeled as a tree of positions (nodes) with variations.
 *
 * This file intentionally contains core-domain code only:
 * - No Angular, no Electron, no persistence, no UI concerns.
 * - Only deterministic state transitions and read-only selectors.
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

import type { ExplorerNodeId } from './ids';
import { createExplorerIdFactory, type ExplorerIdFactory } from './ids';
import type { ExplorerNode, ExplorerMove, ExplorerTree } from './model';

export class ExplorerSession {
	// ---------------------------------------------------------------------------
	// Internal state
	// ---------------------------------------------------------------------------

	private mode: ExplorerMode = 'CASE1_FREE';
	private source: ExplorerSessionSource = { kind: 'FREE' };

	private idFactory: ExplorerIdFactory = createExplorerIdFactory();
	private tree: ExplorerTree = { rootId: 'n0', nodesById: {} };
	private currentNodeId: ExplorerNodeId = 'n0';

	constructor() {
		this.resetToInitial();
	}

	// ---------------------------------------------------------------------------
	// Public API - Lifecycle / Loaders
	// ---------------------------------------------------------------------------

	/**
	 * Hard reset to an empty CASE1 session using the canonical initial position.
	 *
	 * This method:
	 * - recreates a new node id factory (stable ids per session)
	 * - recreates a new tree with a fresh root node
	 * - resets cursor to root
	 * - resets source to FREE
	 */
	resetToInitial(): void {
		this.mode = 'CASE1_FREE';
		this.source = { kind: 'FREE' };

		this.idFactory = createExplorerIdFactory();
		const initialFen = new Chess().fen();

		const rootId = this.idFactory.nextNodeId();
		const rootNode: ExplorerNode = {
			id: rootId,
			ply: 0,
			fen: initialFen,
			childIds: [],
		};

		this.tree = { rootId, nodesById: { [rootId]: rootNode } };
		this.currentNodeId = rootId;
	}

	/**
	 * Semantic alias for resetToInitial().
	 * Use this when the intent is “start a new exploration”.
	 */
	loadInitial(): void {
		this.resetToInitial();
	}

	/**
	 * Loads a FEN position into a fresh CASE1 session.
	 *
	 * Rules:
	 * - Only allowed in CASE1_FREE
	 * - Replaces the root position (hard reset)
	 * - Keeps the session in CASE1_FREE
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

		// chess.js normalizes FEN; store the canonical representation.
		const normalizedFen = chess.fen();

		this.hardResetToRootFen(normalizedFen);
		this.mode = 'CASE1_FREE';
		this.source = { kind: 'FEN', fen: normalizedFen };

		return { ok: true };
	}

	/**
	 * Loads a PGN into the session (CASE2_PGN).
	 *
	 * Notes:
	 * - We rely on chess.js parsing to remain browser-friendly.
	 * - For now, we only import the mainline (no variations/comments).
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

		const movesSan = chessForParsing.history(); // SAN list
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
	 * Loads a game from a list of SAN moves (CASE2_DB).
	 *
	 * This is the DB-equivalent of loadPgn(), except the SAN list is already provided.
	 *
	 * Rules:
	 * - Only allowed from CASE1_FREE (otherwise RESET_REQUIRED)
	 * - Requires meta.gameId (for traceability)
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

	// ---------------------------------------------------------------------------
	// Public API - Move application
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
		const from = attempt.from.toLowerCase();
		const to = attempt.to.toLowerCase();

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

		// Promotion detection (before applying the move).
		const promotionOptions = this.getPromotionOptions(chess, from, to);
		if (promotionOptions === null) {
			return {
				ok: false,
				error: this.makeError('ILLEGAL_MOVE', 'Illegal move.', { from, to }),
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

		// Apply the move.
		const moveResult = chess.move({ from, to, promotion });
		if (!moveResult) {
			return {
				ok: false,
				error: this.makeError('ILLEGAL_MOVE', 'Illegal move.', { from, to, promotion }),
			};
		}

		const san = moveResult.san;
		const uci = this.buildUci(from, to, promotion);
		const fenAfter = chess.fen();

		// Reuse-or-create child node for this exact UCI.
		const parent = this.getCurrentNode();

		const existingChildId = parent.childIds.find(
			(id) => this.tree.nodesById[id]?.incomingMove?.uci === uci,
		);

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
			incomingMove: { uci, san, from, to, promotion },
			childIds: [],
		};

		parent.childIds.push(newId);
		parent.activeChildId = newId;
		this.currentNodeId = newId;

		return { ok: true, newNodeId: newId, fen: fenAfter, san, uci };
	}

	// ---------------------------------------------------------------------------
	// Public API - Navigation
	// ---------------------------------------------------------------------------

	/** True when the cursor is not at root. */
	canGoPrev(): boolean {
		return this.currentNodeId !== this.tree.rootId;
	}

	/** True when current node has an active continuation. */
	canGoNext(): boolean {
		return Boolean(this.getCurrentNode().activeChildId);
	}

	/** Moves cursor to root (ply 0). */
	goStart(): void {
		this.currentNodeId = this.tree.rootId;
	}

	/** Moves cursor to the last node on the active line. */
	goEnd(): void {
		const line = this.getActiveLineNodeIds();
		this.currentNodeId = line[line.length - 1] ?? this.tree.rootId;
	}

	/** Moves cursor to parent node (no-op at root). */
	goPrev(): void {
		const node = this.getCurrentNode();
		if (!node.parentId) return;
		this.currentNodeId = node.parentId;
	}

	/** Moves cursor to active child (no-op if none). */
	goNext(): void {
		const node = this.getCurrentNode();
		if (!node.activeChildId) return;
		this.currentNodeId = node.activeChildId;
	}

	/**
	 * Moves the cursor to a given ply on the active line.
	 *
	 * Ply semantics:
	 * - ply 0 => root
	 * - ply 1 => after White's first move
	 * - ply 2 => after Black's first move
	 */
	goToPly(ply: number): void {
		const safePly = Number.isFinite(ply) ? Math.max(0, Math.floor(ply)) : 0;
		const line = this.getActiveLineNodeIds();
		const targetIndex = Math.min(safePly, line.length - 1);
		this.currentNodeId = line[targetIndex] ?? this.tree.rootId;
	}

	// ---------------------------------------------------------------------------
	// Public API - Read-only selectors
	// ---------------------------------------------------------------------------

	getMode(): ExplorerMode {
		return this.mode;
	}

	getSource(): ExplorerSessionSource {
		return this.source;
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

	getCurrentPly(): number {
		return this.getCurrentNode().ply;
	}

	/**
	 * Returns all legal destination squares for a given origin square,
	 * for the side to move in the current position.
	 *
	 * This is a read-only helper meant for UI hinting (dots/hover/selection).
	 * It MUST NOT mutate the session or the tree.
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

		type VerboseMove = { to: string };
		const moves = chess.moves({ square: from, verbose: true }) as VerboseMove[];

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
	 * This is a read-only helper for UI hinting (capture ring markers).
	 *
	 * Notes:
	 * - Includes en passant captures (target square might be empty in the board representation).
	 * - Duplicates are removed (e.g. promotion captures may generate multiple moves to same "to").
	 */
	getLegalCaptureDestinationsFrom(fromSquare: string): string[] {
		const from = (fromSquare ?? '').toLowerCase();
		if (!this.isSquare(from)) return [];

		const chess = this.tryCreateChessFromCurrentFen();
		if (!chess) return [];

		type VerboseMove = { to: string; flags?: string; captured?: string };
		const moves = chess.moves({ square: from, verbose: true }) as VerboseMove[];

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

	// ---------------------------------------------------------------------------
	// Private helpers - Tree building / resets
	// ---------------------------------------------------------------------------

	/**
	 * Hard resets the tree so that the provided FEN becomes the new root.
	 * This does NOT change mode/source by itself (callers decide).
	 */
	private hardResetToRootFen(rootFen: string): void {
		this.idFactory = createExplorerIdFactory();

		const rootId = this.idFactory.nextNodeId();
		const rootNode: ExplorerNode = { id: rootId, ply: 0, fen: rootFen, childIds: [] };

		this.tree = { rootId, nodesById: { [rootId]: rootNode } };
		this.currentNodeId = rootId;
	}

	/**
	 * Rebuilds the whole tree from an initial position and a SAN mainline.
	 *
	 * This is shared by:
	 * - loadPgn()
	 * - loadGameMovesSan()
	 *
	 * On any illegal move, we reset to initial to keep invariants simple.
	 */
	private rebuildTreeFromSanMoves(movesSan: string[]): ExplorerResult {
		this.idFactory = createExplorerIdFactory();

		const chess = new Chess(); // initial position
		const rootId = this.idFactory.nextNodeId();

		this.tree = {
			rootId,
			nodesById: {
				[rootId]: { id: rootId, ply: 0, fen: chess.fen(), childIds: [] },
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

			const promotionRaw = moveResult.promotion?.toLowerCase();
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
				incomingMove: { uci, san: moveResult.san, from, to, promotion },
				childIds: [],
			};

			parent.childIds.push(newId);
			parent.activeChildId = newId;

			parentId = newId;
		}

		this.currentNodeId = parentId;
		return { ok: true };
	}

	// ---------------------------------------------------------------------------
	// Private helpers - PGN loading (chess.js)
	// ---------------------------------------------------------------------------

	/**
	 * Normalizes PGN text for chess.js:
	 * - normalize newlines
	 * - ensure blank line between headers and movetext
	 * - ensure trailing newline (some builds parse more reliably)
	 */
	private normalizePgnText(pgn: string): string {
		let text = (pgn ?? '').replace(/\r\n/g, '\n').trim();

		// If headers exist, ensure there is a blank line before movetext.
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
			// Some chess.js versions return boolean, others throw on error (and return void).
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
	// Private helpers - Chess / ids / errors
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

	/**
	 * Returns:
	 * - null if (from -> to) is not a legal move
	 * - [] if legal and NOT a promotion
	 * - ['q','r','b','n'] (or subset) if legal AND promotion is available
	 */
	private getPromotionOptions(chess: Chess, from: Square, to: Square): PromotionPiece[] | null {
		type VerboseMove = { from: string; to: string; promotion?: string; flags?: string };

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

		// Fallback: if promotion is detected but pieces are not reported, expose standard options.
		if (options.size === 0) return ['q', 'r', 'b', 'n'];

		return Array.from(options);
	}
}
