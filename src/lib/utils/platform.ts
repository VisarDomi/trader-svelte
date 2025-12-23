export function isIOS(): boolean {
    if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;
    return /iPad|iPhone/.test(navigator.userAgent);
}

export function isPWA(): boolean {
    if (typeof window === 'undefined') return false;
    if (window.matchMedia('(display-mode: standalone)').matches) return true;
    if ('standalone' in navigator && (navigator as any).standalone === true) return true;
    return false;
}