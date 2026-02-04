import * as API from "$lib/shared/constants/api.js";

export interface UserCredentials {
    identifier: string;
    password: string;
    apiKey: string;
}

export interface SessionTokens {
    [API.CST_KEY]: string;
    [API.X_SECURITY_TOKEN_KEY]: string;
}