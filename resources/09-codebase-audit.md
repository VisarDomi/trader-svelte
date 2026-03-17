# Codebase Audit: Current Code Classification

Every file in `src/lib/` classified by how coupled it is to the browser/Svelte runtime. This determines what moves to Rust and what stays in JS.

## Tier 1: PURE LOGIC — Moves to Rust

Zero browser APIs, zero Svelte APIs. Can run anywhere.

| File | Rust module | Notes |
|---|---|---|
| `shared/types/*.ts` | `types/` | All interfaces → Rust structs/enums |
| `shared/constants/*.ts` | `types/constants.rs` | All constants → `pub const` |
| `features/trade-execution/TradePlanner.ts` | `trade/planner.rs` | Pure calculation |
| `domains/trading/domain/RiskManager.ts` | `trade/risk.rs` | Pure calculation |
| `domains/trading/domain/TradeCalculator.ts` | `trade/calculator.rs` | Pure calculation |
| `core/events/EventBus.ts` | **stays in JS** | Pure, but connects IO to state |
| `core/events/globalBus.ts` | **stays in JS** | Singleton of EventBus |

### Command Types (Pure Data — move to Rust)

| File | Rust module | Notes |
|---|---|---|
| `domains/market/stores/MarketCommands.ts` | `market/commands.rs` | Tagged union → Rust enum |
| `domains/trading/stores/PositionCommands.ts` | `position/commands.rs` | Tagged union → Rust enum |
| `domains/trading/stores/AccountCommands.ts` | `account/commands.rs` | Tagged union → Rust enum |

## Tier 2: BROWSER I/O — Stays in JS

Uses `fetch`, `localStorage`, `WebSocket`, `AbortController` but no Svelte reactivity.

| File | Stays in JS | Notes |
|---|---|---|
| `core/services/SessionManager.ts` | Yes | `localStorage` read/write |
| `core/api/ApiClient.ts` | Yes | `fetch` + auth headers |
| `domains/trading/services/TradeApiService.ts` | Yes | `fetch` wrapper |
| `domains/trading/services/AccountApiService.ts` | Yes | `fetch` wrapper |
| `domains/trading/services/PositionPoller.ts` | Yes | `setInterval` + `fetch` |
| `domains/market/services/MarketFeed.ts` | Yes | WebSocket connection |
| `shared/utils/*.ts` | Case by case | Math utils → Rust, DOM utils → JS |

**These become thin adapters**: receive data from browser API → convert to Rust-compatible format → call binding method.

## Tier 3: SVELTE STORES — Dispatch Logic Moves to Rust

Uses `$state`, `$derived`. The dispatch/switch logic moves to Rust, the reactive `$state` wrapper stays as a binding.

| File | What moves to Rust | What stays in JS |
|---|---|---|
| `domains/market/stores/MarketStore.svelte.ts` | `dispatch()` logic, OHLC calculation, state fields | `$state` mirror (MarketBinding) |
| `domains/trading/stores/TradeStore.svelte.ts` | `dispatch()` logic, trade state machine | `$state` mirror (TradeBinding) |
| `domains/trading/stores/PositionStore.svelte.ts` | `dispatch()` logic, P&L calculation | `$state` mirror (PositionBinding) |
| `domains/trading/stores/AccountStore.svelte.ts` | `dispatch()` logic, account switching | `$state` mirror (AccountBinding) |
| `domains/auth/stores/AuthStore.svelte.ts` | Credential validation logic | `$state` mirror + `localStorage` |
| `core/stores/BaseStore.svelte.ts` | N/A | Deleted (each binding is independent) |

## Tier 4: SVELTE + BROWSER — Stays in JS

Uses both Svelte reactivity AND browser APIs.

| File | Stays in JS | Notes |
|---|---|---|
| `core/services/ViewportService.svelte.ts` | Yes | `window.innerWidth`, `$state` |
| `core/services/NotificationService.svelte.ts` | Yes | Toast UI state |
| `core/services/ApiService.svelte.ts` | Yes | API client factory |
| `domains/market/services/MarketDataPump.ts` | Yes | WebSocket + store coordination |
| `domains/trading/services/RiskService.svelte.ts` | Partially | Risk calc → Rust, service lifecycle → JS |

