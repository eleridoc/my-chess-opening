import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import * as path from 'node:path';

import type { AnalysisMode, AnalysisSettings } from 'my-chess-opening-core';

import { normalizeStockfishAnalysisSettings } from '../stockfish/stockfishEvaluation';
import { getSettingsDir } from '../system/paths';

export const ANALYSIS_SETTINGS_SCHEMA_VERSION = 1;
export const STOCKFISH_ANALYSIS_SETTINGS_FILE_NAME = 'stockfish-analysis-settings.json';

const DEFAULT_STOCKFISH_ANALYSIS_SETTINGS: AnalysisSettings = {
	version: ANALYSIS_SETTINGS_SCHEMA_VERSION,
	mode: 'movetime',
	movetimeMs: 250,
	depth: 12,
	threads: 1,
	hashMb: 64,
	multiPv: 1,
};

type JsonObject = Record<string, unknown>;

function isJsonObject(value: unknown): value is JsonObject {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readNumber(value: unknown, fallback: number): number {
	if (typeof value !== 'number' || !Number.isFinite(value)) {
		return fallback;
	}

	return value;
}

function readAnalysisMode(value: unknown, fallback: AnalysisMode): AnalysisMode {
	return value === 'depth' || value === 'movetime' ? value : fallback;
}

/**
 * Return default Stockfish analysis settings.
 *
 * A fresh copy is returned to avoid accidental shared mutations.
 */
export function getDefaultAnalysisSettings(): AnalysisSettings {
	return {
		...DEFAULT_STOCKFISH_ANALYSIS_SETTINGS,
	};
}

/**
 * Resolve the local settings file used for Stockfish analysis.
 */
export function getAnalysisSettingsFilePath(): string {
	return path.join(getSettingsDir(), STOCKFISH_ANALYSIS_SETTINGS_FILE_NAME);
}

/**
 * Normalize unknown JSON into safe Stockfish analysis settings.
 */
export function normalizeAnalysisSettings(value: unknown): AnalysisSettings {
	const defaults = getDefaultAnalysisSettings();

	if (!isJsonObject(value)) {
		return defaults;
	}

	const rawSettings: AnalysisSettings = {
		version: ANALYSIS_SETTINGS_SCHEMA_VERSION,
		mode: readAnalysisMode(value.mode, defaults.mode),
		movetimeMs: readNumber(value.movetimeMs, defaults.movetimeMs),
		depth: readNumber(value.depth, defaults.depth),
		threads: readNumber(value.threads, defaults.threads),
		hashMb: readNumber(value.hashMb, defaults.hashMb),
		multiPv: readNumber(value.multiPv, defaults.multiPv),
	};

	return normalizeStockfishAnalysisSettings(rawSettings);
}

/**
 * Serialize analysis settings as a stable JSON snapshot.
 *
 * This snapshot will be stored with each GameAnalysis row so old analyses
 * remain understandable even when the active app settings change later.
 */
export function serializeAnalysisSettingsSnapshot(settings: AnalysisSettings): string {
	const normalizedSettings = normalizeAnalysisSettings(settings);

	return JSON.stringify(normalizedSettings);
}

function ensureSettingsDir(): void {
	mkdirSync(getSettingsDir(), { recursive: true });
}

function writeSettingsFile(settings: AnalysisSettings): void {
	ensureSettingsDir();

	const filePath = getAnalysisSettingsFilePath();
	const temporaryFilePath = `${filePath}.tmp`;
	const serializedSettings = `${JSON.stringify(settings, null, 2)}\n`;

	writeFileSync(temporaryFilePath, serializedSettings, 'utf8');
	renameSync(temporaryFilePath, filePath);
}

/**
 * Save active Stockfish analysis settings.
 */
export function saveAnalysisSettings(settings: AnalysisSettings): AnalysisSettings {
	const normalizedSettings = normalizeAnalysisSettings(settings);

	writeSettingsFile(normalizedSettings);

	return normalizedSettings;
}

/**
 * Load active Stockfish analysis settings.
 *
 * If the file does not exist, it is created with default values.
 * If the file exists but contains invalid JSON, the default settings are
 * returned and persisted to repair the local configuration.
 */
export function loadAnalysisSettings(): AnalysisSettings {
	const filePath = getAnalysisSettingsFilePath();

	if (!existsSync(filePath)) {
		return saveAnalysisSettings(getDefaultAnalysisSettings());
	}

	try {
		const rawContent = readFileSync(filePath, 'utf8');
		const parsedContent = JSON.parse(rawContent) as unknown;
		const normalizedSettings = normalizeAnalysisSettings(parsedContent);

		// Persist normalized settings so old or partially invalid files are migrated.
		writeSettingsFile(normalizedSettings);

		return normalizedSettings;
	} catch (error) {
		console.warn(
			'[Analysis] Failed to read Stockfish analysis settings. Defaults will be used.',
			error,
		);

		return saveAnalysisSettings(getDefaultAnalysisSettings());
	}
}

/**
 * Ensure the Stockfish analysis settings file exists.
 */
export function ensureAnalysisSettingsFile(): AnalysisSettings {
	return loadAnalysisSettings();
}
