import { ipcMain } from 'electron';
import { prisma } from '../db/prisma';
import type { ExplorerGetGameResult } from 'my-chess-opening-core';

function normalizeResult(
	result: string | null | undefined,
): '1-0' | '0-1' | '1/2-1/2' | '*' | undefined {
	if (!result) return undefined;
	if (result === '1-0' || result === '0-1' || result === '1/2-1/2' || result === '*')
		return result;
	return undefined;
}

export function registerExplorerIpc() {
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

				const snapshot = {
					schemaVersion: 1 as const,
					kind: 'DB' as const,
					gameId: game.id,
					headers: {
						site: String(game.site),
						date: game.playedAt ? game.playedAt.toISOString().slice(0, 10) : undefined,
						white: game.whiteUsername ?? undefined,
						black: game.blackUsername ?? undefined,
						result: normalizeResult(game.result),
						eco: game.eco ?? undefined,
						opening: game.opening ?? undefined,
						whiteElo: game.whiteElo != null ? String(game.whiteElo) : undefined,
						blackElo: game.blackElo != null ? String(game.blackElo) : undefined,
					},
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
			} catch (e: any) {
				console.error('[IPC][Explorer] explorer:getGame failed', e);

				return {
					ok: false,
					error: {
						code: 'DB_ERROR',
						message: e?.message ? String(e.message) : 'Database error',
					},
				};
			}
		},
	);
}
