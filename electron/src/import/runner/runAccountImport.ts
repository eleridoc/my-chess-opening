import type { ImportOrchestrator, ImportOptions } from 'my-chess-opening-core';

import { ImportStatus, type AccountConfig } from '@prisma/client';

import type { EcoOpeningsCatalog } from '../../eco/ecoOpeningsCatalog';
import { prisma } from '../../db/prisma';

import { mapRunStatus, mapSite } from '../importAllAccounts.helpers';
import type { ImportEventPayload } from '../importAllAccounts.types';

import { logImport } from '../persistence/importLogger';
import { persistGame } from '../persistence/persistGame';

import { createAccountProgressCommitter, type ImportRunCounters } from '../progress/progressCommit';

export type RunAccountImportResult = {
	gamesFound: number;
	inserted: number;
	skipped: number;
	failed: number;
	shouldUpdateLastSyncAt: boolean;
};

type RunAccountImportParams = {
	account: Pick<AccountConfig, 'id' | 'site' | 'username' | 'lastSyncAt'>;
	since: Date | null;

	importService: ImportOrchestrator;
	ecoCatalog: EcoOpeningsCatalog;

	maxGamesPerAccount: number | null;
	isLimitedRun: boolean;

	commitEvery: number;

	emit: (payload: ImportEventPayload) => void;
	nowIso: () => string;

	accountsToUpdateLastSyncAt: string[];
};

/**
 * Run the import for a single account (DB + events + logs).
 *
 * IMPORTANT:
 * - Refactor-only: behavior must stay identical to the previous inline loop.
 * - Never throw because of a single game persistence error: those are tracked and surfaced.
 */
