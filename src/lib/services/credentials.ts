import {DEFAULT_ERROR} from "$lib/constants/error.js";
import type {UserCredentials} from "$lib/types/auth.js";
import {USER_CREDENTIALS_KEY} from "$lib/constants/storage.js";

export function getCredentials(): UserCredentials {
    const credentialsData = localStorage.getItem(USER_CREDENTIALS_KEY);
    if (credentialsData) {
        const credentials: UserCredentials = JSON.parse(credentialsData);
        if (credentials?.apiKey && credentials?.password && credentials?.identifier) {
            return credentials;
        }
    }
    throw new Error(DEFAULT_ERROR)
}
