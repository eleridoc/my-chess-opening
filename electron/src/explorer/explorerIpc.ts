import { ipcMain } from 'electron';
import { prisma } from '../db/prisma';
import type { ExplorerGetGameResult, ExplorerGameSnapshotV1 } from 'my-chess-opening-core';

/**
 * Explorer IPC handlers (Electron)
 *
 * Responsibilities:
 * - Fetch persisted games from the database using Prisma.
 * - Map DB records into the stable Explorer snapshot contract (ExplorerGameSnapshotV1).
 * - Never throw: always return typed ok/error unions for the renderer.
 *
 * Notes:
 * - Keep mapping logic local and explicit to avoid leaking DB enums into the UI.
 * - Do not change the snapshot schema shape here; evolve it only in core types.
 */

type NormalizedResult = ExplorerGameSnapshotV1['headers']['result'];
type NormalizedSpeed = ExplorerGameSnapshotV1['headers']['speed'];
type NormalizedColor = NonNullable<ExplorerGameSnapshotV1['myColor']>;

function normalizeResult(result: string | null | undefined): NormalizedResult {
	if (!result) return undefined;
	if (result === '1-0' || result === '0-1' || result === '1/2-1/2' || result === '*')
		return result;
	return undefined;
}

function mapSpeed(s: unknown): NormalizedSpeed {
	const v = String(s ?? '').toUpperCase();
	if (v === 'BULLET') return 'bullet';
	if (v === 'BLITZ') return 'blitz';
	if (v === 'RAPID') return 'rapid';
	if (v === 'CLASSICAL') return 'classical';
	return undefined;
}

function mapMyColor(c: unknown): NormalizedColor | undefined {
	const v = String(c ?? '').toUpperCase();
	if (v === 'WHITE') return 'white';
	if (v === 'BLACK') return 'black';
	return undefined;
}

/**
 * Prisma stores the site as an enum-like value (e.g. "CHESSCOM", "LICHESS").
 * Keep the snapshot header field user-friendly (string), and keep importMeta.site
 * as the enum-like value (typed in core) when possible.
 */
function mapSiteLabel(site: unknown): string | undefined {
	const v = String(site ?? '').trim();
	if (!v) return undefined;
	if (v === 'CHESSCOM') return 'Chess.com';
	if (v === 'LICHESS') return 'Lichess';
	return v;
}

export function registerExplorerIpc(): void {
	ipcMain.handle(
		'explorer:getGame',
		async (_event, gameId: string): Promise<ExplorerGetGameResult> => {
			const id = typeof gameId === 'string' ? gameId.trim() : '';

			if (!id) {
				return {
					ok: false,
					error: { code: 'INVALID_ID', message: 'gameId is required' },
				};
			}

			try {
				const game = await prisma.game.findUnique({
					where: { id },
					select: {
						id: true,
						createdAt: true,
						playedAt: true,
						site: true,
						externalId: true,
						siteUrl: true,
						rated: true,
						speed: true,
						timeControl: true,
						initialSeconds: true,
						incrementSeconds: true,
						variant: true,
						myColor: true,
						result: true,
						eco: true,
						opening: true,
						whiteUsername: true,
						blackUsername: true,
						whiteElo: true,
						blackElo: true,
					},
				});

				if (!game) {
					return {
						ok: false,
						error: { code: 'NOT_FOUND', message: 'Game not found' },
					};
				}

				const moves = await prisma.gameMove.findMany({
					where: { gameId: game.id },
					orderBy: { ply: 'asc' },
					select: { san: true },
				});

				const snapshot: ExplorerGameSnapshotV1 = {
					schemaVersion: 1,
					kind: 'DB',
					gameId: game.id,
					headers: {
						site: mapSiteLabel(game.site),
						siteUrl: game.siteUrl ?? undefined,
						playedAtIso: game.playedAt ? game.playedAt.toISOString() : undefined,

						rated: game.rated ?? undefined,
						speed: mapSpeed(game.speed),
						timeControl: game.timeControl ?? undefined,
						initialSeconds: game.initialSeconds ?? undefined,
						incrementSeconds: game.incrementSeconds ?? undefined,
						variant: game.variant ?? undefined,

						white: game.whiteUsername ?? undefined,
						black: game.blackUsername ?? undefined,
						result: normalizeResult(game.result),

						eco: game.eco ?? undefined,
						opening: game.opening ?? undefined,

						whiteElo: game.whiteElo != null ? String(game.whiteElo) : undefined,
						blackElo: game.blackElo != null ? String(game.blackElo) : undefined,
					},

					// Perspective color is DB-owned, keep it as a normalized string.
					myColor: mapMyColor(game.myColor),

					movesSan: moves
						.map((m) => (typeof m.san === 'string' ? m.san.trim() : ''))
						.filter((s) => s.length > 0),

					importMeta: {
						site: String(game.site) as any,
						externalGameId: game.externalId ?? undefined,
						importedAt: game.createdAt.toISOString(),
					},
				};

				return { ok: true, snapshot };
			} catch (e: unknown) {
				console.error('[IPC][Explorer] explorer:getGame failed', e);

				return {
					ok: false,
					error: {
						code: 'DB_ERROR',
						message: e instanceof Error ? e.message : 'Database error',
					},
				};
			}
		},
	);
}
