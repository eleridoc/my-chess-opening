import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';

/**
 * TestMatPageComponent
 *
 * Minimal page used to visualize theme swatches (Material tokens).
 * Intentionally keeps no interactive Material showroom to avoid noise.
 */
@Component({
	selector: 'app-test-mat-page',
	standalone: true,
	imports: [CommonModule],
	templateUrl: './test-mat-page.component.html',
	styleUrl: './test-mat-page.component.scss',
})
export class TestMatPageComponent {}
