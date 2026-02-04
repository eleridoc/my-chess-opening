import { CommonModule } from '@angular/common';
import { Component, Input, inject } from '@angular/core';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

import { LoadingService } from '../loading.service';

/**
 * GlobalLoaderComponent
 *
 * Fullscreen overlay driven by LoadingService.
 * Can be blocking (captures clicks/scroll) or non-blocking.
 *
 * Note:
 * - Visibility is controlled by LoadingService.isGlobalLoading().
 * - The component itself can always be mounted at the app root.
 */
@Component({
	selector: 'app-global-loader',
	standalone: true,
	imports: [CommonModule, MatProgressSpinnerModule],
	templateUrl: './global-loader.component.html',
	styleUrl: './global-loader.component.scss',
})
export class GlobalLoaderComponent {
	readonly loading = inject(LoadingService);

	/**
	 * When true, the overlay captures pointer events and prevents user interaction.
	 * When false, the overlay is purely visual (click-through).
	 */
	@Input() blocking = true;

	/** Optional label displayed next to the spinner. */
	@Input() label = 'Loading…';
}
