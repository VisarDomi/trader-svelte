# WASM Data Transfer: Zero-Copy Strategies

## The Problem

WASM and JS run in the same process but have separate memory spaces. Passing data between them requires either serialization (serde → JSON → parse) or shared memory (direct byte access). For a trading app, the hot path is the bid/ask tick — it must be as fast as possible.

## Data Flow Classification

| Data flow | Frequency | Size | Strategy |
|---|---|---|---|
| Bid/ask tick | 1-4/sec | 2 x f64 | Scalar arguments |
| Candle close | Every few seconds | 1 x Candle (5 x f64) | Return struct |
| Historical load | Once per instrument | 500-2000 candles | Scalar loop or shared memory |
| Infinite scroll prepend | On user scroll | 100-500 candles | Scalar loop |
| Instrument spec | Once at load | Struct with strings | serde (fine) |
| Account data | On poll (~5s) | Struct with strings | serde (fine) |
| Trade plan result | On user action | Flat struct (10 x f64) | Scalar getters |
| Position update | On poll (~5s) | Struct with strings | serde (fine) |

## Strategy 1: Scalar Arguments (Hot Path)

For the WebSocket tick — two f64 values, called 1-4 times per second.

### Rust

```rust
#[wasm_bindgen]
impl MarketState {
    /// Two f64 args in, one enum out. No serde, no allocation.
    /// Cost: ~5 nanoseconds (two register moves + a branch)
    pub fn update_tick(&mut self, bid: f64, ask: f64, timestamp: f64) -> MarketEffect {
        self.current_bid = Some(bid);
        self.current_ask = Some(ask);
        // ... candle logic, returns PriceUpdated or CandleClosed
    }
}
```

### JS

```typescript
// WebSocket handler — called on every tick
ws.onmessage = (msg) => {
    const { bid, ask, timestamp } = parseTick(msg);

    // 3 numbers cross the WASM boundary — nanosecond cost
    const effect = marketState.update_tick(bid, ask, timestamp);

    // Mirror to Svelte (2 scalar assignments)
    binding.currentBid = bid;
    binding.currentAsk = ask;

    // Update chart if needed
    if (effect === MarketEffect.CandleClosed) {
        const candle = marketState.latest_closed_candle();
        chartSeries.update(candle);
    }
};
```

**Why not serde here:** JSON.stringify + JSON.parse + serde_json::from_str for two numbers would be ~1000x slower than passing scalars. On a 1-4/sec tick it wouldn't matter for correctness, but it's wasteful.

## Strategy 2: Scalar Loop (Bulk History Load)

When you fetch 500 historical candles from the broker API, you have a JSON array in JS. Instead of serializing the whole array to Rust, write each candle as 5 scalar arguments.

### Rust

```rust
#[wasm_bindgen]
impl MarketState {
    /// Called in a loop from JS — one candle at a time, 5 scalars each
    pub fn push_bid_candle(&mut self, time: f64, o: f64, h: f64, l: f64, c: f64) {
        self.bid_history.push(Candle { time, open: o, high: h, low: l, close: c });
    }

    pub fn push_ask_candle(&mut self, time: f64, o: f64, h: f64, l: f64, c: f64) {
        self.ask_history.push(Candle { time, open: o, high: h, low: l, close: c });
    }

    /// Pre-allocate capacity to avoid repeated Vec resizing
    pub fn reserve_history(&mut self, count: usize) {
        self.bid_history.reserve(count);
        self.ask_history.reserve(count);
    }

    /// Signal that loading is complete — triggers any derived calculations
    pub fn history_loaded(&mut self) -> MarketEffect {
        MarketEffect::HistorySet
    }
}
```

### JS

```typescript
// History load — called once per instrument switch
const { bid, ask } = await fetchHistory(epic);

// Pre-allocate in Rust
marketState.reserve_history(bid.length);

// Write each candle as 5 scalars — no serde
for (const c of bid) {
    marketState.push_bid_candle(c.time, c.open, c.high, c.low, c.close);
}
for (const c of ask) {
    marketState.push_ask_candle(c.time, c.open, c.high, c.low, c.close);
}

const effect = marketState.history_loaded();
applyEffect(effect);
```

**Benchmark:** 500 candles × 5 scalars × 2 (bid+ask) = 5,000 WASM function calls. Each call is ~5ns. Total: ~25μs. Imperceptible.

## Strategy 3: Shared Memory (Zero-Copy Read)

When lightweight-charts needs the full candle array (e.g., on chart initialization), JS can read directly from WASM's linear memory instead of copying data out.

### Rust

```rust
#[wasm_bindgen]
impl MarketState {
    /// Return pointer to the candle array in WASM memory
    pub fn bid_history_ptr(&self) -> *const f64 {
        self.bid_history.as_ptr() as *const f64
    }

    pub fn bid_history_len(&self) -> usize {
        self.bid_history.len()
    }

    /// Get a single candle by index (safe alternative to pointer access)
    pub fn bid_candle_time(&self, i: usize) -> f64 { self.bid_history[i].time }
    pub fn bid_candle_open(&self, i: usize) -> f64 { self.bid_history[i].open }
    pub fn bid_candle_high(&self, i: usize) -> f64 { self.bid_history[i].high }
    pub fn bid_candle_low(&self, i: usize) -> f64 { self.bid_history[i].low }
    pub fn bid_candle_close(&self, i: usize) -> f64 { self.bid_history[i].close }
}
```

