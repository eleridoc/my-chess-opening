import type { ExplorerGameHeaders } from 'my-chess-opening-core/explorer';

import type {
	GameInfoOpeningVm,
	GameInfoPlayerVm,
	GameInfoResultVm,
	GameInfoSiteVm,
	GameRatedKey,
	GameResultKey,
	GameResultTone,
	GameSpeedKey,
	GameTimeControlVm,
	PlayerSide,
} from '../view-models/game-info-header.vm';

/**
 * Explorer "game-info" builders (pure functions).
 *
 * Goals:
 * - Keep ExplorerFacade smaller and focused on orchestration (signals, session, loaders).
 * - Provide deterministic, easily testable VM builders (no Angular dependencies, no side effects).
 * - Preserve behavior: code here is a direct extraction from ExplorerFacade.
 */

function isHttpUrl(v: string | undefined): boolean {
	return !!v && /^https?:\/\//i.test(v.trim());
}

/**
 * Picks the first valid HTTP(S) URL from the provided candidates.
 * Returns undefined when no candidate is a valid URL.
 */
function pickFirstHttpUrl(...candidates: Array<string | undefined | null>): string | undefined {
	for (const c of candidates) {
		const s = (c ?? '').trim();
		if (s && isHttpUrl(s)) return s;
	}
	return undefined;
}

/**
 * Returns a UI tone for the result:
 * - good/bad depend on whether the user (myColor) won or lost
 * - neutral for draws
 * - normal for unknown/ongoing/no perspective
 */
function computeResultTone(result?: string, myColor?: 'white' | 'black'): GameResultTone {
	if (!myColor) return 'normal';

	if (result === '1/2-1/2') return 'neutral';

	if (result === '1-0') return myColor === 'white' ? 'good' : 'bad';
	if (result === '0-1') return myColor === 'black' ? 'good' : 'bad';

	return 'normal';
}

export function toSpeedKey(speed: ExplorerGameHeaders['speed'] | undefined): GameSpeedKey {
	if (speed === 'bullet') return 'bullet';
	if (speed === 'blitz') return 'blitz';
	if (speed === 'rapid') return 'rapid';
	if (speed === 'classical') return 'classical';
	return 'unknown';
}

export function toRatedKey(rated: boolean | undefined): GameRatedKey {
	if (rated === true) return 'rated';
	if (rated === false) return 'casual';
	return 'unknown';
}

export function buildGameInfoPlayerVm(
	side: PlayerSide,
	headers: ExplorerGameHeaders | null,
	myColor?: PlayerSide,
): GameInfoPlayerVm {
	const nameRaw = side === 'white' ? headers?.white : headers?.black;
	const eloRaw = side === 'white' ? headers?.whiteElo : headers?.blackElo;

	const name = (nameRaw ?? '').trim() || (side === 'white' ? 'White' : 'Black');
	const elo = (eloRaw ?? '').trim() || undefined;

	const isMe = myColor === side;

	return { name, ...(elo ? { elo } : {}), ...(isMe ? { isMe: true } : {}) };
}

/**
 * Builds a structured time control VM.
 *
 * Goals:
 * - Keep numeric fields when known (DB snapshot).
 * - Accept PGN raw strings (e.g. "900+10" or "15+10").
 * - Provide a normalized display hint (text) when we can safely do so.
 */
