import {DEFAULT_ERROR} from "$lib/constants/error";
import type {UserCredentials} from "$lib/types/auth";
import {USER_CREDENTIALS_KEY} from "$lib/constants/storage";

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
