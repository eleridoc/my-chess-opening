import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { MatTooltipModule } from '@angular/material/tooltip';

import { ExplorerFacade } from '../../facade/explorer.facade';
import { GameMetaHeaderCardComponent } from '../game-meta-header-card/game-meta-header-card.component';

import type { GameResultKey } from '../../view-models/game-info-header.vm';

@Component({
	selector: 'app-explorer-game-info-panel',
	standalone: true,
	imports: [CommonModule, MatTooltipModule, GameMetaHeaderCardComponent],
	templateUrl: './explorer-game-info-panel.component.html',
	styleUrls: ['./explorer-game-info-panel.component.scss'],
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ExplorerGameInfoPanelComponent {
	@Input({ required: true }) facade!: ExplorerFacade;

	resultText(key: GameResultKey | undefined): string {
		if (key === 'white_win') return 'White wins';
		if (key === 'black_win') return 'Black wins';
		if (key === 'draw') return 'Draw';
		if (key === 'ongoing') return 'Ongoing';
		return '—';
	}
}
