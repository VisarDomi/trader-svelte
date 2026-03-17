# Testing Strategy: Rust Tests + JS Tests

## Principle

Test logic in Rust (`cargo test`), test UI/IO in JS (vitest/playwright). The WASM boundary is the test boundary.

## What to Test in Rust

Everything that moved to `tendies-core`:

### 1. Trade Calculations (Unit Tests)

```rust
#[cfg(test)]
mod trade_tests {
    use super::*;

    #[test]
    fn plan_trade_basic_buy() {
        let instrument = InstrumentSpec::new(
            "IX.D.FTSE.DAILY.IP".into(),
            0.5, 1.0, 0.05, "GBP".into(), 1.0,
        );

        let result = plan_trade(
            10_000.0,   // balance
            1,          // leverage
            Direction::Buy,
            7500.0,     // entry
            7450.0,     // stop (50 points away)
            7600.0,     // TP (100 points away)
            &instrument,
            0.02,       // 2% risk
        );

        let trade = result.unwrap();
        assert!(trade.size > 0.0);
        assert!(trade.margin_required <= 10_000.0);
        assert!(trade.risk_reward_ratio >= 1.9); // ~2:1
    }

    #[test]
    fn plan_trade_insufficient_margin() {
        let instrument = InstrumentSpec::new(
            "IX.D.FTSE.DAILY.IP".into(),
            0.5, 1.0, 0.5, "GBP".into(), 1.0,
        );

        let result = plan_trade(
            100.0,      // tiny balance
            1,
            Direction::Buy,
            7500.0,
            7490.0,
            7600.0,
            &instrument,
            0.5,        // 50% risk (triggers large size, exceeds margin)
        );

        assert!(matches!(result, Err(TradeError::InsufficientMargin)));
    }

    #[test]
    fn plan_trade_entry_equals_stop_rejected() {
        let instrument = InstrumentSpec::new(
            "TEST".into(), 0.5, 1.0, 0.05, "GBP".into(), 1.0,
        );

        let result = plan_trade(
            10_000.0, 1, Direction::Buy,
            7500.0, 7500.0, 7600.0, // entry == stop
            &instrument, 0.02,
        );

        assert!(matches!(result, Err(TradeError::EntryEqualsStop)));
    }

    #[test]
    fn risk_assessment_exceeds_limit() {
        let assessment = assess_risk(
            10_000.0,   // balance
            10.0,       // position size
            7500.0,     // entry
            7200.0,     // stop 300 points away
            0.02,       // 2% max risk
        );

        assert!(!assessment.is_acceptable);
        assert!(assessment.risk_percent > 0.02);
        assert!(assessment.suggested_size < 10.0);
    }
}
```

### 2. State Machine Transitions (Unit Tests)

```rust
#[cfg(test)]
mod market_tests {
    use super::*;

    #[test]
    fn tick_creates_first_candle() {
        let mut state = MarketState::new(60.0); // 1-minute candles
        let effect = state.update_tick(100.0, 100.5, 1000.0);

        assert!(matches!(effect, MarketEffect::PriceUpdated));
        assert_eq!(state.current_bid(), Some(100.0));
        assert_eq!(state.current_ask(), Some(100.5));
    }

    #[test]
    fn tick_closes_candle_at_interval() {
        let mut state = MarketState::new(60.0);

        // First tick at t=0
        state.update_tick(100.0, 100.5, 0.0);

        // Tick within same candle
        state.update_tick(101.0, 101.5, 30.0);

        // Tick at next interval — should close candle
        let effect = state.update_tick(102.0, 102.5, 60.0);
        assert!(matches!(effect, MarketEffect::CandleClosed));

        // Verify closed candle is in history
        assert_eq!(state.bid_history_len(), 1);
    }

    #[test]
    fn tick_updates_ohlc_correctly() {
        let mut state = MarketState::new(60.0);

        state.update_tick(100.0, 100.5, 0.0);  // open
        state.update_tick(105.0, 105.5, 10.0); // new high
        state.update_tick(98.0, 98.5, 20.0);   // new low
        state.update_tick(102.0, 102.5, 30.0); // close (within candle)

        // Force candle close
        state.update_tick(103.0, 103.5, 60.0);

        // Verify OHLC
        assert_eq!(state.bid_candle_open(0), 100.0);
        assert_eq!(state.bid_candle_high(0), 105.0);
        assert_eq!(state.bid_candle_low(0), 98.0);
        assert_eq!(state.bid_candle_close(0), 102.0);
    }

    #[test]
    fn reset_clears_everything() {
        let mut state = MarketState::new(60.0);
        state.update_tick(100.0, 100.5, 0.0);
        state.push_bid_candle(1.0, 2.0, 3.0, 4.0, 5.0);

        let effect = state.reset(ChartDataSource::Bid);

        assert!(matches!(effect, MarketEffect::Cleared));
        assert_eq!(state.bid_history_len(), 0);
        assert_eq!(state.current_bid(), None);
    }

    #[test]
    fn spread_calculation() {
        let mut state = MarketState::new(60.0);
        state.update_tick(100.0, 100.8, 0.0);

        assert_eq!(state.spread(), Some(0.8));
    }
}
```

