import * as API from '$lib/shared/constants/api.js';
import type { MarketDetailsResponse, MarketListResponse } from "$lib/shared/types/market.js";
import type { ApiClient } from '$lib/core/api/ApiClient.js';
import { log } from '$lib/shared/utils/log.js';

export function getMarketDetails(
    client: ApiClient,
    epic: string
): Promise<MarketDetailsResponse> {
    return client.get<MarketDetailsResponse>(`${API.MARKETS_ENDPOINT}/${epic}`);
}

export function searchMarkets(
    client: ApiClient,
    searchTerm: string
): Promise<MarketListResponse> {
    const params = { searchTerm };
    return client.get<MarketListResponse>(API.MARKETS_ENDPOINT, params);
}

export function getMarketsByEpics(
    client: ApiClient,
    epics: string[]
): Promise<MarketListResponse> {
    const epicsStr = epics.join(',');
    log.info(`[MarketApiService] Fetching bulk epics: ${epicsStr}`);
    const params = { epics: epicsStr };
    return client.get<MarketListResponse>(API.MARKETS_ENDPOINT, params);
}