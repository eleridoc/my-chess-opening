import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { getAssetsDir } from '../system/paths';

import { normalizeSanLine } from './ecoSan';

type EcoOpeningsFileRow = {
	source: string;
	eco: string;
	name: string;
	pgn: string | null;
	uci: string | null;
	epd: string | null;

	// schema v2
	plies?: number;
	positionKey?: string | null;
};

type EcoOpeningsFile = {
	schemaVersion: number;
	source: string;
	sourceUrl: string;
	generatedAtIso: string;
	rows: EcoOpeningsFileRow[];
};

export type EcoOpeningCandidate = {
	eco: string;
	name: string;

	/** Original dataset line (with move numbers). Useful for tooltips/debug. */
	linePgn: string;

	/**
	 * Parsed SAN moves extracted from linePgn (numbers/results removed).
	 *
	 * NOTE:
	 * This is the raw SAN token list extracted from the dataset line.
	 * It is NOT normalized (no stripping of +/#/!! etc). Use `lineSanNormalized` for matching.
	 */
	lineMovesSan: string[];

	/** Number of plies described by the dataset line. */
	linePlies: number;

	/** Stable key of the final position (transposition-safe). */
	positionKey: string | null;

	/**
	 * Pre-normalized SAN line for fast comparisons.
	 * Computed once at catalog load time.
	 */
	lineSanNormalized: string[];

	/**
	 * Alias for `lineMovesSan`.
	 * Kept for compatibility with earlier iterations of the matcher/catalog.
	 */
	lineSan: string[];
};

export type EcoOpeningsCatalog = {
	/** Dataset metadata for diagnostics. */
	meta: {
		source: string;
		sourceUrl: string;
		generatedAtIso: string;
		schemaVersion: number;
	};

	/**
	 * Returns all opening candidates for a given ECO code.
	 * For common codes like A00 there can be many candidates.
	 *
	 * Returns a COPY of the internal array to avoid accidental mutation.
	 */
	getCandidatesByEco(eco: string): EcoOpeningCandidate[];

	/**
	 * Returns all opening candidates from the dataset (across all ECO codes).
	 *
	 * Returns a COPY of the internal array to avoid accidental mutation.
	 */
	getAllCandidates(): EcoOpeningCandidate[];
};

// -----------------------------------------------------------------------------
// Singleton loader
// -----------------------------------------------------------------------------

let inFlight: Promise<EcoOpeningsCatalog> | null = null;

/**
 * Loads and caches the ECO openings catalog (in-memory).
 *
 * Why:
 * - The dataset is static and shipped with the app.
 * - We want fast per-game lookups during imports.
 * - File IO + JSON parsing should happen only once per process.
 */
export function getEcoOpeningsCatalog(): Promise<EcoOpeningsCatalog> {
	if (!inFlight) {
		inFlight = loadEcoOpeningsCatalog().catch((err) => {
			// Reset cache on failure so a later call can retry.
			inFlight = null;
			throw err;
		});
	}
	return inFlight;
}

// -----------------------------------------------------------------------------
// Implementation
// -----------------------------------------------------------------------------

/**
 * Extract SAN move tokens from a compact PGN line.
 *
 * Dataset format example:
 * "1. e4 e5 2. Nf3 Nc6 3. Bb5 a6"
 *
 * We are NOT parsing full PGN, just splitting a "main line" string.
 * We remove move numbers and results.
 */
function parsePgnLineToSanMoves(pgnLine: string): string[] {
	const raw = pgnLine.trim();
	if (!raw) return [];

	const tokens = raw.split(/\s+/g);

	const resultTokens = new Set(['1-0', '0-1', '1/2-1/2', '*']);

	return tokens.filter((t) => {
		// Remove move numbers "1." or "1..."
		if (/^\d+\.$/.test(t)) return false;
		if (/^\d+\.\.\.$/.test(t)) return false;

		// Remove results
		if (resultTokens.has(t)) return false;

		return true;
	});
}

