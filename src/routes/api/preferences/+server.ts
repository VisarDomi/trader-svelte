import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import * as API from '$lib/shared/constants/api.js';

export const PUT: RequestHandler = async ({ request }) => {
    const body = await request.json();

    const targetUrl = body.url;
    const sessionTokens = body.sessionTokens;
    const leverages = body.leverages;
    const hedgingMode = body.hedgingMode;

    if (!targetUrl || !sessionTokens) {
        error(400, "Missing required parameters");
    }

    try {
        const response = await fetch(targetUrl, {
            method: API.PUT_METHOD,
            headers: {
                [API.CONTENT_TYPE_KEY]: API.APPLICATION_JSON_CONTENT_TYPE,
                [API.X_SECURITY_TOKEN_KEY]: sessionTokens[API.X_SECURITY_TOKEN_KEY],
                [API.CST_KEY]: sessionTokens[API.CST_KEY],
            },
            body: JSON.stringify({
                leverages,
                hedgingMode
            })
        });

        if (!response.ok) {
            error(response.status, "Broker rejected preferences update");
        }

        const status = await response.json();
        return json(status);

    } catch (e) {
        console.error(e);
        throw e;
    }
};