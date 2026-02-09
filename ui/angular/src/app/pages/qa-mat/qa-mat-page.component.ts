import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';

/**
 * QaMatPageComponent
 *
 * Minimal page used to visualize theme swatches (Material tokens).
 * Intentionally keeps no interactive Material showroom to avoid noise.
 */
@Component({
	selector: 'app-qa-mat-page',
	standalone: true,
	imports: [CommonModule],
	templateUrl: './qa-mat-page.component.html',
	styleUrl: './qa-mat-page.component.scss',
})
export class QaMatPageComponent {}
