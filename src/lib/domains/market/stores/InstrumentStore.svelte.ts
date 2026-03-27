import { BaseStore } from '$lib/core/stores/BaseStore.svelte.js';
import { getMarketsByEpics } from '$lib/domains/market/services/MarketApiService.js';
import { getPreferences } from '$lib/domains/trading/services/AccountApiService.js';
import { MarketMapper } from '$lib/domains/market/domain/MarketMapper.js';
import { notifications } from '$lib/core/services/NotificationService.svelte.js';
import { SystemController } from '$lib/core/engine/SystemController.js';
import * as TRADING from '$lib/shared/constants/trading.js';
import type { MarketDetailsResponse, MarketListResponse } from '$lib/shared/types/market.js';
import type { AccountPreferences } from '$lib/shared/types/account.js';
import { log } from '$lib/shared/utils/log.js';

const STORAGE_KEY = 'mt_favorite_epics';

export class InstrumentStore extends BaseStore {
    instruments = $state<MarketDetailsResponse[]>([]);
    userPreferences = $state<AccountPreferences | null>(null);
    favorites = $state<string[]>([]);

    constructor() {
        super();
        this.loadFavorites();
    }

    private loadFavorites() {
        if (typeof window === 'undefined') return;
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) {
            try {
                this.favorites = JSON.parse(raw);
            } catch {
                this.favorites = [TRADING.NDX_EPIC, TRADING.BTCUSD_EPIC];
            }
        } else {
            this.favorites = [TRADING.NDX_EPIC, TRADING.BTCUSD_EPIC];
        }
    }

    private saveFavorites() {
        if (typeof window === 'undefined') return;
        localStorage.setItem(STORAGE_KEY, JSON.stringify(this.favorites));
    }

    async load() {
        this.loadFavorites();

        const client = this.getClient();
        if (!client) return;

        if (this.favorites.length === 0) {
            this.instruments = [];
            return;
        }

        await this.execute(async () => {

            const prefsPromise = getPreferences(client);

            const chunkSize = 50;
            const chunks = [];
            for (let i = 0; i < this.favorites.length; i += chunkSize) {
                chunks.push(this.favorites.slice(i, i + chunkSize));
            }

            const marketPromises = chunks.map(chunk => getMarketsByEpics(client, chunk));

            const [prefs, ...responses] = await Promise.all([
                prefsPromise,
                ...marketPromises
            ]);

            this.userPreferences = prefs;

            const listResponses = responses as MarketListResponse[];
            let finalInstruments: MarketDetailsResponse[] = [];

            listResponses.forEach((r, index) => {
                if (r.marketDetails && Array.isArray(r.marketDetails)) {
                    finalInstruments = [...finalInstruments, ...r.marketDetails];
                    return;
                }

                if (r.markets && Array.isArray(r.markets)) {
                    const mapped = r.markets.map(s => MarketMapper.fromSummary(s));
                    finalInstruments = [...finalInstruments, ...mapped];
                    return;
                }

                log.warn(`[InstrumentStore] Chunk ${index} missing 'markets' or 'marketDetails'.`, r);
            });

            this.instruments = finalInstruments;
        });

        if (this.error) {
            log.error('[InstrumentStore] Load failed:', this.error);
            notifications.error(this.error);
        }
    }

    toggleFavorite(epic: string) {
        if (this.favorites.includes(epic)) {
            this.favorites = this.favorites.filter(e => e !== epic);
        } else {
            this.favorites.push(epic);
        }
        this.saveFavorites();
    }

    addFavorite(epic: string) {
        if (!this.favorites.includes(epic)) {
            this.favorites = [...this.favorites, epic];
            this.saveFavorites();
            return true;
        }
        return false;
    }

    removeFavorite(epic: string) {
        this.favorites = this.favorites.filter(e => e !== epic);
        this.saveFavorites();

        this.instruments = this.instruments.filter(i => i.instrument.epic !== epic);
    }

    isFavorite(epic: string): boolean {
        return this.favorites.includes(epic);
    }

    select(epic: string) {
        SystemController.switchContext(epic);
    }
}

export const instrumentStore = new InstrumentStore();
