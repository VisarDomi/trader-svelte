# Global Architecture Principles

1. **Mobile First:** We optimize for iOS Safari quirks (viewports, tap delays). If a generic web solution fights with iOS behavior, the iOS hack wins.
2. **Explicit Architecture:** We use separate Service/Store/Controller layers. Do not inline logic into Svelte components.
3. **Event Bus:** Cross-domain communication happens via `globalBus`. Do not import Stores deeply across domains.
4. **Comments are Warnings:** If you see a capitalized comment explaining a "hack," assume it is there to prevent a specific bug. Do not remove it.