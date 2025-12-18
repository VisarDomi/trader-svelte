import * as STORAGE from '$lib/constants/storage.js';
import * as ENV from '$lib/env.js';
import * as AUTH_CONST from '$lib/constants/auth.js';
import { login } from "$lib/services/auth.js";
import type { SessionTokens, UserCredentials } from "$lib/types/auth.js";
import type { URL_TYPE } from "$lib/types/url.js";

export class Login {
    apiKey = $state("");
    identifier = $state("");
    password = $state("");
    demoStatus = $state("Not Logged In");
    realStatus = $state("Not Logged In");
    demoTokens = $state<SessionTokens | null>(null);
    realTokens = $state<SessionTokens | null>(null);

    constructor() {
        this.apiKey = ENV.ENV_APIKEY;
        this.identifier = ENV.ENV_IDENTIFIER;
        this.password = ENV.ENV_PASSWORD;
    }

    init() {
        const storedCredentials = localStorage.getItem(STORAGE.USER_CREDENTIALS_KEY);
        if (storedCredentials) {
            const c = JSON.parse(storedCredentials) as UserCredentials;
            this.identifier = c.identifier;
            this.password = c.password;
            this.apiKey = c.apiKey;
        }

        // Load stored tokens
        const demoTokensData = localStorage.getItem(STORAGE.TOKENS_DEMO_KEY);
        if (demoTokensData) this.demoTokens = JSON.parse(demoTokensData);

        const realTokensData = localStorage.getItem(STORAGE.TOKENS_REAL_KEY);
        if (realTokensData) this.realTokens = JSON.parse(realTokensData);
    }

    async loginBoth() {
        await Promise.all([
            this.performLogin(AUTH_CONST.REAL_TYPE),
            this.performLogin(AUTH_CONST.DEMO_TYPE)
        ]);
    }

    async retryReal() {
        await this.performLogin(AUTH_CONST.REAL_TYPE);
    }

    async retryDemo() {
        await this.performLogin(AUTH_CONST.DEMO_TYPE);
    }

    private saveInputs() {
        const credentials: UserCredentials = {
            identifier: this.identifier,
            password: this.password,
            apiKey: this.apiKey
        };
        localStorage.setItem(STORAGE.USER_CREDENTIALS_KEY, JSON.stringify(credentials));
    }

    private async performLogin(type: URL_TYPE) {
        this.saveInputs();

        const isReal = type === AUTH_CONST.REAL_TYPE;
        const setStatus = (msg: string) => {
            if (isReal) this.realStatus = msg;
            else this.demoStatus = msg;
        };
        const setTokens = (t: SessionTokens | null) => {
            if (isReal) this.realTokens = t;
            else this.demoTokens = t;
        };
        const storageKey = isReal ? STORAGE.TOKENS_REAL_KEY : STORAGE.TOKENS_DEMO_KEY;

        try {
            setStatus("Logging in...");
            const sessionTokens = await login(type);
            localStorage.setItem(storageKey, JSON.stringify(sessionTokens));
            localStorage.setItem(STORAGE.LOGIN_TIMESTAMP_KEY, Date.now().toString());
            setTokens(sessionTokens);
            setStatus("Connected");
        } catch (e) {
            const msg = `Error: ${e instanceof Error ? e.message : String(e)}`;
            setStatus(msg);
            console.error(e);
        }
    }
}