export async function runAccountImport(
	params: RunAccountImportParams,
): Promise<RunAccountImportResult> {
	const {
		account,
		since,
		importService,
		ecoCatalog,
		maxGamesPerAccount,
		isLimitedRun,
		commitEvery,
		emit,
		nowIso,
		accountsToUpdateLastSyncAt,
	} = params;

	// Create per-account ImportRun.
	// Note: ImportStatus.PARTIAL is used as our "RUNNING" surrogate until `finishedAt` is set.
	const run = await prisma.importRun.create({
		data: {
			accountConfigId: account.id,
			status: ImportStatus.PARTIAL,
			gamesFound: 0,
			gamesInserted: 0,
			gamesSkipped: 0,
			gamesFailed: 0,
		},
	});

	emit({
		type: 'accountStarted',
		accountId: account.id,
		site: mapSite(account.site),
		username: account.username,
	});

	await logImport({
		importRunId: run.id,
		level: 'INFO',
		scope: 'RUN',
		site: account.site,
		username: account.username,
		message: `Import started (since=${since ? since.toISOString() : 'FULL'}${
			isLimitedRun ? `, maxGames=${maxGamesPerAccount}` : ''
		})`,
	});

	let gamesFound = 0;
	let gamesInserted = 0;
	let gamesSkipped = 0;
	let gamesFailed = 0;

	try {
		const options: ImportOptions = {
			username: account.username,
			since,
			ratedOnly: true,
			speeds: ['bullet', 'blitz', 'rapid'],
			includeMoves: true,
			maxGames: maxGamesPerAccount ?? undefined,
		};

		const games = await importService.importGames(mapSite(account.site), options);
		gamesFound = games.length;

		await prisma.importRun.update({
			where: { id: run.id },
			data: { gamesFound },
		});

		emit({
			type: 'accountNewGamesFound',
			accountId: account.id,
			gamesFound,
		});

		const progress = createAccountProgressCommitter({
			commitEvery,
			runId: run.id,
			accountId: account.id,
			gamesFound,
			emit,
			updateRunCounters: async ({ runId, inserted, skipped, failed }) => {
				await prisma.importRun.update({
					where: { id: runId },
					data: {
						gamesInserted: inserted,
						gamesSkipped: skipped,
						gamesFailed: failed,
					},
				});
			},
		});

		progress.emitInitial();

		for (const g of games) {
			try {
				const { inserted } = await persistGame({
					accountConfigId: account.id,
					game: g,
					ecoCatalog,
				});

				if (inserted) {
					gamesInserted += 1;
				} else {
					gamesSkipped += 1;
				}
			} catch (err: any) {
				gamesFailed += 1;

				const errorMessage = String(err?.message ?? err);

				await logImport({
					importRunId: run.id,
					level: 'ERROR',
					scope: 'PERSIST',
					site: account.site,
					username: account.username,
					externalId: g.externalId,
					message: 'Failed to persist game',
					data: { error: errorMessage },
				});

				emit({
					type: 'accountError',
					accountId: account.id,
					externalId: g.externalId ?? null,
					message: errorMessage,
				});
			}

			const counters: ImportRunCounters = {
				inserted: gamesInserted,
				skipped: gamesSkipped,
				failed: gamesFailed,
			};

			await progress.maybeCommit(counters);
		}

		await progress.commitFinal({
			inserted: gamesInserted,
			skipped: gamesSkipped,
			failed: gamesFailed,
		});

		// Decide final status.
		const status =
			gamesFailed === 0
				? ImportStatus.SUCCESS
				: gamesInserted > 0
					? ImportStatus.PARTIAL
					: ImportStatus.FAILED;

		// Defer lastSyncAt update to batch completion (watermark = batchStartedAt).
		// We only update accounts that finished SUCCESS, to avoid skipping games after failures.
		if (!isLimitedRun && status === ImportStatus.SUCCESS) {
			accountsToUpdateLastSyncAt.push(account.id);
		}

		const finishedAtIso = nowIso();

		await prisma.importRun.update({
			where: { id: run.id },
			data: {
				status,
				finishedAt: new Date(finishedAtIso),
				errorMessage: gamesFailed ? `Some games failed (${gamesFailed}).` : null,
			},
		});

		await logImport({
			importRunId: run.id,
			level: status === ImportStatus.SUCCESS ? 'INFO' : 'WARN',
			scope: 'RUN',
			site: account.site,
			username: account.username,
			message: `Import finished: found=${gamesFound} inserted=${gamesInserted} skipped=${gamesSkipped} failed=${gamesFailed} status=${status}`,
		});

		emit({
			type: 'accountFinished',
			accountId: account.id,
			status: mapRunStatus(status),
			gamesFound,
			inserted: gamesInserted,
			skipped: gamesSkipped,
			failed: gamesFailed,
			finishedAtIso,
		});

		return {
			gamesFound,
			inserted: gamesInserted,
			skipped: gamesSkipped,
			failed: gamesFailed,
			shouldUpdateLastSyncAt: !isLimitedRun && status === ImportStatus.SUCCESS,
		};
	} catch (err: any) {
		const errorMessage = String(err?.message ?? err);

		await prisma.importRun.update({
			where: { id: run.id },
			data: {
				status: ImportStatus.FAILED,
				finishedAt: new Date(),
				errorMessage,
				gamesFound,
				gamesInserted,
				gamesSkipped,
				gamesFailed,
			},
		});

		await logImport({
			importRunId: run.id,
			level: 'ERROR',
			scope: 'RUN',
			site: account.site,
			username: account.username,
			message: `Import failed: ${errorMessage}`,
			data: { error: String(err?.stack ?? err) },
		});

		emit({
			type: 'accountError',
			accountId: account.id,
			externalId: null,
			message: errorMessage,
		});

		emit({
			type: 'accountFinished',
			accountId: account.id,
			status: 'FAILED',
			gamesFound,
			inserted: gamesInserted,
			skipped: gamesSkipped,
			failed: gamesFailed,
			finishedAtIso: nowIso(),
		});

		return {
			gamesFound,
			inserted: gamesInserted,
			skipped: gamesSkipped,
			failed: gamesFailed,
			shouldUpdateLastSyncAt: false,
		};
	}
}
