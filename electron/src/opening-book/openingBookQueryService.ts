import type {
	OpeningBookGetMovesInput,
	OpeningBookGetMovesResult,
	OpeningBookGetMovesSuccess,
	OpeningBookSource,
} from 'my-chess-opening-core';

import {
	clampLichessOpeningExplorerMaxMoves,
	fetchLichessOpeningExplorer,
	LichessOpeningExplorerClientError,
} from './lichessOpeningExplorerClient';

import {
	mapLichessOpeningExplorerErrorToOpeningBookResult,
	mapLichessOpeningExplorerResponseToOpeningBookResult,
} from './openingBookMapper';

const OPENING_BOOK_SUCCESS_CACHE_TTL_MS = 5 * 60 * 1000;
const OPENING_BOOK_SUCCESS_CACHE_MAX_ENTRIES = 250;
const OPENING_BOOK_REMOTE_MIN_INTERVAL_MS = 650;
const OPENING_BOOK_DEFAULT_RATE_LIMIT_COOLDOWN_MS = 30 * 1000;
const OPENING_BOOK_MAX_RATE_LIMIT_COOLDOWN_MS = 5 * 60 * 1000;

interface OpeningBookSuccessCacheEntry {
	result: OpeningBookGetMovesSuccess;
	expiresAt: number;
	lastAccessedAt: number;
}

const successCache = new Map<string, OpeningBookSuccessCacheEntry>();
const pendingRequests = new Map<string, Promise<OpeningBookGetMovesResult>>();

let remoteRequestQueue: Promise<void> = Promise.resolve();
let lastRemoteRequestStartedAt = 0;
let rateLimitedUntil = 0;

/**
 * Load opening book moves with Electron-side robustness around the external API.
 *
 * Responsibilities:
 * - normalize the request key used for caching
 * - reuse in-flight requests for the same position
 * - cache successful results for a short TTL
 * - serialize remote requests and keep a small delay between them
 * - protect the app after remote 429 responses with a temporary cooldown
 */
export async function getOpeningBookMovesWithCache(
	input: OpeningBookGetMovesInput,
): Promise<OpeningBookGetMovesResult> {
	const normalizedInput = normalizeOpeningBookCacheInput(input);
	const cacheKey = buildOpeningBookCacheKey(normalizedInput);
	const cachedResult = readSuccessCache(cacheKey);

	if (cachedResult) {
		console.debug(`[OpeningBook] Cache hit for ${cacheKey}`);
		return cachedResult;
	}

	const pendingRequest = pendingRequests.get(cacheKey);

	if (pendingRequest) {
		console.debug(`[OpeningBook] Reusing in-flight request for ${cacheKey}`);
		return pendingRequest;
	}

	const request = loadAndCacheOpeningBookMoves(normalizedInput, cacheKey).finally(() => {
		pendingRequests.delete(cacheKey);
	});

	pendingRequests.set(cacheKey, request);

	return request;
}

function normalizeOpeningBookCacheInput(
	input: OpeningBookGetMovesInput,
): Required<OpeningBookGetMovesInput> {
	return {
		source: normalizeSource(input.source),
		fen: normalizeFen(input.fen),
		maxMoves: clampLichessOpeningExplorerMaxMoves(input.maxMoves),
	};
}

async function loadAndCacheOpeningBookMoves(
	input: Required<OpeningBookGetMovesInput>,
	cacheKey: string,
): Promise<OpeningBookGetMovesResult> {
	try {
		const response = await runRemoteRequestWithLimit(() => fetchLichessOpeningExplorer(input));
		const result = mapLichessOpeningExplorerResponseToOpeningBookResult(input, response);

		writeSuccessCache(cacheKey, result);

		return result;
	} catch (error) {
		return mapLichessOpeningExplorerErrorToOpeningBookResult(error);
	}
}

function readSuccessCache(cacheKey: string): OpeningBookGetMovesSuccess | null {
	const entry = successCache.get(cacheKey);

	if (!entry) {
		return null;
	}

	if (entry.expiresAt <= Date.now()) {
		successCache.delete(cacheKey);
		return null;
	}

	entry.lastAccessedAt = Date.now();

	return entry.result;
}

function writeSuccessCache(cacheKey: string, result: OpeningBookGetMovesSuccess): void {
	const now = Date.now();

	successCache.set(cacheKey, {
		result,
		expiresAt: now + OPENING_BOOK_SUCCESS_CACHE_TTL_MS,
		lastAccessedAt: now,
	});

	pruneSuccessCache();
}