### JS (pointer access)

```typescript
// Read candle data directly from WASM memory — zero copy
function readCandlesFromWasm(
    wasm: WebAssembly.Instance,
    state: MarketState,
): Array<{time: number, open: number, high: number, low: number, close: number}> {
    const ptr = state.bid_history_ptr();
    const len = state.bid_history_len();

    // Each Candle = 5 x f64 = 40 bytes
    const view = new Float64Array(wasm.memory.buffer, ptr, len * 5);

    const candles = [];
    for (let i = 0; i < len; i++) {
        const o = i * 5;
        candles.push({
            time: view[o],
            open: view[o + 1],
            high: view[o + 2],
            low: view[o + 3],
            close: view[o + 4],
        });
    }
    return candles;
}
```

### JS (indexed access — safer, simpler)

```typescript
// Safer alternative: read through Rust getters (bounds-checked)
function readCandlesSafe(state: MarketState): CandleData[] {
    const len = state.bid_history_len();
    const candles = new Array(len);
    for (let i = 0; i < len; i++) {
        candles[i] = {
            time: state.bid_candle_time(i),
            open: state.bid_candle_open(i),
            high: state.bid_candle_high(i),
            low: state.bid_candle_low(i),
            close: state.bid_candle_close(i),
        };
    }
    return candles;
}
```

**Recommendation:** Use indexed access (safer) for history loads (cold path). Use pointer access only if profiling shows the indexed approach is too slow for very large datasets (10k+ candles).

### Important Caveat: Memory Growth

```typescript
// WASM memory can grow (when Rust Vec resizes).
// This INVALIDATES all Float64Array views.
// Rule: grab pointer, read immediately, don't hold references.

// BAD:
const view = new Float64Array(wasm.memory.buffer, ptr, len);
state.push_bid_candle(1, 2, 3, 4, 5);  // may trigger memory growth!
view[0];  // UNDEFINED BEHAVIOR — view may point to freed memory

// GOOD:
const candles = readCandlesFromWasm(wasm, state);  // copy data out
state.push_bid_candle(1, 2, 3, 4, 5);  // safe, candles is independent
```

## Strategy 4: Serde for Complex/Infrequent Data

For instrument specs, account info, position data — structs with strings, loaded infrequently.

### Rust

```rust
use serde::{Serialize, Deserialize};
use serde_wasm_bindgen;

#[derive(Serialize, Deserialize)]
pub struct InstrumentSpec {
    pub epic: String,
    pub name: String,
    pub min_size: f64,
    pub lot_size: f64,
    pub margin_factor: f64,
    pub currency: String,
    pub pip_size: f64,
}

#[wasm_bindgen]
pub fn load_instrument(json: &str) -> Result<(), String> {
    let spec: InstrumentSpec = serde_json::from_str(json)
        .map_err(|e| e.to_string())?;
    // store it...
    Ok(())
}
```

### JS

```typescript
// Cold path — called once per instrument switch
const instrument = await fetchInstrument(epic);
load_instrument(JSON.stringify(instrument));
```

**Why serde is fine here:** Called once, <1ms, contains strings that can't be passed as scalars anyway.

## Performance Summary

| Strategy | WASM calls | Serde overhead | Copy overhead | When to use |
|---|---|---|---|---|
| Scalar args | 1 per tick | None | None | Hot path (ticks) |
| Scalar loop | N per batch | None | None | Bulk loads (<5k items) |
| Shared memory | 2 (ptr + len) | None | None (direct read) | Large reads (10k+ items) |
| Indexed access | N per batch | None | Minimal | Bulk reads (safe) |
| Serde JSON | 1 per object | ~0.1-1ms | Full copy | Complex structs with strings |

## Decision Matrix for Tendies

```
WebSocket tick (bid, ask)
    → Strategy 1: scalar args (update_tick(bid, ask, ts))

History load (500 candles)
    → Strategy 2: scalar loop (push_bid_candle × 500)

Chart initialization (read all candles for lightweight-charts)
    → Strategy 3 or 4: indexed access or shared memory

Instrument load
    → Strategy 4: serde JSON (load_instrument(json))

Account/position poll
    → Strategy 4: serde JSON (set_accounts_json(json))

Trade plan result
    → Built-in: wasm_bindgen struct with scalar getters
```

## Struct Layout for Shared Memory

If using pointer-based access, the Rust struct layout must be predictable:

```rust
// repr(C) ensures fields are laid out in declaration order
// No padding surprises
#[repr(C)]
#[derive(Clone, Copy)]
pub struct Candle {
    pub time: f64,   // offset 0
    pub open: f64,   // offset 8
    pub high: f64,   // offset 16
    pub low: f64,    // offset 24
    pub close: f64,  // offset 32
}
// Total: 40 bytes per candle, predictable layout
```

```typescript
// JS side knows the layout
const CANDLE_SIZE = 5; // 5 x f64
const view = new Float64Array(wasm.memory.buffer, ptr, len * CANDLE_SIZE);

// Access pattern:
// view[i * 5 + 0] = time
// view[i * 5 + 1] = open
// view[i * 5 + 2] = high
// view[i * 5 + 3] = low
// view[i * 5 + 4] = close
```
