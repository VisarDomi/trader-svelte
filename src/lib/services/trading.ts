import * as API from '$lib/constants/api.js';
import { getBaseUrl } from "$lib/utils/helpers.js";
import type { URL_TYPE } from "$lib/types/url.js";
import type { SessionTokens } from "$lib/types/auth.js";
import type { PositionListResponse, CreatePositionResponse, TradeRequest } from "$lib/types/trading.js";
import { DEFAULT_ERROR } from "$lib/constants/error.js";

export async function getPositions(type: URL_TYPE, tokens: SessionTokens): Promise<PositionListResponse> {
    const baseUrl = getBaseUrl(type);
    const url = `${baseUrl}${API.POSITIONS_ENDPOINT}`;

    const response = await fetch(url, {
        method: API.GET_METHOD,
        headers: {
            [API.CST_KEY]: tokens[API.CST_KEY],
            [API.X_SECURITY_TOKEN_KEY]: tokens[API.X_SECURITY_TOKEN_KEY]
        }
    });

    if (!response.ok) {
        throw new Error(DEFAULT_ERROR);
    }

    return await response.json() as PositionListResponse;
}

export async function createPosition(type: URL_TYPE, tokens: SessionTokens, trade: TradeRequest): Promise<CreatePositionResponse> {
    const baseUrl = getBaseUrl(type);
    const url = `${baseUrl}${API.POSITIONS_ENDPOINT}`;

    const response = await fetch(url, {
        method: API.POST_METHOD,
        headers: {
            [API.CONTENT_TYPE_KEY]: API.APPLICATION_JSON_CONTENT_TYPE,
            [API.CST_KEY]: tokens[API.CST_KEY],
            [API.X_SECURITY_TOKEN_KEY]: tokens[API.X_SECURITY_TOKEN_KEY]
        },
        body: JSON.stringify(trade)
    });

    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.errorCode || DEFAULT_ERROR);
    }

    return await response.json() as CreatePositionResponse;
}