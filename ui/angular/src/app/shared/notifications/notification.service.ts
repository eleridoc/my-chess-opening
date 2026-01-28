import { Injectable } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';

import { AppSnackbarComponent } from './app-snackbar.component';
import type { NotificationKind, NotifyOptions } from './notification.model';

@Injectable({ providedIn: 'root' })
export class NotificationService {
	constructor(private readonly snackBar: MatSnackBar) {}

	/**
	 * Avoid NG0100 (ExpressionChangedAfterItHasBeenCheckedError) when a notification is triggered
	 * during Angular change detection (typical case: @Input setters / ngOnChanges).
	 *
	 * Strategy:
	 * - queue notifications to a microtask
	 * - "last wins" within the same tick to prevent spam
	 */
	private scheduled = false;
	private nextId = 0;
	private activeId = 0;
	private pending: {
		id: number;
		kind: NotificationKind;
		message: string;
		opts?: NotifyOptions;
	} | null = null;

	info(message: string, opts?: NotifyOptions): void {
		this.enqueue('info', message, opts);
	}

	success(message: string, opts?: NotifyOptions): void {
		this.enqueue('success', message, opts);
	}

	warn(message: string, opts?: NotifyOptions): void {
		this.enqueue('warn', message, opts);
	}

	error(message: string, opts?: NotifyOptions): void {
		this.enqueue('error', message, opts);
	}

	private enqueue(kind: NotificationKind, message: string, opts?: NotifyOptions): void {
		const id = ++this.nextId;

		// "Last wins" per tick: prevents spam and ensures deterministic UI.
		this.pending = { id, kind, message, opts };

		if (this.scheduled) return;
		this.scheduled = true;

		queueMicrotask(() => {
			this.scheduled = false;

			const p = this.pending;
			this.pending = null;
			if (!p) return;

			this.openNow(p.id, p.kind, p.message, p.opts);
		});
	}

	private openNow(id: number, kind: NotificationKind, message: string, opts?: NotifyOptions): void {
		this.activeId = id;
		this.safeOpen(id, kind, message, opts, 0);
	}

	private safeOpen(
		id: number,
		kind: NotificationKind,
		message: string,
		opts: NotifyOptions | undefined,
		attempt: number,
	): void {
		// Cancel if a newer notification took over.
		if (id !== this.activeId) return;

		try {
			const durationMs = opts?.durationMs ?? this.defaultDuration(kind);

			// We keep a single snackbar visible at a time to avoid UI clutter.
			this.snackBar.dismiss();

			const ref = this.snackBar.openFromComponent(AppSnackbarComponent, {
				data: { kind, message, actionLabel: opts?.actionLabel },
				duration: durationMs,
				horizontalPosition: 'end',
				verticalPosition: 'bottom',
				panelClass: ['mco-snackbar', `mco-snackbar--${kind}`],
				announcementMessage: message,
			});

			if (opts?.onAction) {
				ref.onAction().subscribe(() => opts.onAction?.());
			}
		} catch (e) {
			// Cancel if a newer notification took over during the throw.
			if (id !== this.activeId) return;

			const transient = this.isTransientOverlayError(e);
			if (transient && attempt < 2) {
				// Retry later (routing/overlays can transiently break DOM insertion).
				const delayMs = attempt === 0 ? 0 : 50;
				setTimeout(() => this.safeOpen(id, kind, message, opts, attempt + 1), delayMs);
				return;
			}

			// Never crash the app because of notifications.
			// Keep logs minimal to avoid spam.
			console.error('[NotificationService] Failed to show snackbar:', e);
		}
	}

	private isTransientOverlayError(e: unknown): boolean {
		const name = (e as any)?.name;
		const msg = String((e as any)?.message ?? '');

		return (
			name === 'HierarchyRequestError' ||
			msg.includes('HierarchyRequestError') ||
			msg.includes("Failed to execute 'insertBefore'") ||
			msg.includes("Failed to execute 'appendChild'")
		);
	}

	private defaultDuration(kind: NotificationKind): number {
		switch (kind) {
			case 'success':
				return 3000;
			case 'warn':
				return 5000;
			case 'error':
				return 6000;
			case 'info':
			default:
				return 3000;
		}
	}
}
