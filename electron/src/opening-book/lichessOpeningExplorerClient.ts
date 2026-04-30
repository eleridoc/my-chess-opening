import type { OpeningBookSource } from 'my-chess-opening-core';

export const LICHESS_OPENING_EXPLORER_BASE_URL = 'https://explorer.lichess.org';
export const LICHESS_OPENING_EXPLORER_DEFAULT_TIMEOUT_MS = 10_000;
export const LICHESS_OPENING_EXPLORER_DEFAULT_MAX_MOVES = 10;
export const LICHESS_OPENING_EXPLORER_MIN_MAX_MOVES = 1;
export const LICHESS_OPENING_EXPLORER_MAX_MAX_MOVES = 50;

const LICHESS_OPENING_EXPLORER_DEFAULT_SPEEDS = ['blitz', 'rapid', 'classical'] as const;
const LICHESS_OPENING_EXPLORER_DEFAULT_RATINGS = [1600, 1800, 2000, 2200, 2500] as const;

export interface LichessOpeningExplorerClientInput {
	source: OpeningBookSource;
	fen: string;
	maxMoves?: number;
}

export interface LichessOpeningExplorerClientOptions {
	baseUrl?: string;
	timeoutMs?: number;

	/**
	 * Optional Lichess OAuth/API token.
	 *
	 * Security:
	 * - the token must be resolved by Electron-side auth/storage services
	 * - this client does not read environment files or renderer storage
	 * - the token must never be exposed back to Angular
	 */
	accessToken?: string | null;
}

export interface LichessOpeningExplorerOpening {
	eco?: string;
	name?: string;
}

export interface LichessOpeningExplorerMove {
	uci?: string;
	san?: string;
	white?: number;
	draws?: number;
	black?: number;
	averageRating?: number | null;
	opening?: LichessOpeningExplorerOpening | null;
}

export interface LichessOpeningExplorerResponse {
	white?: number;
	draws?: number;
	black?: number;
	averageRating?: number | null;
	opening?: LichessOpeningExplorerOpening | null;
	moves?: LichessOpeningExplorerMove[];
	topGames?: unknown[];
	recentGames?: unknown[];
	[key: string]: unknown;
}

export type LichessOpeningExplorerClientErrorCode =
	| 'INVALID_INPUT'
	| 'AUTH_REQUIRED'
	| 'NETWORK_ERROR'
	| 'TIMEOUT'
	| 'RATE_LIMITED'
	| 'REMOTE_ERROR'
	| 'UNEXPECTED_RESPONSE'
	| 'SECURE_STORAGE_UNAVAILABLE';

export class LichessOpeningExplorerClientError extends Error {
	constructor(
		public readonly code: LichessOpeningExplorerClientErrorCode,
		message: string,
		public readonly statusCode: number | null = null,
		public readonly retryAfterMs: number | null = null,
	) {
		super(message);
		this.name = 'LichessOpeningExplorerClientError';
	}
}

/**
 * Fetch raw data from the official Lichess Opening Explorer API.
 *
 * This client intentionally returns the external raw response shape.
 * Mapping to the internal Opening Book contract is handled in a dedicated mapper.
 */
export async function fetchLichessOpeningExplorer(
	input: LichessOpeningExplorerClientInput,
	options: LichessOpeningExplorerClientOptions = {},
): Promise<LichessOpeningExplorerResponse> {
	const url = buildLichessOpeningExplorerUrl(input, options);
	const timeoutMs = normalizeTimeoutMs(options.timeoutMs);
	const accessToken = normalizeAccessToken(options.accessToken);

	const controller = new AbortController();
	const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

	try {
		const response = await fetch(url, {
			method: 'GET',
			headers: buildRequestHeaders(accessToken),
			signal: controller.signal,
		});

		if (!response.ok) {
			throw await buildHttpError(response, url);
		}

		return await readJsonResponse(response);
	} catch (error) {
		if (error instanceof LichessOpeningExplorerClientError) {
			throw error;
		}

		if (isAbortError(error)) {
			throw new LichessOpeningExplorerClientError(
				'TIMEOUT',
				'Lichess Opening Explorer request timed out.',
			);
		}

		throw new LichessOpeningExplorerClientError(
			'NETWORK_ERROR',
			`Lichess Opening Explorer request failed: ${getErrorMessage(error)}`,
		);
	} finally {
		clearTimeout(timeoutId);
	}
}

/**
 * Build the public Lichess Opening Explorer URL.
 *
 * V1.14.5 scope:
 * - use the official explorer.lichess.org host
 * - request the current FEN
 * - request a limited number of moves
 * - avoid top games payload for now
 * - use default Lichess database filters close to the official API example
 */
export function buildLichessOpeningExplorerUrl(
	input: LichessOpeningExplorerClientInput,
	options: LichessOpeningExplorerClientOptions = {},
): string {
	const source = normalizeSource(input.source);
	const fen = normalizeRequiredText(input.fen, 'FEN');
	const maxMoves = clampLichessOpeningExplorerMaxMoves(input.maxMoves);

	const url = new URL(
		getEndpointPath(source),
		options.baseUrl ?? LICHESS_OPENING_EXPLORER_BASE_URL,
	);

	url.searchParams.set('fen', fen);
	url.searchParams.set('moves', String(maxMoves));
	url.searchParams.set('topGames', '0');

	if (source === 'lichess') {
		url.searchParams.set('variant', 'standard');
		url.searchParams.set('speeds', LICHESS_OPENING_EXPLORER_DEFAULT_SPEEDS.join(','));
		url.searchParams.set('ratings', LICHESS_OPENING_EXPLORER_DEFAULT_RATINGS.join(','));
	}

	return url.toString();
}

