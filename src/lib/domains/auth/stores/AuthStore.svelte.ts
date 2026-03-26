import { BaseStore } from '$lib/core/stores/BaseStore.svelte.js';
import * as ENV from '$lib/core/config/env.js';
import * as AUTH from '$lib/shared/constants/auth.js';
import { login } from '$lib/domains/auth/services/AuthService.js';
import { session } from '$lib/core/services/SessionManager.js';
import type { SessionTokens, UserCredentials } from '$lib/shared/types/auth.js';
import type { URL_TYPE } from '$lib/shared/types/url.js';
import { api } from '$lib/core/services/ApiService.svelte.js';
import * as API from '$lib/shared/constants/api.js';
import { AuthError } from '$lib/core/api/ApiClient.js';
import { log, serverLog, LogEvent } from '$lib/shared/utils/log.js';

export class AuthStore extends BaseStore {

    apiKey = $state("");
    identifier = $state("");
    password = $state("");

    demoStatus = $state("Not Logged In");
    realStatus = $state("Not Logged In");

    demoTokens = $state<SessionTokens | null>(null);
    realTokens = $state<SessionTokens | null>(null);

    constructor() {
        super();
        this.apiKey = ENV.ENV_APIKEY;
        this.identifier = ENV.ENV_IDENTIFIER;
        this.password = ENV.ENV_PASSWORD;
    }

    init() {
        try {
            const c = session.getCredentials();
            this.identifier = c.identifier;
            this.password = c.password;
            this.apiKey = c.apiKey;
        } catch {

        }

        this.demoTokens = session.getTokens(AUTH.DEMO_TYPE);
        this.realTokens = session.getTokens(AUTH.REAL_TYPE);

        if (this.demoTokens) this.demoStatus = "Session Token Found";
        if (this.realTokens) this.realStatus = "Session Token Found";
    }

    async validateSession(): Promise<void> {
        if (!this.realTokens && !this.demoTokens) {
            throw new AuthError("No session tokens available");
        }

        await Promise.all([
            this.realTokens ? this.validateMode(AUTH.REAL_TYPE) : Promise.resolve(),
            this.demoTokens ? this.validateMode(AUTH.DEMO_TYPE) : Promise.resolve()
        ]);
    }

    private async validateMode(mode: URL_TYPE): Promise<void> {
        const client = api.getClientForMode(mode);
        if (!client) return;

        try {
            await client.get(API.PING_ENDPOINT);
        } catch (e) {
            if (e instanceof AuthError) {
                log.info(`[AuthStore] ${mode} session expired, refreshing...`);
                try {
                    await this.performLogin(mode);
                    return;
                } catch (loginErr) {
                    const msg = loginErr instanceof Error ? loginErr.message : String(loginErr);
                    serverLog({ tag: LogEvent.AuthFailure, phase: `refresh-${mode}`, error: msg });
                    throw loginErr instanceof AuthError ? loginErr : new AuthError("Refresh failed");
                }
            }
            throw e;
        }
    }

    async loginBoth() {
        await this.execute(async () => {
            await Promise.all([
                this.performLogin(AUTH.REAL_TYPE),
                this.performLogin(AUTH.DEMO_TYPE)
            ]);
        });
    }

    async retryReal() {
        await this.execute(async () => {
            await this.performLogin(AUTH.REAL_TYPE);
        });
    }

    async retryDemo() {
        await this.execute(async () => {
            await this.performLogin(AUTH.DEMO_TYPE);
        });
    }

    private saveInputs() {
        const credentials: UserCredentials = {
            identifier: this.identifier,
            password: this.password,
            apiKey: this.apiKey
        };
        session.saveCredentials(credentials);
    }

    private async performLogin(type: URL_TYPE) {
        this.saveInputs();

        const isReal = type === AUTH.REAL_TYPE;
        const setStatus = (msg: string) => {
            if (isReal) this.realStatus = msg;
            else this.demoStatus = msg;
        };
        const setTokens = (t: SessionTokens | null) => {
            if (isReal) this.realTokens = t;
            else this.demoTokens = t;
        };

        setStatus("Logging in...");

        try {
            const sessionTokens = await login(type);
            session.saveTokens(type, sessionTokens);
            session.saveLoginTimestamp();

            setTokens(sessionTokens);
            setStatus("Connected");
        } catch (e) {
            const msg = `Error: ${e instanceof Error ? e.message : String(e)}`;
            setStatus(msg);
            throw e;
        }
    }
}

export const authStore = new AuthStore();
