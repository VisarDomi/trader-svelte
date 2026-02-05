import * as API from '$lib/shared/constants/api.js';
import * as BACKEND from '$lib/shared/constants/backend.js';
import { getBaseUrl } from "$lib/shared/utils/helpers.js";
import type { URL_TYPE } from "$lib/shared/types/url.js";
import type { Account, AccountPreferences, LeverageUpdate, PreferencesUpdateResponse } from "$lib/shared/types/account.js";
import { DEFAULT_ERROR } from "$lib/shared/constants/error.js";
import type { SessionTokens } from "$lib/shared/types/auth.js";
import type { ApiClient } from '$lib/core/api/ApiClient.js';

export async function getAccounts(client: ApiClient): Promise<Account[]> {
    const data = await client.get<{ accounts: Account[] }>(API.ACCOUNTS_ENDPOINT);
    return data.accounts;
}

// Kept as raw fetch because it hits the Node Proxy (Backend), not Capital directly
export async function switchAccount(type: URL_TYPE, tokens: SessionTokens, accountId: string): Promise<SessionTokens> {
    const brokerUrl = `${getBaseUrl(type)}${API.SESSION_ENDPOINT}`;
    const payload = {
        url: brokerUrl,
        sessionTokens: tokens,
        accountId: accountId
    };
    const response = await fetch(`${BACKEND.URL}${BACKEND.ACCOUNTS_PROXY}`, {
        method: API.PUT_METHOD,
        headers: {
            [API.CONTENT_TYPE_KEY]: API.APPLICATION_JSON_CONTENT_TYPE
        },
        body: JSON.stringify(payload)
    });
    if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error || DEFAULT_ERROR);
    }
    return await response.json() as SessionTokens;
}

export function getPreferences(client: ApiClient): Promise<AccountPreferences> {
    return client.get<AccountPreferences>(API.PREFERENCES_ENDPOINT);
}

// Kept as raw fetch because it hits the Node Proxy (Backend)
export async function updatePreferences(
    type: URL_TYPE,
    tokens: SessionTokens,
    leverages: LeverageUpdate,
    hedgingMode: boolean
): Promise<PreferencesUpdateResponse> {
    const brokerUrl = `${getBaseUrl(type)}${API.PREFERENCES_ENDPOINT}`;
    const payload = {
        url: brokerUrl,
        sessionTokens: tokens,
        leverages,
        hedgingMode
    };
    const response = await fetch(`${BACKEND.URL}${BACKEND.PREFERENCES_PROXY}`, {
        method: API.PUT_METHOD,
        headers: {
            [API.CONTENT_TYPE_KEY]: API.APPLICATION_JSON_CONTENT_TYPE
        },
        body: JSON.stringify(payload)
    });
    if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error || DEFAULT_ERROR);
    }
    return await response.json() as PreferencesUpdateResponse;
}

export function topUpAccount(client: ApiClient, amount: number): Promise<{ successful: boolean }> {
    return client.post<{ successful: boolean }>(API.TOPUP_ENDPOINT, { amount });
}