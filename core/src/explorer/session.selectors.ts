import type { ExplorerNodeId } from './ids';
import type {
	CapturedBySide,
	CapturedCounts,
	CapturedPiecesAtCursor,
	PieceKind,
	ExplorerGameSnapshot,
	ExplorerMode,
	ExplorerSessionSource,
	MaterialAtCursor,
} from './types';
import type {
	ExplorerMoveToken,
	ExplorerMoveListRow,
	ExplorerVariationLine,
	ExplorerTree,
	ExplorerMoveListViewModel,
	ExplorerMove,
	ExplorerMainlineMove,
} from './model';

import type { ExplorerSessionState } from './session.state';
import {
	getCurrentNode,
	getNode,
	getCurrentFen,
	tryCreateChessFromCurrentFen,
} from './session.internals';
import { cloneDbGameSnapshot, isSquare } from './session.utils';
import { getVariationContextAtCurrentPly } from './session.variation';
import { Chess, type Move } from 'chess.js';

/**
 * Session selectors
 *
 * Pure read-only functions that derive UI-friendly data from ExplorerSessionState.
 *
 * Notes:
 * - Selectors must be deterministic and side-effect free.
 * - When the state tree might be inconsistent (defensive coding), selectors should prefer
 *   returning safe defaults rather than throwing.
 * - Keep all comments in English.
 */

export function getMode(state: ExplorerSessionState): ExplorerMode {
	return state.mode;
}

export function getSource(state: ExplorerSessionState): ExplorerSessionSource {
	return state.source;
}

/**
 * Returns a cloned DB snapshot (so callers can't mutate internal state).
 */
export function getDbGameSnapshot(state: ExplorerSessionState): ExplorerGameSnapshot | null {
	return state.dbSnapshot ? cloneDbGameSnapshot(state.dbSnapshot) : null;
}

export function getRootId(state: ExplorerSessionState): ExplorerNodeId {
	return state.tree.rootId;
}

export function getCurrentNodeId(state: ExplorerSessionState): ExplorerNodeId {
	return state.currentNodeId;
}

/**
 * Alias kept for backward compatibility with older UI code.
 * Prefer using `getCurrentFen(state)` directly where possible.
 */
export function getCurrentFenSelector(state: ExplorerSessionState): string {
	return getCurrentFen(state);
}

export function getCurrentNormalizedFen(state: ExplorerSessionState): string {
	return getCurrentNode(state).normalizedFen;
}

export function getCurrentPositionKey(state: ExplorerSessionState): string {
	return getCurrentNode(state).positionKey;
}

export function getCurrentPly(state: ExplorerSessionState): number {
	return getCurrentNode(state).ply;
}

/**
 * Returns the tree reference as readonly.
 * The returned object should still be treated as immutable by callers.
 */
export function getTreeSnapshot(state: ExplorerSessionState): Readonly<ExplorerTree> {
	return state.tree;
}

export function getCurrentNodeSelector(
	state: ExplorerSessionState,
): ReturnType<typeof getCurrentNode> {
	return getCurrentNode(state);
}

/**
 * Returns the node ids from root -> current cursor.
 *
 * Defensive behavior:
 * - If the tree is inconsistent (missing nodes), it returns the longest valid prefix.
 */
export function getCurrentPathNodeIds(state: ExplorerSessionState): ExplorerNodeId[] {
	const path: ExplorerNodeId[] = [];
	let cursor: ExplorerNodeId | undefined = state.currentNodeId;

	while (cursor) {
		const node = state.tree.nodesById[cursor];
		if (!node) break;

		path.push(cursor);
		cursor = node.parentId as ExplorerNodeId | undefined;
	}

	path.reverse();
	return path;
}

/**
 * Returns the node ids for the active line from root following activeChildId.
 *
 * Defensive behavior:
 * - Stops if the next node is missing (tree inconsistency).
 */
export function getActiveLineNodeIds(state: ExplorerSessionState): ExplorerNodeId[] {
	const line: ExplorerNodeId[] = [];
	let cursor: ExplorerNodeId | undefined = state.tree.rootId;

	while (cursor) {
		const node = state.tree.nodesById[cursor];
		if (!node) break;

		line.push(cursor);
		cursor = node.activeChildId as ExplorerNodeId | undefined;
	}

	return line;
}

/**
 * Returns the mainline node ids.
 *
 * Convention:
 * - The mainline is the "first child" chain: children[0] is considered the main continuation.
 *
 * Defensive behavior:
 * - Stops if a node is missing or has no children.
 */
export function getMainlineNodeIds(state: ExplorerSessionState): ExplorerNodeId[] {
	const line: ExplorerNodeId[] = [];
	let currentId: ExplorerNodeId | undefined = state.tree.rootId;

	while (currentId) {
		const currentNode = state.tree.nodesById[currentId];
		if (!currentNode) break;

		line.push(currentId);

		const children = currentNode.childIds as ExplorerNodeId[] | undefined;
		if (!children || children.length === 0) break;

		const nextId = children[0] as ExplorerNodeId;
		if (!state.tree.nodesById[nextId]) break;

		currentId = nextId;
	}

	return line;
}

