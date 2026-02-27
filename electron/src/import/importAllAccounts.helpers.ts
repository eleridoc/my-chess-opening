import { createHash } from 'node:crypto';

import {
	ExternalSite as PrismaExternalSite,
	GameSpeed as PrismaGameSpeed,
	ImportStatus,
	PlayerColor as PrismaPlayerColor,
} from '@prisma/client';

import {
	ExternalSite as CoreExternalSite,
	type ImportedGameRaw,
	type ImportRunStatus,
} from 'my-chess-opening-core';

/**
 * Compute a stable SHA-256 hex digest (lowercase) for PGN storage / deduplication.
 */
export function sha256Hex(input: string): string {
	return createHash('sha256').update(input).digest('hex');
}

/**
 * Map core speed values to the Prisma enum used in persistence.
 *
 * Notes:
 * - Importers should only produce known values.
 * - We keep a defensive fallback to avoid crashing on unexpected data.
 */
export function mapSpeed(speed: ImportedGameRaw['speed']): PrismaGameSpeed {
	switch (speed) {
		case 'bullet':
			return PrismaGameSpeed.BULLET;
		case 'blitz':
			return PrismaGameSpeed.BLITZ;
		case 'rapid':
			return PrismaGameSpeed.RAPID;
		default:
			return PrismaGameSpeed.CLASSICAL;
	}
}

/**
 * Map a color string to the Prisma enum used in persistence.
 */
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
 */
export function mapPrismaSite(site: CoreExternalSite): PrismaExternalSite {
	return site === CoreExternalSite.CHESSCOM
		? PrismaExternalSite.CHESSCOM
		: PrismaExternalSite.LICHESS;
}

/**
 * Convert a Prisma ImportStatus (DB model) to the run status used by the UI/core types.
 *
 * Note:
 * ImportStatus.PARTIAL is also used as our "RUNNING" surrogate while `finishedAt` is null.
 * In that case we never emit `accountFinished`, so mapping it to PARTIAL is acceptable.
 */
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