export function buildTimeControlVm(
	headers: ExplorerGameHeaders | null,
): GameTimeControlVm | undefined {
	if (!headers) return undefined;

	const a = headers.initialSeconds;
	const b = headers.incrementSeconds;

	// DB snapshots usually have preferred numeric values.
	if (typeof a === 'number' && typeof b === 'number') {
		const minutes = Math.round(a / 60);
		return { initialSeconds: a, incrementSeconds: b, text: `${minutes}+${b}` };
	}

	const raw = (headers.timeControl ?? '').trim();
	if (!raw) return undefined;

	const m = raw.match(/^(\d+)\+(\d+)$/);
	if (!m) return { raw };

	const initial = Number(m[1]);
	const inc = Number(m[2]);

	if (!Number.isFinite(initial) || !Number.isFinite(inc)) return { raw };

	// Heuristics:
	// - If initial is divisible by 60 and >= 60, it is likely seconds (e.g. "900+10").
	// - If initial < 60, it is likely minutes (e.g. "15+10").
	if (initial >= 60 && initial % 60 === 0) {
		return {
			initialSeconds: initial,
			incrementSeconds: inc,
			raw,
			text: `${initial / 60}+${inc}`,
		};
	}

	if (initial < 60) {
		return {
			initialSeconds: initial * 60,
			incrementSeconds: inc,
			raw,
			text: `${initial}+${inc}`,
		};
	}

	// Unknown unit: keep structured values but don't force a formatted hint.
	return { initialSeconds: initial, incrementSeconds: inc, raw };
}

function inferSiteKey(label?: string, url?: string): 'lichess' | 'chesscom' | 'unknown' {
	const a = (label ?? '').toLowerCase();
	const b = (url ?? '').toLowerCase();

	if (b.includes('lichess.org') || a.includes('lichess')) return 'lichess';
	if (b.includes('chess.com') || a.includes('chess.com') || a.includes('chesscom'))
		return 'chesscom';

	return 'unknown';
}

export function buildSiteVm(headers: ExplorerGameHeaders | null): GameInfoSiteVm | undefined {
	if (!headers) return undefined;

	const rawSite = (headers.site ?? '').trim();
	const rawSiteIsUrl = isHttpUrl(rawSite);

	// When "Site" is an URL (common for Lichess PGN), treat it as URL, not as label.
	const label = rawSite && !rawSiteIsUrl ? rawSite : undefined;

	// Prefer an explicit siteUrl, then fallback to Site if it is an URL.
	const url = pickFirstHttpUrl(headers.siteUrl, rawSite);

	if (!label && !url) return undefined;

	return {
		siteKey: inferSiteKey(label, url),
		...(label ? { label } : {}),
		...(url ? { url } : {}),
	};
}

function toResultKey(result?: string): GameResultKey {
	if (result === '1-0') return 'white_win';
	if (result === '0-1') return 'black_win';
	if (result === '1/2-1/2') return 'draw';
	if (result === '*') return 'ongoing';
	return 'unknown';
}

export function buildResultVm(
	resultRaw: string | undefined,
	myColor?: 'white' | 'black',
): GameInfoResultVm {
	const raw = resultRaw && resultRaw.length ? resultRaw : undefined;
	const key = toResultKey(raw);

	return {
		key,
		...(raw ? { raw } : {}),
		tone: computeResultTone(raw, myColor),
	};
}

export function buildOpeningVm(headers: ExplorerGameHeaders | null): GameInfoOpeningVm | undefined {
	if (!headers) return undefined;

	const providerEco = (headers.eco ?? '').trim() || undefined;
	const determinedEco = (headers.ecoDetermined ?? '').trim() || undefined;

	// Prefer determined ECO when available (dataset-based)
	const eco = (determinedEco ?? providerEco)?.trim() || undefined;

	const providerName = (headers.opening ?? '').trim() || undefined;
	const deducedName = (headers.ecoOpeningName ?? '').trim() || undefined;

	// Prefer provider opening name, fallback to deduced one
	const name = (providerName ?? deducedName)?.trim() || undefined;

	if (!name && !eco) return undefined;

	const ecoIsDeduced = Boolean(determinedEco && providerEco && determinedEco !== providerEco);
	const nameIsDeduced = Boolean(!providerName && deducedName);

	return {
		...(name ? { name } : {}),
		...(eco ? { eco } : {}),

		ecoIsDeduced,
		nameIsDeduced,

		// Optional: useful for tooltip/details when eco differs
		providerEco: ecoIsDeduced ? providerEco : undefined,
	};
}
