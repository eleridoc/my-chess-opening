import { app, safeStorage } from 'electron';
import { promises as fs } from 'node:fs';
import path from 'node:path';

import type {
	OpeningBookClearLichessTokenResult,
	OpeningBookLichessAuthStatus,
	OpeningBookLichessAuthStatusResult,
	OpeningBookSaveLichessTokenResult,
	OpeningBookTestLichessTokenResult,
} from 'my-chess-opening-core';

import {
	fetchLichessOpeningExplorer,
	LichessOpeningExplorerClientError,
} from './lichessOpeningExplorerClient';
import { mapLichessOpeningExplorerErrorToOpeningBookResult } from './openingBookMapper';

const TOKEN_FILE_VERSION = 1;
const TOKEN_FILE_NAME = 'lichess-opening-book-token.json';

const TOKEN_TEST_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

interface StoredLichessTokenFile {
	version: number;
	encryptedToken: string;
	updatedAt: string;
}

/**
 * Resolve the user token used by Opening Book requests.
 *
 * Security:
 * - The token is read in Electron only.
 * - Angular never receives the secret value.
 */
export async function resolveLichessOpeningBookAccessToken(): Promise<string | null> {
	const token = await readStoredLichessToken();

	return token;
}

export async function getLichessOpeningBookAuthStatus(): Promise<OpeningBookLichessAuthStatusResult> {
	try {
		return {
			ok: true,
			status: await buildAuthStatus(),
		};
	} catch (error) {
		return mapOpeningBookError(error);
	}
}

export async function saveLichessOpeningBookToken(
	rawToken: string,
): Promise<OpeningBookSaveLichessTokenResult> {
	try {
		const token = normalizeToken(rawToken);

		if (!token) {
			throw new LichessOpeningExplorerClientError(
				'INVALID_INPUT',
				'Lichess token is required.',
			);
		}

		assertSecureStorageAvailable();

		const encryptedToken = safeStorage.encryptString(token).toString('base64');
		const updatedAt = new Date().toISOString();

		await fs.mkdir(getTokenDirectoryPath(), { recursive: true });
		await fs.writeFile(
			getTokenFilePath(),
			JSON.stringify(
				{
					version: TOKEN_FILE_VERSION,
					encryptedToken,
					updatedAt,
				} satisfies StoredLichessTokenFile,
				null,
				2,
			),
			'utf8',
		);

		return {
			ok: true,
			status: await buildAuthStatus(),
		};
	} catch (error) {
		return mapOpeningBookError(error);
	}
}

export async function clearLichessOpeningBookToken(): Promise<OpeningBookClearLichessTokenResult> {
	try {
		await fs.rm(getTokenFilePath(), { force: true });

		return {
			ok: true,
			status: await buildAuthStatus(),
		};
	} catch (error) {
		return mapOpeningBookError(error);
	}
}

export async function testLichessOpeningBookToken(): Promise<OpeningBookTestLichessTokenResult> {
	try {
		const token = await readStoredLichessToken();

		if (!token) {
			throw new LichessOpeningExplorerClientError(
				'AUTH_REQUIRED',
				'Lichess token is not configured.',
			);
		}

		await fetchLichessOpeningExplorer(
			{
				source: 'lichess',
				fen: TOKEN_TEST_FEN,
				maxMoves: 1,
			},
			{
				accessToken: token,
			},
		);

		return {
			ok: true,
			status: await buildAuthStatus(),
		};
	} catch (error) {
		return mapOpeningBookError(error);
	}
}

async function buildAuthStatus(): Promise<OpeningBookLichessAuthStatus> {
	if (!isSecureStorageAvailable()) {
		return {
			configured: false,
			storageAvailable: false,
			updatedAt: null,
			message: 'Secure storage is not available on this system.',
		};
	}

	const file = await readStoredTokenFile();

	if (!file) {
		return {
			configured: false,
			storageAvailable: true,
			updatedAt: null,
			message: null,
		};
	}

	try {
		const token = decryptStoredToken(file);

		return {
			configured: token.length > 0,
			storageAvailable: true,
			updatedAt: normalizeIsoDate(file.updatedAt),
			message: null,
		};
	} catch {
		return {
			configured: false,
			storageAvailable: true,
			updatedAt: normalizeIsoDate(file.updatedAt),
			message:
				'A Lichess token file exists but could not be decrypted. Remove it and save a new token.',
		};
	}
}

async function readStoredLichessToken(): Promise<string | null> {
	if (!isSecureStorageAvailable()) {
		return null;
	}

	const file = await readStoredTokenFile();

	if (!file) {
		return null;
	}

	return decryptStoredToken(file);
}

async function readStoredTokenFile(): Promise<StoredLichessTokenFile | null> {
	try {
		const raw = await fs.readFile(getTokenFilePath(), 'utf8');
		const parsed = JSON.parse(raw) as Partial<StoredLichessTokenFile>;

		if (
			parsed.version !== TOKEN_FILE_VERSION ||
			typeof parsed.encryptedToken !== 'string' ||
			typeof parsed.updatedAt !== 'string'
		) {
			throw new LichessOpeningExplorerClientError(
				'INVALID_INPUT',
				'Stored Lichess token file is invalid.',
			);
		}

		return {
			version: parsed.version,
			encryptedToken: parsed.encryptedToken,
			updatedAt: parsed.updatedAt,
		};
	} catch (error) {
		if (isFileNotFoundError(error)) {
			return null;
		}

		throw error;
	}
}

function decryptStoredToken(file: StoredLichessTokenFile): string {
	assertSecureStorageAvailable();

	const decrypted = safeStorage.decryptString(Buffer.from(file.encryptedToken, 'base64'));

	return normalizeToken(decrypted);
}

function assertSecureStorageAvailable(): void {
	if (isSecureStorageAvailable()) {
		return;
	}

	throw new LichessOpeningExplorerClientError(
		'SECURE_STORAGE_UNAVAILABLE',
		'Electron secure storage is not available on this system.',
	);
}

function isSecureStorageAvailable(): boolean {
	try {
		return safeStorage.isEncryptionAvailable();
	} catch {
		return false;
	}
}

function getTokenDirectoryPath(): string {
	return path.join(app.getPath('userData'), 'secrets');
}

function getTokenFilePath(): string {
	return path.join(getTokenDirectoryPath(), TOKEN_FILE_NAME);
}

function normalizeToken(value: unknown): string {
	return typeof value === 'string' ? value.trim() : '';
}

function normalizeIsoDate(value: string): string | null {
	const timestamp = Date.parse(value);

	if (!Number.isFinite(timestamp)) {
		return null;
	}

	return new Date(timestamp).toISOString();
}

function isFileNotFoundError(error: unknown): boolean {
	return (
		error instanceof Error &&
		'code' in error &&
		(error as NodeJS.ErrnoException).code === 'ENOENT'
	);
}

function mapOpeningBookError(error: unknown): { ok: false; error: any } {
	const mapped = mapLichessOpeningExplorerErrorToOpeningBookResult(error);

	if (!mapped.ok) {
		return mapped;
	}

	return {
		ok: false,
		error: {
			code: 'UNEXPECTED_ERROR',
			message: 'Unexpected opening book auth error.',
		},
	};
}
