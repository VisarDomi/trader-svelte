export function isIOS(): boolean {
    if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;

    // Check for iPhone/iPod
    if (/iPad|iPhone|iPod/.test(navigator.userAgent)) return true;

    // Check for iPadOS (which presents as Macintosh but has touch points)
    if (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1) return true;

    return false;
}

export function isPWA(): boolean {
    if (typeof window === 'undefined') return false;

    // 1. Standard Modern Check
    if (window.matchMedia('(display-mode: standalone)').matches) return true;

    // 2. iOS Legacy Check (The "Source of Truth" for iOS PWAs)
    if ('standalone' in navigator && (navigator as any).standalone === true) return true;

    return false;
}