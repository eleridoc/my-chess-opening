import { Component, inject } from '@angular/core';

import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';

import { ExternalLinkService } from '../../shared/system/external-link.service';
import { COMMUNITY_LINKS } from '../../shared/system/community-links';
import { APP_VERSION } from '../../shared/system/app-version';

@Component({
	standalone: true,
	selector: 'app-about-page',
	imports: [MatButtonModule, MatIconModule],
	templateUrl: './about-page.component.html',
	styleUrl: './about-page.component.scss',
})
export class AboutPageComponent {
	private readonly externalLink = inject(ExternalLinkService);

	readonly links = COMMUNITY_LINKS;
	readonly appVersion = APP_VERSION;

	openDiscord(): void {
		this.externalLink.open(this.links.discordInvite);
	}

	openExternal(url: string, event?: Event): void {
		this.externalLink.open(url, event);
	}
}
