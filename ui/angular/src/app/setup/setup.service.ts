import { Injectable } from '@angular/core';
import type { SetupState, SaveAccountsInput } from 'my-chess-opening-core';

@Injectable({ providedIn: 'root' })
export class SetupService {
	async getState(): Promise<SetupState> {
		// In browser-only dev mode, window.electron is not available.
		if (!window.electron) {
			console.warn('[SetupService] window.electron is undefined, returning fake state');
			// In pure browser mode we assume setup is already completed.
			return {
				hasAccounts: true,
				hasCompletedSetup: true,
			};
		}

		return window.electron.setup.getState();
	}

	async saveAccounts(input: SaveAccountsInput): Promise<void> {
		if (!window.electron) {
			console.warn('[SetupService] window.electron is undefined, ignoring saveAccounts', input);
			return;
		}

		const trimmed: SaveAccountsInput = {
			lichessUsername: input.lichessUsername?.trim() || null,
			chesscomUsername: input.chesscomUsername?.trim() || null,
		};

		if (!trimmed.lichessUsername && !trimmed.chesscomUsername) {
			throw new Error('At least one account (Lichess or Chess.com) is required');
		}

		await window.electron.setup.saveAccounts(trimmed);
	}
}
