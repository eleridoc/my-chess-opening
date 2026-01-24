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
	private pending: { kind: NotificationKind; message: string; opts?: NotifyOptions } | null = null;

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
		// "Last wins" per tick: prevents spam and ensures deterministic UI.
		this.pending = { kind, message, opts };

		if (this.scheduled) return;
		this.scheduled = true;

		queueMicrotask(() => {
			this.scheduled = false;

			const p = this.pending;
			this.pending = null;
			if (!p) return;

			this.openNow(p.kind, p.message, p.opts);
		});
	}

	private openNow(kind: NotificationKind, message: string, opts?: NotifyOptions): void {
		const durationMs = opts?.durationMs ?? this.defaultDuration(kind);

		// We keep a single snackbar visible at a time to avoid UI clutter.
		this.snackBar.dismiss();

		const ref = this.snackBar.openFromComponent(AppSnackbarComponent, {
			data: { kind, message, actionLabel: opts?.actionLabel },
			duration: durationMs,
			horizontalPosition: 'end',
			verticalPosition: 'bottom',
			panelClass: ['mco-snackbar', `mco-snackbar--${kind}`],
		});

		if (opts?.onAction) {
			ref.onAction().subscribe(() => opts.onAction?.());
		}
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
