import type {
	StockfishBestMoveLine,
	StockfishInfoLine,
	StockfishUciScore,
} from './stockfishUciTypes';

function readIntegerAfter(tokens: string[], tokenName: string): number | null {
	const index = tokens.indexOf(tokenName);

	if (index < 0 || index + 1 >= tokens.length) {
		return null;
	}

	const value = Number.parseInt(tokens[index + 1], 10);

	return Number.isFinite(value) ? value : null;
}

function parseScore(tokens: string[]): StockfishUciScore | null {
	const scoreIndex = tokens.indexOf('score');

	if (scoreIndex < 0 || scoreIndex + 2 >= tokens.length) {
		return null;
	}

	const scoreType = tokens[scoreIndex + 1];
	const rawValue = Number.parseInt(tokens[scoreIndex + 2], 10);

	if (!Number.isFinite(rawValue)) {
		return null;
	}

	if (scoreType === 'cp') {
		return {
			cp: rawValue,
			mate: null,
		};
	}

	if (scoreType === 'mate') {
		return {
			cp: null,
			mate: rawValue,
		};
	}

	return null;
}

function parsePrincipalVariation(tokens: string[]): string[] {
	const pvIndex = tokens.indexOf('pv');

	if (pvIndex < 0 || pvIndex + 1 >= tokens.length) {
		return [];
	}

	return tokens.slice(pvIndex + 1);
}

/**
 * Parse a Stockfish `info ...` line.
 *
 * Example:
 * `info depth 12 seldepth 16 multipv 1 score cp 34 nodes 12345 pv e2e4 e7e5`
 */
export function parseStockfishInfoLine(line: string): StockfishInfoLine | null {
	const trimmedLine = line.trim();

	if (!trimmedLine.startsWith('info ')) {
		return null;
	}

	const tokens = trimmedLine.split(/\s+/);

	return {
		depth: readIntegerAfter(tokens, 'depth'),
		multiPv: readIntegerAfter(tokens, 'multipv'),
		score: parseScore(tokens),
		principalVariationUci: parsePrincipalVariation(tokens),
		rawLine: trimmedLine,
	};
}

/**
 * Parse a Stockfish `bestmove ...` line.
 *
 * Examples:
 * - `bestmove e2e4 ponder e7e5`
 * - `bestmove e2e4`
 * - `bestmove (none)`
 */
export function parseStockfishBestMoveLine(line: string): StockfishBestMoveLine | null {
	const trimmedLine = line.trim();

	if (!trimmedLine.startsWith('bestmove ')) {
		return null;
	}

	const tokens = trimmedLine.split(/\s+/);
	const rawBestMove = tokens[1] ?? null;

	const ponderIndex = tokens.indexOf('ponder');
	const rawPonderMove =
		ponderIndex >= 0 && ponderIndex + 1 < tokens.length ? tokens[ponderIndex + 1] : null;

	return {
		bestMoveUci: rawBestMove && rawBestMove !== '(none)' ? rawBestMove : null,
		ponderUci: rawPonderMove && rawPonderMove !== '(none)' ? rawPonderMove : null,
		rawLine: trimmedLine,
	};
}

export function parseStockfishIdNameLine(line: string): string | null {
	const prefix = 'id name ';

	if (!line.startsWith(prefix)) {
		return null;
	}

	const name = line.slice(prefix.length).trim();

	return name.length > 0 ? name : null;
}

export function extractStockfishVersionFromName(engineName: string): string | null {
	const normalizedName = engineName.trim();

	if (!normalizedName.toLowerCase().startsWith('stockfish')) {
		return null;
	}

	const version = normalizedName.replace(/^stockfish\s*/i, '').trim();

	return version.length > 0 ? version : null;
}
