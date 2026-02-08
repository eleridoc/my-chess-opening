import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';

/**
 * QaPageComponent
 *
 * Placeholder page kept for future QA tooling.
 * The route is already guarded by devModeGuard.
 */
@Component({
	selector: 'app-qa-page',
	standalone: true,
	imports: [CommonModule],
	templateUrl: './qa-page.component.html',
	styleUrl: './qa-page.component.scss',
})
export class QaPageComponent {}
