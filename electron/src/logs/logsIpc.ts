import { ipcMain } from 'electron';
import { prisma } from '../db/prisma';
import { clamp } from '../shared/math';

import type {
	LogsListInput,
	LogsListResult,
	LogsFacetsResult,
	LogEntryDetails,
} from 'my-chess-opening-core';

function buildWhere(filters: NonNullable<LogsListInput['filters']>) {
	const and: any[] = [];

	if (filters.importRunId) {
		and.push({ importRunId: filters.importRunId });
	}

	if (filters.levels?.length) {
		and.push({ level: { in: filters.levels } });
	}

	if (filters.sites?.length) {
		and.push({ site: { in: filters.sites } });
	}

	if (filters.scopes?.length) {
		const hasNull = filters.scopes.includes(null);
		const nonNull = filters.scopes.filter(
			(s): s is string => typeof s === 'string' && s.length > 0,
		);

		const scopeOr: any[] = [];
		if (hasNull) scopeOr.push({ scope: null });
		if (nonNull.length) scopeOr.push({ scope: { in: nonNull } });

		if (scopeOr.length) and.push({ OR: scopeOr });
	}

	if (filters.username && filters.username.trim().length > 0) {
		and.push({ username: { contains: filters.username.trim() } });
	}

	if (filters.createdAtGteIso) {
		const d = new Date(filters.createdAtGteIso);
		if (!Number.isNaN(d.getTime())) {
			and.push({ createdAt: { gte: d } });
		}
	}

	if (filters.search && filters.search.trim().length > 0) {
		const q = filters.search.trim();
		and.push({
			OR: [{ message: { contains: q } }, { data: { contains: q } }],
		});
	}

	return and.length ? { AND: and } : {};
}

export function registerLogsIpc() {
	ipcMain.handle('logs:facets', async (): Promise<LogsFacetsResult> => {
		const [scopes, usernames, sites] = await Promise.all([
			prisma.importLogEntry.findMany({
				where: { scope: { not: null } },
				distinct: ['scope'],
				select: { scope: true },
				orderBy: { scope: 'asc' },
			}),
			prisma.importLogEntry.findMany({
				where: { username: { not: null } },
				distinct: ['username'],
				select: { username: true },
				orderBy: { username: 'asc' },
			}),
			prisma.importLogEntry.findMany({
				where: { site: { not: null } },
				distinct: ['site'],
				select: { site: true },
				orderBy: { site: 'asc' },
			}),
		]);

		return {
			scopes: scopes.map((s) => s.scope!).filter(Boolean),
			usernames: usernames.map((u) => u.username!).filter(Boolean),
			sites: sites.map((s) => s.site!) as any,
		};
	});

	ipcMain.handle('logs:getEntry', async (_event, id: string): Promise<LogEntryDetails | null> => {
		const entry = await prisma.importLogEntry.findUnique({
			where: { id },
			select: {
				id: true,
				createdAt: true,
				level: true,
				scope: true,
				site: true,
				username: true,
				message: true,
				externalId: true,
				url: true,
				data: true,
				importRunId: true,
			},
		});

		if (!entry) return null;

		return {
			id: entry.id,
			createdAtIso: entry.createdAt.toISOString(),
			level: entry.level as any,
			scope: entry.scope,
			site: entry.site as any,
			username: entry.username,
			message: entry.message,
			externalId: entry.externalId,
			url: entry.url,
			data: entry.data,
			importRunId: entry.importRunId,
		};
	});

	ipcMain.handle('logs:list', async (_event, input?: LogsListInput): Promise<LogsListResult> => {
		const page = clamp(Number(input?.page ?? 1), 1, 10_000);
		const pageSize = clamp(Number(input?.pageSize ?? 50), 1, 200);
		const filters = input?.filters ?? {};

		const where = buildWhere(filters);
		const skip = (page - 1) * pageSize;

		const [total, rows] = await Promise.all([
			prisma.importLogEntry.count({ where }),
			prisma.importLogEntry.findMany({
				where,
				orderBy: { createdAt: 'desc' },
				skip,
				take: pageSize,
				select: {
					id: true,
					createdAt: true,
					level: true,
					scope: true,
					site: true,
					username: true,
					message: true,
					externalId: true,
					url: true,
					importRunId: true,
				},
			}),
		]);

		let runContext = null as any;

		if (filters.importRunId) {
			const run = await prisma.importRun.findUnique({
				where: { id: filters.importRunId },
				select: {
					id: true,
					accountConfigId: true,
					startedAt: true,
					finishedAt: true,
					status: true,
					errorMessage: true,
					gamesFound: true,
					gamesInserted: true,
					gamesSkipped: true,
					gamesFailed: true,
					accountConfig: {
						select: {
							site: true,
							username: true,
						},
					},
				},
			});

			if (run) {
				runContext = {
					id: run.id,
					accountConfigId: run.accountConfigId,
					startedAtIso: run.startedAt.toISOString(),
					finishedAtIso: run.finishedAt ? run.finishedAt.toISOString() : null,
					status: run.status as any,
					errorMessage: run.errorMessage,
					gamesFound: run.gamesFound,
					gamesInserted: run.gamesInserted,
					gamesSkipped: run.gamesSkipped,
					gamesFailed: run.gamesFailed,
					site: run.accountConfig.site as any,
					username: run.accountConfig.username,
				};
			}
		}

		return {
			items: rows.map((r) => ({
				id: r.id,
				createdAtIso: r.createdAt.toISOString(),
				level: r.level as any,
				scope: r.scope,
				site: r.site as any,
				username: r.username,
				message: r.message,
				externalId: r.externalId,
				url: r.url,
				importRunId: r.importRunId,
			})),
			total,
			page,
			pageSize,
			runContext,
		};
	});
}
