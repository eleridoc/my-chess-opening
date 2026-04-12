import {
	Directive,
	EventEmitter,
	Input,
	Output,
	DestroyRef,
	Renderer2,
	inject,
} from '@angular/core';

type ShortcutCanActivate = () => boolean;

/**
 * Explorer navigation shortcuts.
 *
 * Adds mouse wheel + keyboard shortcuts to trigger explorer navigation
 * without re-implementing navigation logic. The directive only emits events; the parent
 * component remains responsible for:
 * - the actual navigation implementation
 * - the "can*" state (same logic as the existing buttons)
 *
 * Shortcuts:
 * - Wheel up   => next
 * - Wheel down => previous
 * - ArrowRight => next
 * - ArrowLeft  => previous
 * - ArrowUp    => previous variation
 * - ArrowDown  => next variation
 * - Home       => start
 * - End        => end
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

	/** Whether previous variation navigation is currently possible. */
	@Input() appExplorerNavigationShortcutsCanPrevVariation: ShortcutCanActivate = () => false;

	/** Whether next variation navigation is currently possible. */
	@Input() appExplorerNavigationShortcutsCanNextVariation: ShortcutCanActivate = () => false;

	/** Whether start navigation is currently possible. */
	@Input() appExplorerNavigationShortcutsCanStart: ShortcutCanActivate = () => false;

	/** Whether end navigation is currently possible. */
	@Input() appExplorerNavigationShortcutsCanEnd: ShortcutCanActivate = () => false;

	/** Emitted when the directive requests a "previous" navigation. */
	@Output() explorerShortcutPrev = new EventEmitter<void>();

	/** Emitted when the directive requests a "next" navigation. */
	@Output() explorerShortcutNext = new EventEmitter<void>();

	/** Emitted when the directive requests a "previous variation" navigation. */
	@Output() explorerShortcutPrevVariation = new EventEmitter<void>();

	/** Emitted when the directive requests a "next variation" navigation. */
	@Output() explorerShortcutNextVariation = new EventEmitter<void>();

	/** Emitted when the directive requests a "start" navigation. */
	@Output() explorerShortcutStart = new EventEmitter<void>();

	/** Emitted when the directive requests an "end" navigation. */
	@Output() explorerShortcutEnd = new EventEmitter<void>();

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

		switch (event.key) {
			case 'ArrowRight':
				if (this.appExplorerNavigationShortcutsCanNext) {
					event.preventDefault();
					this.explorerShortcutNext.emit();
				}
				return;

			case 'ArrowLeft':
				if (this.appExplorerNavigationShortcutsCanPrev) {
					event.preventDefault();
					this.explorerShortcutPrev.emit();
				}
				return;

			case 'ArrowUp':
				if (this.appExplorerNavigationShortcutsCanPrevVariation()) {
					event.preventDefault();
					this.explorerShortcutPrevVariation.emit();
				}
				return;

			case 'ArrowDown':
				if (this.appExplorerNavigationShortcutsCanNextVariation()) {
					event.preventDefault();
					this.explorerShortcutNextVariation.emit();
				}
				return;

			case 'Home':
				if (this.appExplorerNavigationShortcutsCanStart()) {
					event.preventDefault();
					this.explorerShortcutStart.emit();
				}
				return;

			case 'End':
				if (this.appExplorerNavigationShortcutsCanEnd()) {
					event.preventDefault();
					this.explorerShortcutEnd.emit();
				}
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
