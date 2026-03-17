# Phase 2: Command Dispatch & State Machines

## Goal

Move all store dispatch logic into Rust. Each store's `dispatch(cmd)` switch statement becomes a Rust `match` with exhaustive checking. Svelte stores become thin bindings that mirror Rust state into `$state`.

## The Pattern

Every store follows the same migration pattern:

```
BEFORE (TypeScript):
    Store has $state + dispatch(cmd) with switch
    Logic and reactivity live together

AFTER (Rust + Svelte):
    Rust: State struct + dispatch(cmd) → (new state, Effect)
    Svelte: Binding class mirrors Rust state into $state, applies Effects
```

## MarketStore Migration

### Current TypeScript

```typescript
// MarketStore.svelte.ts (simplified)
export class MarketStore extends BaseStore {
    bidHistory = $state<ChartCandle[]>([]);
    askHistory = $state<ChartCandle[]>([]);
    currentBid = $state<number | null>(null);
    currentAsk = $state<number | null>(null);
    dataSource = $state<ChartDataSource>('BID');
    liveCandle = $state<ChartCandle | null>(null);

    dispatch(cmd: MarketCommand) {
        switch (cmd.tag) {
            case MarketCmd.Reset:
                this.bidHistory = [];
                this.askHistory = [];
                this.dataSource = cmd.dataSource;
                break;
            case MarketCmd.SetHistory:
                this.bidHistory = cmd.bid;
                this.askHistory = cmd.ask;
                break;
            case MarketCmd.PrependHistory:
                this.bidHistory = [...cmd.bid, ...this.bidHistory];
                this.askHistory = [...cmd.ask, ...this.askHistory];
                break;
            case MarketCmd.UpdateLive:
                this._updateLive(cmd.update);
                break;
        }
    }
}
```

### Rust Replacement

```rust
// crates/tendies-core/src/market/commands.rs

#[derive(Debug)]
pub enum MarketCommand {
    Reset { data_source: ChartDataSource },
    SetHistory { bid: Vec<Candle>, ask: Vec<Candle> },
    PrependHistory { bid: Vec<Candle>, ask: Vec<Candle> },
    UpdateLive { bid: f64, ask: f64, timestamp: f64 },
}
```

