import { CHART_CONTAINER_ID } from '$lib/shared/constants/chart.js';

let shieldCount = 0;

/**
 * Action to temporarily disable pointer events on the chart container
 * when the target element is touched/clicked.
 * This prevents "ghost clicks" or "tap penetration" on iOS.
 */
export function shield(node: HTMLElement) {
    function triggerShield() {
        const chart = document.getElementById(CHART_CONTAINER_ID);
        if (!chart) return;

        // Increment lock count
        shieldCount++;
        chart.style.pointerEvents = 'none';

        // Release lock after safety margin (iOS tap delay is ~300ms)
        setTimeout(() => {
            shieldCount--;
            // Only unlock if no other shields are active
            if (shieldCount <= 0) {
                shieldCount = 0;
                const c = document.getElementById(CHART_CONTAINER_ID);
                if (c) c.style.pointerEvents = 'auto';
            }
        }, 450);
    }

    // Capture interactions
    node.addEventListener('touchstart', triggerShield, { passive: true });
    node.addEventListener('mousedown', triggerShield, { passive: true });

    return {
        destroy() {
            node.removeEventListener('touchstart', triggerShield);
            node.removeEventListener('mousedown', triggerShield);
        }
    };
}