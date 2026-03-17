# Phase 1: Types & Pure Business Logic

## Goal

Extract all type definitions, constants, and pure calculation functions into a Rust crate. Zero architectural change to the app — Svelte calls Rust functions instead of TypeScript functions.

## What Moves to Rust

### Types (from `src/lib/shared/types/`)

Every TypeScript interface/type becomes a Rust struct or enum:

```rust
// crates/tendies-core/src/types/instrument.rs

use wasm_bindgen::prelude::*;

#[wasm_bindgen]
#[derive(Clone, Debug)]
pub struct InstrumentSpec {
    epic: String,
    min_size: f64,
    lot_size: f64,
    margin_factor: f64,
    currency: String,
    pip_size: f64,
    // Add fields matching your TypeScript InstrumentSpec
}

#[wasm_bindgen]
impl InstrumentSpec {
    #[wasm_bindgen(constructor)]
    pub fn new(
        epic: String,
        min_size: f64,
        lot_size: f64,
        margin_factor: f64,
        currency: String,
        pip_size: f64,
    ) -> Self {
        Self { epic, min_size, lot_size, margin_factor, currency, pip_size }
    }

    // Getters for JS access
    #[wasm_bindgen(getter)]
    pub fn epic(&self) -> String { self.epic.clone() }

    #[wasm_bindgen(getter)]
    pub fn min_size(&self) -> f64 { self.min_size }

    #[wasm_bindgen(getter)]
    pub fn lot_size(&self) -> f64 { self.lot_size }

    #[wasm_bindgen(getter)]
    pub fn margin_factor(&self) -> f64 { self.margin_factor }
}
```

```rust
// crates/tendies-core/src/types/candle.rs

#[wasm_bindgen]
#[derive(Clone, Copy, Debug)]
pub struct Candle {
    pub time: f64,
    pub open: f64,
    pub high: f64,
    pub low: f64,
    pub close: f64,
}

#[wasm_bindgen]
impl Candle {
    #[wasm_bindgen(constructor)]
    pub fn new(time: f64, open: f64, high: f64, low: f64, close: f64) -> Self {
        Self { time, open, high, low, close }
    }
}
```

```rust
// crates/tendies-core/src/types/price.rs

#[wasm_bindgen]
#[derive(Clone, Copy, Debug)]
pub enum Direction {
    Buy,
    Sell,
}

#[wasm_bindgen]
#[derive(Clone, Copy, Debug)]
pub enum ChartDataSource {
    Bid,
    Offer,
}
```

### Constants (from `src/lib/shared/constants/`)

```rust
// crates/tendies-core/src/types/constants.rs

// Trading constants
pub const MAX_LEVERAGE: u8 = 10;
pub const MIN_LEVERAGE: u8 = 1;
pub const DEFAULT_LEVERAGE: u8 = 1;

// Risk constants
pub const MAX_RISK_PERCENT: f64 = 0.02; // 2% max risk per trade
pub const DEFAULT_SLIPPAGE_TOLERANCE: f64 = 0.001; // 0.1%

// Expose to JS
use wasm_bindgen::prelude::*;

#[wasm_bindgen]
pub fn max_leverage() -> u8 { MAX_LEVERAGE }

#[wasm_bindgen]
pub fn default_slippage_tolerance() -> f64 { DEFAULT_SLIPPAGE_TOLERANCE }
```

### TradePlanner (from `src/lib/features/trade-execution/TradePlanner.ts`)

```rust
// crates/tendies-core/src/trade/planner.rs

use wasm_bindgen::prelude::*;
use crate::types::{Direction, InstrumentSpec};

#[wasm_bindgen]
#[derive(Clone, Debug)]
pub struct PlannedTrade {
    pub direction: Direction,
    pub size: f64,
    pub entry_price: f64,
    pub stop_level: f64,
    pub take_profit: f64,
    pub margin_required: f64,
    pub risk_amount: f64,
    pub reward_amount: f64,
    pub risk_reward_ratio: f64,
    pub leverage: u8,
}

#[wasm_bindgen]
#[derive(Clone, Debug)]
pub enum TradeError {
    InsufficientMargin,
    StopTooClose,
    ExceedsRiskLimit,
    InvalidSize,
    InvalidInstrument,
    EntryEqualsStop,
}

#[wasm_bindgen]
pub fn plan_trade(
    balance: f64,
    leverage: u8,
    direction: Direction,
    entry_price: f64,
    stop_price: f64,
    take_profit_price: f64,
    instrument: &InstrumentSpec,
    risk_percent: f64,
) -> Result<PlannedTrade, TradeError> {
    // Validate inputs
    if entry_price == stop_price {
        return Err(TradeError::EntryEqualsStop);
    }
    if leverage < 1 || leverage > 10 {
        return Err(TradeError::InvalidSize);
    }

    let stop_distance = (entry_price - stop_price).abs();
    let pip_value = instrument.pip_size();

    // Position sizing based on risk
    let risk_amount = balance * risk_percent;
    let size = risk_amount / (stop_distance / pip_value);

    // Clamp to instrument constraints
    let size = clamp_to_lot_size(size, instrument.lot_size(), instrument.min_size());
    if size < instrument.min_size() {
        return Err(TradeError::InvalidSize);
    }

    // Margin calculation
    let notional = size * entry_price;
    let margin_required = notional * instrument.margin_factor() / (leverage as f64);
    if margin_required > balance {
        return Err(TradeError::InsufficientMargin);
    }

    // Risk/reward
    let actual_risk = size * stop_distance;
    let reward_distance = (take_profit_price - entry_price).abs();
    let reward_amount = size * reward_distance;
    let rr_ratio = if actual_risk > 0.0 { reward_amount / actual_risk } else { 0.0 };

    Ok(PlannedTrade {
        direction,
        size,
        entry_price,
        stop_level: stop_price,
        take_profit: take_profit_price,
        margin_required,
        risk_amount: actual_risk,
        reward_amount,
        risk_reward_ratio: rr_ratio,
        leverage,
    })
}

fn clamp_to_lot_size(size: f64, lot_size: f64, min_size: f64) -> f64 {
    let lots = (size / lot_size).floor();
    let clamped = lots * lot_size;
    if clamped < min_size { min_size } else { clamped }
}
```

