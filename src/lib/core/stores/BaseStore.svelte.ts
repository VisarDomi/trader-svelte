import { api } from '$lib/core/services/ApiService.svelte.js';
import type { ApiClient } from '$lib/core/api/ApiClient.js';
import { log } from '$lib/shared/utils/log.js';

/**
 * Base class for all Stores to standardize Loading, Error, and Client access.
 */
export abstract class BaseStore {
    isLoading = $state(false);
    error = $state("");

    /**
     * Helper to get the API client.
     * Returns null if session is invalid, setting error automatically.
     */
    protected getClient(): ApiClient | null {
        const client = api.client;
        if (!client) {
            this.error = "Session invalid or expired";
            return null;
        }
        return client;
    }

    /**
     * Wraps an async operation with loading/error state management.
     */
    protected async execute<T>(operation: () => Promise<T>): Promise<T | null> {
        this.isLoading = true;
        this.error = "";

        try {
            const result = await operation();
            return result;
        } catch (e) {
            this.error = e instanceof Error ? e.message : String(e);
            log.error(`[${this.constructor.name}] Error:`, e);
            return null;
        } finally {
            this.isLoading = false;
        }
    }
}