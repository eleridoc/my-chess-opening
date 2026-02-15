/**
 * Fetches the Lichess chess-openings TSV files (a.tsv..e.tsv) and generates a bundled JSON asset.
 *
 * Why:
 * - We want a small, deterministic, versionable dataset shipped with the app.
 * - Seed happens locally on first launch.
 *
 * Notes:
 * - The TSV files contain: eco, name, pgn (no uci/epd in these raw files).
 * - We keep uci/epd fields in the JSON as null for forward compatibility.
 *
 * Source repo: https://github.com/lichess-org/chess-openings (CC0)
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import https from 'node:https';
import { Chess } from 'chess.js';

type EcoRow = {
	source: 'lichess-chess-openings';
	eco: string;
	name: string;
	pgn: string | null;
	uci: string | null;
	epd: string | null;
	plies: number;
	positionKey: string | null;
};

type OutputFile = {
	schemaVersion: 2;
	source: 'lichess-chess-openings';
	sourceUrl: string;
	generatedAtIso: string;
	rows: EcoRow[];
};

const RAW_BASE = 'https://raw.githubusercontent.com/lichess-org/chess-openings/master';

const FILES = ['a.tsv', 'b.tsv', 'c.tsv', 'd.tsv', 'e.tsv'] as const;

const OUTPUT_PATH = path.resolve(process.cwd(), 'electron/assets/eco/lichess-chess-openings.json');

const SOURCE_URL = 'https://github.com/lichess-org/chess-openings';

function downloadText(url: string): Promise<string> {
	return new Promise((resolve, reject) => {
		https
			.get(url, (res) => {
				if (!res.statusCode || res.statusCode < 200 || res.statusCode >= 300) {
					reject(new Error(`Download failed (${res.statusCode ?? 'unknown'}): ${url}`));
					res.resume();
					return;
				}

				res.setEncoding('utf8');

				let data = '';
				res.on('data', (chunk) => (data += chunk));
				res.on('end', () => resolve(data));
			})
			.on('error', reject);
	});
}

function toIsoNow(): string {
	return new Date().toISOString();
}

function parseTsv(content: string): Array<{ eco: string; name: string; pgn: string }> {
	const lines = content
		.replace(/^\uFEFF/, '') // Strip BOM if present
		.split('\n')
		.map((l) => l.trim())
		.filter((l) => l.length > 0);

	const rows: Array<{ eco: string; name: string; pgn: string }> = [];

	for (const line of lines) {
		// TSV format: eco \t name \t pgn
		const parts = line.split('\t');

		if (parts.length < 2) continue;

		const eco = (parts[0] ?? '').trim();
		const name = (parts[1] ?? '').trim();
		const pgn = (parts.slice(2).join('\t') ?? '').trim();

		// Basic validation to catch corrupted lines.
		if (!/^[A-E][0-9]{2}$/.test(eco)) continue;
		if (!name) continue;

		rows.push({ eco, name, pgn: pgn || '' });
	}

	return rows;
}

async function ensureDir(filePath: string): Promise<void> {
	await fs.mkdir(path.dirname(filePath), { recursive: true });
}

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

/**
 * Compute a stable "position key" from a final FEN, ignoring clocks.
 * We keep only the first 4 FEN fields:
 * - piece placement
 * - active color
 * - castling rights
 * - en-passant square
 *
 * This makes the key transposition-safe (order of moves does not matter as long as
 * the final position is the same).
 */
function fenToPositionKey(fen: string): string | null {
	const parts = fen.trim().split(/\s+/g);
	if (parts.length < 4) return null;

	const board = parts[0];
	const turn = parts[1];
	const castling = parts[2] || '-';
	const ep = parts[3] || '-';

	return `${board} ${turn} ${castling} ${ep}`;
}

function computePositionKeyFromSanMoves(movesSan: string[]): string | null {
	try {
		const chess = new Chess();

		for (const san of movesSan) {
			const res = chess.move(san, { strict: true });
			if (!res) return null;
		}

		return fenToPositionKey(chess.fen());
	} catch {
		return null;
	}
}

async function main(): Promise<void> {
	console.log('[eco] Generating bundled dataset from Lichess TSV files...');

	const all: EcoRow[] = [];

	for (const file of FILES) {
		const url = `${RAW_BASE}/${file}`;
		console.log(`[eco] Downloading ${url}`);
		const tsv = await downloadText(url);
		const parsed = parseTsv(tsv);

		for (const row of parsed) {
			const pgn = row.pgn || null;

			let plies = 0;
			let positionKey: string | null = null;

			if (pgn) {
				const sanMoves = parsePgnLineToSanMoves(pgn);
				plies = sanMoves.length;
				positionKey = plies > 0 ? computePositionKeyFromSanMoves(sanMoves) : null;

				// Keep this best-effort: if positionKey is null, we can still do prefix matching later.
				// Do not fail the generation because of a few problematic lines.
				if (!positionKey) {
					console.warn('[eco] positionKey not computed (will rely on prefix matching):', {
						eco: row.eco,
						name: row.name,
						pgn,
					});
				}
			}

			all.push({
				source: 'lichess-chess-openings',
				eco: row.eco,
				name: row.name,
				pgn,
				uci: null,
				epd: null,
				plies,
				positionKey,
			});
		}
	}

	// Deterministic ordering -> stable diffs in git.
	all.sort((a, b) => {
		if (a.eco !== b.eco) return a.eco.localeCompare(b.eco);
		return a.name.localeCompare(b.name);
	});

	const output: OutputFile = {
		schemaVersion: 2,
		source: 'lichess-chess-openings',
		sourceUrl: SOURCE_URL,
		generatedAtIso: toIsoNow(),
		rows: all,
	};

	await ensureDir(OUTPUT_PATH);
	await fs.writeFile(OUTPUT_PATH, JSON.stringify(output, null, 2) + '\n', 'utf8');

	console.log(`[eco] Done. Rows: ${all.length}`);
	console.log(`[eco] Wrote: ${OUTPUT_PATH}`);
}

main().catch((err) => {
	console.error('[eco] Failed:', err);
	process.exitCode = 1;
});
