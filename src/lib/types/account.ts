export type LeverageCategory =
    | 'SHARES'
    | 'CURRENCIES'
    | 'INDICES'
    | 'CRYPTOCURRENCIES'
    | 'COMMODITIES'
    | 'INTEREST_RATES'
    | 'BONDS';

export interface Account {
    accountId: string;
    accountName: string;
    status: string;
    accountType: string;
    preferred: boolean;
    balance: {
        balance: number;
        deposit: number;
        profitLoss: number;
        available: number;
    };
    currency: string;
    symbol: string;
}

export interface AccountPreferences {
    hedgingMode: boolean;
    leverages: {
        [key in LeverageCategory]: {
            current: number;
            available: number[];
        };
    };
}

export type LeverageUpdate = {
    [key in LeverageCategory]?: number;
};

export interface PreferencesUpdateResponse {
    status: string;
}