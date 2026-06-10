import * as API from '$lib/shared/constants/api.js';
import * as BACKEND from '$lib/shared/constants/backend.js';
import { getBaseUrl } from '$lib/shared/utils/helpers.js';
import { DEFAULT_ERROR } from '$lib/shared/constants/error.js';
import { serverLog, LogEvent } from '$lib/shared/utils/log.js';
import type { PositionListResponse, CreatePositionResponse, TradeRequest, TradeConfirmation } from "$lib/shared/types/trading.js";
import type { ApiClient } from '$lib/core/api/ApiClient.js';
import type { SessionTokens } from '$lib/shared/types/auth.js';
import type { URL_TYPE } from '$lib/shared/types/url.js';

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

export async function getConfirmation(client: ApiClient, dealReference: string): Promise<TradeConfirmation> {
    const endpoint = API.getDealReferenceEndpoint(dealReference);
    const conf = await client.get<TradeConfirmation>(endpoint);

    if (conf.dealStatus === 'REJECTED') {
        serverLog({
            tag: LogEvent.TradeRejected,
            dealReference,
            rejectReason: conf.rejectReason || 'Unknown',
            epic: conf.epic,
            size: conf.size,
            direction: conf.direction,
        });
        throw new Error(`Order rejected: ${conf.rejectReason || 'Unknown'}`);
    }

    if (isValidConfirmation(conf)) return conf;

    await new Promise(r => setTimeout(r, 300));
    const retry = await client.get<TradeConfirmation>(endpoint);

    if (retry.dealStatus === 'REJECTED') {
        serverLog({
            tag: LogEvent.TradeRejected,
            dealReference,
            rejectReason: retry.rejectReason || 'Unknown',
            epic: retry.epic,
            size: retry.size,
            direction: retry.direction,
        });
        throw new Error(`Order rejected: ${retry.rejectReason || 'Unknown'}`);
    }

    if (isValidConfirmation(retry)) return retry;

    throw new Error(`Broker returned invalid confirmation for ${dealReference}: level=${retry.level}, dealId=${retry.dealId}`);
}

function isValidConfirmation(conf: TradeConfirmation): boolean {
    return !!conf.dealId && !!conf.level && conf.level > 0;
}