import { ipcMain } from 'electron';
import type { Prisma } from '@prisma/client';

import {
	buildSharedGameFilterQueryPayload,
	resolveSharedGameFilterPlayedDateRange,
} from 'my-chess-opening-core';

import type {
	DashboardOverviewInput,
	DashboardOverviewResult,
	SharedGameFilterQuery,
} from 'my-chess-opening-core';

import { prisma } from '../db/prisma';
import { DASHBOARD_SHARED_GAME_FILTER_CONTEXT_CONFIG } from '../shared/sharedGameFilterContextConfigs';
import { DASHBOARD_PRISMA_SPEEDS, buildDashboardOverviewBlocks } from './dashboardAggregation';

/**
 * Register IPC handlers for the Dashboard page.
 *
 * V1.12 scope:
 * - one overview endpoint
 * - backend-side filter sanitization
 * - date-only filtering
 * - no classical games
 * - in-memory aggregation after a focused Prisma query
 */
export function registerDashboardIpc(): void {
	ipcMain.handle(
		'dashboard:getOverview',
		async (_event, input?: DashboardOverviewInput): Promise<DashboardOverviewResult> => {
			const referenceDate = new Date();

			const payload = buildSharedGameFilterQueryPayload(
				input?.filter ?? {},
				DASHBOARD_SHARED_GAME_FILTER_CONTEXT_CONFIG,
				referenceDate,
			);

			const playedDateRange = resolveSharedGameFilterPlayedDateRange(
				payload.filter,
				referenceDate,
			);

			const where = buildDashboardWhere(payload.query);

			const games = await prisma.game.findMany({
				where,
				orderBy: [{ playedAt: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
				select: {
					id: true,
					playedAt: true,
					myResultKey: true,
					speed: true,
					myElo: true,
					accountConfigId: true,
					accountConfig: {
						select: {
							id: true,
							site: true,
							username: true,
						},
					},
				},
			});

			const overviewBlocks = buildDashboardOverviewBlocks(games, playedDateRange);

			return {
				appliedFilter: payload.filter,
				playedDateRange,
				...overviewBlocks,
			};
		},
	);
}

/**
 * Build the Prisma where clause for Dashboard queries.
 *
 * Dashboard V1.12 intentionally supports only:
 * - played date bounds
 * - bullet / blitz / rapid games
 *
 * Hidden shared-filter fields are already stripped by
 * DASHBOARD_SHARED_GAME_FILTER_CONTEXT_CONFIG before this function runs.
 */
function buildDashboardWhere(query: SharedGameFilterQuery): Prisma.GameWhereInput {
	const and: Prisma.GameWhereInput[] = [];

	if (query.playedDateFromIso) {
		const playedAtFrom = parseIsoDate(query.playedDateFromIso);

		if (playedAtFrom !== null) {
			and.push({ playedAt: { gte: playedAtFrom } });
		}
	}

	if (query.playedDateToIso) {
		const playedAtTo = parseIsoDate(query.playedDateToIso);

		if (playedAtTo !== null) {
			and.push({ playedAt: { lte: playedAtTo } });
		}
	}

	// Dashboard V1.12 does not include classical games.
	and.push({
		speed: {
			in: DASHBOARD_PRISMA_SPEEDS,
		},
	});

	return and.length > 0 ? { AND: and } : {};
}

/**
 * Convert an ISO string to a valid Date instance.
 */
function parseIsoDate(value: string): Date | null {
	const date = new Date(value);

	return Number.isNaN(date.getTime()) ? null : date;
}
