import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request }) => {
    const { event, data } = await request.json();
    if (!event || typeof event !== 'string') {
        return new Response(null, { status: 400 });
    }
    console.log(`[Frontend] ${event}`, data ? JSON.stringify(data) : '');
    return new Response(null, { status: 204 });
};
