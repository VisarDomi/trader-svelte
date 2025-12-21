import type { URL_TYPE } from "$lib/types/url.js";
import { DEFAULT_ERROR } from "$lib/constants/error.js";
import { DEMO_TYPE, REAL_TYPE } from "$lib/constants/auth.js";
import { DEMO_BASE_URL, REAL_BASE_URL } from "$lib/constants/api.js";

export function getBaseUrl(type: URL_TYPE): string {
    switch (type) {
        case DEMO_TYPE:
            return DEMO_BASE_URL;
        case REAL_TYPE:
            return REAL_BASE_URL;
        default:
            throw new Error(DEFAULT_ERROR);
    }
}