```rust
// crates/tendies-core/src/market/state.rs

use wasm_bindgen::prelude::*;
use crate::types::{Candle, ChartDataSource};

#[wasm_bindgen]
pub struct MarketState {
    bid_history: Vec<Candle>,
    ask_history: Vec<Candle>,
    current_bid: Option<f64>,
    current_ask: Option<f64>,
    data_source: ChartDataSource,
    live_candle: Option<Candle>,
    candle_interval_secs: f64,
}

/// Effects tell the JS side what changed — Svelte only reacts to these
#[wasm_bindgen]
#[derive(Debug)]
pub enum MarketEffect {
    /// State was cleared, UI should reset chart
    Cleared,
    /// Full history loaded, UI should set chart data
    HistorySet,
    /// History prepended, UI should prepend to chart
    HistoryPrepended,
    /// Only price changed, UI updates price display
    PriceUpdated,
    /// A candle closed and a new one started, UI pushes candle to chart
    CandleClosed,
}

#[wasm_bindgen]
impl MarketState {
    #[wasm_bindgen(constructor)]
    pub fn new(candle_interval_secs: f64) -> Self {
        Self {
            bid_history: Vec::new(),
            ask_history: Vec::new(),
            current_bid: None,
            current_ask: None,
            data_source: ChartDataSource::Bid,
            live_candle: None,
            candle_interval_secs,
        }
    }

    /// Reset to a new data source. Returns Cleared effect.
    pub fn reset(&mut self, data_source: ChartDataSource) -> MarketEffect {
        self.bid_history.clear();
        self.ask_history.clear();
        self.current_bid = None;
        self.current_ask = None;
        self.live_candle = None;
        self.data_source = data_source;
        MarketEffect::Cleared
    }

    /// Hot path: WebSocket tick. Two scalars in, one effect out.
    pub fn update_tick(&mut self, bid: f64, ask: f64, timestamp: f64) -> MarketEffect {
        self.current_bid = Some(bid);
        self.current_ask = Some(ask);

        let price = match self.data_source {
            ChartDataSource::Bid => bid,
            ChartDataSource::Offer => ask,
        };

        match &mut self.live_candle {
            Some(candle) => {
                let candle_end = candle.time + self.candle_interval_secs;
                if timestamp >= candle_end {
                    // Close current candle, start new one
                    let closed = *candle;
                    self.close_candle(closed);
                    self.live_candle = Some(Candle::new(candle_end, price, price, price, price));
                    MarketEffect::CandleClosed
                } else {
                    // Update live candle OHLC
                    candle.close = price;
                    if price > candle.high { candle.high = price; }
                    if price < candle.low { candle.low = price; }
                    MarketEffect::PriceUpdated
                }
            }
            None => {
                // First tick — start a new candle
                let aligned = self.align_timestamp(timestamp);
                self.live_candle = Some(Candle::new(aligned, price, price, price, price));
                MarketEffect::PriceUpdated
            }
        }
    }

    // --- Shared memory access for candle data (zero-copy) ---

    pub fn bid_history_ptr(&self) -> *const Candle {
        self.bid_history.as_ptr()
    }

    pub fn bid_history_len(&self) -> usize {
        self.bid_history.len()
    }

    pub fn ask_history_ptr(&self) -> *const Candle {
        self.ask_history.as_ptr()
    }

    pub fn ask_history_len(&self) -> usize {
        self.ask_history.len()
    }

    /// Push a single candle (called in a loop from JS for history loading)
    pub fn push_bid_candle(&mut self, time: f64, o: f64, h: f64, l: f64, c: f64) {
        self.bid_history.push(Candle::new(time, o, h, l, c));
    }

    pub fn push_ask_candle(&mut self, time: f64, o: f64, h: f64, l: f64, c: f64) {
        self.ask_history.push(Candle::new(time, o, h, l, c));
    }

    /// Signal that history loading is complete
    pub fn history_loaded(&mut self) -> MarketEffect {
        MarketEffect::HistorySet
    }

    /// Prepend older history (infinite scroll)
    pub fn prepend_bid_candle(&mut self, time: f64, o: f64, h: f64, l: f64, c: f64) {
        self.bid_history.insert(0, Candle::new(time, o, h, l, c));
    }

    pub fn history_prepended(&mut self) -> MarketEffect {
        MarketEffect::HistoryPrepended
    }

    // --- Getters for JS ---

    pub fn current_bid(&self) -> Option<f64> { self.current_bid }
    pub fn current_ask(&self) -> Option<f64> { self.current_ask }
    pub fn spread(&self) -> Option<f64> {
        match (self.current_ask, self.current_bid) {
            (Some(ask), Some(bid)) => Some(ask - bid),
            _ => None,
        }
    }

    pub fn live_candle_close(&self) -> Option<f64> {
        self.live_candle.map(|c| c.close)
    }

    // --- Internal ---

    fn close_candle(&mut self, candle: Candle) {
        match self.data_source {
            ChartDataSource::Bid => self.bid_history.push(candle),
            ChartDataSource::Offer => self.ask_history.push(candle),
        }
    }

    fn align_timestamp(&self, ts: f64) -> f64 {
        (ts / self.candle_interval_secs).floor() * self.candle_interval_secs
    }
}
```

### Svelte Binding (thin mirror)

