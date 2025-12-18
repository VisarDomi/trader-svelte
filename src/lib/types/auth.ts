import * as API from "$lib/constants/api.js";

// What the user types in the UI
export interface UserCredentials {
    identifier: string;
    password: string;
    apiKey: string;
}

// What the API returns after login
export interface SessionTokens {
    [API.CST_KEY]: string;
    [API.X_SECURITY_TOKEN_KEY]: string;
}