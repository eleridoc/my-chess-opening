import { Injectable } from '@angular/core';

import type {
	AnalysisEngineStatus,
	AnalysisSettings,
	AnalyzeGameInput,
	AnalyzeGameResult,
	CancelCurrentAnalysisResult,
	GetGameAnalysisInput,
	GetGameAnalysisResult,
} from 'my-chess-opening-core';

/**
 * Thin Angular wrapper around Electron IPC for Stockfish game analysis.
 *
 * Responsibilities:
 * - expose engine status
 * - expose active Stockfish analysis settings
 * - start one-game analysis
 * - load the latest persisted analysis for one game
 * - cancel the current analysis
 *
 * Notes:
 * - This service is intentionally transport-only.
 * - UI state management belongs to Explorer Analysis components.
 * - Stockfish runs in Electron main, never in the Angular renderer.
 */
@Injectable({ providedIn: 'root' })
export class AnalysisService {
	async getEngineStatus(): Promise<AnalysisEngineStatus> {
		if (!window.electron?.analysis?.getEngineStatus) {
			throw new Error('Electron analysis API is not available');
		}

		return window.electron.analysis.getEngineStatus();
	}

	async getSettings(): Promise<AnalysisSettings> {
		if (!window.electron?.analysis?.getSettings) {
			throw new Error('Electron analysis API is not available');
		}

		return window.electron.analysis.getSettings();
	}

	async analyzeGame(input: AnalyzeGameInput): Promise<AnalyzeGameResult> {
		if (!window.electron?.analysis?.analyzeGame) {
			throw new Error('Electron analysis API is not available');
		}

		return window.electron.analysis.analyzeGame(input);
	}

	async getLatestGameAnalysis(input: GetGameAnalysisInput): Promise<GetGameAnalysisResult> {
		if (!window.electron?.analysis?.getLatestGameAnalysis) {
			throw new Error('Electron analysis API is not available');
		}

		return window.electron.analysis.getLatestGameAnalysis(input);
	}

	async cancelCurrentAnalysis(): Promise<CancelCurrentAnalysisResult> {
		if (!window.electron?.analysis?.cancelCurrentAnalysis) {
			throw new Error('Electron analysis API is not available');
		}

		return window.electron.analysis.cancelCurrentAnalysis();
	}
}
