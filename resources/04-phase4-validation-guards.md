# Phase 4: Validation Guards & Typestate Pattern

## Goal

Make it impossible to execute a trade without passing all precondition checks. Use Rust's type system so that `submit_order()` can only be called with a validated `ExecutionReady` token — a token that JS cannot construct, only Rust can produce.

## The Problem

In the current TypeScript code, the trade execution flow has implicit preconditions:

```typescript
// Nothing prevents calling this with stale data, no connection, or wrong app state
async execute(client, plannedTrade, instrument) {
    // Manual checks that can be forgotten or bypassed:
    if (!client.isConnected()) throw new Error('...');
    if (!plannedTrade) throw new Error('...');
    // ... submit order
}
```

A developer can:
- Call `execute()` before planning is complete
- Call `execute()` while the app is sleeping
- Call `execute()` with stale price data
- Call `execute()` with a disconnected WebSocket
- Forget to check any of the above

## The Typestate Solution

```rust
// crates/tendies-core/src/trade/executor.rs

use wasm_bindgen::prelude::*;
use crate::engine::EnginePhase;
use crate::market::MarketState;
use crate::trade::planner::PlannedTrade;
use crate::types::InstrumentSpec;

/// A validated execution token. JS cannot construct this —
/// it can only be obtained by calling validate_execution().
#[wasm_bindgen]
pub struct ExecutionReady {
    direction_str: String,  // "BUY" or "SELL"
    epic: String,
    size: f64,
    entry_price: f64,
    stop_level: f64,
    limit_level: f64,
    validated_at_price: f64,
    // Private fields — JS can read but not set
}

#[wasm_bindgen]
impl ExecutionReady {
    // Only getters — no constructor, no setters
    pub fn epic(&self) -> String { self.epic.clone() }
    pub fn direction_str(&self) -> String { self.direction_str.clone() }
    pub fn size(&self) -> f64 { self.size }
    pub fn stop_level(&self) -> f64 { self.stop_level }
    pub fn limit_level(&self) -> f64 { self.limit_level }
    pub fn validated_at_price(&self) -> f64 { self.validated_at_price }
}

/// Every reason execution can be rejected.
/// Exhaustive — no "catch-all" error.
#[wasm_bindgen]
#[derive(Debug)]
pub enum ExecutionError {
    /// App is not in Ready state
    AppNotReady,
    /// No trade has been planned
    NoPlannedTrade,
    /// No live price data available
    NoPriceData,
    /// Price moved beyond slippage tolerance since plan was created
    PriceDrifted,
    /// Instrument data is missing or stale
    NoInstrument,
    /// Account balance insufficient (re-check at execution time)
    InsufficientBalance,
    /// Position already open (single-position mode)
    PositionAlreadyOpen,
}

/// Validate all preconditions. Returns ExecutionReady on success.
/// This is the ONLY way to get an ExecutionReady token.
#[wasm_bindgen]
pub fn validate_execution(
    engine_phase: EnginePhase,
    has_position: bool,
    planned_trade_json: &str,
    current_bid: f64,
    current_ask: f64,
    available_balance: f64,
    slippage_tolerance: f64,
) -> Result<ExecutionReady, ExecutionError> {
    // 1. App must be Ready
    if engine_phase != EnginePhase::Ready {
        return Err(ExecutionError::AppNotReady);
    }

    // 2. Must not have an open position (single-position mode)
    if has_position {
        return Err(ExecutionError::PositionAlreadyOpen);
    }

    // 3. Parse planned trade
    let trade: PlannedTrade = serde_json::from_str(planned_trade_json)
        .map_err(|_| ExecutionError::NoPlannedTrade)?;

    // 4. Must have live price
    if current_bid <= 0.0 || current_ask <= 0.0 {
        return Err(ExecutionError::NoPriceData);
    }

    // 5. Check price drift (slippage)
    let current_price = match trade.direction {
        Direction::Buy => current_ask,   // buy at ask
        Direction::Sell => current_bid,  // sell at bid
    };
    let drift = (current_price - trade.entry_price).abs() / trade.entry_price;
    if drift > slippage_tolerance {
        return Err(ExecutionError::PriceDrifted);
    }

    // 6. Re-check balance at execution time
    if trade.margin_required > available_balance {
        return Err(ExecutionError::InsufficientBalance);
    }

    // All checks passed — produce the token
    Ok(ExecutionReady {
        direction_str: match trade.direction {
            Direction::Buy => "BUY".to_string(),
            Direction::Sell => "SELL".to_string(),
        },
        epic: trade.epic.clone(),
        size: trade.size,
        entry_price: trade.entry_price,
        stop_level: trade.stop_level,
        limit_level: trade.take_profit,
        validated_at_price: current_price,
    })
}
```

## JS Side: Using the Token