### 3. Engine Lifecycle (Exhaustive Tests)

```rust
#[cfg(test)]
mod engine_tests {
    use super::*;

    // Test EVERY valid transition
    #[test]
    fn full_boot_sequence() {
        let mut e = EngineState::new();
        assert_eq!(e.dispatch(EngineCommand::Boot), EngineEffect::ValidateSession);
        assert_eq!(e.dispatch(EngineCommand::SessionValid), EngineEffect::LoadData);
        assert_eq!(e.dispatch(EngineCommand::DataLoaded), EngineEffect::StartServices);
        assert_eq!(e.phase(), EnginePhase::Ready);
    }

    #[test]
    fn boot_with_no_session() {
        let mut e = EngineState::new();
        e.dispatch(EngineCommand::Boot);
        assert_eq!(e.dispatch(EngineCommand::SessionInvalid), EngineEffect::ShowLogin);
        assert_eq!(e.phase(), EnginePhase::LoginRequired);
    }

    #[test]
    fn login_then_load() {
        let mut e = EngineState::new();
        e.dispatch(EngineCommand::Boot);
        e.dispatch(EngineCommand::SessionInvalid);
        assert_eq!(e.dispatch(EngineCommand::LoginSuccess), EngineEffect::LoadData);
        assert_eq!(e.dispatch(EngineCommand::DataLoaded), EngineEffect::StartServices);
        assert_eq!(e.phase(), EnginePhase::Ready);
    }

    // Test EVERY invalid transition
    #[test]
    fn cannot_load_data_without_session() {
        let mut e = EngineState::new();
        assert_eq!(e.dispatch(EngineCommand::DataLoaded), EngineEffect::InvalidTransition);
    }

    #[test]
    fn cannot_boot_when_ready() {
        let mut e = ready_engine();
        assert_eq!(e.dispatch(EngineCommand::Boot), EngineEffect::InvalidTransition);
    }

    #[test]
    fn cannot_login_when_ready() {
        let mut e = ready_engine();
        assert_eq!(e.dispatch(EngineCommand::LoginSuccess), EngineEffect::InvalidTransition);
    }

    // Sleep/wake cycle tests
    #[test]
    fn sleep_wake_revalidates() {
        let mut e = ready_engine();
        e.dispatch(EngineCommand::AppBackgrounded);
        assert_eq!(e.phase(), EnginePhase::Sleeping);

        let effect = e.dispatch(EngineCommand::AppForegrounded);
        assert_eq!(effect, EngineEffect::RevalidateSession);
        assert_eq!(e.phase(), EnginePhase::AuthCheck);
    }

    #[test]
    fn deep_sleep_from_ready() {
        let mut e = ready_engine();
        let effect = e.dispatch(EngineCommand::DeepSleepDetected);
        assert_eq!(effect, EngineEffect::StopServices);
        assert_eq!(e.phase(), EnginePhase::Sleeping);
    }

    #[test]
    fn double_deep_sleep_is_noop() {
        let mut e = ready_engine();
        e.dispatch(EngineCommand::DeepSleepDetected);
        let effect = e.dispatch(EngineCommand::DeepSleepDetected);
        assert_eq!(effect, EngineEffect::None);
    }

    // Logout from any state
    #[test]
    fn logout_clears_everything() {
        for start in [EnginePhase::Ready, EnginePhase::Loading, EnginePhase::Sleeping] {
            let mut e = engine_in_phase(start);
            let effect = e.dispatch(EngineCommand::Logout);
            assert_eq!(effect, EngineEffect::ClearSession);
            assert_eq!(e.phase(), EnginePhase::LoginRequired);
        }
    }

    // Connectivity tests
    #[test]
    fn connection_lost_while_ready() {
        let mut e = ready_engine();
        let effect = e.dispatch(EngineCommand::ConnectionLost);
        assert_eq!(effect, EngineEffect::StopServices);
    }

    // Helpers
    fn ready_engine() -> EngineState {
        let mut e = EngineState::new();
        e.dispatch(EngineCommand::Boot);
        e.dispatch(EngineCommand::SessionValid);
        e.dispatch(EngineCommand::DataLoaded);
        e
    }

    fn engine_in_phase(phase: EnginePhase) -> EngineState {
        let mut e = EngineState::new();
        match phase {
            EnginePhase::Ready => {
                e.dispatch(EngineCommand::Boot);
                e.dispatch(EngineCommand::SessionValid);
                e.dispatch(EngineCommand::DataLoaded);
            }
            EnginePhase::Loading => {
                e.dispatch(EngineCommand::Boot);
                e.dispatch(EngineCommand::SessionValid);
            }
            EnginePhase::Sleeping => {
                e.dispatch(EngineCommand::Boot);
                e.dispatch(EngineCommand::SessionValid);
                e.dispatch(EngineCommand::DataLoaded);
                e.dispatch(EngineCommand::AppBackgrounded);
            }
            _ => {}
        }
        e
    }
}
```

