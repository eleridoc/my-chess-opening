import type { ImportedGameRaw } from 'my-chess-opening-core';

import type { EcoOpeningsCatalog } from '../../eco/ecoOpeningsCatalog';
import {
	findBestEcoOpeningMatch,
	findBestEcoOpeningMatchGlobal,
	DEFAULT_MIN_GLOBAL_MATCH_PLY,
} from '../../eco/ecoOpeningMatcher';

/**
 * Debug flag for ECO enrichment diagnostics.
 * Enable by setting: MCO_ECO_DEBUG=1
 */
const ECO_DEBUG = process.env.MCO_ECO_DEBUG === '1';

export type EcoEnrichmentResult = {
	ecoDetermined: string | null;
	ecoOpeningName: string | null;
	ecoOpeningLinePgn: string | null;
	ecoOpeningMatchPly: number | null;
};

/**
 * Best-effort ECO enrichment based on the bundled openings dataset.
 *
 * IMPORTANT:
 * - Must NEVER throw (import must not fail because of ECO).
 * - Never overwrite provider `opening` / `eco` fields.
 * - `ecoDetermined` is the app-derived ECO (may differ from provider).
 */
export function enrichEcoFields(params: {
	game: ImportedGameRaw;
	ecoCatalog: EcoOpeningsCatalog;
}): EcoEnrichmentResult {
	const { game, ecoCatalog } = params;

	let ecoOpeningName: string | null = null;
	let ecoOpeningLinePgn: string | null = null;
	let ecoOpeningMatchPly: number | null = null;
	let ecoDetermined: string | null = null;

	try {
		const providerEcoRaw = typeof game.eco === 'string' ? game.eco.trim() : '';
		const providerEco = providerEcoRaw.length > 0 ? providerEcoRaw : null;

		// Default:
		// - if provider ECO exists: keep it
		// - else: null until proven by a global match
		ecoDetermined = providerEco;

		const hasMoves = Boolean(game.moves?.length);
		if (!hasMoves) {
			if (ECO_DEBUG) {
				console.warn('[ECO][debug] Determine ECO skipped (no moves).', {
					gameRef: `${game.site}:${game.externalId}`,
					providerEco,
					hasOpeningHeader: Boolean(game.opening),
				});
			}

			return {
				ecoDetermined,
				ecoOpeningName,
				ecoOpeningLinePgn,
				ecoOpeningMatchPly,
			};
		}

		const gameMovesSan = (game.moves ?? []).map((m) => m.san);

		if (providerEco) {
			const candidates = ecoCatalog.getCandidatesByEco(providerEco);

			if (ECO_DEBUG) {
				console.warn('[ECO][debug] Provider ECO bucket check', {
					gameRef: `${game.site}:${game.externalId}`,
					providerEco,
					movesCount: gameMovesSan.length,
					candidatesCount: candidates.length,
					hasOpeningHeader: Boolean(game.opening),
				});
			}

			const providerMatch =
				candidates.length > 0 ? findBestEcoOpeningMatch(gameMovesSan, candidates) : null;

			if (providerMatch) {
				ecoDetermined = providerEco;
				ecoOpeningName = providerMatch.name;
				ecoOpeningLinePgn = providerMatch.linePgn;
				ecoOpeningMatchPly = providerMatch.matchPly;

				if (ECO_DEBUG) {
					console.warn('[ECO][debug] Provider ECO match OK', {
						gameRef: `${game.site}:${game.externalId}`,
						providerEco,
						ecoDetermined,
						name: ecoOpeningName,
						matchPly: ecoOpeningMatchPly,
					});
				}
			} else {
				// Global scan fallback
				const allCandidates = (((ecoCatalog as any).getAllCandidates?.() as unknown[]) ??
					[]) as any[];

				if (ECO_DEBUG) {
					console.warn('[ECO][debug] Provider ECO no match -> global scan', {
						gameRef: `${game.site}:${game.externalId}`,
						providerEco,
						allCandidatesCount: allCandidates.length,
						minMatchPly: DEFAULT_MIN_GLOBAL_MATCH_PLY,
					});
				}

				const globalMatch =
					allCandidates.length > 0
						? findBestEcoOpeningMatchGlobal(gameMovesSan, allCandidates as any, {
								minMatchPly: DEFAULT_MIN_GLOBAL_MATCH_PLY,
							})
						: null;

				if (globalMatch) {
					ecoDetermined = globalMatch.eco;
					ecoOpeningName = globalMatch.name;
					ecoOpeningLinePgn = globalMatch.linePgn;
					ecoOpeningMatchPly = globalMatch.matchPly;

					if (ECO_DEBUG) {
						console.warn('[ECO][debug] Global match found (provider mismatch)', {
							gameRef: `${game.site}:${game.externalId}`,
							providerEco,
							ecoDetermined,
							name: ecoOpeningName,
							matchPly: ecoOpeningMatchPly,
						});
					}
				} else if (ECO_DEBUG) {
					console.warn('[ECO][debug] Global scan failed, keep provider ECO', {
						gameRef: `${game.site}:${game.externalId}`,
						providerEco,
						ecoDetermined,
						sampleMoves: gameMovesSan.slice(0, 16),
					});
				}
			}
		} else {
			// No provider ECO -> global scan
			const allCandidates = (((ecoCatalog as any).getAllCandidates?.() as unknown[]) ??
				[]) as any[];

			if (ECO_DEBUG) {
				console.warn('[ECO][debug] No provider ECO -> global scan', {
					gameRef: `${game.site}:${game.externalId}`,
					allCandidatesCount: allCandidates.length,
					minMatchPly: DEFAULT_MIN_GLOBAL_MATCH_PLY,
					movesCount: gameMovesSan.length,
				});
			}

			const globalMatch =
				allCandidates.length > 0
					? findBestEcoOpeningMatchGlobal(gameMovesSan, allCandidates as any, {
							minMatchPly: DEFAULT_MIN_GLOBAL_MATCH_PLY,
						})
					: null;

			if (globalMatch) {
				ecoDetermined = globalMatch.eco;
				ecoOpeningName = globalMatch.name;
				ecoOpeningLinePgn = globalMatch.linePgn;
				ecoOpeningMatchPly = globalMatch.matchPly;

				if (ECO_DEBUG) {
					console.warn('[ECO][debug] Global match found (no provider ECO)', {
						gameRef: `${game.site}:${game.externalId}`,
						ecoDetermined,
						name: ecoOpeningName,
						matchPly: ecoOpeningMatchPly,
					});
				}
			} else if (ECO_DEBUG) {
				console.warn('[ECO][debug] Global scan failed (no provider ECO)', {
					gameRef: `${game.site}:${game.externalId}`,
					sampleMoves: gameMovesSan.slice(0, 16),
				});
			}
		}

		return {
			ecoDetermined,
			ecoOpeningName,
			ecoOpeningLinePgn,
			ecoOpeningMatchPly,
		};
	} catch {
		// Best-effort fallback: keep provider ECO (if any), ignore everything else.
		const providerEcoRaw = typeof game.eco === 'string' ? game.eco.trim() : '';
		ecoDetermined = providerEcoRaw.length > 0 ? providerEcoRaw : null;

		return {
			ecoDetermined,
			ecoOpeningName: null,
			ecoOpeningLinePgn: null,
			ecoOpeningMatchPly: null,
		};
	}
}
