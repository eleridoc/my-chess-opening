import { Chess } from 'chess.js';

import type { ExplorerNodeId } from './ids';
import type { ExplorerNode } from './model';
import type { ExplorerSessionState } from './session.state';

export function getNode(state: ExplorerSessionState, id: ExplorerNodeId): ExplorerNode {
	const node = state.tree.nodesById[id];
	if (!node) {
		throw new Error(`ExplorerSession invariant violated: missing node "${id}".`);
	}
	return node;
}

export function getCurrentNode(state: ExplorerSessionState): ExplorerNode {
	return getNode(state, state.currentNodeId);
}

export function getCurrentFen(state: ExplorerSessionState): string {
	return getCurrentNode(state).fen;
}

/**
 * Creates a chess.js instance from the current cursor FEN.
 * Returns null if the FEN is invalid (should never happen if invariants are respected).
 */
export function tryCreateChessFromCurrentFen(state: ExplorerSessionState): Chess | null {
	try {
		return new Chess(getCurrentFen(state));
	} catch {
		return null;
	}
}
