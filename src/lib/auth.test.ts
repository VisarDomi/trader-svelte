import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as API from '$lib/constants/api.js';
import * as AUTH from '$lib/constants/auth.js';
import * as TEST from '$lib/constants/test.js';

// We import the Class we are about to build
import { CapitalAuthService } from '$lib/services/auth.js';

describe('CapitalAuthService', () => {
    let fetchMock: any;
    let authService: CapitalAuthService;

    beforeEach(() => {
        // 1. We mock fetch locally, not globally.
        // This is pure Dependency Injection.
        fetchMock = vi.fn();

        // 2. We inject the mock into the service
        authService = new CapitalAuthService(fetchMock);
    });

    const testCases = [
        {
            type: AUTH.DEMO_TYPE,
            baseUrl: API.DEMO_BASE_URL,
            cst: TEST.MOCK_CST_DEMO,
            sec: TEST.MOCK_SEC_DEMO,
        },
        {
            type: AUTH.REAL_TYPE,
            baseUrl: API.REAL_BASE_URL,
            cst: TEST.MOCK_CST_REAL,
            sec: TEST.MOCK_SEC_REAL,
        }
    ];

    testCases.forEach((scenario) => {
        it(`logs into ${scenario.type} and extracts tokens via injected fetcher`, async () => {
            // ARRANGE
            const mockResponseHeaders = new Headers();
            mockResponseHeaders.append(API.CST_KEY, scenario.cst);
            mockResponseHeaders.append(API.X_SECURITY_TOKEN_KEY, scenario.sec);

            fetchMock.mockResolvedValue({
                ok: true,
                headers: mockResponseHeaders,
                json: async () => ({})
            });

            const credentials = {
                identifier: TEST.MOCK_USER,
                password: TEST.MOCK_PASS,
                apiKey: TEST.MOCK_API_KEY
            };

            // ACT
            // We call the method on the instance
            const result = await authService.login(
                scenario.type,
                credentials.identifier,
                credentials.password,
                credentials.apiKey
            );

            // ASSERT
            // 1. Verify URL construction
            const expectedUrl = `${scenario.baseUrl}${API.SESSION_ENDPOINT}`;

            // 2. Verify the injected fetch was called correctly
            expect(fetchMock).toHaveBeenCalledWith(
                expectedUrl,
                expect.objectContaining({
                    method: API.POST_METHOD,
                    headers: expect.objectContaining({
                        [API.CONTENT_TYPE_KEY]: API.APPLICATION_JSON_CONTENT_TYPE,
                        [API.X_CAP_API_KEY_KEY]: credentials.apiKey
                    }),
                    body: JSON.stringify({
                        [API.IDENTIFIER_KEY]: credentials.identifier,
                        [API.PASSWORD_KEY]: credentials.password
                    })
                })
            );

            // 3. Verify Parsing Logic
            expect(result).toEqual({
                [API.CST_KEY]: scenario.cst,
                [API.X_SECURITY_TOKEN_KEY]: scenario.sec
            });
        });
    });

    it('throws when response is not OK', async () => {
        const errorCode = "error.public-api.failure.login";
        fetchMock.mockResolvedValue({
            ok: false,
            status: 401,
            json: async () => ({ [API.ERROR_CODE_KEY]: errorCode })
        });

        await expect(
            authService.login(AUTH.DEMO_TYPE, TEST.MOCK_USER, TEST.MOCK_PASS, TEST.MOCK_API_KEY)
        ).rejects.toThrow(errorCode);
    });
});