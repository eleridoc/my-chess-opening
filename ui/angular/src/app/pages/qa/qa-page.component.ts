import { CommonModule } from '@angular/common';
import { Component, isDevMode } from '@angular/core';
import { RouterLink } from '@angular/router';

import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';

import { ExplorerQaPanelComponent } from '../../explorer/components/explorer-qa-panel/explorer-qa-panel.component';

/**
 * QaPageComponent
 *
 * Dev-only surface to host QA tools (Explorer QA panel for now).
 * In production builds, the route can be guarded, and the UI displays a fallback note.
 */
@Component({
	selector: 'app-qa-page',
	standalone: true,
	imports: [
		CommonModule,
		RouterLink,
		MatButtonModule,
		MatCardModule,
		MatIconModule,
		ExplorerQaPanelComponent,
	],
	templateUrl: './qa-page.component.html',
	styleUrl: './qa-page.component.scss',
})
export class QaPageComponent {
	/** True only for Angular dev builds. Used to hide QA tools in production builds. */
	readonly isDevBuild = isDevMode();
}
