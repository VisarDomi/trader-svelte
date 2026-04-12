import * as AUTH from '$lib/shared/constants/auth.js';
import type { URL_TYPE } from '$lib/shared/types/url.js';
import type { AppProfile } from '$lib/shared/types/app.js';

let appProfile: AppProfile = 'personal';

export function setRuntimeAppProfile(profile: AppProfile): void {
    appProfile = profile;
}

export function getAppProfile(): AppProfile {
    return appProfile;
}

export function isShowcaseProfile(): boolean {
    return appProfile === 'showcase';
}

export function getAllowedModes(): URL_TYPE[] {
    return isShowcaseProfile()
        ? [AUTH.DEMO_TYPE]
        : [AUTH.REAL_TYPE, AUTH.DEMO_TYPE];
}

export function getDefaultMode(): URL_TYPE {
    return AUTH.DEMO_TYPE;
}

export function allowsMode(mode: URL_TYPE): boolean {
    return getAllowedModes().includes(mode);
}
