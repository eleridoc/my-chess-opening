import { Injectable } from '@angular/core';

import type { OpeningBookGetMovesInput, OpeningBookGetMovesResult } from 'my-chess-opening-core';

/**
 * Thin Angular wrapper around Electron IPC for the Explorer external Opening Book.
 *
 * Responsibilities:
 * - request external opening book moves for the current Explorer position
 *
 * Notes:
 * - This service is intentionally transport-only.
 * - UI state management belongs to the Explorer component layer.
 * - Network access is handled by Electron, not by the Angular renderer.
 */
@Injectable({ providedIn: 'root' })
export class OpeningBookService {
	async getMoves(input: OpeningBookGetMovesInput): Promise<OpeningBookGetMovesResult> {
		if (!window.electron?.openingBook?.getMoves) {
			throw new Error('Electron openingBook API is not available');
		}

		return window.electron.openingBook.getMoves(input);
	}
}
