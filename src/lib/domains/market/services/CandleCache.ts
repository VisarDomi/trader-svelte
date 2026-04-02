import type { ChartCandle } from '$lib/shared/types/market.js';
import { log } from '$lib/shared/utils/log.js';

const DB_NAME = 'tendies-candle-cache';
const DB_VERSION = 1;
const STORE_NAME = 'candles';

interface CacheEntry {
    epic: string;
    candles: ChartCandle[];
    updatedAt: number;
}

class CandleCache {
    private db: IDBDatabase | null = null;

    async open(): Promise<void> {
        if (this.db) return;

        return new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, DB_VERSION);

            request.onupgradeneeded = () => {
                const db = request.result;
                if (!db.objectStoreNames.contains(STORE_NAME)) {
                    db.createObjectStore(STORE_NAME, { keyPath: 'epic' });
                }
            };

            request.onsuccess = () => {
                this.db = request.result;
                resolve();
            };

            request.onerror = () => {
                log.warn('[CandleCache] Failed to open IndexedDB');
                reject(request.error);
            };
        });
    }

    async get(epic: string): Promise<ChartCandle[] | null> {
        try {
            await this.open();
            if (!this.db) return null;

            return new Promise((resolve) => {
                const tx = this.db!.transaction(STORE_NAME, 'readonly');
                const store = tx.objectStore(STORE_NAME);
                const request = store.get(epic);

                request.onsuccess = () => {
                    const entry = request.result as CacheEntry | undefined;
                    resolve(entry?.candles ?? null);
                };

                request.onerror = () => {
                    log.warn('[CandleCache] Read failed');
                    resolve(null);
                };
            });
        } catch {
            return null;
        }
    }

    async put(epic: string, candles: ChartCandle[]): Promise<void> {
        try {
            await this.open();
            if (!this.db) return;

            const entry: CacheEntry = {
                epic,
                candles,
                updatedAt: Date.now(),
            };

            return new Promise((resolve) => {
                const tx = this.db!.transaction(STORE_NAME, 'readwrite');
                const store = tx.objectStore(STORE_NAME);
                store.put(entry);

                tx.oncomplete = () => resolve();
                tx.onerror = () => {
                    log.warn('[CandleCache] Write failed');
                    resolve();
                };
            });
        } catch {
            // IndexedDB unavailable — degrade gracefully
        }
    }

    async clear(epic: string): Promise<void> {
        try {
            await this.open();
            if (!this.db) return;

            return new Promise((resolve) => {
                const tx = this.db!.transaction(STORE_NAME, 'readwrite');
                const store = tx.objectStore(STORE_NAME);
                store.delete(epic);

                tx.oncomplete = () => resolve();
                tx.onerror = () => resolve();
            });
        } catch {
            // IndexedDB unavailable
        }
    }
}

export const candleCache = new CandleCache();