## Tier 5: LIFECYCLE + ORCHESTRATION — State Machine Moves to Rust

| File | What moves to Rust | What stays in JS |
|---|---|---|
| `core/engine/AppEngine.svelte.ts` | State machine (phase transitions) | Browser event adapters, WASM init |
| `core/engine/ConnectionMonitor.svelte.ts` | None | Stays as `BrowserEventAdapter` |
| `core/engine/SystemController.ts` | None | Becomes part of EngineBinding effect handler |

## Tier 6: UI COMPONENTS — Stay in JS

All `.svelte` files stay in Svelte. They import bindings instead of stores.

| File | Change |
|---|---|
| `components/chart-engine/ChartController.ts` | Registers callback with MarketBinding |
| `components/chart-engine/ChartEvents.ts` | Stays, converts chart clicks to commands |
| `components/chart-engine/ChartResizer.ts` | Stays (DOM) |
| `components/chart-engine/ChartCamera.ts` | Stays (chart API) |
| `components/ui/HydrationGate.svelte` | Stays |
| `components/ui/ToastContainer.svelte` | Stays |
| All route components (`+page.svelte`) | Import bindings instead of stores |

## Tier 7: CHART FEATURES — Stay in JS

All chart drawing, orchestration, and HUD components stay in JS. They interact with Rust through the MarketBinding callback.

| File | Change |
|---|---|
| `features/chart-orchestration/ChartLogic.svelte.ts` | Uses bindings instead of stores |
| `features/chart-orchestration/ChartLoader.ts` | Calls `marketBinding.loadHistory()` |
| `features/chart-drawings/*.ts` | Stay (lightweight-charts plugin API) |
| `features/chart-hud/*.svelte` | Read from bindings via `$derived` |
| `features/trade-execution/TradePopup.svelte` | Calls `validate_execution()` on confirm |

## Migration Impact Summary

| Category | Files affected | Moves to Rust | Stays in JS | Deleted |
|---|---|---|---|---|
| Types & constants | ~10 | 10 | 0 | 10 (TS originals) |
| Pure logic | 3 | 3 | 0 | 3 |
| Command types | 3 | 3 | 0 | 3 |
| Store dispatch | 5 | 5 (logic only) | 5 (as bindings) | 5 (original stores) |
| Engine state machine | 1 | 1 | 1 (adapter) | 1 |
| Browser services | 7 | 0 | 7 | 0 |
| UI components | ~19 | 0 | 19 | 0 |
| Chart features | ~10 | 0 | 10 | 0 |
| Event system | 2 | 0 | 2 | 0 |
| **Total** | **~60** | **22** | **44** | **22** |

## File Count After Migration

```
New Rust files:     ~15 (in crates/tendies-core/src/)
New binding files:  ~5  (in src/lib/bindings/)
New adapter files:  ~2  (BrowserEventAdapter, EventWiring)
Deleted TS files:   ~22 (replaced by Rust + bindings)
Unchanged files:    ~38 (UI, chart, services)
```

## Lines of Code Estimate

| Layer | Before (TS) | After (Rust) | After (TS binding) |
|---|---|---|---|
| Types + constants | ~500 | ~400 | 0 (auto-generated .d.ts) |
| Business logic | ~400 | ~500 | ~50 (thin wrappers) |
| Store dispatch | ~800 | ~600 | ~200 (bindings) |
| Engine | ~230 | ~200 | ~80 (adapter) |
| **Subtotal moved** | **~1,930** | **~1,700** | **~330** |
| Services, UI, chart | ~9,000 | — | ~8,500 (minor import changes) |
| **Total** | **~11,000** | **~1,700** | **~8,830** |

Net: ~11,000 LOC → ~10,530 LOC (1,700 Rust + 8,830 TS). Slightly fewer total lines, but the critical 1,700 lines are now compiler-verified.
