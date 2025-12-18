import * as API from '$lib/constants/api.js';
import * as BACKEND from '$lib/constants/backend.js';
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