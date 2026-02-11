import { CommonModule } from '@angular/common';
import { Component, OnInit, computed, effect, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';

import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTableModule } from '@angular/material/table';
import { MatTooltipModule } from '@angular/material/tooltip';

import type { ExternalSite } from 'my-chess-opening-core';

import { AccountsStateService } from '../../services/accounts-state.service';
import { ChessAccountsService } from '../../services/chess-accounts.service';
import { ImportStateService, type ImportAccountPhaseVm } from '../../services/import-state.service';
import { NotificationService } from '../../shared/notifications/notification.service';

import { IsoDateTimePipe } from '../../shared/dates/pipes';
import { SectionLoaderComponent } from '../../shared/loading/section-loader/section-loader.component';

/**
 * Import page view-models.
 * Keep them local to the page to avoid leaking UI-only concerns to services.
 */
type AccountRow = {
	id: string;
	site: 'LICHESS' | 'CHESSCOM';
	username: string;
	isEnabled: boolean;
	lastSyncAt: string | null;

	/**
	 * Total games stored locally for this account.
	 * Note: not currently used by the template, but kept for future UX (e.g. "Imported: N").
	 */
	gamesTotal: number;
};

type ImportErrorVm = {
	externalId: string | null;
	message: string;
};

type TableRowVm = AccountRow & {
	siteLabel: string;

	/**
	 * Tooltip for the per-account import action (null means "no special reason").
	 * Only used when the account is not enabled.
	 */
	disabledReason: string | null;

	// Live import state (streamed by Electron -> ImportStateService)
	isWaiting: boolean;
	gamesFound: number | null;
	processed: number | null;
	inserted: number | null;
	skipped: number | null;
	failed: number | null;
	status: string | null; // RUNNING / SUCCESS / FAILED / PARTIAL etc.
	errors: ImportErrorVm[];
	phase: ImportAccountPhaseVm | null;
};

const BASE_COLUMNS = ['site', 'username', 'lastSyncAt', 'actions'] as const;
const IMPORT_COLUMNS = [
	'site',
	'username',
	'lastSyncAt',
	'newGames',
	'progress',
	'results',
	'status',
	'actions',
] as const;

@Component({
	standalone: true,
	selector: 'app-import-page',
	imports: [
		CommonModule,
		RouterLink,
		MatButtonModule,
		MatIconModule,
		MatTableModule,
		MatTooltipModule,
		MatProgressBarModule,
		MatProgressSpinnerModule,
		SectionLoaderComponent,
		IsoDateTimePipe,
	],
	templateUrl: './import-page.component.html',
	styleUrl: './import-page.component.scss',
})
export class ImportPageComponent implements OnInit {
	// -------------------------------------------------------------------------
	// Dependencies (keep them private unless the template needs them)
	// -------------------------------------------------------------------------

	private readonly route = inject(ActivatedRoute);
	private readonly router = inject(Router);
	private readonly accountsState = inject(AccountsStateService);
	private readonly accounts = inject(ChessAccountsService);
	private readonly notify = inject(NotificationService);

	/**
	 * Public (used by template):
	 * Global import state (batch info + per-account progress).
	 */
	readonly importState = inject(ImportStateService);

	// -------------------------------------------------------------------------
	// Local state (signals)
	// -------------------------------------------------------------------------

	/**
	 * Browser mode vs desktop app mode (Electron).
	 * In browser mode we do not call IPC services and show a friendly message instead.
	 */
	readonly isDesktopApp = signal(false);

	readonly loading = signal(false);
	readonly error = signal<string | null>(null);
	readonly rows = signal<AccountRow[]>([]);

	/**
	 * Page-level guards to ensure we handle "batch finished" only once per batchId.
	 * Signals/effects can re-run for unrelated changes, so we keep explicit tracking here.
	 */
	private handledFinishedBatchId: string | null = null;
	private lastStartedBatchId: string | null = null;

	// -------------------------------------------------------------------------
	// Derived state (computed)
	// -------------------------------------------------------------------------

	/**
	 * UI choice:
	 * Keep last batch details visible after completion until the next run starts.
	 */
	readonly showImportInfo = computed(() => this.importState.batchId() != null);

	readonly displayedColumns = computed(() => {
		return this.showImportInfo() ? [...IMPORT_COLUMNS] : [...BASE_COLUMNS];
	});

	readonly actionsDisabled = computed(() => this.loading() || this.importState.isImporting());

	readonly tableRows = computed<TableRowVm[]>(() => {
		const baseRows = this.rows();
		const states = this.importState.accounts();
		const isImporting = this.importState.isImporting();

		return baseRows.map((r) => {
			const st = states[r.id] ?? null;

			/**
			 * "Waiting" means:
			 * - An import batch is currently running
			 * - The account is enabled
			 * - We haven't received any state for this account yet
			 */
			const isWaiting = isImporting && r.isEnabled && !st;

			const disabledReason = !r.isEnabled
				? 'Account disabled (enable it in Chess Accounts).'
				: null;

			return {
				...r,
				siteLabel: this.siteLabel(r.site),
				disabledReason,

				isWaiting,

				phase: st ? st.phase : null,
				gamesFound: st ? st.gamesFound : null,
				processed: st ? st.processed : null,
				inserted: st ? st.inserted : null,
				skipped: st ? st.skipped : null,
				failed: st ? st.failed : null,
				status: st ? st.status : null,
				errors: st ? st.errors : [],
			};
		});
	});

	// -------------------------------------------------------------------------
	// Effects
	// -------------------------------------------------------------------------

