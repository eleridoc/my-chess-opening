import { ipcMain } from 'electron';
import { Prisma } from '@prisma/client';
import type { ExternalSite as PrismaExternalSite } from '@prisma/client';

import { prisma } from '../db/prisma';

import { ExternalSite as CoreExternalSite } from 'my-chess-opening-core';
import type {
	AccountsListResult,
	AccountsSetEnabledResult,
	AccountsDeleteResult,
	AccountsCreateResult,
	AccountsError,
} from 'my-chess-opening-core';

type AccountsSetEnabledPayload = { accountId: string; isEnabled: boolean };
type AccountsDeletePayload = { accountId: string };
type AccountsCreatePayload = { site: unknown; username: string };

/**
 * Register IPC handlers for chess account management.
 *
 * Notes:
 * - This module is used by the Electron main process.
 * - Keep payload validation lightweight and return structured IPC errors.
 * - `lastSyncAt` is returned as a raw ISO string (UI is responsible for formatting).
 */
export function registerAccountsIpc(): void {
	ipcMain.handle('accounts:list', async (): Promise<AccountsListResult> => {
		try {
			const accounts = await prisma.accountConfig.findMany({
				select: {
					id: true,
					site: true,
					username: true,
					isEnabled: true,
					lastSyncAt: true,
					_count: {
						select: {
							games: true,
						},
					},
				},
				orderBy: [{ site: 'asc' }, { username: 'asc' }],
			});

			return {
				ok: true,
				rows: accounts.map((a) => ({
					id: a.id,
					site: toCoreExternalSite(a.site),
					username: a.username,
					isEnabled: a.isEnabled,
					lastSyncAt: a.lastSyncAt ? a.lastSyncAt.toISOString() : null,
					gamesTotal: a._count.games,
				})),
			};
		} catch (e: unknown) {
			console.error('[IPC][Accounts] accounts:list failed', e);
			return { ok: false, error: dbError(e) };
		}
	});

	ipcMain.handle(
		'accounts:setEnabled',
		async (_evt, payload: AccountsSetEnabledPayload): Promise<AccountsSetEnabledResult> => {
			const accountId = requireAccountId(payload);

			if (!accountId) {
				return {
					ok: false,
					error: { code: 'INVALID_ID', message: 'Account id is required.' },
				};
			}

			try {
				await prisma.accountConfig.update({
					where: { id: accountId },
					data: { isEnabled: payload.isEnabled },
				});

				return { ok: true };
			} catch (e: unknown) {
				// Prisma throws P2025 when the record to update does not exist.
				if (isPrismaNotFound(e)) {
					return { ok: false, error: notFoundError() };
				}

				console.error('[IPC][Accounts] accounts:setEnabled failed', e);
				return { ok: false, error: dbError(e) };
			}
		},
	);

	ipcMain.handle(
		'accounts:delete',
		async (_evt, payload: AccountsDeletePayload): Promise<AccountsDeleteResult> => {
			const accountId = requireAccountId(payload);

			if (!accountId) {
				return {
					ok: false,
					error: { code: 'INVALID_ID', message: 'Account id is required.' },
				};
			}

			try {
				// Deleting AccountConfig cascades to related models (as defined in Prisma schema),
				// such as games, moves, import runs, logs, etc.
				await prisma.accountConfig.delete({ where: { id: accountId } });
				return { ok: true };
			} catch (e: unknown) {
				if (isPrismaNotFound(e)) {
					return { ok: false, error: notFoundError() };
				}

				console.error('[IPC][Accounts] accounts:delete failed', e);
				return { ok: false, error: dbError(e) };
			}
		},
	);

	ipcMain.handle(
		'accounts:create',
		async (_evt, payload: AccountsCreatePayload): Promise<AccountsCreateResult> => {
			const username = payload?.username?.trim();
			if (!username) {
				return {
					ok: false,
					error: { code: 'VALIDATION_ERROR', message: 'Username is required.' },
				};
			}

			// Keep aligned with UI maxLength.
			if (username.length > 40) {
				return {
					ok: false,
					error: { code: 'VALIDATION_ERROR', message: 'Username is too long.' },
				};
			}

			// Accept both:
			// - core enum values (string or numeric depending on TS enum output)
			// - plain strings coming from UI casts ("LICHESS" / "CHESSCOM")
			const site = normalizePrismaSite(payload?.site);
			if (!site) {
				return {
					ok: false,
					error: { code: 'VALIDATION_ERROR', message: 'Unsupported site.' },
				};
			}

			try {
				// Uniqueness is enforced at application level for now.
				// Later we can add a DB unique constraint (site + username).
				const existing = await prisma.accountConfig.findFirst({
					where: { site, username },
					select: { id: true },
				});

				if (existing) {
					return {
						ok: false,
						error: { code: 'ALREADY_EXISTS', message: 'This account already exists.' },
					};
				}

				const created = await prisma.accountConfig.create({
					data: {
						site,
						username,
						isEnabled: true,
						lastSyncAt: null,
					},
					select: { id: true },
				});

				return { ok: true, accountId: created.id };
			} catch (e: unknown) {
				if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
					return {
						ok: false,
						error: { code: 'ALREADY_EXISTS', message: 'This account already exists.' },
					};
				}

				console.error('[IPC][Accounts] accounts:create failed', e);
				return { ok: false, error: dbError(e) };
			}
		},
	);
}

function requireAccountId(payload: { accountId?: string } | null | undefined): string | null {
	const accountId = payload?.accountId?.trim();
	return accountId && accountId.length > 0 ? accountId : null;
}

function isPrismaNotFound(e: unknown): boolean {
	return e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2025';
}

function notFoundError(): AccountsError {
	return { code: 'NOT_FOUND', message: 'Account not found.' };
}

function dbError(e: unknown): AccountsError {
	return {
		code: 'DB_ERROR',
		message: e instanceof Error ? e.message : 'Database error',
	};
}

/**
 * Normalize incoming `site` value into the Prisma enum union.
 *
 * We need this because:
 * - The Angular UI currently sends string literals (casts) to avoid bundling core runtime code.
 * - The core also exposes an enum, which may be string or numeric depending on compilation.
 */
function normalizePrismaSite(site: unknown): PrismaExternalSite | null {
	// UI-cast or string enum case
	if (site === 'LICHESS' || site === 'CHESSCOM') {
		return site;
	}

	// Core enum (string enum or numeric enum) case
	if (site === CoreExternalSite.LICHESS) return 'LICHESS';
	if (site === CoreExternalSite.CHESSCOM) return 'CHESSCOM';

	return null;
}

/**
 * Prisma enum -> Core enum adapter.
 *
 * Prisma Client types enums as string unions, while the core uses a TS enum.
 * Keep this mapping explicit to avoid subtle runtime mismatches.
 */
function toCoreExternalSite(site: PrismaExternalSite): CoreExternalSite {
	switch (site) {
		case 'CHESSCOM':
			return CoreExternalSite.CHESSCOM;
		case 'LICHESS':
			return CoreExternalSite.LICHESS;
		default: {
			// Defensive fallback (should never happen if schema and core stay in sync).
			const _exhaustiveCheck: never = site;
			throw new Error(`Unsupported ExternalSite value: ${String(_exhaustiveCheck)}`);
		}
	}
}
