export function isIOS(): boolean {
    if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;

    // Standard iOS detection
    // Note: This matches iPhones, iPads, and iPods.
    // It does not explicitly check for 'MacIntel' with touch points (iPad OS 13+),
    // but the regex usually suffices for the specific "phone" viewport hacks needed.
    return /iPad|iPhone|iPod/.test(navigator.userAgent);
}