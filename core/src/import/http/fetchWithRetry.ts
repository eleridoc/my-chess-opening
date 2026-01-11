// core/src/import/http/fetchWithRetry.ts
export function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseRetryAfterMs(value: string | null): number | null {
	if (!value) return null;

	// Retry-After can be either seconds or an HTTP date.
	const asSeconds = Number(value);
	if (!Number.isNaN(asSeconds) && asSeconds >= 0) return asSeconds * 1000;

	const asDate = Date.parse(value);
	if (!Number.isNaN(asDate)) {
		const ms = asDate - Date.now();
		return ms > 0 ? ms : 0;
	}

	return null;
}

function backoffMs(attempt: number, baseMs: number, capMs: number): number {
	// Exponential backoff with jitter
	const exp = Math.min(capMs, baseMs * 2 ** attempt);
	const jitter = Math.floor(Math.random() * Math.min(250, exp)); // up to 250ms jitter
	return exp + jitter;
}

export async function fetchWithRetry(
	input: RequestInfo | URL,
	init: RequestInit & {
		// throttle between calls (ms)
		minDelayMs?: number;
		// retry policy
		maxRetries?: number;
		baseBackoffMs?: number;
		maxBackoffMs?: number;
		// retry on 5xx too
		retryOn5xx?: boolean;
	} = {},
): Promise<Response> {
	const {
		minDelayMs = 300,
		maxRetries = 5,
		baseBackoffMs = 500,
		maxBackoffMs = 8_000,
		retryOn5xx = true,
		...fetchInit
	} = init;

	// Optional spacing before the request (simple throttle)
	if (minDelayMs > 0) await sleep(minDelayMs);

	for (let attempt = 0; attempt <= maxRetries; attempt++) {
		const res = await fetch(input, fetchInit);

		// Success
		if (res.ok) return res;

		const status = res.status;

		const is429 = status === 429;
		const is5xx = status >= 500 && status <= 599;

		const shouldRetry = is429 || (retryOn5xx && is5xx);

		// Do not retry on other statuses (400/401/403/404...)
		if (!shouldRetry || attempt === maxRetries) {
			return res;
		}

		// Respect Retry-After when present (especially for 429)
		const retryAfterHeader = res.headers.get('retry-after');
		const retryAfter = parseRetryAfterMs(retryAfterHeader);

		// Always drain body before retrying (avoid resource leaks)
		await res.text().catch(() => '');

		const waitMs = retryAfter ?? backoffMs(attempt, baseBackoffMs, maxBackoffMs);

		await sleep(waitMs);
	}

	// Unreachable, but TS likes it.
	throw new Error('fetchWithRetry: unexpected fallthrough');
}
