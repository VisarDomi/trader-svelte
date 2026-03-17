# TDD Workflow: business.md → Tests → Rewrite

## Prerequisites

**Do NOT start the rewrite or write any tests until business.md is complete.**

business.md is the single source of truth. Everything — test specs, test code, implementation — derives from it. Starting without it means the LLM will invent requirements or reverse-engineer them from existing code, which defeats the purpose.

Write business.md yourself, from your domain knowledge and experience running Tendies. The LLM should not write it — it doesn't know what burned you in production, which edge cases cost money, or which behaviors are intentional vs accidental.

## The Hierarchy

Strict, one-directional. Each layer derives from the one above.

```
1. business.md           — YOU write this. Product rules with IDs.
2. tests/*.md            — LLM derives from business.md. Structured specs.
3. .test.rs / .test.ts   — LLM generates from tests/*.md. Executable tests.
4. Implementation         — LLM writes to make tests pass. Separate session.
```

A test only changes if a business rule changes. Implementation only changes if a test changes.

## Step 0: Write business.md

**Owner: You. Not the LLM.**

### Format

Follow the manga-reader pattern. Each rule has:
- A unique ID (AA, AB, AC...)
- A clear statement of what the system MUST do
- Edge cases described inline
- No implementation details (no class names, no file paths, no function signatures)

### What to cover

```
AA-AF:  Trade Planning       (sizing, rounding, margin, leverage, risk)
AG-AL:  Market Data          (candle aggregation, ticks, history, data source)
AM-AT:  Trade Execution      (preconditions, slippage, confirmation, errors)
AU-BA:  App Lifecycle        (boot, sleep/wake, connectivity, logout)
BB-BF:  Position Management  (P&L, polling, single-position mode)
BG-BK:  Account Management   (switching, demo/live, session, tokens)
```

### How to write good rules

Each "MUST" or "MUST NOT" becomes a test. Be precise about numbers, thresholds, and boundaries.

**Vague (bad):**
```markdown
## AA. Position Sizing
Position size should be based on risk.
```

**Precise (good):**
```markdown
## AA. Position Sizing
Position size = (balance × risk_percent) / (stop_distance_pips × pip_value).
Size MUST be rounded DOWN to the nearest lot_size. If rounded size < instrument
min_size, the trade is rejected — never round UP to meet minimum. Risk amount
= size × stop_distance, not balance × risk_percent (the actual risk may be
lower than requested due to rounding).
```

### Capture what you know from running the app

Things the LLM can't know:
- Which broker API quirks affect behavior (e.g., session tokens expire after X minutes)
- Which iOS PWA edge cases you've hit (deep sleep, viewport hacks)
- Which trading scenarios caused wrong P&L or missed trades
- Which state transitions actually happen in practice vs theory
- Timing constraints (how fast ticks arrive, how long history loads take)

These go in business.md as explicit rules with IDs.

## Step 1: Derive tests/*.md from business.md

**Owner: LLM, reviewed by you.**

Give the LLM business.md and ask it to produce structured test specs. The LLM is good at enumerating scenarios from prose rules — including edge cases you might not list explicitly.

### Format

```markdown
# Trade Planning Tests (derived from AA-AF)

## AA. Position Sizing

### AA-1: Basic position sizing
- Given: balance=10000, risk=2%, entry=7500, stop=7450, pip_size=1.0, lot_size=1.0
- Expected: size=4.0, risk_amount=200.0

### AA-2: Size rounds down to lot size
- Given: calculated_size=3.7, lot_size=1.0
- Expected: size=3.0 (not 4.0)

### AA-3: Size below minimum is rejected
- Given: calculated_size=0.3, min_size=0.5
- Expected: error=InvalidSize

### AA-4: Zero stop distance is rejected
- Given: entry=7500, stop=7500
- Expected: error=EntryEqualsStop

### AA-5: Risk amount reflects actual size, not requested risk
- Given: balance=10000, risk=2% (→200), but size rounds from 4.0 to 3.0
- Expected: risk_amount=150.0 (3.0 × 50), not 200.0
```

### Rules for test specs

- Each spec references a business rule ID (AA-1, AM-3, etc.)
- Specs describe **inputs and expected outputs**, not implementation
- No class names, function names, or file paths
- No "should call X" or "should import Y" — only observable behavior
- Each spec is independently verifiable

### Your review

