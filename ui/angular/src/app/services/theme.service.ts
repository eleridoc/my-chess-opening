import { DOCUMENT } from '@angular/common';
import { Injectable, inject, signal } from '@angular/core';

export type AppTheme = 'dark' | 'light';

const STORAGE_KEY = 'mco.theme';

@Injectable({ providedIn: 'root' })
export class ThemeService {
	private readonly doc = inject(DOCUMENT);

	readonly theme = signal<AppTheme>('dark');

	init(): void {
		const saved = this.readStoredTheme();
		const preferred = this.getPreferredTheme();
		this.setTheme(saved ?? preferred);
	}

	toggle(): void {
		this.setTheme(this.theme() === 'dark' ? 'light' : 'dark');
	}

	setTheme(theme: AppTheme): void {
		this.theme.set(theme);
		this.storeTheme(theme);

		const body = this.doc.body;
		body.classList.remove('theme-dark', 'theme-light');
		body.classList.add(theme === 'dark' ? 'theme-dark' : 'theme-light');
	}

	isDark(): boolean {
		return this.theme() === 'dark';
	}

	private readStoredTheme(): AppTheme | null {
		const raw = localStorage.getItem(STORAGE_KEY);
		return raw === 'dark' || raw === 'light' ? raw : null;
	}

	private storeTheme(theme: AppTheme): void {
		localStorage.setItem(STORAGE_KEY, theme);
	}

	private getPreferredTheme(): AppTheme {
		return window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
	}
}
