import { dev } from '$app/environment';
import { env as public_env } from '$env/dynamic/public';

export const ENV_APIKEY = dev ? (public_env.PUBLIC_API_KEY ?? "") : "";
export const ENV_IDENTIFIER = dev ? (public_env.PUBLIC_IDENTIFIER ?? "") : "";
export const ENV_PASSWORD = dev ? (public_env.PUBLIC_PASSWORD ?? "") : "";