function pruneSuccessCache(): void {
	const now = Date.now();

	for (const [cacheKey, entry] of successCache) {
		if (entry.expiresAt <= now) {
			successCache.delete(cacheKey);
		}
	}

	if (successCache.size <= OPENING_BOOK_SUCCESS_CACHE_MAX_ENTRIES) {
		return;
	}

	const entriesByLastAccess = Array.from(successCache.entries()).sort(
		([, a], [, b]) => a.lastAccessedAt - b.lastAccessedAt,
	);

	const entriesToDelete = successCache.size - OPENING_BOOK_SUCCESS_CACHE_MAX_ENTRIES;

	for (let index = 0; index < entriesToDelete; index++) {
		successCache.delete(entriesByLastAccess[index][0]);
	}
}

function buildOpeningBookCacheKey(input: Required<OpeningBookGetMovesInput>): string {
	return `${input.source}::${input.maxMoves}::${input.fen}`;
}

async function runRemoteRequestWithLimit<T>(operation: () => Promise<T>): Promise<T> {
	const scheduledRequest = remoteRequestQueue.then(async () => {
		throwIfLocallyRateLimited();
		await waitForRemoteInterval();
		throwIfLocallyRateLimited();

		lastRemoteRequestStartedAt = Date.now();

		try {
			return await operation();
		} catch (error) {
			applyRateLimitCooldownIfNeeded(error);
			throw error;
		}
	});

	remoteRequestQueue = scheduledRequest.then(
		() => undefined,
		() => undefined,
	);

	return scheduledRequest;
}

async function waitForRemoteInterval(): Promise<void> {
	const elapsedMs = Date.now() - lastRemoteRequestStartedAt;
	const waitMs = Math.max(0, OPENING_BOOK_REMOTE_MIN_INTERVAL_MS - elapsedMs);

	if (waitMs <= 0) {
		return;
	}

	await delay(waitMs);
}

function throwIfLocallyRateLimited(): void {
	const now = Date.now();

	if (rateLimitedUntil <= now) {
		return;
	}

	const retryAfterMs = rateLimitedUntil - now;

	throw new LichessOpeningExplorerClientError(
		'RATE_LIMITED',
		`Opening book requests are temporarily paused after a Lichess rate limit response. Retry in ${formatRetryAfter(retryAfterMs)}.`,
		429,
		retryAfterMs,
	);
}

function applyRateLimitCooldownIfNeeded(error: unknown): void {
	if (!(error instanceof LichessOpeningExplorerClientError) || error.code !== 'RATE_LIMITED') {
		return;
	}

	const cooldownMs = clampRateLimitCooldownMs(error.retryAfterMs);
	rateLimitedUntil = Math.max(rateLimitedUntil, Date.now() + cooldownMs);

	console.warn(`[OpeningBook] Rate limited. Cooling down for ${formatRetryAfter(cooldownMs)}.`);
}

function clampRateLimitCooldownMs(value: number | null): number {
	if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
		return OPENING_BOOK_DEFAULT_RATE_LIMIT_COOLDOWN_MS;
	}

	return Math.min(Math.max(Math.trunc(value), 1_000), OPENING_BOOK_MAX_RATE_LIMIT_COOLDOWN_MS);
}

function normalizeSource(source: OpeningBookSource): OpeningBookSource {
	if (source === 'lichess' || source === 'masters') {
		return source;
	}

	throw new LichessOpeningExplorerClientError(
		'INVALID_INPUT',
		`Unsupported opening book source: ${String(source)}`,
	);
}

function normalizeFen(fen: string): string {
	if (typeof fen !== 'string') {
		throw new LichessOpeningExplorerClientError('INVALID_INPUT', 'FEN must be a string.');
	}

	const normalized = fen.trim();

	if (!normalized) {
		throw new LichessOpeningExplorerClientError('INVALID_INPUT', 'FEN is required.');
	}

	return normalized;
}

function delay(ms: number): Promise<void> {
	return new Promise((resolve) => {
		setTimeout(resolve, ms);
	});
}

function formatRetryAfter(ms: number): string {
	const seconds = Math.max(1, Math.ceil(ms / 1000));

	return seconds === 1 ? '1 second' : `${seconds} seconds`;
}