```typescript
// src/lib/bindings/market.svelte.ts
import { MarketState, MarketEffect, ChartDataSource } from '$lib/wasm/tendies_core';

class MarketBinding {
    private core: MarketState;

    // Reactive surface — ONLY these trigger Svelte updates
    currentBid = $state<number | null>(null);
    currentAsk = $state<number | null>(null);
    spread = $state<number | null>(null);
    liveClose = $state<number | null>(null);

    // Chart callback — bypasses Svelte reactivity for performance
    private onChartUpdate: ((effect: MarketEffect) => void) | null = null;

    constructor(candleIntervalSecs: number) {
        this.core = new MarketState(candleIntervalSecs);
    }

    setChartCallback(cb: (effect: MarketEffect) => void) {
        this.onChartUpdate = cb;
    }

    reset(dataSource: ChartDataSource) {
        const effect = this.core.reset(dataSource);
        this.syncReactiveState();
        this.onChartUpdate?.(effect);
    }

    /** Hot path — called 1-4x per second from WebSocket */
    tick(bid: number, ask: number, timestamp: number) {
        const effect = this.core.update_tick(bid, ask, timestamp);

        // Update reactive state (two scalar assignments)
        this.currentBid = bid;
        this.currentAsk = ask;
        this.spread = this.core.spread() ?? null;
        this.liveClose = this.core.live_candle_close() ?? null;

        // Notify chart directly (not through Svelte)
        this.onChartUpdate?.(effect);
    }

    /** Bulk history load — called once per instrument switch */
    loadHistory(bidCandles: Array<{t: number, o: number, h: number, l: number, c: number}>,
                askCandles: Array<{t: number, o: number, h: number, l: number, c: number}>) {
        for (const c of bidCandles) {
            this.core.push_bid_candle(c.t, c.o, c.h, c.l, c.c);
        }
        for (const c of askCandles) {
            this.core.push_ask_candle(c.t, c.o, c.h, c.l, c.c);
        }
        const effect = this.core.history_loaded();
        this.onChartUpdate?.(effect);
    }

    private syncReactiveState() {
        this.currentBid = this.core.current_bid() ?? null;
        this.currentAsk = this.core.current_ask() ?? null;
        this.spread = this.core.spread() ?? null;
        this.liveClose = this.core.live_candle_close() ?? null;
    }
}

export const marketBinding = new MarketBinding(60); // 1-minute candles
```

---

## PositionStore Migration

### Rust

```rust
// crates/tendies-core/src/position/commands.rs

pub enum PositionCommand {
    SetFromTrade(PositionData),
    UpdateFromPoll(Vec<PositionData>),
    ClearAll,
}

pub enum PositionEffect {
    PositionOpened { position: PositionData },
    PositionUpdated { pnl: f64 },
    PositionClosed,
    NoChange,
}
```

```rust
// crates/tendies-core/src/position/state.rs

use wasm_bindgen::prelude::*;
use serde::{Serialize, Deserialize};

#[wasm_bindgen]
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct PositionData {
    deal_id: String,
    direction: Direction,
    size: f64,
    open_level: f64,
    stop_level: Option<f64>,
    limit_level: Option<f64>,
    currency: String,
}

#[wasm_bindgen]
pub struct PositionState {
    active: Option<PositionData>,
}

#[wasm_bindgen]
impl PositionState {
    #[wasm_bindgen(constructor)]
    pub fn new() -> Self {
        Self { active: None }
    }

    pub fn set_from_trade(&mut self, position_json: &str) -> bool {
        // Deserialize from JSON (cold path — called once per trade)
        match serde_json::from_str::<PositionData>(position_json) {
            Ok(pos) => {
                self.active = Some(pos);
                true // PositionOpened
            }
            Err(_) => false,
        }
    }

    pub fn clear(&mut self) -> bool {
        let had_position = self.active.is_some();
        self.active = None;
        had_position // true = PositionClosed
    }

    pub fn has_position(&self) -> bool {
        self.active.is_some()
    }

    /// Calculate P&L given current market price
    pub fn unrealized_pnl(&self, current_price: f64) -> f64 {
        match &self.active {
            Some(pos) => {
                let diff = match pos.direction {
                    Direction::Buy => current_price - pos.open_level,
                    Direction::Sell => pos.open_level - current_price,
                };
                diff * pos.size
            }
            None => 0.0,
        }
    }

    pub fn open_level(&self) -> Option<f64> {
        self.active.as_ref().map(|p| p.open_level)
    }

    pub fn size(&self) -> Option<f64> {
        self.active.as_ref().map(|p| p.size)
    }
}
```

### Svelte Binding

```typescript
// src/lib/bindings/position.svelte.ts
import { PositionState } from '$lib/wasm/tendies_core';

class PositionBinding {
    private core = new PositionState();

    hasPosition = $state(false);
    unrealizedPnl = $state(0);
    openLevel = $state<number | null>(null);
    size = $state<number | null>(null);

    setFromTrade(positionJson: string) {
        this.core.set_from_trade(positionJson);
        this.sync();
    }

    close() {
        this.core.clear();
        this.sync();
    }

    /** Called on every price tick to update P&L display */
    updatePnl(currentPrice: number) {
        this.unrealizedPnl = this.core.unrealized_pnl(currentPrice);
    }

    private sync() {
        this.hasPosition = this.core.has_position();
        this.openLevel = this.core.open_level() ?? null;
        this.size = this.core.size() ?? null;
        this.unrealizedPnl = 0;
    }
}

export const positionBinding = new PositionBinding();
```

