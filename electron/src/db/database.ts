import * as fs from 'node:fs';

import { getDatabaseDir, getDatabaseFilePath } from '../system/paths';
import { configurePrismaDatabaseUrl } from './databaseUrl';
import { applyPendingSqliteMigrations } from './migrations';
import { getPrismaClient } from './prisma';

export interface DatabaseInitializationResult {
	databaseFilePath: string;
	databaseUrl: string;
}

/**
 * Initialize the runtime SQLite database.
 *
 * Order matters:
 * 1. Ensure the database directory exists.
 * 2. Configure DATABASE_URL.
 * 3. Create PrismaClient lazily.
 * 4. Apply pending migrations.
 * 5. Run a minimal health-check.
 */
export async function initializeDatabase(): Promise<DatabaseInitializationResult> {
	const databaseDir = getDatabaseDir();
	const databaseFilePath = getDatabaseFilePath();

	fs.mkdirSync(databaseDir, { recursive: true });

	const databaseUrl = configurePrismaDatabaseUrl();
	console.info('[DB] SQLite database URL:', databaseUrl);
	const prisma = getPrismaClient();

	await applyPendingSqliteMigrations(prisma);
	await prisma.$queryRaw`SELECT 1`;

	console.info('[DB] SQLite database ready:', databaseFilePath);

	return {
		databaseFilePath,
		databaseUrl,
	};
}