export function getActiveLineMoves(state: ExplorerSessionState): ExplorerMove[] {
	const ids = getActiveLineNodeIds(state);
	return ids
		.slice(1)
		.map((id) => getNode(state, id).incomingMove)
		.filter((m): m is ExplorerMove => Boolean(m));
}

export function getCurrentPathMoves(state: ExplorerSessionState): ExplorerMove[] {
	const ids = getCurrentPathNodeIds(state);
	return ids
		.slice(1)
		.map((id) => getNode(state, id).incomingMove)
		.filter((m): m is ExplorerMove => Boolean(m));
}

/**
 * Legacy-friendly mainline list that includes "variationCount" for each mainline move.
 *
 * Variation count meaning:
 * - number of alternative children from the parent position (excluding the mainline continuation).
 */
export function getMainlineMovesWithMeta(state: ExplorerSessionState): ExplorerMainlineMove[] {
	const ids = getMainlineNodeIds(state);

	return ids
		.slice(1) // exclude root
		.map((id) => {
			const node = getNode(state, id);

			// For non-root nodes, parentId should exist
			const parent = node.parentId ? getNode(state, node.parentId) : undefined;
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

export function getVariationInfoAtCurrentPly(
	state: ExplorerSessionState,
): { index: number; count: number } | null {
	const ctx = getVariationContextAtCurrentPly(state);
	if (!ctx) return null;
	return { index: ctx.index, count: ctx.siblings.length };
}

/**
 * Returns captured pieces computed at the current cursor position.
 *
 * Rules:
 * - For FEN imports, captures are not applicable (no move history).
 * - For PGN/DB/FREE, captures are computed by replaying the current path moves from the root.
 *
 * Meaning of "captured by side":
 * - bySide.white.p = number of black pawns captured by White
 * - bySide.black.q = number of white queens captured by Black
 */
export function getCapturedPiecesAtCursor(state: ExplorerSessionState): CapturedPiecesAtCursor {
	// FEN has no move history => we cannot know what was captured by whom.
	if (state.source.kind === 'FEN') {
		return { availability: 'not_applicable' };
	}

	const bySide = makeEmptyCapturedBySide();

	// Defensive: root FEN should always be valid if invariants hold.
	let chess: Chess;
	try {
		const rootFen = getNode(state, state.tree.rootId).fen;
		chess = new Chess(rootFen);
	} catch {
		return { availability: 'available', bySide };
	}

	// Replay the current path (mainline or variation) from the root to the cursor.
	const pathMoves = getCurrentPathMoves(state);

	for (const m of pathMoves) {
		const from = (m.from ?? '').toLowerCase();
		const to = (m.to ?? '').toLowerCase();

		// Defensive guard: should never happen if core invariants hold.
		if (!isSquare(from) || !isSquare(to)) {
			return { availability: 'available', bySide: makeEmptyCapturedBySide() };
		}

		const moveResult: Move | null = m.promotion
			? chess.move({ from, to, promotion: m.promotion })
			: chess.move({ from, to });

		if (!moveResult) {
			// If the move path is inconsistent, return a safe empty payload.
			return { availability: 'available', bySide: makeEmptyCapturedBySide() };
		}

		const captured = normalizeCapturedPieceKind(moveResult.captured);
		if (!captured) continue;

		// chess.js moveResult.color: 'w' or 'b' -> the mover.
		const side = moveResult.color === 'b' ? 'black' : 'white';
		bySide[side][captured] += 1;
	}

	return { availability: 'available', bySide };
}

export function getMoveListViewModel(state: ExplorerSessionState): ExplorerMoveListViewModel {
	const rows = buildMainlineRows(state);
	const variationsByNodeId: Record<string, ExplorerVariationLine[]> = {};

	// Build variation lines for every node (small tree => OK and simpler).
	for (const id of Object.keys(state.tree.nodesById)) {
		variationsByNodeId[id] = buildVariationLinesFromNode(state, id as ExplorerNodeId);
	}

	return { rows, variationsByNodeId };
}

export function getLegalDestinationsFrom(
	state: ExplorerSessionState,
	fromSquare: string,
): string[] {
	const from = (fromSquare ?? '').toLowerCase();
	if (!isSquare(from)) return [];

	const chess = tryCreateChessFromCurrentFen(state);
	if (!chess) return [];

	const moves = chess.moves({ square: from, verbose: true }) as Array<{ to: string }>;

	const dests = new Set<string>();
	for (const m of moves) {
		const to = (m?.to ?? '').toLowerCase();
		if (isSquare(to)) dests.add(to);
	}

	// Stable order helps avoid UI flicker when rendering markers.
	return Array.from(dests).sort();
}

export function getLegalCaptureDestinationsFrom(
	state: ExplorerSessionState,
	fromSquare: string,
): string[] {
	const from = (fromSquare ?? '').toLowerCase();
	if (!isSquare(from)) return [];

	const chess = tryCreateChessFromCurrentFen(state);
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
		if (isSquare(to)) captures.add(to);
	}

	return Array.from(captures).sort();
}

/**
 * Returns material information at the current cursor position (board-only).
 *
 * Important:
 * - This is NOT derived from capture history.
 * - It counts pieces currently present on the board, which makes it promotion-safe.
 * - Kings are intentionally ignored for material scoring.
 */
export function getMaterialAtCursor(state: ExplorerSessionState): MaterialAtCursor {
	const placement = (getCurrentFen(state).split(' ')[0] ?? '').trim();

	const emptyCounts = () => ({ p: 0, n: 0, b: 0, r: 0, q: 0 });

	const bySide = {
		white: emptyCounts(),
		black: emptyCounts(),
	};

	for (const ch of placement) {
		if (ch === '/' || (ch >= '1' && ch <= '8')) continue;

		const isWhite = ch === ch.toUpperCase();
		const piece = ch.toLowerCase();

		// Ignore kings: not part of material evaluation here.
		if (piece !== 'p' && piece !== 'n' && piece !== 'b' && piece !== 'r' && piece !== 'q') {
			continue;
		}

		const side = isWhite ? 'white' : 'black';
		bySide[side][piece as keyof typeof bySide.white] += 1;
	}

	const score = (c: { p: number; n: number; b: number; r: number; q: number }) =>
		c.p * 1 + c.n * 3 + c.b * 3 + c.r * 5 + c.q * 9;

	const whiteScore = score(bySide.white);
	const blackScore = score(bySide.black);

	const diffSigned = whiteScore - blackScore;

	return {
		bySide,
		scoreBySide: { white: whiteScore, black: blackScore },
		diff: Math.abs(diffSigned),
		leadingSide: diffSigned === 0 ? undefined : diffSigned > 0 ? 'white' : 'black',
	};
}

// ---- Move list builders (private to selectors module) ----

function buildMainlineRows(state: ExplorerSessionState): ExplorerMoveListRow[] {
	const ids = getMainlineNodeIds(state).slice(1); // exclude root
	const tokens: ExplorerMoveToken[] = ids
		.map((id) => nodeToToken(state, id, /* isLineStart */ false))
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

function buildVariationLinesFromNode(
	state: ExplorerSessionState,
	nodeId: ExplorerNodeId,
): ExplorerVariationLine[] {
	const node = getNode(state, nodeId);
	const children = node.childIds ?? [];
	if (children.length <= 1) return [];

	// Variations = all children except the mainline continuation (index 0)
	const variationStarts = children.slice(1) as ExplorerNodeId[];

	return variationStarts.map((startId) => buildVariationLine(state, startId));
}

function buildVariationLine(
	state: ExplorerSessionState,
	startNodeId: ExplorerNodeId,
): ExplorerVariationLine {
	const tokens: ExplorerMoveToken[] = [];

	let cursor: ExplorerNodeId | undefined = startNodeId;
	let isLineStart = true;

	while (cursor) {
		const t = nodeToToken(state, cursor, isLineStart);
		if (!t) break;
		tokens.push(t);

		const n = getNode(state, cursor);
		const next = (n.childIds?.[0] as ExplorerNodeId | undefined) ?? undefined;
		cursor = next;

		isLineStart = false;
	}

	return { startNodeId, tokens };
}

function nodeToToken(
	state: ExplorerSessionState,
	nodeId: ExplorerNodeId,
	isLineStart: boolean,
): ExplorerMoveToken | null {
	const node = getNode(state, nodeId);
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
		label: formatVariationLabel(node.ply, move.san, isLineStart),
	};
}

function formatVariationLabel(ply: number, san: string, isLineStart: boolean): string {
	const fullMove = Math.floor((ply + 1) / 2);

	// White move => always show move number (like "5.O-O")
	if (ply % 2 === 1) return `${fullMove}.${san}`;

	// Black move => show "5...c5" only if line starts on black
	return isLineStart ? `${fullMove}...${san}` : san;
}

function makeEmptyCapturedCounts(): CapturedCounts {
	return { p: 0, n: 0, b: 0, r: 0, q: 0 };
}

function makeEmptyCapturedBySide(): CapturedBySide {
	return {
		white: makeEmptyCapturedCounts(),
		black: makeEmptyCapturedCounts(),
	};
}

function normalizeCapturedPieceKind(value?: string): PieceKind | null {
	const v = (value ?? '').toLowerCase();
	return v === 'p' || v === 'n' || v === 'b' || v === 'r' || v === 'q' ? v : null;
}
