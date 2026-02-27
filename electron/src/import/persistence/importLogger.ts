import { ExternalSite as PrismaExternalSite } from '@prisma/client';

import { prisma } from '../../db/prisma';

export type ImportLogLevel = 'INFO' | 'WARN' | 'ERROR';

export type ImportLogParams = {
	importRunId: string;
	level: ImportLogLevel;
	message: string;
	scope?: string;
	site?: PrismaExternalSite;
	username?: string;
	externalId?: string;
	url?: string;
	data?: unknown;
};

/**
 * Persist a single import log entry.
 *
 * Notes:
 * - `data` is stored as a JSON string (or null) to keep the DB schema minimal.
 * - This function intentionally throws on DB errors; callers may wrap it in try/catch
 *   when logging is strictly best-effort (e.g. cleanup paths).
 */
export async function logImport(params: ImportLogParams): Promise<void> {
	const { data, level, ...rest } = params;

	await prisma.importLogEntry.create({
		data: {
			...rest,
			level,
			data: data == null ? null : JSON.stringify(data),
		},
	});
}
