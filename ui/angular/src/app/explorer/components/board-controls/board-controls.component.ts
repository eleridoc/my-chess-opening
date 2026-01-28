import { Component, EventEmitter, Input, Output } from '@angular/core';

import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';

@Component({
	selector: 'app-board-controls',
	standalone: true,
	imports: [MatButtonModule, MatIconModule],
	templateUrl: './board-controls.component.html',
	styleUrl: './board-controls.component.scss',
})
export class BoardControlsComponent {
	/**
	 * UI-only navigation controls for the Explorer.
	 *
	 * This component does NOT implement chess rules.
	 * It only:
	 * - displays buttons
	 * - emits user intentions (start/prev/next/end/reset)
	 */

	@Input() canStart = false;
	@Input() canPrev = false;
	@Input() canNext = false;
	@Input() canEnd = false;

	@Output() reset = new EventEmitter<void>();
	@Output() start = new EventEmitter<void>();
	@Output() prev = new EventEmitter<void>();
	@Output() next = new EventEmitter<void>();
	@Output() end = new EventEmitter<void>();
	@Output() rotate = new EventEmitter<void>();

	/** Emit "reset" (hard reset to initial state). */
	onResetClick(): void {
		this.reset.emit();
	}

	/** Emit "start" (jump to start). */
	onStartClick(): void {
		this.start.emit();
	}

	/** Emit "prev" (go to previous ply). */
	onPrevClick(): void {
		this.prev.emit();
	}

	/** Emit "next" (go to next ply). */
	onNextClick(): void {
		this.next.emit();
	}

	/** Emit "end" (jump to end). */
	onEndClick(): void {
		this.end.emit();
	}

	/** Emit "rotate" (toggle board orientation). */
	onRotateClick(): void {
		this.rotate.emit();
	}
}
