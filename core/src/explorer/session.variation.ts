import type { ExplorerNodeId } from './ids';
import { getCurrentNode, getNode } from './session.internals';
import type { ExplorerSessionState } from './session.state';

export function getVariationContextAtCurrentPly(state: ExplorerSessionState): {
	parent: ReturnType<typeof getNode>;
	siblings: ExplorerNodeId[];
	index: number;
} | null {
	const node = getCurrentNode(state);
	if (!node.parentId) return null;

	const parent = getNode(state, node.parentId);

	const siblings = (parent.childIds ?? []) as ExplorerNodeId[];
	if (siblings.length <= 1) return null;

	// Prefer currentNodeId index, fallback to parent's activeChildId, then default to 0.
	let index = siblings.indexOf(state.currentNodeId);

	if (index === -1 && parent.activeChildId) {
		index = siblings.indexOf(parent.activeChildId as ExplorerNodeId);
	}

	if (index === -1) index = 0;

	return { parent, siblings, index };
}

export function shiftVariationAtCurrentPly(state: ExplorerSessionState, delta: number): void {
	const ctx = getVariationContextAtCurrentPly(state);
	if (!ctx) return;

	const count = ctx.siblings.length;
	const nextIndex = (ctx.index + delta + count) % count;
	const nextId = ctx.siblings[nextIndex];

	// Selecting a variation means: update parent activeChildId + move cursor to the selected sibling.
	ctx.parent.activeChildId = nextId;
	state.currentNodeId = nextId;
}
