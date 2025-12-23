// Versioning keys helps if we need to migrate in the future
export const STORAGE_PREFIX = 'mt_v1_';

// 1. Credentials (User Input) - Kept separate
export const CREDENTIALS_KEY = `${STORAGE_PREFIX}credentials`;

// 2. Session (Server Response) - Tokens & Timestamps
export const SESSION_KEY = `${STORAGE_PREFIX}session`;

// 3. App State (User Preferences) - UI State, Mode, Account Selections
export const STATE_KEY = `${STORAGE_PREFIX}state`;

// 4. Viewport (Device Specifics) - iOS Hack dimensions
export const VIEWPORT_KEY = `${STORAGE_PREFIX}viewport`;

// 5. Trade Context (Logic) - Persisting data not available in API (Initial Balance)
export const TRADE_CONTEXT_KEY = `${STORAGE_PREFIX}trade_context`;

// 6. Chart Settings (Time Span + Price Range)
export const CHART_STATE_KEY = `${STORAGE_PREFIX}chart_state`;