# Svelte Bindings Pattern: The Thin Bridge

## Principle

A binding is a Svelte 5 class that:
1. Owns a Rust (WASM) state instance
2. Exposes a minimal `$state` surface for Svelte reactivity
3. Translates method calls to Rust dispatches
4. Applies returned Effects to `$state` or external systems (chart, navigation)

A binding does NOT contain business logic. If you're writing an `if` statement that decides what happens, it belongs in Rust.

## Anatomy of a Binding

```typescript
// src/lib/bindings/[domain].svelte.ts

import { SomeState, SomeEffect } from '$lib/wasm/tendies_core';

class SomeBinding {
    // 1. Private Rust core — not reactive, not exposed
    private core: SomeState;

    // 2. Reactive surface — ONLY what the UI needs to render
    someValue = $state<number>(0);
    someFlag = $state(false);

    // 3. Constructor — create Rust instance
    constructor(config: number) {
        this.core = new SomeState(config);
    }

    // 4. Methods — translate to Rust calls, apply effects
    doSomething(input: number) {
        const effect = this.core.some_method(input);  // Rust decides
        this.applyEffect(effect);                      // JS mirrors
    }

    // 5. Effect handler — the ONLY place $state is mutated
    private applyEffect(effect: SomeEffect) {
        switch (effect) {
            case SomeEffect.ValueChanged:
                this.someValue = this.core.get_value();
                break;
            case SomeEffect.Reset:
                this.someValue = 0;
                this.someFlag = false;
                break;
            case SomeEffect.None:
                break;
        }
    }
}

// 6. Singleton export
export const someBinding = new SomeBinding(42);
```

## Rules

### 1. One binding per Rust state struct

```
MarketState   → MarketBinding
PositionState → PositionBinding
AccountState  → AccountBinding
EngineState   → EngineBinding
```

### 2. $state only for what the UI renders

**Bad** — exposing everything:
```typescript
class MarketBinding {
    bidHistory = $state<Candle[]>([]);     // UI doesn't render this directly
    askHistory = $state<Candle[]>([]);     // chart reads from Rust memory
    dataSource = $state('BID');            // no component reads this
    liveCandle = $state<Candle | null>(null); // chart reads from Rust
    currentBid = $state<number | null>(null); // HUD displays this ✓
    currentAsk = $state<number | null>(null); // HUD displays this ✓
}
```

**Good** — minimal surface:
```typescript
class MarketBinding {
    // Only what Svelte components actually bind to
    currentBid = $state<number | null>(null);
    currentAsk = $state<number | null>(null);
    spread = $state<number | null>(null);

    // Chart gets data through callback, not $state
    private onChartUpdate: ((effect: MarketEffect) => void) | null = null;
}
```

### 3. Effects are the only mutation trigger

Never mutate `$state` outside of `applyEffect()`:

```typescript
// BAD
tick(bid: number, ask: number) {
    this.currentBid = bid;  // mutation outside effect handler
    this.core.update_tick(bid, ask, ts);
}

// GOOD
tick(bid: number, ask: number, ts: number) {
    const effect = this.core.update_tick(bid, ask, ts);
    // All mutations happen here:
    this.currentBid = bid;
    this.currentAsk = ask;
    this.spread = this.core.spread() ?? null;
    this.onChartUpdate?.(effect);
}
```

Exception: the tick hot path is performance-sensitive. It's acceptable to inline the reactive updates alongside the Rust call as shown above, since the effect enum tells you what changed.

### 4. Callbacks for non-reactive consumers

The chart (lightweight-charts) doesn't use Svelte reactivity — it has its own imperative API. Use callbacks instead of `$state`:

```typescript
class MarketBinding {
    private onChartUpdate: ((effect: MarketEffect) => void) | null = null;

    /** Chart controller registers itself here */
    setChartCallback(cb: (effect: MarketEffect) => void) {
        this.onChartUpdate = cb;
    }

    tick(bid: number, ask: number, ts: number) {
        const effect = this.core.update_tick(bid, ask, ts);
        this.syncReactiveState();
        // Direct callback to chart — bypasses Svelte reactivity
        this.onChartUpdate?.(effect);
    }
}
```

