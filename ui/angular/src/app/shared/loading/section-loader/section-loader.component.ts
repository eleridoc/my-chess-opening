import { CommonModule } from '@angular/common';
import { Component, Input, OnDestroy, signal } from '@angular/core';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

export type SectionLoaderMode = 'overlay' | 'inline';

/**
 * SectionLoaderComponent
 *
 * Local loader for a specific page/section/component.
 *
 * Anti-flicker strategy:
 * - Optional "show delay": do not display the loader if loading ends quickly.
 * - Optional "min visible": once displayed, keep it visible for a minimum duration.
 *
 * Implementation note:
 * - displayedLoading is a signal to work reliably in zoneless setups.
 */
@Component({
	selector: 'app-section-loader',
	standalone: true,
	imports: [CommonModule, MatProgressSpinnerModule],
	templateUrl: './section-loader.component.html',
	styleUrl: './section-loader.component.scss',
})
export class SectionLoaderComponent implements OnDestroy {
	private _loading = false;

	/** True when the section is loading. */
	@Input({ required: true })
	set loading(value: boolean) {
		const next = !!value;
		if (next === this._loading) return;

		this._loading = next;

		if (next) this.onLoadingStarted();
		else this.onLoadingEnded();
	}
	get loading(): boolean {
		return this._loading;
	}

	/** Overlay (default) or inline. */
	@Input() mode: SectionLoaderMode = 'overlay';

	/**
	 * If true, the projected content is visually hidden while loading.
	 * Useful to prevent "data flashing" or layout glitches.
	 */
	@Input() mask = false;

	/**
	 * When true, overlay captures pointer events (prevents interacting with the section).
	 * This only applies to overlay mode.
	 */
	@Input() blocking = true;

	/** Optional label displayed next to the spinner. */
	@Input() label = 'Loading…';

	/** Spinner diameter for local loaders. */
	@Input() spinnerSize = 34;

	/**
	 * Anti-flicker: delay before showing the loader (ms).
	 * If loading ends before this delay, the loader is never shown.
	 */
	@Input() showDelayMs = 0;

	/**
	 * Anti-flicker: once shown, keep the loader visible for at least this duration (ms).
	 */
	@Input() minVisibleMs = 300;

	/** Internal "actually shown" state (signal for reliable rendering). */
	readonly displayedLoading = signal(false);

	private showTimer: ReturnType<typeof setTimeout> | null = null;
	private hideTimer: ReturnType<typeof setTimeout> | null = null;
	private shownAtMs: number | null = null;

	ngOnDestroy(): void {
		this.clearTimers();
	}

	private onLoadingStarted(): void {
		// Cancel any pending hide.
		if (this.hideTimer) {
			clearTimeout(this.hideTimer);
			this.hideTimer = null;
		}

		// Already visible => nothing to do.
		if (this.displayedLoading()) return;

		if (this.showTimer) clearTimeout(this.showTimer);

		const delay = Math.max(0, this.showDelayMs);

		// ✅ IMPORTANT: if delay is 0, show synchronously (no timer)
		if (delay === 0) {
			this.displayedLoading.set(true);
			this.shownAtMs = performance.now();
			return;
		}

		this.showTimer = setTimeout(() => {
			this.showTimer = null;

			// If loading already ended during the delay, do not show.
			if (!this._loading) return;

			this.displayedLoading.set(true);
			this.shownAtMs = performance.now();
		}, delay);
	}

	private onLoadingEnded(): void {
		// If we haven't shown it yet, just cancel the show timer.
		if (this.showTimer) {
			clearTimeout(this.showTimer);
			this.showTimer = null;
		}

		// If it's not visible, nothing to do.
		if (!this.displayedLoading()) return;

		// Enforce min visible time.
		const minVisible = Math.max(0, this.minVisibleMs);
		const shownAt = this.shownAtMs ?? performance.now();
		const elapsed = performance.now() - shownAt;
		const remaining = Math.max(0, minVisible - elapsed);

		if (this.hideTimer) clearTimeout(this.hideTimer);

		this.hideTimer = setTimeout(() => {
			this.hideTimer = null;

			// If loading restarted while we were waiting, keep it visible.
			if (this._loading) return;

			this.displayedLoading.set(false);
			this.shownAtMs = null;
		}, remaining);
	}

	private clearTimers(): void {
		if (this.showTimer) clearTimeout(this.showTimer);
		if (this.hideTimer) clearTimeout(this.hideTimer);
		this.showTimer = null;
		this.hideTimer = null;
	}
}
