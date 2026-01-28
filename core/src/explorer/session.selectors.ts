import type { ExplorerNodeId } from './ids';
import type { ExplorerGameSnapshot, ExplorerMode, ExplorerSessionSource } from './types';
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

export function getMode(state: ExplorerSessionState): ExplorerMode {
	return state.mode;
}

export function getSource(state: ExplorerSessionState): ExplorerSessionSource {
	return state.source;
}

export function getDbGameSnapshot(state: ExplorerSessionState): ExplorerGameSnapshot | null {
	return state.dbSnapshot ? cloneDbGameSnapshot(state.dbSnapshot) : null;
}

export function getRootId(state: ExplorerSessionState): ExplorerNodeId {
	return state.tree.rootId;
}

export function getCurrentNodeId(state: ExplorerSessionState): ExplorerNodeId {
	return state.currentNodeId;
}

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

export function getTreeSnapshot(state: ExplorerSessionState): Readonly<ExplorerTree> {
	return state.tree;
}

export function getCurrentNodeSelector(state: ExplorerSessionState) {
	return getCurrentNode(state);
}

export function getCurrentPathNodeIds(state: ExplorerSessionState): ExplorerNodeId[] {
	const path: ExplorerNodeId[] = [];
	let cursor: ExplorerNodeId | undefined = state.currentNodeId;

	while (cursor) {
		path.push(cursor);
		cursor = state.tree.nodesById[cursor]?.parentId;
	}

	path.reverse();
	return path;
}

export function getActiveLineNodeIds(state: ExplorerSessionState): ExplorerNodeId[] {
	const line: ExplorerNodeId[] = [];
	let cursor: ExplorerNodeId | undefined = state.tree.rootId;

	while (cursor) {
		line.push(cursor);
		cursor = getNode(state, cursor).activeChildId as ExplorerNodeId | undefined;
	}

	return line;
}

export function getMainlineNodeIds(state: ExplorerSessionState): ExplorerNodeId[] {
	const line: ExplorerNodeId[] = [];
	let currentId: ExplorerNodeId = state.tree.rootId;

	while (true) {
		line.push(currentId);

		const currentNode = state.tree.nodesById[currentId];
		if (!currentNode) break;

		const children = currentNode.childIds as ExplorerNodeId[] | undefined;
		if (!children || children.length === 0) break;

		const nextId = children[0] as ExplorerNodeId;

		// Defensive guard: stop if tree is inconsistent
		const nextNode = state.tree.nodesById[nextId];
		if (!nextNode) break;

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

export function getMoveListViewModel(state: ExplorerSessionState): ExplorerMoveListViewModel {
	const vmRows = buildMainlineRows(state);
	const variationsByNodeId: Record<string, ExplorerVariationLine[]> = {};

	// Build variation lines for every node (small tree => OK and simpler)
	for (const id of Object.keys(state.tree.nodesById)) {
		variationsByNodeId[id] = buildVariationLinesFromNode(state, id as ExplorerNodeId);
	}

	return {
		rows: vmRows,
		variationsByNodeId,
	};
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

// ---- Move list builders (private to selectors module) ----

function buildMainlineRows(state: ExplorerSessionState): ExplorerMoveListRow[] {
	const ids = getMainlineNodeIds(state).slice(1); // exclude root
	const tokens: ExplorerMoveToken[] = ids
		.map((id) => nodeToToken(state, id, /*isLineStart*/ false))
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
