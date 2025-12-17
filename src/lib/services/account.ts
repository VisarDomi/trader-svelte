import * as API from '$lib/constants/api.js';
import {getBaseUrl} from "$lib/utils/helpers";
import type {URL_TYPE} from "$lib/types/url";
import type {AuthTokens} from "$lib/types/auth";
import type {Account} from "$lib/types/account";
import {DEFAULT_ERROR} from "$lib/constants/error";

export async function  getAccounts(type: URL_TYPE, tokens: AuthTokens): Promise<Account[]> {
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
