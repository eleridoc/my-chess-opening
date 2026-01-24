/**
 * Notification types shared between the NotificationService and the snackbar component.
 *
 * Design goals:
 * - Small surface area: only the essentials needed by the whole app.
 * - UI-agnostic: no Material-specific types here.
 */

export type NotificationKind = 'info' | 'success' | 'warn' | 'error';

export interface NotifyOptions {
	/** Duration in milliseconds. If omitted, the service picks a default based on the kind. */
	durationMs?: number;

	/** Optional label to display an action button (e.g. "Undo", "Retry"). */
	actionLabel?: string;

	/** Callback invoked when the user clicks the action button. */
	onAction?: () => void;
}

export interface NotificationData {
	/** Visual/semantic kind of notification (drives icon + colors). */
	kind: NotificationKind;

	/** Human-readable message (keep it short/snackbar-friendly). */
	message: string;

	/** Optional action label shown in the snackbar. */
	actionLabel?: string;
}