```typescript
// src/lib/bindings/trade-execution.svelte.ts
import {
    validate_execution,
    ExecutionReady,
    ExecutionError,
    EnginePhase,
} from '$lib/wasm/tendies_core';

export async function executeTrade(
    enginePhase: EnginePhase,
    hasPosition: boolean,
    plannedTradeJson: string,
    currentBid: number,
    currentAsk: number,
    availableBalance: number,
    slippageTolerance: number,
    apiClient: ApiClient,
): Promise<{ success: boolean; error?: string }> {
    // Step 1: Validate in Rust — get token or error
    let ready: ExecutionReady;
    try {
        ready = validate_execution(
            enginePhase,
            hasPosition,
            plannedTradeJson,
            currentBid,
            currentAsk,
            availableBalance,
            slippageTolerance,
        );
    } catch (e) {
        // Rust error — mapped to ExecutionError enum
        return { success: false, error: mapExecutionError(e) };
    }

    // Step 2: Submit order using validated data from the token
    // JS can only read the token's fields — it can't forge one
    try {
        const response = await apiClient.post('/positions/otc', {
            direction: ready.direction_str(),
            epic: ready.epic(),
            size: ready.size(),
            stopLevel: ready.stop_level(),
            limitLevel: ready.limit_level(),
            orderType: 'MARKET',
            currencyCode: 'GBP',
        });
        return { success: true };
    } catch (e) {
        return { success: false, error: 'Order submission failed' };
    }
}

function mapExecutionError(error: ExecutionError): string {
    // Map Rust enum variants to user-facing messages
    const messages: Record<string, string> = {
        'AppNotReady': 'App is not connected. Please wait.',
        'NoPlannedTrade': 'No trade planned. Tap the chart to set entry.',
        'NoPriceData': 'No live price. Check connection.',
        'PriceDrifted': 'Price moved too far. Review and re-plan.',
        'NoInstrument': 'Instrument data unavailable.',
        'InsufficientBalance': 'Insufficient margin. Reduce size or leverage.',
        'PositionAlreadyOpen': 'Close existing position first.',
    };
    return messages[error] ?? 'Unknown error';
}
```

## Extended Typestate: Multi-Step Confirmation Flow

For a trade confirmation popup that requires user interaction:

```rust
// Optional: encode the confirmation flow in types

/// Step 1: User plans a trade → PlannedTrade
/// Step 2: User opens confirmation popup → ConfirmationPending
/// Step 3: User confirms → validate_execution() → ExecutionReady
/// Step 4: Submit order

/// ConfirmationPending proves the user SAW the trade details
#[wasm_bindgen]
pub struct ConfirmationPending {
    trade: PlannedTrade,
    shown_at_price: f64,
    shown_at_ms: f64,
}

#[wasm_bindgen]
pub fn show_confirmation(
    trade_json: &str,
    current_price: f64,
    timestamp_ms: f64,
) -> Result<ConfirmationPending, ExecutionError> {
    let trade: PlannedTrade = serde_json::from_str(trade_json)
        .map_err(|_| ExecutionError::NoPlannedTrade)?;

    Ok(ConfirmationPending {
        trade,
        shown_at_price: current_price,
        shown_at_ms: timestamp_ms,
    })
}

/// Convert ConfirmationPending → ExecutionReady if still valid
#[wasm_bindgen]
pub fn confirm_execution(
    pending: ConfirmationPending,
    engine_phase: EnginePhase,
    has_position: bool,
    current_bid: f64,
    current_ask: f64,
    available_balance: f64,
    slippage_tolerance: f64,
    max_confirmation_age_ms: f64,
    now_ms: f64,
) -> Result<ExecutionReady, ExecutionError> {
    // Check confirmation isn't stale (user left popup open too long)
    let age = now_ms - pending.shown_at_ms;
    if age > max_confirmation_age_ms {
        return Err(ExecutionError::PriceDrifted); // Treat as stale
    }

    // Delegate to standard validation
    validate_execution(
        engine_phase,
        has_position,
        &serde_json::to_string(&pending.trade).unwrap(),
        current_bid,
        current_ask,
        available_balance,
        slippage_tolerance,
    )
}
```

## What This Prevents

| Scenario | Without typestate | With typestate |
|---|---|---|
| Submit without validation | Runtime error (maybe) | Compile error — no `ExecutionReady` |
| Forge validation result | `{ valid: true }` in JS | Can't construct `ExecutionReady` from JS |
| Skip slippage check | Forget the if-statement | Built into `validate_execution()` |
| Submit while sleeping | Race condition | `AppNotReady` error from `engine_phase` check |
| Stale confirmation popup | User doesn't notice | `max_confirmation_age_ms` enforced |

## Migration Checklist

- [ ] Create `ExecutionReady` struct (no public constructor)
- [ ] Create `ExecutionError` enum (all failure modes)
- [ ] Implement `validate_execution()` with all precondition checks
- [ ] Optionally implement `ConfirmationPending` flow
- [ ] Write Rust tests for every `ExecutionError` variant
- [ ] Write Rust tests proving `ExecutionReady` can only come from validation
- [ ] Create `src/lib/bindings/trade-execution.svelte.ts`
- [ ] Wire trade confirmation popup to call `validate_execution()` on confirm
- [ ] Wire submit button to use `ExecutionReady` token for API call
- [ ] Delete `TradeExecutor.ts` validation logic
- [ ] Test: disconnect WiFi → tap confirm → expect `AppNotReady`
- [ ] Test: wait 30s on confirmation → expect `PriceDrifted`
