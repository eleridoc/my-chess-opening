import { Injectable } from '@angular/core';
import type { GamesListInput, GamesListResult } from 'my-chess-opening-core';

@Injectable({ providedIn: 'root' })
export class GamesService {
	async list(input?: GamesListInput): Promise<GamesListResult> {
		if (!window.electron) throw new Error('Electron API is not available');
		return window.electron.games.list(input);
	}
}
