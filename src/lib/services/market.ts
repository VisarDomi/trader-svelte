import * as API from '$lib/constants/api.js';
import type { MarketDetailsResponse } from "$lib/types/market.js";
import type { ApiClient } from '$lib/api/client.js';

export function getMarketDetails(
    client: ApiClient,
    epic: string
): Promise<MarketDetailsResponse> {
    return client.get<MarketDetailsResponse>(`${API.MARKETS_ENDPOINT}/${epic}`);
}