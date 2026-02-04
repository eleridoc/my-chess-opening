import { inject, Pipe, PipeTransform } from '@angular/core';

import { DateFormatService, type IsoInput } from '../date-format.service';

/**
 * appIsoDate
 *
 * Formats an ISO 8601 string into a locale-aware date string.
 */
@Pipe({
	name: 'appIsoDate',
	standalone: true,
})
export class IsoDatePipe implements PipeTransform {
	private readonly dates = inject(DateFormatService);

	transform(iso: IsoInput): string {
		return this.dates.formatDate(iso);
	}
}
