// Re-export domain types for convenience (public API surface)
export type { SetupState, SaveAccountsInput, SetupApi } from './setup/types';

export type { ImportRunNowInput, ImportRunNowResult, ImportApi } from './import/types';

export type {
	ImportLogLevel,
	LogsListFilters,
	LogsListInput,
	LogListItem,
	ImportRunContext,
	LogsListResult,
	LogEntryDetails,
	LogsFacetsResult,
	LogsApi,
} from '../logs/types';

// Compose ElectronApi from domain APIs
import type { SetupApi } from './setup/types';
import type { ImportApi } from './import/types';
import type { LogsApi } from '../logs/types';

export interface ElectronApi {
	ping: () => Promise<{ message: string; core: string }>;
	setup: SetupApi;
	import: ImportApi;
	logs: LogsApi;
}
