import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import * as API from '$lib/constants/api.js';

export const PUT: RequestHandler = async ({ request }) => {
    const body = await request.json();

    const targetUrl = body.url;
    const sessionTokens = body.sessionTokens;
    const accountId = body.accountId;

    if (!targetUrl || !sessionTokens || !accountId) {
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
                accountId: accountId
            })
        });

        if (!response.ok) {
            error(response.status, "Broker rejected account switch");
        }

        const cst = response.headers.get(API.CST_KEY);
        const sec = response.headers.get(API.X_SECURITY_TOKEN_KEY);

        if (!cst || !sec) {
            error(500, "Upstream response missing security tokens");
        }

        return json({
            [API.CST_KEY]: cst,
            [API.X_SECURITY_TOKEN_KEY]: sec
        });

    } catch (e) {
        console.error(e);
        throw e;
    }
};