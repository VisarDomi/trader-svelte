import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as API from '$lib/constants/api.js';
import * as TEST from '$lib/constants/test.js';
import * as AUTH from '$lib/constants/auth.js';
import * as TRADING from '$lib/constants/trading.js';
import { DateTime } from 'luxon';

// TDD: We import the function we want to build
import { fetchCandles, type CandleRequestParams } from '$lib/market.js';

const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

describe('Market Service (Frontend)', () => {
    beforeEach(() => {
        fetchMock.mockReset();
    });

    const mockTokens = {
        [API.CST_KEY]: TEST.MOCK_CST_DEMO,
        [API.X_SECURITY_TOKEN_KEY]: TEST.MOCK_SEC_DEMO
    };

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
        it(`fetches candles from ${scenario.type} with correct headers and params`, async () => {
            // ARRANGE
            // 1. Setup Time
            const endDateTime = DateTime.utc();
            const fromUTCDateTime = endDateTime.minus({ minutes: 999 });

            // Replicate the string formatting logic expected by Capital.com
            const fromUTC = fromUTCDateTime.startOf("second").toISO({ suppressMilliseconds: true })?.slice(0, -1) || '';
            const toUTC = endDateTime.startOf("second").toISO({ suppressMilliseconds: true })?.slice(0, -1) || '';

            // 2. Setup Params
            const params: CandleRequestParams = {
                epic: TRADING.BTCUSD_EPIC,
                resolution: API.RESOLUTION_MINUTE,
                max: API.MAX_ROWS,
                from: fromUTC,
                to: toUTC
            };

            // 3. Mock Response
            const mockResponse = { prices: [] };
            fetchMock.mockResolvedValue({
                ok: true,
                json: async () => mockResponse
            });

            // ACT
            // We pass the type and tokens explicitly, decoupling from global state
            const tokens = {
                [API.CST_KEY]: scenario.cst,
                [API.X_SECURITY_TOKEN_KEY]: scenario.sec
            };

            await fetchCandles(scenario.type, params, tokens);

            // ASSERT
            // 1. Construct Expected URL
            const expectedEndpoint = `${scenario.baseUrl}${API.PRICES_ENDPOINT}/${TRADING.BTCUSD_EPIC}`;

            // We verify the call was made to the correct endpoint
            expect(fetchMock).toHaveBeenCalledWith(
                expect.stringContaining(expectedEndpoint),
                expect.anything()
            );

            // 2. Verify Headers (Critical for Direct Access)
            const expectedHeaders = {
                [API.CONTENT_TYPE_KEY]: API.APPLICATION_JSON_CONTENT_TYPE,
                [API.CST_KEY]: scenario.cst,
                [API.X_SECURITY_TOKEN_KEY]: scenario.sec
            };

            expect(fetchMock).toHaveBeenCalledWith(
                expect.anything(),
                expect.objectContaining({
                    method: API.GET_METHOD,
                    headers: expect.objectContaining(expectedHeaders)
                })
            );

            // 3. Verify Query Parameters
            // We parse the actual URL called to ensure params were attached correctly
            const calledUrlString = fetchMock.mock.calls[0][0] as string;
            const calledUrl = new URL(calledUrlString);

            expect(calledUrl.searchParams.get(API.RESOLUTION_KEY)).toBe(API.RESOLUTION_MINUTE);
            expect(calledUrl.searchParams.get(API.MAX_KEY)).toBe(API.MAX_ROWS);
            expect(calledUrl.searchParams.get(API.FROM_KEY)).toBe(fromUTC);
            expect(calledUrl.searchParams.get(API.TO_KEY)).toBe(toUTC);
        });
    });

    it('throws an error if the API returns an application-level error code', async () => {
        // ARRANGE
        const errorCode = "error.invalid.date.range";
        fetchMock.mockResolvedValue({
            ok: false,
            status: 400,
            json: async () => ({ [API.ERROR_CODE_KEY]: errorCode })
        });

        const params: CandleRequestParams = {
            epic: TRADING.BTCUSD_EPIC,
            resolution: API.RESOLUTION_MINUTE,
            max: API.MAX_ROWS
        };

        // ACT & ASSERT
        await expect(fetchCandles(AUTH.DEMO_TYPE, params, mockTokens))
            .rejects
            .toThrow(errorCode);
    });
});