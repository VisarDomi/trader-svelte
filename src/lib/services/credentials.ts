import {DEFAULT_ERROR} from "$lib/constants/error";
import type {Credentials} from "$lib/types/auth";
import {CREDENTIALS_KEY} from "$lib/constants/storage";

export function getCredentials(): Credentials {
    const credentialsData = localStorage.getItem(CREDENTIALS_KEY);
    if (credentialsData) {
        const credentials: Credentials = JSON.parse(credentialsData);
        if (credentials?.apiKey && credentials?.password && credentials?.identifier) {
            return credentials;
        }
    }
    throw new Error(DEFAULT_ERROR)
}
