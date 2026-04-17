import { Injectable } from '@angular/core';
import type {
	ExportSummaryInput,
	ExportSummaryResult,
	ExportBuildPgnInput,
	ExportBuildPgnResult,
} from 'my-chess-opening-core';

/**
 * ExportService
 *
 * Thin Angular wrapper around Electron IPC (`window.electron.export`).
 *
 * Responsibilities:
 * - request the export summary for a filter snapshot
 * - request the generated PGN export file for an executed filter snapshot
 *
 * Notes:
 * - This service intentionally stays transport-only.
 * - UI concerns such as Blob creation, download triggering, notifications,
 *   and screen state management belong to the page layer.
 */
@Injectable({ providedIn: 'root' })
export class ExportService {
	async getSummary(input: ExportSummaryInput): Promise<ExportSummaryResult> {
		if (!window.electron) {
			throw new Error('Electron API is not available');
		}

		return window.electron.export.getSummary(input);
	}

	async buildPgnFile(input: ExportBuildPgnInput): Promise<ExportBuildPgnResult> {
		if (!window.electron) {
			throw new Error('Electron API is not available');
		}

		return window.electron.export.buildPgnFile(input);
	}
}
