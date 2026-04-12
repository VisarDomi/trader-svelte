import { getPublicAppConfig } from '$lib/server/app-config.js';

export const load = async () => {
    return getPublicAppConfig();
};
