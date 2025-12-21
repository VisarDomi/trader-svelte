import * as API from '$lib/constants/api.js';
import type { PositionListResponse, CreatePositionResponse, TradeRequest, TradeConfirmation } from "$lib/types/trading.js";
import type { ApiClient } from '$lib/api/client.js';

export function getPositions(client: ApiClient): Promise<PositionListResponse> {
    return client.get<PositionListResponse>(API.POSITIONS_ENDPOINT);
}

export function createPosition(client: ApiClient, trade: TradeRequest): Promise<CreatePositionResponse> {
    return client.post<CreatePositionResponse>(API.POSITIONS_ENDPOINT, trade);
}

export function getConfirmation(client: ApiClient, dealReference: string): Promise<TradeConfirmation> {
    const endpoint = API.getDealReferenceEndpoint(dealReference);
    return client.get<TradeConfirmation>(endpoint);
}