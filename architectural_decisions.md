# Global Architecture Principles

1. **Mobile First:** We optimize for iOS Safari quirks (viewports, tap delays). If a generic web solution fights with iOS behavior, the iOS hack wins.
2. **Explicit Architecture:** We use separate Service/Store/Controller layers. Do not inline logic into Svelte components.
3. **Event Bus:** Cross-domain communication happens via `globalBus`. Do not import Stores deeply across domains.
4. **Comments are Warnings:** If you see a capitalized comment explaining a "hack," assume it is there to prevent a specific bug. Do not remove it.

## iOS PWA Status Bar — Full-Screen Chart Approach

The chart page renders its canvas at full `screen.height`, extending behind the translucent iOS status bar.
This replaced a previous hack that used a 200px black spacer div (`TopBar.svelte`) with auto-scroll enforcement.

How it works:
- `app.html` sets `--app-height` to `screen.height` (the true device height, not the iOS `innerHeight` lie).
- `body` uses `height: var(--app-height, 100vh)` to fill the real screen.
- `viewport-fit=cover` + `apple-mobile-web-app-status-bar-style=black-translucent` makes the status bar transparent.
- The chart canvas fills the full viewport — no spacer, no scroll, no enforcement.
- The dark chart background blends seamlessly with the translucent status bar.
- HUD overlays use `env(safe-area-inset-top)` to position below the status bar.
- Non-chart pages still get `padding-top: env(safe-area-inset-top)` via the layout's `.safe-area` class.

This approach is ported from the comix-frontend reader, adapted for a non-scrolling chart context.
Works on both iOS 18 and iOS 26.

## Crosshair Suppression — API-Level Guard (replaced chartGuard.ts)

Overlays (ChartHud, TradePopup) sit on top of the chart. On iOS, touching an overlay or
closing a modal causes synthetic mouse/pointer events that activate LWC's crosshair.

### Why DOM-level blocking failed (the old `chartGuard.ts` approach)

The old approach attached capture-phase event listeners to the chart container to block
synthetic `mouseover`/`pointermove` events for 300ms after overlay interaction.
This failed for three reasons:

1. **LWC attaches listeners to `document`**, not just its canvas. Synthetic events reach
   those document-level handlers, bypassing any container-level blocking.
2. **Wrong events blocked** — only hover events were intercepted, not `touchstart`/`pointerdown`.
3. **Timer started on `touchstart`** — if the user held a touch >300ms, the blocking window
   expired before the synthetic events fired on `touchend`.

### The fix: control the output, not the input

Instead of fighting DOM events, we control LWC's crosshair via its own API:

- `ChartController` subscribes to `chart.subscribeCrosshairMove()`. When `crosshairBlocked`
  is true and the crosshair moves, it immediately calls `clearCrosshairPosition()` via
  `requestAnimationFrame`.
- Overlays signal `overlay:block-crosshair` / `overlay:unblock-crosshair` via the global
  event bus. Unblock is delayed 400ms to catch post-interaction synthetic events.
- `chartGuard.ts` is deleted. The Svelte action, the per-event blocking, and the timing
  hacks are all gone.

### Overlay-specific details

- **ChartHud**: Emits block on `touchstart`/`mousedown`, unblock on `touchend`/`mouseup`.
  Also blocks during position close (`isClosingPosition` effect) since the position section
  unmounting triggers synthetic events.
- **TradePopup**: Emits block while open, unblock on close. The backdrop is
  `pointer-events: none` so chart taps pass through, allowing the user to re-plan at a
  different price by tapping elsewhere. The popup dialog itself is `pointer-events: auto`.