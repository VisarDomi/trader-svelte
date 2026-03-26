import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import * as API from '$lib/shared/constants/api.js';

export const PUT: RequestHandler = async ({ request }) => {
    const body = await request.json();

    const targetUrl = body.url;
    const sessionTokens = body.sessionTokens;

    const updateData = body.data;

    if (!targetUrl || !sessionTokens || !updateData) {
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
            body: JSON.stringify(updateData)
        });

        if (!response.ok) {
            const errBody = await response.json().catch(() => ({}));

            error(response.status, errBody.errorCode || "Broker rejected position update");
        }

        const result = await response.json();
        return json(result);

    } catch (e) {
        console.error(e);
        throw e;
    }
};
