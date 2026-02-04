import { Injectable, computed, signal } from '@angular/core';

export type LoadingToken = number;

/**
 * LoadingService
 *
 * Global (app-wide) loading state to drive a top-level loader overlay.
 *
 * Design goals:
 * - Token-based API to avoid "stop called too many times" bugs.
 * - Signal-based state for simple Angular template consumption.
 * - Defensive behavior: stopping an unknown token is a no-op (no crash).
 */
@Injectable({ providedIn: 'root' })
export class LoadingService {
	private nextToken: LoadingToken = 0;

	// Active tokens represent "in-flight" operations.
	private readonly activeTokens = new Set<LoadingToken>();

	// Optional debug labels (useful in dev / QA).
	private readonly tokenLabels = new Map<LoadingToken, string>();

	/** Number of currently active global loading operations. */
	readonly globalCount = signal(0);

	/** True if at least one global loading operation is active. */
	readonly isGlobalLoading = computed(() => this.globalCount() > 0);

	/**
	 * Starts the global loader and returns a token that must be stopped later.
	 * The token is intentionally opaque to callers.
	 */
	startGlobal(label?: string): LoadingToken {
		const token = ++this.nextToken;

		this.activeTokens.add(token);

		const cleanLabel = (label ?? '').trim();
		if (cleanLabel) this.tokenLabels.set(token, cleanLabel);

		this.globalCount.set(this.activeTokens.size);

		return token;
	}

	/**
	 * Stops a previously started global loader token.
	 * Safe behavior:
	 * - unknown token => no-op
	 * - double stop => no-op
	 */
	stopGlobal(token: LoadingToken): void {
		if (!this.activeTokens.has(token)) return;

		this.activeTokens.delete(token);
		this.tokenLabels.delete(token);

		this.globalCount.set(this.activeTokens.size);
	}

	/**
	 * Convenience helper to wrap an async operation with a global loader.
	 * Ensures stopGlobal() is always called.
	 */
	async runGlobal<T>(work: Promise<T> | (() => Promise<T>), label?: string): Promise<T> {
		const token = this.startGlobal(label);

		try {
			const p = typeof work === 'function' ? work() : work;
			return await p;
		} finally {
			this.stopGlobal(token);
		}
	}

	/**
	 * Runs an async operation with a global loader, ensuring the loader is visible
	 * for at least `minMs` milliseconds to avoid flickering.
	 */
	async runGlobalMin<T>(
		work: Promise<T> | (() => Promise<T>),
		minMs = 300,
		label?: string,
	): Promise<T> {
		const token = this.startGlobal(label);
		const startedAt = performance.now();

		try {
			const p = typeof work === 'function' ? work() : work;
			return await p;
		} finally {
			const elapsed = performance.now() - startedAt;
			const remaining = Math.max(0, minMs - elapsed);

			if (remaining > 0) {
				await this.delay(remaining);
			}

			this.stopGlobal(token);
		}
	}

	/**
	 * Returns active labels for debugging/QA purposes.
	 * Note: this is not reactive by design (UI should rely on signals).
	 */
	getActiveLabels(): string[] {
		return Array.from(this.tokenLabels.values());
	}

	private delay(ms: number): Promise<void> {
		return new Promise((resolve) => setTimeout(resolve, ms));
	}
}
