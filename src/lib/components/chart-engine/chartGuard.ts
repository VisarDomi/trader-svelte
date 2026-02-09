import { CHART_CONTAINER_ID } from '$lib/shared/constants/chart.js';

/**
 * Block synthetic hover/enter/move events on the chart container for a duration.
 *
 * iOS fires synthetic mouseover/pointerenter/pointermove at the last known
 * touch position when pointer-events are restored or an overlay is removed.
 * This prevents LWC's crosshair from activating on those phantom events.
 */
export function blockChartEvents(duration = 300) {
    const c = document.getElementById(CHART_CONTAINER_ID);
    if (!c) return;

    let blocking = true;
    const events = ['mouseover', 'mouseenter', 'mousemove',
        'pointerenter', 'pointerover', 'pointermove'];

    function blockAll(e: Event) {
        if (!blocking) return;
        e.stopImmediatePropagation();
        e.stopPropagation();
        e.preventDefault();
    }

    for (const evt of events) c.addEventListener(evt, blockAll, true);

    setTimeout(() => {
        blocking = false;
        for (const evt of events) c.removeEventListener(evt, blockAll, true);
    }, duration);
}

/**
 * Svelte action: blocks chart synthetic events after each tap on the element.
 * Use on buttons/interactive elements that sit over the chart.
 */
export function chartGuard(node: HTMLElement) {
    function onInteraction() {
        blockChartEvents();
    }

    node.addEventListener('touchstart', onInteraction, { passive: true });
    node.addEventListener('mousedown', onInteraction, { passive: true });

    return {
        destroy() {
            node.removeEventListener('touchstart', onInteraction);
            node.removeEventListener('mousedown', onInteraction);
        }
    };
}
