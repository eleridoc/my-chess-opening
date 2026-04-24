import * as path from 'node:path';

import { getDatabaseFilePath } from '../system/paths';

/**
 * Convert a local filesystem path to a Prisma SQLite connection URL.
 *
 * Prisma expects SQLite URLs to use the `file:` prefix.
 */
export function toPrismaSqliteUrl(filePath: string): string {
	const absolutePath = path.resolve(filePath);
	const normalizedPath = absolutePath.replace(/\\/g, '/');

	return `file:${encodeURI(normalizedPath)}`;
}

/**
 * Return the runtime SQLite database URL used by Prisma.
 */
export function getRuntimeDatabaseUrl(): string {
	return toPrismaSqliteUrl(getDatabaseFilePath());
}

/**
 * Configure Prisma's DATABASE_URL before PrismaClient is created.
 */
export function configurePrismaDatabaseUrl(): string {
	const databaseUrl = getRuntimeDatabaseUrl();

	process.env['DATABASE_URL'] = databaseUrl;

	return databaseUrl;
}
