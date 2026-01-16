import type { Provider } from '@angular/core';

import { CHESS_BOARD_ADAPTER_FACTORY, type ChessBoardAdapterFactory } from './board-adapter';
import { CmChessboardAdapter } from './cm-chessboard-adapter';

/**
 * Provides the current chessboard adapter implementation.
 * Swap this provider later if we want to use another board library.
 */
export function provideChessBoardAdapter(): Provider {
	const factory: ChessBoardAdapterFactory = {
		create: (init) => new CmChessboardAdapter(init),
	};

	return {
		provide: CHESS_BOARD_ADAPTER_FACTORY,
		useValue: factory,
	};
}
