import { describe, it, expect, vi, beforeEach } from 'vitest';
import { login } from './auth';
import * as BACKEND from './constants/backend.js';
import * as API from './constants/api.js';
import * as AUTH from './constants/auth.js';
import * as TEST from './constants/test.js';

// Mock the global fetch of the BROWSER
const fetchMock = vi.fn();
global.fetch = fetchMock;

describe('Frontend Auth Logic', () => {
    beforeEach(() => {
        fetchMock.mockReset();
    });

    it('calls the node backend with correct parameters', async () => {
        // 1. Mock a successful response from your Node Server
        const mockTokens = {
            [API.CST_KEY]: TEST.MOCK_CST_DEMO,
            [API.X_SECURITY_TOKEN_KEY]: TEST.MOCK_SEC_DEMO
        };

        fetchMock.mockResolvedValue({
            ok: true,
            json: async () => mockTokens
        });

        // 2. Call the function
        const result = await login(AUTH.DEMO_TYPE);

        // 3. Assert we called the backend
        const expectedUrl = `${BACKEND.URL}${BACKEND.LOGIN}`;

        expect(fetchMock).toHaveBeenCalledWith(expectedUrl, {
            method: API.POST_METHOD,
            headers: {
                [API.CONTENT_TYPE_KEY]: API.APPLICATION_JSON_CONTENT_TYPE
            },
            body: JSON.stringify({ type: AUTH.DEMO_TYPE })
        });

        // 4. Assert we got the tokens back
        expect(result).toEqual(mockTokens);
    });

    it('handles backend errors gracefully', async () => {
        fetchMock.mockResolvedValue({
            ok: false,
            status: 500,
            json: async () => ({ error: 'Backend failed' })
        });

        await expect(login(AUTH.REAL_TYPE)).rejects.toThrow('Backend failed');
    });
});