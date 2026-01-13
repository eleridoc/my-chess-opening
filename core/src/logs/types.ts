import type { ExternalSite } from '../import/types';

export type ImportLogLevel = 'INFO' | 'WARN' | 'ERROR';

export interface LogsListFilters {
	levels?: ImportLogLevel[];
	sites?: ExternalSite[];
	scopes?: (string | null)[];
	username?: string | null;
	search?: string | null;
	importRunId?: string | null;
	createdAtGteIso?: string | null;
}

export interface LogsListInput {
	page?: number; // 1-based
	pageSize?: number; // default 50
	filters?: LogsListFilters;
}

export interface LogListItem {
	id: string;
	createdAtIso: string;

	level: ImportLogLevel;
	scope: string | null;
	site: ExternalSite | null;
	username: string | null;

	message: string;
	externalId: string | null;
	url: string | null;

	importRunId: string;
}

export interface ImportRunContext {
	id: string;
	accountConfigId: string;
	startedAtIso: string;
	finishedAtIso: string | null;
	status: 'SUCCESS' | 'FAILED' | 'PARTIAL';
	errorMessage: string | null;

	gamesFound: number;
	gamesInserted: number;
	gamesSkipped: number;
	gamesFailed: number;

	site: ExternalSite;
	username: string;
}

export interface LogsListResult {
	items: LogListItem[];
	total: number;
	page: number;
	pageSize: number;
	runContext?: ImportRunContext | null;
}

export interface LogEntryDetails extends LogListItem {
	data: string | null;
}

export interface LogsFacetsResult {
	scopes: string[];
	usernames: string[];
	sites: ExternalSite[];
}

export interface LogsApi {
	list: (input?: LogsListInput) => Promise<LogsListResult>;
	getEntry: (id: string) => Promise<LogEntryDetails | null>;
	facets: () => Promise<LogsFacetsResult>;
}
