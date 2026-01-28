import { Component, computed, effect, signal } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { MatTableModule } from '@angular/material/table';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatChipsModule } from '@angular/material/chips';
import { MatSidenavModule } from '@angular/material/sidenav';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatExpansionModule } from '@angular/material/expansion';

import type {
	ExternalSite,
	ImportLogLevel,
	LogListItem,
	LogEntryDetails,
} from 'my-chess-opening-core';
import { LogsService } from '../../services/logs.service';
import { NotificationService } from '../../shared/notifications/notification.service';

type TimePreset = 'none' | '1h' | '24h' | '7d';

@Component({
	standalone: true,
	selector: 'app-logs-page',
	imports: [
		CommonModule,
		FormsModule,
		DatePipe,

		MatTableModule,
		MatPaginatorModule,
		MatFormFieldModule,
		MatSelectModule,
		MatInputModule,
		MatButtonModule,
		MatIconModule,
		MatChipsModule,
		MatSidenavModule,
		MatProgressSpinnerModule,
		MatExpansionModule,
	],
	templateUrl: './logs-page.component.html',
	styleUrls: ['./logs-page.component.scss'],
})
export class LogsPageComponent {
	readonly displayedColumns = [
		'createdAt',
		'level',
		'scope',
		'site',
		'username',
		'message',
		'externalId',
		'actions',
	];

	// Data
	items = signal<LogListItem[]>([]);
	total = signal(0);
	loading = signal(false);

	// Facets
	scopes = signal<string[]>([]);
	usernames = signal<string[]>([]);
	sitesInData = signal<ExternalSite[]>([]);

	// Filters
	levels = signal<ImportLogLevel[]>(['INFO', 'WARN', 'ERROR']);
	sites = signal<ExternalSite[]>([]);
	selectedScopes = signal<(string | null)[]>([]);
	username = signal<string>('');
	search = signal<string>('');
	timePreset = signal<TimePreset>('none');
	importRunId = signal<string>(''); // optional

	// Paging
	page = signal(1);
	pageSize = signal(50);

	// Details drawer
	detailsOpen = signal(false);
	selectedId = signal<string | null>(null);
	selectedDetails = signal<LogEntryDetails | null>(null);
	detailsLoading = signal(false);

	runContext = signal<any>(null);

	// UI state
	advancedOpen = signal(false);

	toggleAdvanced(): void {
		this.advancedOpen.update((v) => !v);
	}

	// Derived: chips state
	chips = computed(() => {
		const out: { key: string; label: string }[] = [];
		const lv = this.levels();
		if (lv.length && lv.length < 3) out.push({ key: 'levels', label: `Level: ${lv.join(', ')}` });

		const st = this.sites();
		if (st.length) out.push({ key: 'sites', label: `Site: ${st.join(', ')}` });

		const sc = this.selectedScopes();
		if (sc.length)
			out.push({ key: 'scopes', label: `Scope: ${sc.map((s) => s ?? '(empty)').join(', ')}` });

		const u = this.username().trim();
		if (u) out.push({ key: 'username', label: `User: ${u}` });

		const q = this.search().trim();
		if (q) out.push({ key: 'search', label: `Search: ${q}` });

		const t = this.timePreset();
		if (t !== 'none') out.push({ key: 'time', label: `Time: last ${t}` });

		const r = this.importRunId().trim();
		if (r) out.push({ key: 'run', label: `Run: ${r}` });

		return out;
	});

	constructor(
		private readonly logs: LogsService,
		private readonly notify: NotificationService,
	) {
		// Load facets once
		this.loadFacets();

		// Auto-load on state changes
		effect(() => {
			// Touch signals to track them
			void this.page();
			void this.pageSize();
			void this.levels();
			void this.sites();
			void this.selectedScopes();
			void this.username();
			void this.search();
			void this.timePreset();
			void this.importRunId();

			// Debounce the search a bit (manual)
			this.queueReload();
		});
	}

	private reloadTimer: any = null;

	private queueReload(): void {
		if (this.reloadTimer) clearTimeout(this.reloadTimer);
		this.reloadTimer = setTimeout(() => this.loadPage(), 250);
	}

