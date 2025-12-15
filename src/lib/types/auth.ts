import * as API from "$lib/constants/api";

export interface AuthTokens {
    [API.CST_KEY]: string;
    [API.X_SECURITY_TOKEN_KEY]: string;
}

export interface Credentials {
    apiKey:string;
    password:string;
    identifier:string;
}