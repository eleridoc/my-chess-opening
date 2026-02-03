import { Component, OnInit, inject, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';

import { AccountsStateService } from './services/accounts-state.service';

@Component({
	selector: 'app-root',
	imports: [RouterOutlet],
	templateUrl: './app.html',
	styleUrl: './app.scss',
})
export class App implements OnInit {
	protected readonly title = signal('angular');
	private readonly accountsState = inject(AccountsStateService);

	async ngOnInit(): Promise<void> {
		await this.accountsState.refresh();

		if (window.electron) {
			try {
				const res = await window.electron.ping();
				console.log('[Angular] ping result:', res);
			} catch (err) {
				console.error('[Angular] ping failed:', err);
			}
		} else {
			console.log('[Angular] window.electron is not available (browser mode)');
		}
	}
}
