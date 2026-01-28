import { Chess } from 'chess.js';

import type { ExplorerNodeId } from './ids';
import { createExplorerIdFactory } from './ids';
import type { ExplorerNode } from './model';
import type { ExplorerApplyMoveResult, ExplorerResult, PromotionPiece } from './types';
import { getCurrentNode, getNode } from './session.internals';
import type { ExplorerSessionState } from './session.state';
import {
	buildUci,
	computePositionIdentity,
	makeError,
	normalizePromotionPiece,
} from './session.utils';

export function resetTreeToRootFen(state: ExplorerSessionState, rootFen: string): void {
	state.idFactory = createExplorerIdFactory();

	const rootId = state.idFactory.nextNodeId();
	const rootIdentity = computePositionIdentity(rootFen);
	const rootNode: ExplorerNode = {
		id: rootId,
		ply: 0,
		fen: rootFen,
		normalizedFen: rootIdentity.normalizedFen,
		positionKey: rootIdentity.positionKey,
		childIds: [],
	};

	state.tree = { rootId, nodesById: { [rootId]: rootNode } };
	state.currentNodeId = rootId;
}

/**
 * Rebuilds the whole tree from an initial position and a SAN mainline.
 * On any illegal move, we reset to initial to keep invariants simple.
 */
export function rebuildTreeFromSanMoves(
	state: ExplorerSessionState,
	movesSan: string[],
	onResetToInitial: () => void,
): ExplorerResult {
	state.idFactory = createExplorerIdFactory();

	const chess = new Chess(); // initial position
	const rootId = state.idFactory.nextNodeId();
	const rootFen = chess.fen();
	const rootIdentity = computePositionIdentity(rootFen);

	state.tree = {
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
			onResetToInitial();
			return {
				ok: false,
				error: makeError('INVALID_PGN', 'Game contains an illegal move.', { san }),
			};
		}

		const from = moveResult.from;
		const to = moveResult.to;
		const promotionApplied = normalizePromotionPiece((moveResult as any).promotion);

		const uci = buildUci(from, to, promotionApplied);

		const newId = state.idFactory.nextNodeId();
		const parent = state.tree.nodesById[parentId];

		const fenAfter = chess.fen();
		const identity = computePositionIdentity(fenAfter);

		state.tree.nodesById[newId] = {
			id: newId,
			parentId,
			ply: state.tree.nodesById[parentId].ply + 1,
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

	state.currentNodeId = parentId;
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
export function upsertChildFromAppliedMove(
	state: ExplorerSessionState,
	payload: {
		from: string;
		to: string;
		fenAfter: string;
		uci: string;
		san: string;
		promotionApplied?: PromotionPiece;
	},
): ExplorerApplyMoveResult {
	const parent = getCurrentNode(state);

	const existingChildId = parent.childIds.find(
		(id) => state.tree.nodesById[id]?.incomingMove?.uci === payload.uci,
	) as ExplorerNodeId | undefined;

	if (existingChildId) {
		parent.activeChildId = existingChildId;
		state.currentNodeId = existingChildId;

		const child = getNode(state, existingChildId);
		return {
			ok: true,
			newNodeId: existingChildId,
			fen: child.fen,
			san: child.incomingMove?.san ?? payload.san,
			uci: payload.uci,
		};
	}

	const newId = state.idFactory.nextNodeId();
	const identity = computePositionIdentity(payload.fenAfter);

	state.tree.nodesById[newId] = {
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
	state.currentNodeId = newId;

	return {
		ok: true,
		newNodeId: newId,
		fen: payload.fenAfter,
		san: payload.san,
		uci: payload.uci,
	};
}
