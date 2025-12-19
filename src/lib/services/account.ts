import * as API from '$lib/constants/api.js';
import * as BACKEND from '$lib/constants/backend.js';
import * as STORAGE from '$lib/constants/storage.js';
import * as AUTH from '$lib/constants/auth.js';
import {getBaseUrl} from "$lib/utils/helpers.js";
import type {URL_TYPE} from "$lib/types/url.js";
import type {Account, AccountPreferences, LeverageUpdate, PreferencesUpdateResponse} from "$lib/types/account.js";
import {DEFAULT_ERROR} from "$lib/constants/error.js";
import type {SessionTokens} from "$lib/types/auth.js";

export async function getAccounts(type: URL_TYPE, tokens: SessionTokens): Promise<Account[]> {
    const baseUrl = getBaseUrl(type);
    const url = `${baseUrl}${API.ACCOUNTS_ENDPOINT}`;
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
    const data  = await response.json();
    return data.accounts as Account[];
}

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

export async function getSyncedAccounts(type: URL_TYPE, tokens: SessionTokens): Promise<Account[]> {
    const accounts = await getAccounts(type, tokens);

    if (typeof window === 'undefined') return accounts;

    const storageKey = type === AUTH.REAL_TYPE ? STORAGE.LAST_REAL_ACCOUNT_ID_KEY : STORAGE.LAST_DEMO_ACCOUNT_ID_KEY;
    const lastUsedId = localStorage.getItem(storageKey);
    const activeAccount = accounts.find(a => a.preferred);

    if (lastUsedId && activeAccount && activeAccount.accountId !== lastUsedId) {
        const targetAccount = accounts.find(a => a.accountId === lastUsedId);

        if (targetAccount) {
            try {
                const newTokens = await switchAccount(type, tokens, lastUsedId);

                const tokenStorageKey = type === AUTH.REAL_TYPE ? STORAGE.TOKENS_REAL_KEY : STORAGE.TOKENS_DEMO_KEY;
                localStorage.setItem(tokenStorageKey, JSON.stringify(newTokens));

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

export async function getPreferences(type: URL_TYPE, tokens: SessionTokens): Promise<AccountPreferences> {
    const baseUrl = getBaseUrl(type);
    const url = `${baseUrl}${API.PREFERENCES_ENDPOINT}`;
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
    return await response.json() as AccountPreferences;
}

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