import { createExplorerIdFactory, type ExplorerIdFactory, type ExplorerNodeId } from './ids';
import type { ExplorerGameSnapshot, ExplorerMode, ExplorerSessionSource } from './types';
import type { ExplorerTree } from './model';

export type ExplorerSessionState = {
	mode: ExplorerMode;
	source: ExplorerSessionSource;

	idFactory: ExplorerIdFactory;
	tree: ExplorerTree;
	currentNodeId: ExplorerNodeId;

	dbSnapshot: ExplorerGameSnapshot | null;
};

export function createExplorerSessionState(): ExplorerSessionState {
	return {
		mode: 'CASE1_FREE',
		source: { kind: 'FREE' },
		idFactory: createExplorerIdFactory(),
		tree: { rootId: 'n0', nodesById: {} },
		currentNodeId: 'n0',
		dbSnapshot: null,
	};
}
