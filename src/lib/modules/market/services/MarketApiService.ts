import * as API from '$lib/shared/constants/api.js';
import type { MarketDetailsResponse } from "$lib/shared/types/market.js";
import type { ApiClient } from '$lib/modules/core/api/ApiClient.js';

export function getMarketDetails(
    client: ApiClient,
    epic: string
): Promise<MarketDetailsResponse> {
    return client.get<MarketDetailsResponse>(`${API.MARKETS_ENDPOINT}/${epic}`);
}