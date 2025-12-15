import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as API from '$lib/constants/api.js';
import * as TEST from '$lib/constants/test.js';
import * as AUTH from '$lib/constants/auth.js';
import * as TRADING from '$lib/constants/trading.js';
import { DateTime } from 'luxon';

// TDD: Importing the class we will build next
import { CapitalMarketService, type CandleRequestParams } from '$lib/services/market.js';

describe('CapitalMarketService', () => {
    let fetchMock: any;
    let marketService: CapitalMarketService;

    beforeEach(() => {
        // 1. Mock Fetch locally
        fetchMock = vi.fn();

        // 2. Inject into Service
        marketService = new CapitalMarketService(fetchMock);
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
        it(`fetches candles from ${scenario.type} using injected fetcher`, async () => {
            // ARRANGE
            // 1. Setup Time
            const endDateTime = DateTime.utc();
            const fromUTCDateTime = endDateTime.minus({ minutes: 999 });
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

            const tokens = {
                [API.CST_KEY]: scenario.cst,
                [API.X_SECURITY_TOKEN_KEY]: scenario.sec
            };

            // 3. Mock Response
            const mockResponse = { prices: [] };
            fetchMock.mockResolvedValue({
                ok: true,
                json: async () => mockResponse
            });

            // ACT
            // Instance method call
            const result = await marketService.getCandles(scenario.type, tokens, params);

            // ASSERT
            // 1. Verify Endpoint
            const expectedEndpoint = `${scenario.baseUrl}${API.PRICES_ENDPOINT}/${TRADING.BTCUSD_EPIC}`;

            expect(fetchMock).toHaveBeenCalledWith(
                expect.stringContaining(expectedEndpoint),
                expect.anything()
            );

            // 2. Verify Headers (Auth + Content Type)
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

            // 3. Verify Query Params
            const calledUrlString = fetchMock.mock.calls[0][0] as string;
            const calledUrl = new URL(calledUrlString);

            expect(calledUrl.searchParams.get(API.RESOLUTION_KEY)).toBe(API.RESOLUTION_MINUTE);
            expect(calledUrl.searchParams.get(API.MAX_KEY)).toBe(API.MAX_ROWS);
            expect(calledUrl.searchParams.get(API.FROM_KEY)).toBe(fromUTC);
            expect(calledUrl.searchParams.get(API.TO_KEY)).toBe(toUTC);

            expect(result).toEqual(mockResponse);
        });
    });

    it('throws an error if the API returns an error code', async () => {
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

        const tokens = {
            [API.CST_KEY]: TEST.MOCK_CST_DEMO,
            [API.X_SECURITY_TOKEN_KEY]: TEST.MOCK_SEC_DEMO
        };

        // ACT & ASSERT
        await expect(marketService.getCandles(AUTH.DEMO_TYPE, tokens, params))
            .rejects
            .toThrow(errorCode);
    });
});