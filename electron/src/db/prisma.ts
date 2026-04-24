import { PrismaClient } from '@prisma/client';

let prismaClient: PrismaClient | null = null;

/**
 * Return the single PrismaClient instance used by the Electron main process.
 *
 * Important:
 * - DATABASE_URL must be configured before the first access.
 * - Keep this lazy to avoid creating PrismaClient during module import.
 */
export function getPrismaClient(): PrismaClient {
	if (!process.env['DATABASE_URL']) {
		throw new Error('[DB] DATABASE_URL must be configured before PrismaClient is created.');
	}

	if (!prismaClient) {
		prismaClient = new PrismaClient();
	}

	return prismaClient;
}

/**
 * Disconnect the Prisma client during app shutdown.
 */
export async function disconnectPrismaClient(): Promise<void> {
	if (!prismaClient) {
		return;
	}

	await prismaClient.$disconnect();
	prismaClient = null;
}

/**
 * Backward-compatible lazy Prisma export.
 *
 * This lets existing modules keep importing `{ prisma }` while preventing
 * PrismaClient from being instantiated before DATABASE_URL is configured.
 */
export const prisma = new Proxy({} as PrismaClient, {
	get(_target, propertyKey) {
		const client = getPrismaClient();
		const value = client[propertyKey as keyof PrismaClient];

		if (typeof value === 'function') {
			return value.bind(client);
		}

		return value;
	},
});
