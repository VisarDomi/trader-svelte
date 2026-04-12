import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import * as API from '$lib/shared/constants/api.js';
import { createShowcaseDemoSession, getAppProfile } from '$lib/server/app-config.js';

export const POST: RequestHandler = async () => {
    if (getAppProfile() !== 'showcase') {
        error(404, 'Not found');
    }

    const response = await createShowcaseDemoSession();

    if (!response.ok) {
        error(response.status, 'Showcase bootstrap failed');
    }

    const cst = response.headers.get(API.CST_KEY);
    const sec = response.headers.get(API.X_SECURITY_TOKEN_KEY);

    if (!cst || !sec) {
        error(500, 'Showcase bootstrap missing tokens');
    }

    return json({
        [API.CST_KEY]: cst,
        [API.X_SECURITY_TOKEN_KEY]: sec,
    });
};
