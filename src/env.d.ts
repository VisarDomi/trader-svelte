import * as ENV from './constants/env';

declare global {
    namespace NodeJS {
        interface ProcessEnv {
            [ENV.BACKEND_IP_ENV_KEY]: string;
            [ENV.CAPITAL_API_KEY_ENV_KEY]: string;
            [ENV.CAPITAL_IDENTIFIER_ENV_KEY]: string;
            [ENV.CAPITAL_PASSWORD_ENV_KEY]: string;
        }
    }
}

export {};