import {
	Directive,
	EventEmitter,
	Input,
	Output,
	DestroyRef,
	Renderer2,
	inject,
} from '@angular/core';

/**
 * Explorer navigation shortcuts.
 *
 * Adds mouse wheel + keyboard shortcuts to trigger the existing "previous / next" navigation
 * without re-implementing navigation logic. The directive only emits events; the parent
 * component remains responsible for:
 * - the actual navigation implementation (previous/next handlers)
 * - the "canPrev / canNext" state (same logic as the existing buttons)
 *
 * Shortcuts:
 * - Wheel up   => next
 * - Wheel down => previous
 * - ArrowRight => next
 * - ArrowLeft  => previous
 *
 * Notes:
 * - Wheel is scoped to the host element (so it doesn't affect other scroll areas).
 * - Keyboard is listened on window, but is ignored while typing in inputs/textareas/selects
 *   or contenteditable elements.
 * - Wheel is throttled to avoid trackpad spam.
 */
@Directive({
	selector: '[appExplorerNavigationShortcuts]',
	standalone: true,
	host: {
		// Host-scoped wheel handling: only triggers when pointer is over the host element.
		'(wheel)': 'onWheel($event)',
	},
})
export class ExplorerNavigationShortcutsDirective {
	private readonly destroyRef = inject(DestroyRef);
	private readonly renderer = inject(Renderer2);

	/** Prevents multiple triggers from trackpads / inertial scrolling. */
	private readonly wheelThrottleMs = 200;

	/** Timestamp (ms) of the last accepted wheel action. */
	private lastWheelAtMs = 0;

	/**
	 * Whether previous navigation is currently possible.
	 * Must reflect the exact same condition as the "Previous" button's disabled state.
	 */
	@Input() appExplorerNavigationShortcutsCanPrev = false;

	/**
	 * Whether next navigation is currently possible.
	 * Must reflect the exact same condition as the "Next" button's disabled state.
	 */
	@Input() appExplorerNavigationShortcutsCanNext = false;

	/** Emitted when the directive requests a "previous" navigation. */
	@Output() explorerShortcutPrev = new EventEmitter<void>();

	/** Emitted when the directive requests a "next" navigation. */
	@Output() explorerShortcutNext = new EventEmitter<void>();

	constructor() {
		// Keyboard shortcuts are global to the page (window-level).
		// We clean up the listener via DestroyRef to avoid leaks.
		const disposeKeydown = this.renderer.listen('window', 'keydown', (event: KeyboardEvent) => {
			this.onKeydown(event);
		});

		this.destroyRef.onDestroy(disposeKeydown);
	}

	onWheel(event: WheelEvent): void {
		// Avoid interfering with OS/browser gestures (zoom, history navigation, etc.)
		if (event.ctrlKey || event.metaKey || event.altKey || event.deltaY === 0) return;

		// Throttle wheel to prevent rapid-fire triggers from trackpads / inertial scroll.
		const now = Date.now();
		if (now - this.lastWheelAtMs < this.wheelThrottleMs) return;

		// Lichess-like convention:
		// - deltaY < 0 => wheel up => next
		// - deltaY > 0 => wheel down => previous
		if (event.deltaY < 0 && this.appExplorerNavigationShortcutsCanNext) {
			this.lastWheelAtMs = now;
			event.preventDefault();
			this.explorerShortcutNext.emit();
			return;
		}

		if (event.deltaY > 0 && this.appExplorerNavigationShortcutsCanPrev) {
			this.lastWheelAtMs = now;
			event.preventDefault();
			this.explorerShortcutPrev.emit();
		}
	}

	private onKeydown(event: KeyboardEvent): void {
		// Ignore when modifiers are pressed, when key repeats, or when typing in an editable field.
		if (
			event.ctrlKey ||
			event.metaKey ||
			event.altKey ||
			event.repeat ||
			this.isTypingTarget(event.target)
		) {
			return;
		}

		if (event.key === 'ArrowRight' && this.appExplorerNavigationShortcutsCanNext) {
			event.preventDefault();
			this.explorerShortcutNext.emit();
			return;
		}

		if (event.key === 'ArrowLeft' && this.appExplorerNavigationShortcutsCanPrev) {
			event.preventDefault();
			this.explorerShortcutPrev.emit();
		}
	}

	/**
	 * Returns true if the keyboard event target is an editable element
	 * (inputs, selects, textareas, or contenteditable trees).
	 */
	private isTypingTarget(target: EventTarget | null): boolean {
		if (!(target instanceof Element)) return false;

		const tagName = target.tagName.toLowerCase();
		if (tagName === 'input' || tagName === 'textarea' || tagName === 'select') return true;

		return target.closest('[contenteditable="true"]') !== null;
	}
}
