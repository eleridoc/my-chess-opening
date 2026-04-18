import { Injectable } from '@angular/core';
import type { MyNextMovesInput, MyNextMovesResult } from 'my-chess-opening-core';

/**
 * Thin Angular wrapper around Electron IPC for the Explorer "My next moves" feature.
 *
 * Responsibilities:
 * - request aggregated next-move statistics for the current position
 *
 * Notes:
 * - This service is intentionally transport-only.
 * - UI state management belongs to the page / component layer.
 */
@Injectable({ providedIn: 'root' })
export class MyNextMovesService {
	async getMoves(input: MyNextMovesInput): Promise<MyNextMovesResult> {
		if (!window.electron?.myNextMoves?.getMoves) {
			throw new Error('Electron myNextMoves API is not available');
		}

		return window.electron.myNextMoves.getMoves(input);
	}
}
