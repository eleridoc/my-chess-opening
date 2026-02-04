import { inject, Pipe, PipeTransform } from '@angular/core';

import { DateFormatService, type IsoInput } from '../date-format.service';

/**
 * appIsoDateTime
 *
 * Formats an ISO 8601 string into a locale-aware date+time string.
 * Use `withSeconds=true` for log screens.
 */
@Pipe({
	name: 'appIsoDateTime',
	standalone: true,
})
export class IsoDateTimePipe implements PipeTransform {
	private readonly dates = inject(DateFormatService);

	transform(iso: IsoInput, withSeconds = false): string {
		return this.dates.formatDateTime(iso, withSeconds);
	}
}