```typescript
// ChartController registers the callback
class ChartController {
    init(marketBinding: MarketBinding) {
        marketBinding.setChartCallback((effect) => {
            switch (effect) {
                case MarketEffect.CandleClosed:
                    // Read latest candle from Rust memory, push to chart
                    const len = marketBinding.core.bid_history_len();
                    // ... read candle and update chart
                    break;
                case MarketEffect.PriceUpdated:
                    // Update live candle display
                    break;
            }
        });
    }
}
```

### 5. Bindings are singletons

Like the current stores, bindings are module-level singletons:

```typescript
// Bottom of file
export const marketBinding = new MarketBinding(60);
export const positionBinding = new PositionBinding();
export const accountBinding = new AccountBinding();
export const engineBinding = new EngineBinding();
```

Components import the singleton:

```svelte
<script>
import { marketBinding } from '$lib/bindings/market.svelte';

// Reactive: updates when binding.currentBid changes
const bid = $derived(marketBinding.currentBid);
</script>

<span>{bid ?? '---'}</span>
```

### 6. EventBus connects bindings to IO

The EventBus stays in JS. It wires browser events (WebSocket, fetch, timers) to binding methods:

```typescript
// src/lib/services/EventWiring.ts

import { bus } from '$lib/core/events/globalBus';
import { marketBinding } from '$lib/bindings/market.svelte';
import { positionBinding } from '$lib/bindings/position.svelte';
import { engineBinding } from '$lib/bindings/engine.svelte';

export function wireEvents() {
    // WebSocket tick → MarketBinding
    bus.on('PRICE_TICK', ({ bid, ask, ts }) => {
        marketBinding.tick(bid, ask, ts);
        // Also update position P&L with new price
        positionBinding.updatePnl(bid);
    });

    // Position poll result → PositionBinding
    bus.on('POSITION_POLLED', (data) => {
        positionBinding.setFromPoll(JSON.stringify(data));
    });

    // Connectivity → EngineBinding
    bus.on('CONNECTION_LOST', () => {
        engineBinding.dispatch(EngineCommand.ConnectionLost);
    });
    bus.on('CONNECTION_RESTORED', () => {
        engineBinding.dispatch(EngineCommand.ConnectionRestored);
    });
}
```

## Complete Example: PositionBinding

```typescript
// src/lib/bindings/position.svelte.ts

import { PositionState } from '$lib/wasm/tendies_core';

class PositionBinding {
    private core = new PositionState();

    // Reactive surface
    hasPosition = $state(false);
    unrealizedPnl = $state(0);
    openLevel = $state<number | null>(null);
    size = $state<number | null>(null);
    direction = $state<string | null>(null);

    setFromTrade(positionJson: string) {
        const success = this.core.set_from_trade(positionJson);
        if (success) this.sync();
    }

    setFromPoll(positionJson: string) {
        const success = this.core.update_from_poll(positionJson);
        if (success) this.sync();
    }

    close() {
        this.core.clear();
        this.sync();
    }

    /** Called on every price tick — high frequency */
    updatePnl(currentPrice: number) {
        // Single scalar call to Rust, single scalar back
        this.unrealizedPnl = this.core.unrealized_pnl(currentPrice);
    }

    private sync() {
        this.hasPosition = this.core.has_position();
        this.openLevel = this.core.open_level() ?? null;
        this.size = this.core.size() ?? null;
        this.direction = this.core.direction_str() ?? null;
        this.unrealizedPnl = 0;
    }
}

export const positionBinding = new PositionBinding();
```

## Complete Example: Using in a Svelte Component

```svelte
<!-- src/routes/chart/+page.svelte -->
<script>
import { marketBinding } from '$lib/bindings/market.svelte';
import { positionBinding } from '$lib/bindings/position.svelte';

const bid = $derived(marketBinding.currentBid);
const ask = $derived(marketBinding.currentAsk);
const spread = $derived(marketBinding.spread);
const pnl = $derived(positionBinding.unrealizedPnl);
const hasPos = $derived(positionBinding.hasPosition);
</script>

<div class="hud">
    <span class="bid">{bid?.toFixed(1) ?? '---'}</span>
    <span class="spread">{spread?.toFixed(1)}</span>
    <span class="ask">{ask?.toFixed(1) ?? '---'}</span>

    {#if hasPos}
        <span class="pnl" class:positive={pnl > 0} class:negative={pnl < 0}>
            {pnl.toFixed(2)}
        </span>
    {/if}
</div>
```

The component doesn't know or care that the values come from Rust. It just reads `$state` through `$derived`. The binding is the only thing that knows about WASM.