async function loadEcoOpeningsCatalog(): Promise<EcoOpeningsCatalog> {
	const assetsDir = getAssetsDir();
	const datasetPath = path.join(assetsDir, 'eco', 'lichess-chess-openings.json');

	let jsonText: string;
	try {
		jsonText = await fs.readFile(datasetPath, 'utf-8');
	} catch (err) {
		// Keep the app functional even if dataset is missing.
		// Import will simply not enrich opening names.
		console.warn('[ECO] Dataset not found. Opening enrichment will be disabled.', {
			datasetPath,
			error: String((err as any)?.message ?? err),
		});

		return {
			meta: {
				source: 'unknown',
				sourceUrl: '',
				generatedAtIso: '',
				schemaVersion: 0,
			},
			getCandidatesByEco: () => [],
			getAllCandidates: () => [],
		};
	}

	let parsed: EcoOpeningsFile;
	try {
		parsed = JSON.parse(jsonText) as EcoOpeningsFile;
	} catch (err) {
		console.warn('[ECO] Failed to parse dataset JSON. Opening enrichment will be disabled.', {
			datasetPath,
			error: String((err as any)?.message ?? err),
		});

		return {
			meta: {
				source: 'unknown',
				sourceUrl: '',
				generatedAtIso: '',
				schemaVersion: 0,
			},
			getCandidatesByEco: () => [],
			getAllCandidates: () => [],
		};
	}

	const byEco = new Map<string, EcoOpeningCandidate[]>();
	const allCandidates: EcoOpeningCandidate[] = [];

	for (const row of parsed.rows ?? []) {
		if (!row?.eco || !row?.name || !row?.pgn) continue;

		const eco = row.eco.trim();
		const name = row.name.trim();
		const linePgn = row.pgn.trim();

		if (!eco || !name || !linePgn) continue;

		const lineMovesSan = parsePgnLineToSanMoves(linePgn);
		if (lineMovesSan.length === 0) continue;

		// Prefer dataset-provided plies (schema v2), fallback to parsed SAN length.
		const linePlies =
			typeof row.plies === 'number' && Number.isFinite(row.plies) && row.plies > 0
				? row.plies
				: lineMovesSan.length;

		const positionKey = typeof row.positionKey === 'string' ? row.positionKey : null;

		// Pre-normalize SAN line once (used by matchers).
		const lineSanNormalized = normalizeSanLine(lineMovesSan);

		const candidate: EcoOpeningCandidate = {
			eco,
			name,
			linePgn,
			lineMovesSan,
			linePlies,
			positionKey,
			lineSanNormalized,

			// Alias kept for compatibility.
			lineSan: lineMovesSan,
		};

		allCandidates.push(candidate);

		const arr = byEco.get(eco);
		if (arr) arr.push(candidate);
		else byEco.set(eco, [candidate]);
	}

	console.info('[ECO] Dataset loaded', {
		schemaVersion: parsed.schemaVersion,
		source: parsed.source,
		generatedAtIso: parsed.generatedAtIso,
		ecoCodes: byEco.size,
		totalRows: parsed.rows?.length ?? 0,
		datasetPath,
	});

	/**
	 * IMPORTANT:
	 * We return COPIES of the internal arrays to prevent accidental mutation by callers.
	 * Candidate objects themselves are shared (cheap), but lists are not.
	 */
	function getCandidatesByEco(eco: string): EcoOpeningCandidate[] {
		const key = eco.trim();
		const arr = byEco.get(key);
		return arr ? arr.slice() : [];
	}

	function getAllCandidates(): EcoOpeningCandidate[] {
		return allCandidates.slice();
	}

	return {
		meta: {
			source: parsed.source ?? 'unknown',
			sourceUrl: parsed.sourceUrl ?? '',
			generatedAtIso: parsed.generatedAtIso ?? '',
			schemaVersion: parsed.schemaVersion ?? 0,
		},
		getCandidatesByEco,
		getAllCandidates,
	};
}