export function clampLichessOpeningExplorerMaxMoves(value: number | undefined): number {
	if (typeof value !== 'number' || !Number.isFinite(value)) {
		return LICHESS_OPENING_EXPLORER_DEFAULT_MAX_MOVES;
	}

	const integerValue = Math.trunc(value);

	return Math.min(
		Math.max(integerValue, LICHESS_OPENING_EXPLORER_MIN_MAX_MOVES),
		LICHESS_OPENING_EXPLORER_MAX_MAX_MOVES,
	);
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

function getEndpointPath(source: OpeningBookSource): string {
	switch (source) {
		case 'lichess':
			return '/lichess';

		case 'masters':
			return '/masters';

		default:
			throw new LichessOpeningExplorerClientError(
				'INVALID_INPUT',
				`Unsupported opening book source: ${String(source)}`,
			);
	}
}

function normalizeRequiredText(value: unknown, label: string): string {
	if (typeof value !== 'string') {
		throw new LichessOpeningExplorerClientError('INVALID_INPUT', `${label} must be a string.`);
	}

	const normalized = value.trim();

	if (normalized.length === 0) {
		throw new LichessOpeningExplorerClientError('INVALID_INPUT', `${label} is required.`);
	}

	return normalized;
}

function normalizeTimeoutMs(value: number | undefined): number {
	if (typeof value !== 'number' || !Number.isFinite(value)) {
		return LICHESS_OPENING_EXPLORER_DEFAULT_TIMEOUT_MS;
	}

	const integerValue = Math.trunc(value);

	return Math.min(Math.max(integerValue, 1_000), 30_000);
}

async function buildHttpError(
	response: Response,
	url: string,
): Promise<LichessOpeningExplorerClientError> {
	const bodyPreview = await readBodyPreview(response);
	const suffix = bodyPreview ? ` Body: ${bodyPreview}` : '';
	const retryAfterMs = parseRetryAfterMs(response.headers.get('Retry-After'));

	console.warn(
		`[OpeningBook] Lichess Opening Explorer returned HTTP ${response.status} for ${url}.${suffix}`,
	);

	if (response.status === 401) {
		return new LichessOpeningExplorerClientError(
			'AUTH_REQUIRED',
			`Lichess authentication is required to use the Opening Explorer. HTTP ${response.status}.${suffix}`,
			response.status,
		);
	}

	if (response.status === 429) {
		const retrySuffix = retryAfterMs ? ` Retry after ${formatRetryAfter(retryAfterMs)}.` : '';

		return new LichessOpeningExplorerClientError(
			'RATE_LIMITED',
			`Lichess Opening Explorer rate limit exceeded. HTTP ${response.status}.${retrySuffix}${suffix}`,
			response.status,
			retryAfterMs,
		);
	}

	return new LichessOpeningExplorerClientError(
		'REMOTE_ERROR',
		`Lichess Opening Explorer returned HTTP ${response.status}.${suffix}`,
		response.status,
	);
}

function parseRetryAfterMs(value: string | null): number | null {
	if (!value) {
		return null;
	}

	const trimmed = value.trim();
	const seconds = Number(trimmed);

	if (Number.isFinite(seconds) && seconds >= 0) {
		return Math.trunc(seconds * 1000);
	}

	const retryAt = Date.parse(trimmed);

	if (!Number.isFinite(retryAt)) {
		return null;
	}

	return Math.max(0, retryAt - Date.now());
}

function formatRetryAfter(ms: number): string {
	const seconds = Math.max(1, Math.ceil(ms / 1000));

	return seconds === 1 ? '1 second' : `${seconds} seconds`;
}

async function readJsonResponse(response: Response): Promise<LichessOpeningExplorerResponse> {
	try {
		return (await response.json()) as LichessOpeningExplorerResponse;
	} catch {
		throw new LichessOpeningExplorerClientError(
			'UNEXPECTED_RESPONSE',
			'Lichess Opening Explorer returned invalid JSON.',
		);
	}
}

async function readBodyPreview(response: Response): Promise<string> {
	try {
		const body = await response.text();
		return body.trim().slice(0, 300);
	} catch {
		return '';
	}
}

function buildRequestHeaders(accessToken: string | null): Headers {
	const headers = new Headers();

	headers.set('Accept', 'application/json');

	if (accessToken) {
		headers.set('Authorization', `Bearer ${accessToken}`);
	}

	return headers;
}

function normalizeAccessToken(value: unknown): string | null {
	if (typeof value !== 'string') {
		return null;
	}

	const normalized = value.trim();

	return normalized.length > 0 ? normalized : null;
}

function isAbortError(error: unknown): boolean {
	return error instanceof Error && error.name === 'AbortError';
}

function getErrorMessage(error: unknown): string {
	if (error instanceof Error && error.message.trim().length > 0) {
		return error.message;
	}

	return 'Unknown error';
}