### 4. Validation Guards (Unit Tests)

```rust
#[cfg(test)]
mod execution_tests {
    use super::*;

    fn valid_trade_json() -> String {
        serde_json::to_string(&PlannedTrade {
            direction: Direction::Buy,
            size: 1.0,
            entry_price: 7500.0,
            stop_level: 7450.0,
            take_profit: 7600.0,
            margin_required: 375.0,
            risk_amount: 50.0,
            reward_amount: 100.0,
            risk_reward_ratio: 2.0,
            leverage: 1,
            epic: "IX.D.FTSE.DAILY.IP".into(),
        }).unwrap()
    }

    #[test]
    fn valid_execution() {
        let result = validate_execution(
            EnginePhase::Ready,
            false,
            &valid_trade_json(),
            7499.0,     // bid
            7501.0,     // ask (close to entry)
            10_000.0,   // balance
            0.01,       // 1% slippage tolerance
        );
        assert!(result.is_ok());
    }

    #[test]
    fn rejects_when_not_ready() {
        let result = validate_execution(
            EnginePhase::Sleeping,
            false,
            &valid_trade_json(),
            7500.0, 7501.0, 10_000.0, 0.01,
        );
        assert!(matches!(result, Err(ExecutionError::AppNotReady)));
    }

    #[test]
    fn rejects_with_open_position() {
        let result = validate_execution(
            EnginePhase::Ready,
            true,       // has position
            &valid_trade_json(),
            7500.0, 7501.0, 10_000.0, 0.01,
        );
        assert!(matches!(result, Err(ExecutionError::PositionAlreadyOpen)));
    }

    #[test]
    fn rejects_price_drift() {
        let result = validate_execution(
            EnginePhase::Ready,
            false,
            &valid_trade_json(),
            7600.0, 7601.0,  // price drifted 100 points
            10_000.0, 0.001, // 0.1% tolerance
        );
        assert!(matches!(result, Err(ExecutionError::PriceDrifted)));
    }

    #[test]
    fn rejects_insufficient_balance() {
        let result = validate_execution(
            EnginePhase::Ready,
            false,
            &valid_trade_json(),
            7500.0, 7501.0,
            100.0,      // tiny balance, margin_required is 375
            0.01,
        );
        assert!(matches!(result, Err(ExecutionError::InsufficientBalance)));
    }
}
```

