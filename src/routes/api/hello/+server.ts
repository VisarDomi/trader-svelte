import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async () => {
    return json({
        message: "Hello from SvelteKit Backend!",
        time: Date.now()
    });
};