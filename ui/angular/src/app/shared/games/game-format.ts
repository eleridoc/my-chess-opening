import type { GamesListItem, ResultKey } from 'my-chess-opening-core';

export function ratedKey(rated: boolean): 'rated' | 'casual' {
	return rated ? 'rated' : 'casual';
}

// UI-only labels for now (later: i18n)
export function ratedLabel(rated: boolean): string {
	return rated ? 'Rated' : 'Casual';
}

export function openingLabel(opening: string | null | undefined): string {
	return opening ?? '(unknown)';
}

export function myResultSymbolFromKey(key: ResultKey | null | undefined): string {
	if (key === 1) return '1';
	if (key === 0) return '1/2';
	if (key === -1) return '0';
	return '—';
}

export function parseTimeControl(tc: string): { mins: string; inc: string } {
	const raw = (tc ?? '').trim();
	if (!raw) return { mins: '—', inc: '—' };

	const m = raw.match(/^(\d+)\s*(?:\+|\|)\s*(\d+)$/);
	if (!m) return { mins: raw, inc: '—' };

	const a = Number(m[1]);
	const b = Number(m[2]);

	const mins =
		a > 60
			? (a % 60 === 0 ? String(a / 60) : String(Math.round((a / 60) * 10) / 10)).replace(/\.0$/, '')
			: String(a);

	return { mins, inc: String(b) };
}

export function timeLabel(tc: string): string {
	const t = parseTimeControl(tc);
	return `${t.mins} | ${t.inc}`;
}

export function myResultLabel(g: GamesListItem): string {
	return myResultSymbolFromKey(g.myResultKey);
}
