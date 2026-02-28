import { CommonModule } from '@angular/common';
import { Component, Input } from '@angular/core';

import type { ImportBatchTotalsVm } from '../../../../services/import-state.service';
import { IsoDateTimePipe } from '../../../../shared/dates/pipes';

@Component({
	standalone: true,
	selector: 'app-import-batch-summary',
	imports: [CommonModule, IsoDateTimePipe],
	templateUrl: './batch-summary.component.html',
	styleUrl: './batch-summary.component.scss',
})
export class ImportBatchSummaryComponent {
	/** Import batch id (non-null while a batch is running / displayed). */
	@Input({ required: true }) batchId!: string;

	/** ISO 8601 timestamp (nullable). */
	@Input() startedAtIso: string | null = null;

	/** ISO 8601 timestamp (nullable). */
	@Input() finishedAtIso: string | null = null;

	/** Optional dev limit, displayed only when not null. */
	@Input() maxGamesPerAccount: number | null = null;

	/** Aggregate totals, displayed only when available. */
	@Input() totals: ImportBatchTotalsVm | null = null;
}
