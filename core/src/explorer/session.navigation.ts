import type { ExplorerNodeId } from './ids';
import type { ExplorerSessionState } from './session.state';
import { getCurrentNode, getNode } from './session.internals';
import { getMainlineNodeIds } from './session.selectors';
import { getVariationContextAtCurrentPly, shiftVariationAtCurrentPly } from './session.variation';

export function canGoPrev(state: ExplorerSessionState): boolean {
	return state.currentNodeId !== state.tree.rootId;
}

export function canGoNext(state: ExplorerSessionState): boolean {
	const node = getCurrentNode(state);
	const isOnMainline = getMainlineNodeIds(state).includes(state.currentNodeId);

	if (isOnMainline) {
		return (node.childIds?.length ?? 0) > 0;
	}

	return Boolean(node.activeChildId ?? node.childIds?.[0]);
}

export function goStart(state: ExplorerSessionState): void {
	state.currentNodeId = state.tree.rootId;
}

export function goEnd(state: ExplorerSessionState): void {
	const line = getMainlineNodeIds(state);
	state.currentNodeId = line[line.length - 1] ?? state.tree.rootId;
}

export function goPrev(state: ExplorerSessionState): void {
	const node = getCurrentNode(state);
	if (!node.parentId) return;
	state.currentNodeId = node.parentId;
}

export function goNext(state: ExplorerSessionState): void {
	const node = getCurrentNode(state);
	const isOnMainline = getMainlineNodeIds(state).includes(state.currentNodeId);

	const nextId = isOnMainline
		? (node.childIds?.[0] as ExplorerNodeId | undefined)
		: ((node.activeChildId ?? node.childIds?.[0]) as ExplorerNodeId | undefined);

	if (!nextId) return;
	state.currentNodeId = nextId;
}

export function canGoPrevVariation(state: ExplorerSessionState): boolean {
	return getVariationContextAtCurrentPly(state) !== null;
}

export function canGoNextVariation(state: ExplorerSessionState): boolean {
	return getVariationContextAtCurrentPly(state) !== null;
}

export function goPrevVariation(state: ExplorerSessionState): void {
	shiftVariationAtCurrentPly(state, -1);
}

export function goNextVariation(state: ExplorerSessionState): void {
	shiftVariationAtCurrentPly(state, 1);
}

export function goToPly(state: ExplorerSessionState, ply: number): void {
	const safePly = Number.isFinite(ply) ? Math.max(0, Math.floor(ply)) : 0;
	const line = getMainlineNodeIds(state);
	const targetIndex = Math.min(safePly, line.length - 1);
	state.currentNodeId = line[targetIndex] ?? state.tree.rootId;
}

export function goToNode(state: ExplorerSessionState, nodeId: ExplorerNodeId): void {
	const n = state.tree.nodesById[nodeId];
	if (!n) return;
	state.currentNodeId = nodeId;
	// Ensure node exists (keeps same invariant behavior if you want a throw later)
	getNode(state, nodeId);
}
