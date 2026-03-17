# Tendies Rust/WASM Migration — Overview

## Vision

Extract all business logic, state machines, and command dispatch from TypeScript into a Rust crate compiled to WASM. Svelte becomes a thin reactive shell that mirrors Rust state into `$state` and forwards browser events as Rust commands.

## Architecture

```
trader-svelte/
├── crates/
│   └── tendies-core/              # Rust → WASM
│       ├── src/
│       │   ├── lib.rs             # wasm_bindgen entry, init()
│       │   ├── trade/             # TradePlanner, RiskManager, TradeCalculator
│       │   │   ├── mod.rs
│       │   │   ├── planner.rs
│       │   │   ├── risk.rs
│       │   │   ├── calculator.rs
│       │   │   └── executor.rs    # validation guards, typestate
│       │   ├── market/            # MarketState, command dispatch, candle aggregation
│       │   │   ├── mod.rs
│       │   │   ├── state.rs
│       │   │   ├── commands.rs
│       │   │   └── candle.rs
│       │   ├── position/          # PositionState, P&L calculations
│       │   │   ├── mod.rs
│       │   │   ├── state.rs
│       │   │   └── commands.rs
│       │   ├── account/           # AccountState, switching logic
│       │   │   ├── mod.rs
│       │   │   ├── state.rs
│       │   │   └── commands.rs
│       │   ├── engine/            # AppState machine (lifecycle transitions)
│       │   │   ├── mod.rs
│       │   │   ├── state.rs
│       │   │   └── commands.rs
│       │   └── types/             # All shared types, enums, constants
│       │       ├── mod.rs
│       │       ├── instrument.rs
│       │       ├── candle.rs
│       │       ├── price.rs
│       │       └── constants.rs
│       ├── tests/                 # Rust unit + integration tests
│       │   ├── trade_tests.rs
│       │   ├── market_tests.rs
│       │   ├── engine_tests.rs
│       │   └── integration.rs
│       ├── Cargo.toml
│       └── pkg/                   # wasm-pack output (auto-generated .d.ts + .wasm)
├── src/
│   └── lib/
│       ├── wasm/                  # Symlink or copy of crates/tendies-core/pkg/
│       ├── bindings/              # Thin Svelte ↔ WASM bridge
│       │   ├── market.svelte.ts   # Mirrors Rust MarketState → $state
│       │   ├── trade.svelte.ts    # Mirrors Rust TradeState → $state
│       │   ├── position.svelte.ts
│       │   ├── account.svelte.ts
│       │   └── engine.svelte.ts
│       ├── services/              # IO stays JS (fetch, WebSocket, localStorage)
│       ├── components/            # UI stays Svelte (chart, overlays, gestures)
│       └── features/              # Chart orchestration stays JS
```

## Core Principle: Command → Dispatch → Effect

Every state change flows through Rust:

```
Browser Event (JS)
    → Command (typed enum)
        → Rust dispatch(cmd) → new state + Effect enum
            → JS applies Effect to $state and/or chart
```

Nothing in JS decides state transitions. JS only:
1. Converts browser events to commands
2. Passes commands to Rust
3. Reads effects and mirrors them into Svelte reactivity or chart updates

## What Stays in JS Forever

| Layer                    | Reason                                              |
|--------------------------|-----------------------------------------------------|
| lightweight-charts       | JS library, no Rust equivalent                      |
| Chart drawings           | DOM/canvas manipulation                             |
| WebSocket connection     | Browser API — produces commands for Rust             |
| fetch calls              | Browser API — passes response data to Rust           |
| iOS quirks               | window/document access (sentinel timer, viewport)    |
| Svelte components        | UI rendering                                        |
| Service Worker           | Browser API                                         |
| Gesture/touch handling   | Touch events → commands                             |
| localStorage             | Browser API — SessionManager reads/writes tokens     |

## Migration Phases

| Phase | Scope                              | Effort    | Doc                              |
|-------|-------------------------------------|-----------|----------------------------------|
| 1     | Types + pure business logic         | 1 week    | `01-phase1-types-and-logic.md`   |
| 2     | Command dispatch (all stores)       | 2-3 weeks | `02-phase2-state-machines.md`    |
| 3     | AppEngine lifecycle state machine   | 1 week    | `03-phase3-app-engine.md`        |
| 4     | Validation guards + typestate       | 1 week    | `04-phase4-validation-guards.md` |

## Documents Index

- `00-overview.md` — this file
- `01-phase1-types-and-logic.md` — extracting pure types and business logic
- `02-phase2-state-machines.md` — command dispatch and store migration
- `03-phase3-app-engine.md` — AppEngine lifecycle in Rust
- `04-phase4-validation-guards.md` — typestate pattern for trade execution safety
- `05-wasm-data-transfer.md` — zero-copy strategies for candle data and ticks
- `06-build-integration.md` — wasm-pack, Vite config, dev workflow
- `07-testing-strategy.md` — what to test where (cargo vs vitest)
- `08-svelte-bindings-pattern.md` — the thin bridge between Rust state and Svelte $state
- `09-codebase-audit.md` — current code classified by tier (pure → browser-coupled)
