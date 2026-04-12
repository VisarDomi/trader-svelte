import { BaseStore } from '$lib/core/stores/BaseStore.svelte.js';
import * as ENV from '$lib/core/config/env.js';
import * as AUTH from '$lib/shared/constants/auth.js';
import { bootstrapShowcaseSession, login } from '$lib/domains/auth/services/AuthService.js';
import { session } from '$lib/core/services/SessionManager.js';
import type { SessionTokens, UserCredentials } from '$lib/shared/types/auth.js';
import type { URL_TYPE } from '$lib/shared/types/url.js';
import { api } from '$lib/core/services/ApiService.svelte.js';
import * as API from '$lib/shared/constants/api.js';
import { AuthError } from '$lib/core/api/ApiClient.js';
import { serverLog, LogEvent } from '$lib/shared/utils/log.js';
import { isShowcaseProfile } from '$lib/core/config/runtime.js';

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
        if (isShowcaseProfile()) {
            session.mode = AUTH.DEMO_TYPE;
        }

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
        if (isShowcaseProfile()) {
            if (!this.demoTokens) {
                throw new AuthError("No demo session available");
            }

            await this.validateShowcaseDemo();
            return;
        }

        if (!this.realTokens && !this.demoTokens) {
            throw new AuthError("No session tokens available");
        }

        await Promise.all([
            this.realTokens ? this.validateMode(AUTH.REAL_TYPE) : Promise.resolve(),
            this.demoTokens ? this.validateMode(AUTH.DEMO_TYPE) : Promise.resolve()
        ]);
    }

    private async validateShowcaseDemo(): Promise<void> {
        const client = api.getClientForMode(AUTH.DEMO_TYPE);
        if (!client) {
            throw new AuthError("No demo session available");
        }

        try {
            await client.get(API.PING_ENDPOINT);
        } catch (e) {
            if (e instanceof AuthError) {
                serverLog({ tag: LogEvent.AuthFailure, phase: 'refresh-showcase', error: 'session expired' });
                const tokens = await bootstrapShowcaseSession();
                session.saveTokens(AUTH.DEMO_TYPE, tokens);
                session.saveLoginTimestamp();
                session.mode = AUTH.DEMO_TYPE;
                this.demoTokens = tokens;
                this.demoStatus = "Connected";
                return;
            }
            throw e;
        }
    }

    private async validateMode(mode: URL_TYPE): Promise<void> {
        const client = api.getClientForMode(mode);
        if (!client) return;

        try {
            await client.get(API.PING_ENDPOINT);
        } catch (e) {
            if (e instanceof AuthError) {
                serverLog({ tag: LogEvent.AuthFailure, phase: `refresh-${mode}`, error: 'session expired' });
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

    async loginShowcase() {
        await this.execute(async () => {
            this.demoStatus = "Loading showcase...";
            const sessionTokens = await bootstrapShowcaseSession();
            session.saveTokens(AUTH.DEMO_TYPE, sessionTokens);
            session.saveLoginTimestamp();
            session.mode = AUTH.DEMO_TYPE;
            this.demoTokens = sessionTokens;
            this.demoStatus = "Connected";
        });
    }

    async retryReal() {
        if (isShowcaseProfile()) return;
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
        if (isShowcaseProfile()) return;
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
