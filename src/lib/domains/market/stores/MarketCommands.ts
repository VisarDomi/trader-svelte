import type { ChartData } from '$lib/shared/types/trading.js';
import type { ChartCandle } from '$lib/shared/types/market.js';
import type { FeedUpdate } from '$lib/domains/market/services/MarketFeed.js';

export const MarketCmd = {
    Reset: 0,
    SetHistory: 1,
    SetLoaded: 2,
    PrependHistory: 3,
    MergeLatestHistory: 4,
    UpdateLive: 5,
    SetDataSource: 6,
    SetMetadata: 7,
} as const;

export type MarketCommand =
    | { tag: typeof MarketCmd.Reset; dataSource: ChartData }
    | { tag: typeof MarketCmd.SetHistory; bid: ChartCandle[]; ask: ChartCandle[] }
    | { tag: typeof MarketCmd.SetLoaded; loaded: boolean }
    | { tag: typeof MarketCmd.PrependHistory; bid: ChartCandle[]; ask: ChartCandle[] }
    | { tag: typeof MarketCmd.MergeLatestHistory; bid: ChartCandle[]; ask: ChartCandle[] }
    | { tag: typeof MarketCmd.UpdateLive; update: FeedUpdate }
    | { tag: typeof MarketCmd.SetDataSource; source: ChartData }
    | { tag: typeof MarketCmd.SetMetadata; epic: string; status: string };

export const marketCmd = {
    reset: (dataSource: ChartData): MarketCommand =>
        ({ tag: MarketCmd.Reset, dataSource }),
    setHistory: (bid: ChartCandle[], ask: ChartCandle[]): MarketCommand =>
        ({ tag: MarketCmd.SetHistory, bid, ask }),
    setLoaded: (loaded: boolean): MarketCommand =>
        ({ tag: MarketCmd.SetLoaded, loaded }),
    prependHistory: (bid: ChartCandle[], ask: ChartCandle[]): MarketCommand =>
        ({ tag: MarketCmd.PrependHistory, bid, ask }),
    mergeLatestHistory: (bid: ChartCandle[], ask: ChartCandle[]): MarketCommand =>
        ({ tag: MarketCmd.MergeLatestHistory, bid, ask }),
    updateLive: (update: FeedUpdate): MarketCommand =>
        ({ tag: MarketCmd.UpdateLive, update }),
    setDataSource: (source: ChartData): MarketCommand =>
        ({ tag: MarketCmd.SetDataSource, source }),
    setMetadata: (epic: string, status: string): MarketCommand =>
        ({ tag: MarketCmd.SetMetadata, epic, status }),
};