	constructor() {
		/**
		 * Reset page-level "finished" handling when a new batch starts.
		 * This allows the user to run multiple imports in a row and still refresh once per batch.
		 */
		effect(() => {
			const batchId = this.importState.batchId();
			const isImporting = this.importState.isImporting();

			if (!isImporting || !batchId) return;
			if (this.lastStartedBatchId === batchId) return;

			this.lastStartedBatchId = batchId;
			this.handledFinishedBatchId = null;
		});

		/**
		 * When a batch finishes, refresh account list so lastSyncAt updates.
		 */
		effect(() => {
			const batchId = this.importState.batchId();
			const finishedAtIso = this.importState.finishedAtIso();
			const isImporting = this.importState.isImporting();

			if (!batchId || !finishedAtIso || isImporting) return;
			if (this.handledFinishedBatchId === batchId) return;

			this.handledFinishedBatchId = batchId;
			void this.onBatchFinished();
		});
	}

	// -------------------------------------------------------------------------
	// Lifecycle
	// -------------------------------------------------------------------------

	async ngOnInit(): Promise<void> {
		// Ensure IPC subscription exists even if user lands here first.
		this.importState.ensureInitialized();

		// Feature detection: import is available only in the Electron desktop app.
		this.isDesktopApp.set(Boolean(window.electron?.import?.start));

		// Browser mode: do not call IPC services.
		if (!this.isDesktopApp()) return;

		// Load accounts first (importAll() relies on enabled accounts count).
		await this.refresh();

		// Optional autostart: /import?autostart=1
		const autostart = this.route.snapshot.queryParamMap.get('autostart') === '1';
		if (!autostart) return;

		/**
		 * Remove the query param to prevent accidental re-trigger:
		 * - refresh
		 * - back/forward navigation
		 */
		await this.router.navigate([], {
			relativeTo: this.route,
			queryParams: { autostart: null },
			queryParamsHandling: 'merge',
			replaceUrl: true,
		});

		await this.importAll();
	}

	// -------------------------------------------------------------------------
	// Template helpers
	// -------------------------------------------------------------------------

	readonly trackById = (_: number, r: TableRowVm): string => r.id;

	// -------------------------------------------------------------------------
	// Actions
	// -------------------------------------------------------------------------

	async refresh(): Promise<void> {
		this.loading.set(true);
		this.error.set(null);

		try {
			const res = await this.accounts.list();

			if (!res.ok) {
				this.rows.set([]);
				this.error.set(res.error.message);
				this.notify.error(res.error.message);
				return;
			}

			this.rows.set(res.rows.map(this.mapRow));
		} catch (e) {
			const msg = this.toErrorMessage(e, 'Unknown error while loading accounts.');
			this.rows.set([]);
			this.error.set(msg);
			this.notify.error(msg);
		} finally {
			this.loading.set(false);
		}
	}

	async importAll(): Promise<void> {
		if (this.actionsDisabled()) return;

		const enabledCount = this.rows().filter((r) => r.isEnabled).length;
		if (enabledCount === 0) {
			this.notify.warn('No enabled account to import.');
			return;
		}

		try {
			const res = await this.importState.startAll();
			this.notify.info(res.message);
		} catch (e) {
			const msg = this.toErrorMessage(e, 'Unknown error while starting import.');
			this.notify.error(msg);
		}
	}

	async importOne(accountId: string): Promise<void> {
		if (this.actionsDisabled()) return;

		const row = this.rows().find((r) => r.id === accountId);
		if (!row) return;

		if (!row.isEnabled) {
			this.notify.warn('This account is disabled. Enable it first in Chess Accounts.');
			return;
		}

		try {
			const res = await this.importState.startOne(accountId);
			this.notify.info(res.message);
		} catch (e) {
			const msg = this.toErrorMessage(e, 'Unknown error while starting import.');
			this.notify.error(msg);
		}
	}

	// -------------------------------------------------------------------------
	// Internal helpers
	// -------------------------------------------------------------------------

	private async onBatchFinished(): Promise<void> {
		// Refresh account lastSyncAt + keep global "hasAccounts" state consistent.
		await this.refresh();
		await this.accountsState.refresh();

		const totals = this.importState.totals();
		if (!totals) return;

		const limitedNote = this.getLimitedRunNote();

		if (totals.totalFailed > 0) {
			this.notify.warn(
				`Import finished with errors. Inserted ${totals.totalInserted}, skipped ${totals.totalSkipped}, failed ${totals.totalFailed}.${limitedNote}`,
			);
			return;
		}

		this.notify.success(
			`Import completed. Inserted ${totals.totalInserted}, skipped ${totals.totalSkipped}.${limitedNote}`,
		);
	}

	private getLimitedRunNote(): string {
		const limit = this.importState.maxGamesPerAccount();
		return typeof limit === 'number' && limit > 0 ? ' Limited run: last sync was not updated.' : '';
	}

	private toErrorMessage(error: unknown, fallback: string): string {
		return error instanceof Error ? error.message : fallback;
	}

	private mapRow = (r: {
		id: string;
		site: ExternalSite;
		username: string;
		isEnabled: boolean;
		lastSyncAt: string | null;
		gamesTotal: number;
	}): AccountRow => ({
		id: r.id,
		site: r.site as unknown as AccountRow['site'],
		username: r.username,
		isEnabled: r.isEnabled,
		lastSyncAt: r.lastSyncAt,
		gamesTotal: r.gamesTotal,
	});

	private siteLabel(site: AccountRow['site']): string {
		return site === 'LICHESS' ? 'Lichess' : 'Chess.com';
	}
}
