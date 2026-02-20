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