### RiskManager (from `src/lib/domains/trading/domain/RiskManager.ts`)

```rust
// crates/tendies-core/src/trade/risk.rs

use wasm_bindgen::prelude::*;
use crate::types::Direction;

#[wasm_bindgen]
pub struct RiskAssessment {
    pub is_acceptable: bool,
    pub risk_percent: f64,
    pub max_allowed_percent: f64,
    pub suggested_size: f64,
}

#[wasm_bindgen]
pub fn assess_risk(
    balance: f64,
    position_size: f64,
    entry_price: f64,
    stop_price: f64,
    max_risk_percent: f64,
) -> RiskAssessment {
    let risk_amount = position_size * (entry_price - stop_price).abs();
    let risk_percent = if balance > 0.0 { risk_amount / balance } else { 1.0 };
    let is_acceptable = risk_percent <= max_risk_percent;

    let suggested_size = if !is_acceptable {
        let max_risk = balance * max_risk_percent;
        let stop_distance = (entry_price - stop_price).abs();
        if stop_distance > 0.0 { max_risk / stop_distance } else { 0.0 }
    } else {
        position_size
    };

    RiskAssessment {
        is_acceptable,
        risk_percent,
        max_allowed_percent: max_risk_percent,
        suggested_size,
    }
}

#[wasm_bindgen]
pub fn calculate_risk_based_stop(
    entry_price: f64,
    direction: Direction,
    balance: f64,
    position_size: f64,
    risk_percent: f64,
) -> f64 {
    let max_loss = balance * risk_percent;
    let stop_distance = if position_size > 0.0 { max_loss / position_size } else { 0.0 };

    match direction {
        Direction::Buy => entry_price - stop_distance,
        Direction::Sell => entry_price + stop_distance,
    }
}
```

## Cargo.toml

```toml
# crates/tendies-core/Cargo.toml

[package]
name = "tendies-core"
version = "0.1.0"
edition = "2021"

[lib]
crate-type = ["cdylib", "rlib"]
# cdylib = WASM output for wasm-pack
# rlib = allows cargo test to work

[dependencies]
wasm-bindgen = "0.2"
serde = { version = "1", features = ["derive"] }
serde-wasm-bindgen = "0.6"

[dev-dependencies]
wasm-bindgen-test = "0.3"

[profile.release]
opt-level = "z"     # optimize for size
lto = true          # link-time optimization
codegen-units = 1   # better optimization, slower compile
strip = true        # strip debug symbols
```

## Svelte Integration

After `wasm-pack build`, import directly:

```typescript
// src/lib/bindings/trade.svelte.ts
import init, {
    plan_trade,
    assess_risk,
    calculate_risk_based_stop,
    Direction,
    type PlannedTrade,
    type RiskAssessment,
    type TradeError,
} from '$lib/wasm/tendies_core';

// Initialize WASM once at app boot
let initialized = false;
export async function initWasm() {
    if (!initialized) {
        await init();
        initialized = true;
    }
}

// Usage in components — same API surface, Rust behind it
export function planTrade(
    balance: number,
    leverage: number,
    direction: Direction,
    entry: number,
    stop: number,
    tp: number,
    instrument: InstrumentSpec,
    riskPercent: number,
): PlannedTrade {
    return plan_trade(balance, leverage, direction, entry, stop, tp, instrument, riskPercent);
}
```

## Migration Checklist

- [ ] Create `crates/tendies-core/` with `Cargo.toml`
- [ ] Port all types from `src/lib/shared/types/` to `src/types/`
- [ ] Port all constants from `src/lib/shared/constants/` to `src/types/constants.rs`
- [ ] Port `TradePlanner.ts` → `src/trade/planner.rs`
- [ ] Port `RiskManager.ts` → `src/trade/risk.rs`
- [ ] Port `TradeCalculator.ts` → `src/trade/calculator.rs`
- [ ] Write Rust unit tests for every calculation function
- [ ] Run `wasm-pack build --target web`
- [ ] Create `src/lib/bindings/trade.svelte.ts` wrapper
- [ ] Add WASM init to `AppEngine.boot()`
- [ ] Replace TS imports with WASM imports in components
- [ ] Delete original TS files after confirming parity
- [ ] Add `wasm:build` to `package.json` scripts

## Verification

After migration, the app should behave identically. The only observable difference:
- `plan_trade()` throws a Rust-defined `TradeError` enum instead of a JS exception
- Trade calculations are guaranteed exhaustive by the Rust compiler
- `.d.ts` files are auto-generated (no manual type maintenance)
