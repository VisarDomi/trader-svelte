import { BaseStore } from '$lib/modules/core/stores/BaseStore.svelte.js';
import * as ENV from '$lib/modules/core/config/env.js';
import * as AUTH from '$lib/shared/constants/auth.js';
import { login } from '$lib/modules/auth/services/AuthService.js';
import { session } from '$lib/modules/core/services/SessionManager.js';
import type { SessionTokens, UserCredentials } from '$lib/shared/types/auth.js';
import type { URL_TYPE } from '$lib/shared/types/url.js';

export class AuthStore extends BaseStore {
    // Form State
    apiKey = $state("");
    identifier = $state("");
    password = $state("");

    // Connection Status
    demoStatus = $state("Not Logged In");
    realStatus = $state("Not Logged In");

    // Tokens
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
            // Ignore if no credentials saved
        }

        this.demoTokens = session.getTokens(AUTH.DEMO_TYPE);
        this.realTokens = session.getTokens(AUTH.REAL_TYPE);

        if (this.demoTokens) this.demoStatus = "Session Token Found";
        if (this.realTokens) this.realStatus = "Session Token Found";
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
            // Re-throw so BaseStore.execute catches it and sets .error state
            throw e;
        }
    }
}

export const authStore = new AuthStore();