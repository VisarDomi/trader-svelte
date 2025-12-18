export type LeverageCategory = 'SHARES' | 'CURRENCIES' | 'INDICES' | 'CRYPTOCURRENCIES' | 'COMMODITIES';

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

// Structure returned by GET /accounts/preferences
export interface AccountPreferences {
    hedgingMode: boolean;
    leverages: {
        [key in LeverageCategory]: {
            current: number;
            available: number[];
        };
    };
}

// Structure sent in PUT /accounts/preferences
export type LeverageUpdate = {
    [key in LeverageCategory]?: number;
};

export interface PreferencesUpdatePayload {
    leverages: LeverageUpdate;
    hedgingMode: boolean;
}

export interface PreferencesUpdateResponse {
    status: string;
}