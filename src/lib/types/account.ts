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