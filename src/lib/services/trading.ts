import * as API from '$lib/constants/api.js';
import * as BACKEND from '$lib/constants/backend.js';
import type { PositionListResponse, CreatePositionResponse, TradeRequest, TradeConfirmation } from "$lib/types/trading.js";
import type { ApiClient } from '$lib/api/client.js';
import type { SessionTokens } from '$lib/types/auth.js';
import type { URL_TYPE } from '$lib/types/url.js';
import { getBaseUrl } from '$lib/utils/helpers.js';
import { DEFAULT_ERROR } from '$lib/constants/error.js';

export interface PositionUpdateBody {
    stopLevel?: number;
    profitLevel?: number;
    guaranteedStop?: boolean;
    trailingStop?: boolean;
}

export function getPositions(client: ApiClient): Promise<PositionListResponse> {
    return client.get<PositionListResponse>(API.POSITIONS_ENDPOINT);
}

export function createPosition(client: ApiClient, trade: TradeRequest): Promise<CreatePositionResponse> {
    return client.post<CreatePositionResponse>(API.POSITIONS_ENDPOINT, trade);
}

export async function updatePosition(
    type: URL_TYPE,
    tokens: SessionTokens,
    dealId: string,
    updates: PositionUpdateBody
): Promise<CreatePositionResponse> {
    const brokerUrl = `${getBaseUrl(type)}${API.POSITIONS_ENDPOINT}/${dealId}`;

    const payload = {
        url: brokerUrl,
        sessionTokens: tokens,
        data: updates
    };

    const response = await fetch(`${BACKEND.URL}${BACKEND.POSITIONS_PROXY}`, {
        method: API.PUT_METHOD,
        headers: {
            [API.CONTENT_TYPE_KEY]: API.APPLICATION_JSON_CONTENT_TYPE
        },
        body: JSON.stringify(payload)
    });

    if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.message || DEFAULT_ERROR);
    }

    return await response.json() as CreatePositionResponse;
}

export function getConfirmation(client: ApiClient, dealReference: string): Promise<TradeConfirmation> {
    const endpoint = API.getDealReferenceEndpoint(dealReference);
    return client.get<TradeConfirmation>(endpoint);
}