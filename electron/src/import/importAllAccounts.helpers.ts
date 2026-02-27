import { createHash } from 'node:crypto';

import {
	ImportStatus,
	ExternalSite as PrismaExternalSite,
	GameSpeed as PrismaGameSpeed,
	PlayerColor as PrismaPlayerColor,
} from '@prisma/client';

import {
	ExternalSite as CoreExternalSite,
	type ImportedGameRaw,
	type ImportRunStatus,
} from 'my-chess-opening-core';

/**
 * Compute a stable SHA-256 hash for PGN storage / deduplication.
 */
export function sha256Hex(input: string): string {
	return createHash('sha256').update(input).digest('hex');
}

export function mapSpeed(speed: ImportedGameRaw['speed']): PrismaGameSpeed {
	switch (speed) {
		case 'bullet':
			return PrismaGameSpeed.BULLET;
		case 'blitz':
			return PrismaGameSpeed.BLITZ;
		case 'rapid':
			return PrismaGameSpeed.RAPID;
		default:
			// Defensive fallback: treat unknown values as classical.
			return PrismaGameSpeed.CLASSICAL;
	}
}

export function mapColor(color: 'white' | 'black'): PrismaPlayerColor {
	return color === 'white' ? PrismaPlayerColor.WHITE : PrismaPlayerColor.BLACK;
}

/**
 * Map Prisma enum -> Core enum for orchestrator calls and UI events.
 */
export function mapSite(site: PrismaExternalSite): CoreExternalSite {
	return site === PrismaExternalSite.CHESSCOM
		? CoreExternalSite.CHESSCOM
		: CoreExternalSite.LICHESS;
}

/**
 * Map Core enum -> Prisma enum for DB persistence.
 * This avoids unsafe casts (`as unknown as`) at write-time.
 */
export function mapPrismaSite(site: CoreExternalSite): PrismaExternalSite {
	return site === CoreExternalSite.CHESSCOM
		? PrismaExternalSite.CHESSCOM
		: PrismaExternalSite.LICHESS;
}

export function mapRunStatus(status: ImportStatus): ImportRunStatus {
	switch (status) {
		case ImportStatus.SUCCESS:
			return 'SUCCESS';
		case ImportStatus.FAILED:
			return 'FAILED';
		default:
			return 'PARTIAL';
	}
}