Before generating test code, review tests/*.md:
- Are there scenarios missing that you've hit in practice?
- Are the expected values correct?
- Do the edge cases match your domain knowledge?

Add or remove specs. This is the last chance before tests become code.

## Step 2: Generate Test Code

**Owner: LLM, in a session that CANNOT see the existing codebase.**

### Split: Rust tests vs JS tests

Every test spec maps to either Rust or JS based on what it tests:

| Tests for... | Language | File location |
|---|---|---|
| Trade calculations | Rust | `crates/tendies-core/tests/trade_planning.rs` |
| State machine transitions | Rust | `crates/tendies-core/tests/market_state.rs` |
| Engine lifecycle | Rust | `crates/tendies-core/tests/engine.rs` |
| Validation guards | Rust | `crates/tendies-core/tests/execution.rs` |
| P&L calculation | Rust | `crates/tendies-core/tests/position.rs` |
| Binding mirrors state correctly | TypeScript | `src/lib/bindings/__tests__/market.test.ts` |
| Chart callback fires on effect | TypeScript | `src/lib/bindings/__tests__/market.test.ts` |
| WASM init + boot sequence | TypeScript | `src/lib/bindings/__tests__/engine.test.ts` |

### Test naming convention

Tests are named by their spec ID:

```rust
/// AA-1: Basic position sizing
#[test]
fn aa1_basic_position_sizing() { ... }

/// AM-2: App not ready rejects execution
#[test]
fn am2_app_not_ready_rejects() { ... }
```

```typescript
// AG-1: Tick mirrors to reactive state
test('ag1_tick_mirrors_bid_ask', () => { ... });
```

### The anti-cheat constraint

The test-writing session must NOT have access to:
- The current `src/lib/` implementation
- Any existing store, service, or component code
- The `resources/01-*.md` through `resources/09-*.md` files (implementation plans)

It should only see:
- `business.md`
- `tests/*.md`
- The Rust/WASM API surface (struct names, function signatures — just enough to write test calls)

This prevents the LLM from writing tests that confirm existing behavior instead of testing intended behavior.

### All tests must fail

After generating test code, run:

```bash
cd crates/tendies-core && cargo test    # all fail (no implementation)
npx vitest run                           # all fail (no bindings)
```

If any test passes, something is wrong — either the test is trivial or it's testing the wrong thing.

## Step 3: Implement to Make Tests Pass

**Owner: LLM, in a NEW session. Can see tests but should not modify them.**

### Instruction to LLM

```
Here are the failing tests. Implement the minimum code to make them pass.
Do NOT modify any test file. If a test seems wrong, tell me — don't change it.
The tests are the spec.
```

### Implementation order (matches migration phases)

```
Phase 1: types/ + trade/       → trade planning tests pass
Phase 2: market/ + position/   → state machine tests pass
         + account/
Phase 3: engine/               → lifecycle tests pass
Phase 4: trade/executor.rs     → validation guard tests pass
Phase 5: src/lib/bindings/     → binding tests pass
```

Each phase ends with `cargo test` (or `vitest`) showing that phase's tests green, previous phases still green, later phases still red.

### When a test seems wrong

If the implementation reveals that a test spec is incorrect:
1. Stop implementing
2. Go back to business.md — is the rule wrong or the test?
3. If the rule is wrong, update business.md first, then tests/*.md, then .test.rs
4. If the test misinterprets the rule, update tests/*.md, then .test.rs
5. Never fix a test just to make the implementation easier

## Step 4: Wire the Svelte Shell

**No spec-driven tests here.** The shell is:
- Chart rendering (visual, tested manually)
- Gesture handling (experiential, tested on device)
- iOS PWA quirks (device-specific, tested on device)
- WebSocket connection (tested by running the app)
- lightweight-charts bindings (tested by looking at the chart)

The shell imports bindings, not stores. It converts browser events to Rust commands and applies effects to the chart or DOM. It contains no business logic.

## File Structure After TDD

```
trader-svelte/
├── business.md                              # YOU wrote this
├── tests/
│   ├── trade-planning.md                    # derived from AA-AF
│   ├── market-data.md                       # derived from AG-AL
│   ├── trade-execution.md                   # derived from AM-AT
│   ├── app-lifecycle.md                     # derived from AU-BA
│   ├── position-management.md               # derived from BB-BF
│   └── account-management.md                # derived from BG-BK
├── crates/
│   └── tendies-core/
│       ├── src/                             # implementation (makes tests pass)
│       │   ├── trade/
│       │   ├── market/
│       │   ├── position/
│       │   ├── account/
│       │   ├── engine/
│       │   └── types/
│       └── tests/                           # generated from tests/*.md
│           ├── trade_planning.rs
│           ├── market_state.rs
│           ├── execution.rs
│           ├── engine.rs
│           └── position.rs
├── src/
│   └── lib/
│       ├── wasm/                            # wasm-pack output
│       ├── bindings/
│       │   ├── __tests__/                   # generated from tests/*.md
│       │   │   ├── market.test.ts
│       │   │   ├── position.test.ts
│       │   │   ├── account.test.ts
│       │   │   └── engine.test.ts
│       │   ├── market.svelte.ts
│       │   ├── position.svelte.ts
│       │   ├── account.svelte.ts
│       │   ├── trade.svelte.ts
│       │   └── engine.svelte.ts
│       ├── services/                        # IO adapters (no tests needed)
│       ├── components/                      # UI (manual testing)
│       └── features/                        # chart orchestration (manual)
└── resources/                               # migration docs (reference only)
```

## CLAUDE.md Update

After business.md exists, update the project's CLAUDE.md to enforce the hierarchy:

```markdown
## Spec Hierarchy

1. `business.md` (source of truth — only Visar edits this)
2. `tests/*.md` (contracts derived from business.md)
3. `crates/tendies-core/tests/*.rs` + `src/lib/bindings/__tests__/*.test.ts`
4. Implementation code

A test only changes if a business rule changes.
Never modify a test to make implementation easier.
```

## Checklist

- [ ] **Write business.md** (you, not the LLM)
- [ ] Review and iterate business.md until every rule is precise
- [ ] LLM derives tests/*.md from business.md
- [ ] You review tests/*.md — add missing scenarios, fix wrong ones
- [ ] LLM generates .test.rs and .test.ts from tests/*.md (separate session, no codebase access)
- [ ] Verify all tests fail
- [ ] Phase 1: implement types + trade logic → trade tests pass
- [ ] Phase 2: implement state machines → dispatch tests pass
- [ ] Phase 3: implement engine → lifecycle tests pass
- [ ] Phase 4: implement validation guards → execution tests pass
- [ ] Phase 5: implement bindings → binding tests pass
- [ ] Wire Svelte shell, manual testing on iOS
- [ ] Update CLAUDE.md with spec hierarchy
