import { Injectable } from '@angular/core';
import type { ExplorerGetGameResult } from 'my-chess-opening-core';

@Injectable({ providedIn: 'root' })
export class ExplorerDbService {
	async getGame(gameId: string): Promise<ExplorerGetGameResult> {
		if (!window.electron) throw new Error('Electron API is not available');
		return window.electron.explorer.getGame(gameId);
	}
}
