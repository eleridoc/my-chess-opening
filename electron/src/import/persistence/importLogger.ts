import { prisma } from '../../db/prisma';
import { ExternalSite as PrismaExternalSite } from '@prisma/client';

export type ImportLogLevel = 'INFO' | 'WARN' | 'ERROR';

export async function logImport(params: {
	importRunId: string;
	level: ImportLogLevel;
	message: string;
	scope?: string;
	site?: PrismaExternalSite;
	username?: string;
	externalId?: string;
	url?: string;
	data?: unknown;
}): Promise<void> {
	const { data, level, ...rest } = params;

	await prisma.importLogEntry.create({
		data: {
			...rest,
			level,
			data: data ? JSON.stringify(data) : null,
		},
	});
}