---

## AccountStore Migration

### Rust

```rust
// crates/tendies-core/src/account/state.rs

use wasm_bindgen::prelude::*;
use serde::{Serialize, Deserialize};

#[wasm_bindgen]
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct AccountInfo {
    account_id: String,
    account_name: String,
    balance: f64,
    deposit: f64,
    profit_loss: f64,
    available: f64,
}

#[wasm_bindgen]
pub struct AccountState {
    accounts: Vec<AccountInfo>,
    active_index: Option<usize>,
}

#[wasm_bindgen]
impl AccountState {
    #[wasm_bindgen(constructor)]
    pub fn new() -> Self {
        Self { accounts: Vec::new(), active_index: None }
    }

    pub fn set_accounts_json(&mut self, json: &str) -> bool {
        match serde_json::from_str::<Vec<AccountInfo>>(json) {
            Ok(accounts) => {
                self.accounts = accounts;
                if self.active_index.is_none() && !self.accounts.is_empty() {
                    self.active_index = Some(0);
                }
                true
            }
            Err(_) => false,
        }
    }

    pub fn switch_account(&mut self, index: usize) -> bool {
        if index < self.accounts.len() {
            self.active_index = Some(index);
            true
        } else {
            false
        }
    }

    pub fn active_balance(&self) -> f64 {
        self.active_account().map(|a| a.balance).unwrap_or(0.0)
    }

    pub fn active_available(&self) -> f64 {
        self.active_account().map(|a| a.available).unwrap_or(0.0)
    }

    pub fn account_count(&self) -> usize {
        self.accounts.len()
    }

    fn active_account(&self) -> Option<&AccountInfo> {
        self.active_index.and_then(|i| self.accounts.get(i))
    }
}
```

---

## The EventBus Question

The current `EventBus` is pure TypeScript with no Svelte or browser dependencies. It coordinates between stores.

**Decision: Keep the EventBus in JS.**

Reasons:
1. It's already pure and working
2. Cross-WASM-boundary event dispatch would require serialization on every event
3. The bus connects IO (WebSocket, fetch) to state (Rust) — it's the glue layer
4. Moving it to Rust would mean all subscribers (services, pollers) also need to be Rust

The flow becomes:

```
WebSocket tick
    → JS EventBus emits 'PRICE_UPDATE'
    → MarketBinding.tick(bid, ask, ts)     // calls Rust
    → PositionBinding.updatePnl(bid)       // calls Rust
    → ChartController.update(effect)       // stays JS
```

The EventBus orchestrates, Rust decides. Clean separation.

---

## Migration Checklist

- [ ] Port MarketCommands.ts → `market/commands.rs` + `market/state.rs`
- [ ] Port PositionCommands.ts → `position/commands.rs` + `position/state.rs`
- [ ] Port AccountCommands.ts → `account/commands.rs` + `account/state.rs`
- [ ] Port TradeStore dispatch logic → `trade/state.rs`
- [ ] Write Rust tests: every command variant produces expected effect
- [ ] Write Rust tests: invalid state transitions return error effects
- [ ] Create `src/lib/bindings/market.svelte.ts`
- [ ] Create `src/lib/bindings/position.svelte.ts`
- [ ] Create `src/lib/bindings/account.svelte.ts`
- [ ] Create `src/lib/bindings/trade.svelte.ts`
- [ ] Rewire MarketDataPump to call `marketBinding.tick()` instead of `marketStore.dispatch()`
- [ ] Rewire PositionPoller to call `positionBinding.setFromTrade()`
- [ ] Rewire chart callbacks to respond to MarketEffect enum
- [ ] Delete original TypeScript store dispatch logic
- [ ] Keep EventBus in JS, update subscribers to call bindings
- [ ] Run full manual test on iOS PWA
