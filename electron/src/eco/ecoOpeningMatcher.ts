import type { EcoOpeningCandidate } from './ecoOpeningsCatalog';
import { normalizeSanLine } from './ecoSan';

export type EcoOpeningMatch = {
	eco: string;
	name: string;
	linePgn: string;
	matchPly: number;
	linePlies: number;
	positionKey: string | null;
};

/**
 * Minimum ply count required for a GLOBAL scan match (across all ECO codes).
 *
 * Why:
 * Early moves are extremely generic and would otherwise produce many false positives
 * (e.g. "d4 d5 c4 ...").
 */
export const DEFAULT_MIN_GLOBAL_MATCH_PLY = 6;

/**
 * Compute how many plies match from the start of the line.
 *
 * We compare normalized SAN token-by-token:
 * - stop at first mismatch
 * - return the number of matching tokens (plies)
 */
function computeMatchPly(
	gameMovesSanNormalized: readonly string[],
	lineSanNormalized: readonly string[],
): number {
	const max = Math.min(gameMovesSanNormalized.length, lineSanNormalized.length);
	let i = 0;

	for (; i < max; i += 1) {
		if (gameMovesSanNormalized[i] !== lineSanNormalized[i]) {
			break;
		}
	}

	return i;
}

function isBetterMatch(
	candidate: EcoOpeningCandidate,
	matchPly: number,
	best: EcoOpeningMatch | null,
): boolean {
	if (!best) return true;

	if (matchPly > best.matchPly) return true;
	if (matchPly < best.matchPly) return false;

	// Tie-breaker: prefer more specific lines (longer described line).
	// This tends to pick the most precise opening name when the prefix is identical.
	const candidateLen = candidate.linePlies;
	const bestLen = best.linePlies;

	if (candidateLen > bestLen) return true;
	if (candidateLen < bestLen) return false;

	// Stable fallback: keep the first seen.
	return false;
}

/**
 * Finds the best opening match among a list of candidates (typically restricted to one ECO code).
 *
 * NOTE:
 * This function does NOT enforce a minimum ply threshold by default.
 * When candidates are already filtered by ECO, even short matches can be useful.
 */
export function findBestEcoOpeningMatch(
	gameMovesSan: readonly string[],
	candidates: readonly EcoOpeningCandidate[],
): EcoOpeningMatch | null {
	return findBestEcoOpeningMatchInternal(gameMovesSan, candidates, 1);
}

/**
 * Finds the best opening match by scanning the full dataset (all ECO codes).
 *
 * This is used as a fallback when provider ECO is inconsistent with the move sequence.
 */
export function findBestEcoOpeningMatchGlobal(
	gameMovesSan: readonly string[],
	allCandidates: readonly EcoOpeningCandidate[],
	options?: { minMatchPly?: number },
): EcoOpeningMatch | null {
	const minMatchPly = options?.minMatchPly ?? DEFAULT_MIN_GLOBAL_MATCH_PLY;
	return findBestEcoOpeningMatchInternal(gameMovesSan, allCandidates, minMatchPly);
}

function findBestEcoOpeningMatchInternal(
	gameMovesSan: readonly string[],
	candidates: readonly EcoOpeningCandidate[],
	minMatchPly: number,
): EcoOpeningMatch | null {
	if (!gameMovesSan.length || !candidates.length) return null;

	// Normalize game moves once (performance).
	const gameMovesSanNormalized = normalizeSanLine(gameMovesSan);

	let best: EcoOpeningMatch | null = null;

	for (const c of candidates) {
		// Candidate SAN is already normalized at catalog load time.
		const matchPly = computeMatchPly(gameMovesSanNormalized, c.lineSanNormalized);

		if (matchPly < minMatchPly) continue;

		if (isBetterMatch(c, matchPly, best)) {
			best = {
				eco: c.eco,
				name: c.name,
				linePgn: c.linePgn,
				matchPly,
				linePlies: c.linePlies,
				positionKey: c.positionKey,
			};
		}
	}

	return best;
}
