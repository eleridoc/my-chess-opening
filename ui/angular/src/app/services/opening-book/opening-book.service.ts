import { Injectable } from '@angular/core';

import type {
	OpeningBookClearLichessTokenResult,
	OpeningBookGetMovesInput,
	OpeningBookGetMovesResult,
	OpeningBookLichessAuthStatusResult,
	OpeningBookSaveLichessTokenInput,
	OpeningBookSaveLichessTokenResult,
	OpeningBookTestLichessTokenResult,
} from 'my-chess-opening-core';

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

	async getLichessAuthStatus(): Promise<OpeningBookLichessAuthStatusResult> {
		if (!window.electron?.openingBook?.getLichessAuthStatus) {
			throw new Error('Electron openingBook auth API is not available');
		}

		return window.electron.openingBook.getLichessAuthStatus();
	}

	async saveLichessToken(
		input: OpeningBookSaveLichessTokenInput,
	): Promise<OpeningBookSaveLichessTokenResult> {
		if (!window.electron?.openingBook?.saveLichessToken) {
			throw new Error('Electron openingBook auth API is not available');
		}

		return window.electron.openingBook.saveLichessToken(input);
	}

	async clearLichessToken(): Promise<OpeningBookClearLichessTokenResult> {
		if (!window.electron?.openingBook?.clearLichessToken) {
			throw new Error('Electron openingBook auth API is not available');
		}

		return window.electron.openingBook.clearLichessToken();
	}

	async testLichessToken(): Promise<OpeningBookTestLichessTokenResult> {
		if (!window.electron?.openingBook?.testLichessToken) {
			throw new Error('Electron openingBook auth API is not available');
		}

		return window.electron.openingBook.testLichessToken();
	}
}
