import * as API from '$lib/shared/constants/api.js';
import * as BACKEND from '$lib/shared/constants/backend.js';
import { getBaseUrl } from "$lib/shared/utils/helpers.js";
import type { URL_TYPE } from "$lib/shared/types/url.js";
import type { Account, AccountPreferences, LeverageUpdate, PreferencesUpdateResponse } from "$lib/shared/types/account.js";
import { DEFAULT_ERROR } from "$lib/shared/constants/error.js";
import type { SessionTokens } from "$lib/shared/types/auth.js";
import type { ApiClient } from '$lib/core/api/ApiClient.js';
import { session } from '$lib/core/services/SessionManager.js';

// Refactored to use ApiClient
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

export async function getSyncedAccounts(type: URL_TYPE, tokens: SessionTokens, client: ApiClient): Promise<Account[]> {
    const accounts = await getAccounts(client);

    if (typeof window === 'undefined') return accounts;

    // Use SessionManager to get the persisted ID instead of raw localStorage keys
    const lastUsedId = session.getLastAccountId(type);
    const activeAccount = accounts.find(a => a.preferred);

    if (lastUsedId && activeAccount && activeAccount.accountId !== lastUsedId) {
        const targetAccount = accounts.find(a => a.accountId === lastUsedId);

        if (targetAccount) {
            try {
                const newTokens = await switchAccount(type, tokens, lastUsedId);

                // Use SessionManager to save tokens instead of raw localStorage keys
                session.saveTokens(type, newTokens);

                return accounts.map(a => ({
                    ...a,
                    preferred: a.accountId === lastUsedId
                }));
            } catch (e) {
                console.warn(`Failed to auto-restore ${type} account:`, e);
            }
        }
    }

    return accounts;
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