	async loadFacets(): Promise<void> {
		try {
			const f = await this.logs.facets();
			this.scopes.set(f.scopes);
			this.usernames.set(f.usernames);
			this.sitesInData.set(f.sites);
		} catch (e) {
			this.notify.error('Failed to load log filters.', {
				actionLabel: 'Retry',
				onAction: () => void this.loadFacets(),
			});
		}
	}

	private computeCreatedAtGteIso(): string | null {
		const preset = this.timePreset();
		if (preset === 'none') return null;

		const now = Date.now();
		const ms =
			preset === '1h'
				? 1 * 3600 * 1000
				: preset === '24h'
					? 24 * 3600 * 1000
					: 7 * 24 * 3600 * 1000;

		return new Date(now - ms).toISOString();
	}

	async loadPage(): Promise<void> {
		this.loading.set(true);
		try {
			const res = await this.logs.list({
				page: this.page(),
				pageSize: this.pageSize(),
				filters: {
					levels: this.levels(),
					sites: this.sites().length ? this.sites() : undefined,
					scopes: this.selectedScopes().length ? this.selectedScopes() : undefined,
					username: this.username().trim() ? this.username().trim() : null,
					search: this.search().trim() ? this.search().trim() : null,
					importRunId: this.importRunId().trim() ? this.importRunId().trim() : null,
					createdAtGteIso: this.computeCreatedAtGteIso(),
				},
			});

			this.items.set(res.items);
			this.total.set(res.total);
			this.runContext.set(res.runContext ?? null);
		} catch (e) {
			this.notify.error('Failed to load logs.', {
				actionLabel: 'Retry',
				onAction: () => void this.loadPage(),
			});
			this.items.set([]);
			this.total.set(0);
			this.runContext.set(null);
		} finally {
			this.loading.set(false);
		}
	}

	onPage(event: PageEvent): void {
		this.pageSize.set(event.pageSize);
		this.page.set(event.pageIndex + 1);
	}

	clearFilters(): void {
		this.levels.set(['INFO', 'WARN', 'ERROR']);
		this.sites.set([]);
		this.selectedScopes.set([]);
		this.username.set('');
		this.search.set('');
		this.timePreset.set('none');
		this.importRunId.set('');
		this.page.set(1);
	}

	removeChip(key: string): void {
		if (key === 'levels') this.levels.set(['INFO', 'WARN', 'ERROR']);
		if (key === 'sites') this.sites.set([]);
		if (key === 'scopes') this.selectedScopes.set([]);
		if (key === 'username') this.username.set('');
		if (key === 'search') this.search.set('');
		if (key === 'time') this.timePreset.set('none');
		if (key === 'run') this.importRunId.set('');
		this.page.set(1);
	}

	setErrorsOnly(): void {
		this.levels.set(['ERROR']);
		this.page.set(1);
	}

	setWarningsAndErrors(): void {
		this.levels.set(['WARN', 'ERROR']);
		this.page.set(1);
	}

	async openDetails(row: LogListItem): Promise<void> {
		this.detailsOpen.set(true);
		this.selectedId.set(row.id);
		this.selectedDetails.set(null);
		this.detailsLoading.set(true);

		try {
			const d = await this.logs.getEntry(row.id);
			this.selectedDetails.set(d);
		} catch (e) {
			this.notify.error('Failed to load log details.', {
				actionLabel: 'Retry',
				onAction: () => void this.openDetails(row),
			});
			this.selectedDetails.set(null);
		} finally {
			this.detailsLoading.set(false);
		}
	}

	closeDetails(): void {
		this.detailsOpen.set(false);
		this.selectedId.set(null);
		this.selectedDetails.set(null);
	}

	openUrl(url: string | null): void {
		if (!url) return;
		window.open(url, '_blank');
	}

	viewRun(importRunId: string): void {
		this.importRunId.set(importRunId);
		this.page.set(1);
		this.closeDetails();
	}

	formatDataPretty(data: string | null): string {
		if (!data) return '';
		try {
			const obj = JSON.parse(data);
			return JSON.stringify(obj, null, 2);
		} catch {
			return data;
		}
	}

	async copyToClipboard(text: string): Promise<void> {
		try {
			await navigator.clipboard.writeText(text);
		} catch (e) {
			this.notify.warn('Clipboard copy failed.');
		}
	}
}
