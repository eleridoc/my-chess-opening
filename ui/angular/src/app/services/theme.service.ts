import { DOCUMENT } from '@angular/common';
import { Injectable, inject, signal } from '@angular/core';

export type AppTheme = 'dark' | 'light';

const STORAGE_KEY = 'mco.theme';

@Injectable({ providedIn: 'root' })
export class ThemeService {
	private readonly doc = inject(DOCUMENT);

	readonly theme = signal<AppTheme>('dark');

	/**
	 * Initialize the app theme as early as possible.
	 *
	 * Notes:
	 * - Stored preference wins when available.
	 * - OS preference is used as a fallback.
	 * - DOM class update must never depend on localStorage availability.
	 */
	init(): void {
		const saved = this.readStoredTheme();
		const preferred = this.getPreferredTheme();

		this.applyTheme(saved ?? preferred, { persist: false });
	}

	toggle(): void {
		this.setTheme(this.theme() === 'dark' ? 'light' : 'dark');
	}

	setTheme(theme: AppTheme): void {
		this.applyTheme(theme, { persist: true });
	}

	isDark(): boolean {
		return this.theme() === 'dark';
	}

	private applyTheme(theme: AppTheme, options: { persist: boolean }): void {
		this.theme.set(theme);
		this.applyBodyThemeClass(theme);

		if (options.persist) {
			this.storeTheme(theme);
		}
	}

	private applyBodyThemeClass(theme: AppTheme): void {
		const body = this.doc.body;

		body.classList.remove('theme-dark', 'theme-light');
		body.classList.add(theme === 'dark' ? 'theme-dark' : 'theme-light');
	}

	private readStoredTheme(): AppTheme | null {
		const storage = this.getStorage();

		if (!storage) {
			return null;
		}

		const raw = storage.getItem(STORAGE_KEY);
		return raw === 'dark' || raw === 'light' ? raw : null;
	}

	private storeTheme(theme: AppTheme): void {
		const storage = this.getStorage();

		if (!storage) {
			return;
		}

		try {
			storage.setItem(STORAGE_KEY, theme);
		} catch {
			// Theme switching must keep working even if storage is unavailable.
		}
	}

	private getPreferredTheme(): AppTheme {
		try {
			return window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
		} catch {
			return 'dark';
		}
	}

	private getStorage(): Storage | null {
		try {
			return globalThis.localStorage ?? null;
		} catch {
			return null;
		}
	}
}
