import type { PrismaClient } from '@prisma/client';
import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';

import { getPrismaMigrationsDir } from '../system/paths';

interface AppliedMigrationRow {
	migration_name: string;
}

interface MigrationFile {
	name: string;
	sqlPath: string;
	sql: string;
	checksum: string;
}

/**
 * Apply pending SQLite migrations from the Prisma migrations directory.
 *
 * Why this exists:
 * - Packaged Electron apps cannot rely on `prisma migrate dev`.
 * - The app must be able to initialize its local SQLite database at runtime.
 * - We reuse Prisma-generated SQL migrations as the source of truth.
 */
export async function applyPendingSqliteMigrations(prisma: PrismaClient): Promise<void> {
	await ensurePrismaMigrationsTable(prisma);

	const migrations = readMigrationFiles();
	const appliedMigrationNames = await getAppliedMigrationNames(prisma);

	for (const migration of migrations) {
		if (appliedMigrationNames.has(migration.name)) {
			continue;
		}

		await applyMigration(prisma, migration);
	}
}

async function ensurePrismaMigrationsTable(prisma: PrismaClient): Promise<void> {
	await prisma.$executeRawUnsafe(`
		CREATE TABLE IF NOT EXISTS "_prisma_migrations" (
			"id" TEXT PRIMARY KEY NOT NULL,
			"checksum" TEXT NOT NULL,
			"finished_at" DATETIME,
			"migration_name" TEXT NOT NULL,
			"logs" TEXT,
			"rolled_back_at" DATETIME,
			"started_at" DATETIME NOT NULL DEFAULT current_timestamp,
			"applied_steps_count" INTEGER NOT NULL DEFAULT 0
		);
	`);
}

async function getAppliedMigrationNames(prisma: PrismaClient): Promise<Set<string>> {
	const rows = await prisma.$queryRawUnsafe<AppliedMigrationRow[]>(
		`SELECT "migration_name" FROM "_prisma_migrations" WHERE "rolled_back_at" IS NULL`,
	);

	return new Set(rows.map((row) => row.migration_name));
}

function readMigrationFiles(): MigrationFile[] {
	const migrationsDir = getPrismaMigrationsDir();

	if (!fs.existsSync(migrationsDir)) {
		throw new Error(`[DB] Prisma migrations directory not found: ${migrationsDir}`);
	}

	return fs
		.readdirSync(migrationsDir, { withFileTypes: true })
		.filter((entry) => entry.isDirectory())
		.map((entry) => {
			const name = entry.name;
			const sqlPath = path.join(migrationsDir, name, 'migration.sql');

			if (!fs.existsSync(sqlPath)) {
				throw new Error(`[DB] Prisma migration file not found: ${sqlPath}`);
			}

			const sql = fs.readFileSync(sqlPath, 'utf8');
			const checksum = crypto.createHash('sha256').update(sql).digest('hex');

			return {
				name,
				sqlPath,
				sql,
				checksum,
			};
		})
		.sort((a, b) => a.name.localeCompare(b.name));
}

async function applyMigration(prisma: PrismaClient, migration: MigrationFile): Promise<void> {
	const startedAt = new Date();
	const statements = splitSqlStatements(migration.sql);

	console.info(`[DB] Applying migration ${migration.name}`);

	try {
		for (const statement of statements) {
			await prisma.$executeRawUnsafe(statement);
		}

		await prisma.$executeRaw`
			INSERT INTO "_prisma_migrations" (
				"id",
				"checksum",
				"finished_at",
				"migration_name",
				"logs",
				"rolled_back_at",
				"started_at",
				"applied_steps_count"
			)
			VALUES (
				${crypto.randomUUID()},
				${migration.checksum},
				${new Date()},
				${migration.name},
				NULL,
				NULL,
				${startedAt},
				${statements.length}
			)
		`;

		console.info(`[DB] Applied migration ${migration.name}`);
	} catch (err) {
		console.error(`[DB] Failed to apply migration ${migration.name}`, err);
		throw err;
	}
}

/**
 * Split Prisma-generated SQLite migration SQL into executable statements.
 *
 * This is intentionally simple because Prisma migration files generated for
 * this project are plain SQL statements separated by semicolons.
 */
function splitSqlStatements(sql: string): string[] {
	return sql
		.split(';')
		.map((statement) => statement.trim())
		.filter((statement) => hasExecutableSql(statement));
}

function hasExecutableSql(statement: string): boolean {
	return statement.split('\n').some((line) => {
		const trimmedLine = line.trim();

		return trimmedLine.length > 0 && !trimmedLine.startsWith('--');
	});
}
