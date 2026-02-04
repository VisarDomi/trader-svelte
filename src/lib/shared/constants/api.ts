export const POST_METHOD = "POST";
export const GET_METHOD = "GET";
export const PUT_METHOD = "PUT";

export const REAL_BASE_URL = "https://api-capital.backend-capital.com";
export const DEMO_BASE_URL = "https://demo-api-capital.backend-capital.com";
export const SESSION_ENDPOINT = "/api/v1/session";
export const ACCOUNTS_ENDPOINT = "/api/v1/accounts";
export const PING_ENDPOINT = "/api/v1/ping";
export const PREFERENCES_ENDPOINT = "/api/v1/accounts/preferences";
export const PRICES_ENDPOINT = "/api/v1/prices";
export const MARKETS_ENDPOINT = "/api/v1/markets";
export const POSITIONS_ENDPOINT = "/api/v1/positions";
export const TOPUP_ENDPOINT = "/api/v1/accounts/topUp";

export const getDealReferenceEndpoint = (dealReference: string) => `/api/v1/confirms/${dealReference}`;

export const WEBSOCKET_BASE_URL = "wss://api-streaming-capital.backend-capital.com";
export const WEBSOCKET_PATH = "/connect";

export const X_CAP_API_KEY_KEY = "X-CAP-API-KEY";
export const IDENTIFIER_KEY = "identifier";
export const PASSWORD_KEY = "password";
export const X_SECURITY_TOKEN_KEY = "x-security-token";
export const CST_KEY = "cst";

export const CONTENT_TYPE_KEY = "Content-Type";
export const APPLICATION_JSON_CONTENT_TYPE = "application/json";

export const MARKET_DATA_DESTINATION = "marketData.subscribe";
export const PING_DESTINATION = "ping";

export const EPIC_KEY = "epic";
export const EPICS_KEY = "epics";
export const DATA_DESTINATION_QUOTE = "quote";


export const MARKET_DATA_CORRELATION_ID = "1";
export const PING_CORRELATION_ID = "5";

export const RESOLUTION_MINUTE = "MINUTE";
export const MAX_ROWS = "1000";

export const RESOLUTION_KEY = 'resolution';
export const MAX_KEY = 'max';
export const FROM_KEY = 'from';
export const TO_KEY = 'to';