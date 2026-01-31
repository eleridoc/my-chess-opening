import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';

import type {
	GameInfoHeaderVm,
	GameRatedKey,
	GameSpeedKey,
} from '../../view-models/game-info-header.vm';

type MetaPartKind = 'timeControl' | 'rated' | 'speed';
type MetaPart = { kind: MetaPartKind; text: string };

/**
 * GameMetaHeaderCardComponent (UI / Angular)
 *
 * Displays a compact "game meta" header block in the Explorer left panel.
 *
 * This component is intentionally flexible:
 * - It receives the SINGLE header VM (GameInfoHeaderVm).
 * - It renders raw/structured pieces (time control, rated key, speed key, playedAtIso)
 *   without forcing a pre-formatted "line1/line2" contract.
 *
 * Localization note:
 * - For now, we map enum-like keys to English labels locally.
 * - Later this mapping will be replaced by i18n (translation keys).
 */
@Component({
	selector: 'app-game-meta-header-card',
	standalone: true,
	imports: [CommonModule, MatIconModule],
	templateUrl: './game-meta-header-card.component.html',
	styleUrls: ['./game-meta-header-card.component.scss'],
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GameMetaHeaderCardComponent {
	/** Single header VM (computed by the facade). */
	@Input({ required: true }) header!: GameInfoHeaderVm;

	get icon(): string {
		return this.speedKeyToIcon(this.header?.meta?.speedKey);
	}

	get playedAtIso(): string {
		return (this.header?.meta?.playedAtIso ?? '').trim() || '—';
	}

	get metaParts(): MetaPart[] {
		const parts: MetaPart[] = [];

		const tc = this.getTimeControlText();
		if (tc) parts.push({ kind: 'timeControl', text: tc });

		const rated = this.ratedLabel(this.header?.meta?.ratedKey);
		if (rated) parts.push({ kind: 'rated', text: rated });

		const speed = this.speedLabel(this.header?.meta?.speedKey);
		if (speed) parts.push({ kind: 'speed', text: speed });

		return parts;
	}

	private getTimeControlText(): string | null {
		const tc = this.header?.meta?.timeControl;
		const text = (tc?.text ?? '').trim();
		if (text) return text;

		const raw = (tc?.raw ?? '').trim();
		if (raw) return raw;

		return null;
	}

	private ratedLabel(key: GameRatedKey | undefined): string | null {
		if (key === 'rated') return 'Rated';
		if (key === 'casual') return 'Casual';
		return null;
	}

	private speedLabel(key: GameSpeedKey | undefined): string | null {
		if (key === 'bullet') return 'Bullet';
		if (key === 'blitz') return 'Blitz';
		if (key === 'rapid') return 'Rapid';
		if (key === 'classical') return 'Classical';
		return null;
	}

	private speedKeyToIcon(key: GameSpeedKey | undefined): string {
		// UI-level choice (Material icons)
		if (key === 'bullet') return 'flash_on';
		if (key === 'blitz') return 'bolt';
		if (key === 'rapid') return 'timer';
		if (key === 'classical') return 'hourglass_bottom';
		return 'help';
	}
}
