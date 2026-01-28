import { Injectable } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class ExternalLinkService {
	open(url: string | null | undefined, event?: Event): void {
		// Keep it usable from (click) on <a> or from buttons
		event?.preventDefault?.();
		event?.stopPropagation?.();

		const u = (url ?? '').trim();
		if (!u) return;

		if (!window.electron) {
			// Browser/dev fallback
			window.open(u, '_blank', 'noopener,noreferrer');
			return;
		}

		void window.electron.system.openExternal(u);
	}
}
