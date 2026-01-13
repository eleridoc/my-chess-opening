import { Injectable } from '@angular/core';
import type {
	LogsListInput,
	LogsListResult,
	LogsFacetsResult,
	LogEntryDetails,
} from 'my-chess-opening-core';

@Injectable({ providedIn: 'root' })
export class LogsService {
	async list(input: LogsListInput): Promise<LogsListResult> {
		if (!window.electron) throw new Error('Electron API is not available');
		return window.electron.logs.list(input);
	}

	async facets(): Promise<LogsFacetsResult> {
		if (!window.electron) throw new Error('Electron API is not available');
		return window.electron.logs.facets();
	}

	async getEntry(id: string): Promise<LogEntryDetails | null> {
		if (!window.electron) throw new Error('Electron API is not available');
		return window.electron.logs.getEntry(id);
	}
}
