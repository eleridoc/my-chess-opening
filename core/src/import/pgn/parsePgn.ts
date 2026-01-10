import { ImportedGameMove } from '../types';

export type ParsedPgnGame = {
	headers: Record<string, string>;
	movesText: string; // raw moves section (after headers)
	moves?: ImportedGameMove[];
};

function parseHeaders(pgn: string): { headers: Record<string, string>; bodyStartIndex: number } {
	const headers: Record<string, string> = {};
	const lines = pgn.split(/\r?\n/);

	let i = 0;
	for (; i < lines.length; i++) {
		const line = lines[i].trim();
		if (!line) {
			// first empty line after headers
			i++;
			break;
		}
		const m = line.match(/^\[([A-Za-z0-9_]+)\s+"(.*)"\]$/);
		if (m) headers[m[1]] = m[2];
	}

	// bodyStartIndex in original string
	const body = lines.slice(i).join('\n');
	const headerPart = lines.slice(0, i).join('\n');
	const bodyStartIndex = headerPart.length;
	return { headers, bodyStartIndex };
}

function clockToMs(clockStr: string): number | undefined {
	// Examples:
	// "0:15:07" or "0:15:15.2"
	const m = clockStr.trim().match(/^(\d+):(\d+):(\d+)(?:\.(\d+))?$/);
	if (!m) return undefined;
	const h = Number(m[1]);
	const min = Number(m[2]);
	const sec = Number(m[3]);
	const frac = m[4] ? Number(`0.${m[4]}`) : 0;
	const totalMs = Math.round((h * 3600 + min * 60 + sec + frac) * 1000);
	return Number.isFinite(totalMs) ? totalMs : undefined;
}

function extractClockMs(comment: string | undefined): number | undefined {
	if (!comment) return undefined;
	// Handles "{[%clk 0:15:07]}" and "{ [%clk 0:15:00] }"
	const m = comment.match(/%clk\s+(\d+:\d+:\d+(?:\.\d+)?)/);
	if (!m) return undefined;
	return clockToMs(m[1]);
}

function parseMovesWithClocks(movesText: string): ImportedGameMove[] {
	// This is intentionally pragmatic for chess.com + lichess exports:
	// pattern like: "1. e4 {[%clk 0:15:00]} 1... e5 {[%clk 0:15:00]} ..."
	// We ignore variations/comments besides clock tags.
	const moves: ImportedGameMove[] = [];

	const tokenRe = /(\d+)\.(\.\.)?\s+([^\s{]+)\s*(\{[^}]*\})?/g;
	let ply = 1;
	let match: RegExpExecArray | null;

	while ((match = tokenRe.exec(movesText)) !== null) {
		const san = match[3];
		const comment = match[4];
		// Ignore results token if it appears as "1-0" etc (rare in this pattern, but safe)
		if (san === '1-0' || san === '0-1' || san === '1/2-1/2' || san === '*') continue;

		moves.push({
			ply,
			san,
			clockMs: extractClockMs(comment),
		});
		ply++;
	}

	return moves;
}

export function parsePgnGame(pgn: string, includeMoves: boolean): ParsedPgnGame {
	const { headers } = parseHeaders(pgn);

	// Moves section = everything after the last header line + blank line.
	// We'll just remove header lines from the start.
	const movesText = pgn
		.split(/\r?\n/)
		.filter((l) => !l.trim().startsWith('['))
		.join('\n')
		.trim();

	const parsed: ParsedPgnGame = {
		headers,
		movesText,
	};

	if (includeMoves) {
		parsed.moves = parseMovesWithClocks(movesText);
	}

	return parsed;
}
