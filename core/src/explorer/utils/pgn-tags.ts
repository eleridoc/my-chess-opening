import type { ExplorerGameHeaders } from '../types';

/**
 * PGN tag parsing + mapping helpers (CORE)
 *
 * Responsibilities:
 * - Parse PGN header tag pairs into a simple dictionary (PgnTags).
 * - Map best-effort PGN tags into ExplorerGameHeaders (UI-friendly, source-agnostic).
 *
 * Notes:
 * - Keep this file dependency-free (no DOM, no external libs).
 * - Prefer additive changes: many PGN exports vary between providers.
 */

export type PgnTags = Record<string, string>;

const TAG_LINE_RE = /^\s*\[([A-Za-z0-9_]+)\s+"((?:\\.|[^"\\])*)"\s*\]\s*$/;

function unescapeTagValue(v: string): string {
	return v.replace(/\\"/g, '"').replace(/\\\\/g, '\\').trim();
}

export function parsePgnTags(pgn: string): PgnTags {
	const tags: PgnTags = {};
	const lines = (pgn ?? '').split(/\r?\n/);

	for (const line of lines) {
		const trimmed = line.trim();
		if (!trimmed) continue;

		// Stop at movetext (first non-tag line after headers).
		if (!trimmed.startsWith('[')) break;

		const m = TAG_LINE_RE.exec(trimmed);
		if (!m) continue;

		const key = m[1];
		const value = unescapeTagValue(m[2] ?? '');
		if (value.length) tags[key] = value;
	}

	return tags;
}

function asResult(v: string | undefined): ExplorerGameHeaders['result'] | undefined {
	if (v === '1-0' || v === '0-1' || v === '1/2-1/2' || v === '*') return v;
	return undefined;
}

function clean(v: string | undefined): string | undefined {
	const s = (v ?? '').trim();
	return s.length ? s : undefined;
}

function isHttpUrl(v: string | undefined): boolean {
	const s = (v ?? '').trim();
	return /^https?:\/\//i.test(s);
}

/**
 * Best-effort mapping of PGN tags into normalized ExplorerGameHeaders.
 *
 * Provider quirks:
 * - Lichess: [Site] is usually an URL (https://lichess.org/xxxx).
 * - Chess.com: [Site] is often "Chess.com" and the actual game URL is in [Link "..."].
 * - Time control: typically "900+10" (seconds), but sometimes other formats exist.
 * - Date/Time: prefer [UTCDate]/[UTCTime], fallback to [Date]/[StartTime] when present.
 */
export function mapPgnTagsToExplorerHeaders(tags: PgnTags): ExplorerGameHeaders {
	const tc = parseTimeControlToSeconds(tags.TimeControl);

	const event = clean(tags.Event);
	const eventLower = (event ?? '').toLowerCase();

	// "Rated" is not reliably present for all providers; keep it best-effort.
	const rated = eventLower.includes('rated')
		? true
		: eventLower.includes('casual')
			? false
			: undefined;

	// Normalize speed labels for UI consumption.
	let speed: ExplorerGameHeaders['speed'] = eventLower.includes('bullet')
		? 'bullet'
		: eventLower.includes('blitz')
			? 'blitz'
			: eventLower.includes('rapid')
				? 'rapid'
				: eventLower.includes('classical')
					? 'classical'
					: undefined;

	if (!speed) speed = inferSpeedFromSeconds(tc.initialSeconds);

	// Site + URL mapping:
	// - Prefer Site when it is already an URL
	// - Otherwise fallback to Link if it is an URL
	const siteRaw = clean(tags.Site);
	const linkRaw = clean(tags.Link);

	const siteUrl = isHttpUrl(siteRaw) ? siteRaw : isHttpUrl(linkRaw) ? linkRaw : undefined;

	// Build a UTC ISO timestamp (playedAtIso) when both date + time are available.
	const d = parsePgnUtcDate(tags.UTCDate ?? tags.Date);
	const t = parsePgnUtcTime(tags.UTCTime ?? tags.StartTime);
	const playedAtIso = d && t ? toUtcIso(d, t) : undefined;

	return {
		playedAtIso: clean(playedAtIso),
		round: clean(tags.Round),

		white: clean(tags.White),
		black: clean(tags.Black),
		result: asResult(clean(tags.Result)),

		eco: clean(tags.ECO),
		opening: clean(tags.Opening),

		whiteElo: clean(tags.WhiteElo),
		blackElo: clean(tags.BlackElo),

		event,
		site: siteRaw,
		siteUrl,

		rated,
		speed,

		timeControl: tc.timeControl,
		initialSeconds: tc.initialSeconds,
		incrementSeconds: tc.incrementSeconds,

		variant: clean(tags.Variant),
	};
}

function parseTimeControlToSeconds(raw: string | undefined): {
	initialSeconds?: number;
	incrementSeconds?: number;
	timeControl?: string;
} {
	const s = (raw ?? '').trim();
	if (!s || s === '-' || s === '?' || s.toLowerCase() === 'unknown') return {};

	// Common format: "900+10" (seconds) or "15+10" (minutes+seconds, sometimes).
	const m = /^(\d+)\s*\+\s*(\d+)$/.exec(s);
	if (m) {
		const a = Number(m[1]);
		const b = Number(m[2]);
		if (Number.isFinite(a) && Number.isFinite(b)) {
			// Heuristic: if a is huge, it's seconds; if small (<= 180), it could be minutes.
			// We keep raw in timeControl and only set seconds when it looks like seconds.
			const looksLikeSeconds = a >= 180;
			return {
				timeControl: s,
				initialSeconds: looksLikeSeconds ? a : undefined,
				incrementSeconds: looksLikeSeconds ? b : undefined,
			};
		}
	}

	// Single number: "600" => seconds
	const n = Number(s);
	if (Number.isFinite(n) && n > 0)
		return { timeControl: s, initialSeconds: n, incrementSeconds: 0 };

	return { timeControl: s };
}

function inferSpeedFromSeconds(
	initialSeconds?: number,
): 'bullet' | 'blitz' | 'rapid' | 'classical' | undefined {
	if (typeof initialSeconds !== 'number' || !Number.isFinite(initialSeconds)) return undefined;

	if (initialSeconds <= 180) return 'bullet';
	if (initialSeconds <= 600) return 'blitz';
	if (initialSeconds <= 1800) return 'rapid';
	return 'classical';
}

function parsePgnUtcDate(v: string | undefined): { y: number; m: number; d: number } | null {
	const s = clean(v);
	if (!s) return null;

	// Expected format: "YYYY.MM.DD"
	const m = /^(\d{4})\.(\d{2})\.(\d{2})$/.exec(s);
	if (!m) return null;

	const y = Number(m[1]);
	const mo = Number(m[2]);
	const d = Number(m[3]);
	if (!Number.isFinite(y) || !Number.isFinite(mo) || !Number.isFinite(d)) return null;

	return { y, m: mo, d };
}

function parsePgnUtcTime(v: string | undefined): { hh: number; mm: number; ss: number } | null {
	const s = clean(v);
	if (!s) return null;

	// Expected formats: "HH:MM" or "HH:MM:SS"
	const m = /^(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(s);
	if (!m) return null;

	const hh = Number(m[1]);
	const mm = Number(m[2]);
	const ss = m[3] != null ? Number(m[3]) : 0;
	if ([hh, mm, ss].some((n) => !Number.isFinite(n))) return null;

	return { hh, mm, ss };
}

function toUtcIso(
	date: { y: number; m: number; d: number },
	time: { hh: number; mm: number; ss: number },
): string {
	// JS months are 0-based
	const dt = new Date(Date.UTC(date.y, date.m - 1, date.d, time.hh, time.mm, time.ss));
	return dt.toISOString(); // Includes milliseconds + "Z"
}