## What to Test in JS (vitest / playwright)

### Binding Layer Tests (vitest)

Test that the Svelte bindings correctly mirror Rust state:

```typescript
// src/lib/bindings/__tests__/market.test.ts
import { describe, it, expect, beforeAll } from 'vitest';
import { initWasm } from '$lib/wasm/init';
import { MarketBinding } from '$lib/bindings/market.svelte';

beforeAll(async () => {
    await initWasm();
});

describe('MarketBinding', () => {
    it('mirrors tick to reactive state', () => {
        const binding = new MarketBinding(60);
        binding.tick(100.0, 100.5, 0);

        expect(binding.currentBid).toBe(100.0);
        expect(binding.currentAsk).toBe(100.5);
        expect(binding.spread).toBeCloseTo(0.5);
    });

    it('calls chart callback on candle close', () => {
        const binding = new MarketBinding(60);
        let lastEffect = null;
        binding.setChartCallback((effect) => { lastEffect = effect; });

        binding.tick(100.0, 100.5, 0);   // first candle
        binding.tick(101.0, 101.5, 60);  // closes first candle

        expect(lastEffect).toBe('CandleClosed');
    });
});
```

### iOS PWA Tests (manual / playwright)

These test browser-specific behavior that Rust can't cover:

- [ ] Deep sleep detection (lock screen → unlock → app resumes)
- [ ] Safe area insets render correctly
- [ ] Touch gestures work (swipe, tap chart)
- [ ] Service worker installs correctly
- [ ] HTTPS certificate accepted
- [ ] Wake lock activates during chart view

### Chart Integration Tests (manual)

- [ ] Historical candles render correctly
- [ ] Live candle updates in real-time
- [ ] Infinite scroll loads more history
- [ ] Entry/stop/TP lines draw on tap
- [ ] Chart resizes on orientation change

## Running Tests

```bash
# Rust tests (fast, no browser, ~1s)
npm run test:rust

# Rust tests in watch mode
npm run test:rust:watch

# JS binding tests (requires WASM build)
npm run wasm:build:dev && npx vitest run

# All tests
npm run test:rust && npm run wasm:build:dev && npx vitest run
```

## CI Pipeline

```yaml
# .github/workflows/test.yml
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: dtolnay/rust-toolchain@stable
        with:
          targets: wasm32-unknown-unknown

      - uses: actions/setup-node@v4
        with:
          node-version: 22

      - name: Install wasm-pack
        run: cargo install wasm-pack

      - name: Rust tests
        run: cd crates/tendies-core && cargo test

      - name: Build WASM
        run: npm run wasm:build

      - name: Install JS deps
        run: npm ci

      - name: JS tests
        run: npx vitest run

      - name: Type check
        run: npm run check

      - name: Production build
        run: npm run build
```

## Test Coverage Split

| Layer | Test tool | What it covers | Speed |
|---|---|---|---|
| Trade calculations | `cargo test` | Math correctness, edge cases | <1s |
| State machines | `cargo test` | Every transition, every invalid state | <1s |
| Validation guards | `cargo test` | Every rejection reason | <1s |
| Candle aggregation | `cargo test` | OHLC logic, interval boundaries | <1s |
| Svelte bindings | `vitest` | Reactive state mirrors Rust | ~3s |
| Chart rendering | manual | Visual correctness | manual |
| iOS PWA | manual | Device-specific behavior | manual |
