# Continue Session — Target Buttons + State Fixes

## What's implemented
- `TargetButtons.svelte` + `LeverageBar.svelte` wired into chart page
- `TargetExecutor.ts` with two-phase target order flow (Phase 1: open max size, Phase 2: set SL/TP)
- Optimistic balance updates on trade confirmation (AccountStore deducts margin on open, adds PnL on close)
- Removed aggressive 5×1s poll loop, replaced with single 2s delayed refresh
- `serverLog` with `timingMs` on TradePlan for performance measurement
- Added `seq` to trade-plan logs to trace individual plan→execute pairs

## What's broken / needs investigation
**Stale size on execute**: Logs show `plan()` calculates correct size (e.g. 0.928) but `execute()` sends a different stale size (e.g. 0.958 from previous trade). Needs debugging.

**Added diagnostic logging**: `execute()` now logs an `execute-read` event right before reading `this.plannedTrade` — so you can see exactly what size was captured at execute time vs what was planned.

## How to test
1. Open `https://192.168.1.197:23456` on iPhone (local network, self-signed cert)
2. Do rapid open/close cycles
3. Check journalctl for `execute-read` events to trace stale state

## How to watch logs
```bash
journalctl --user -u trader-svelte.service -f | grep "\[Frontend\]"
```

## Key files
- `src/lib/domains/trading/stores/TradeStore.svelte.ts` — plan/execute logic with $derived
- `src/lib/domains/trading/stores/AccountStore.svelte.ts` — optimistic balance updates
- `src/lib/features/target-buttons/TargetButtons.svelte` — target button UI
- `src/lib/features/target-buttons/TargetExecutor.ts` — two-phase order flow
- `src/lib/features/target-buttons/LeverageBar.svelte` — leverage switcher
- `goal.md` — overall goal tracking

## Not pushed
Latest changes (diagnostic logging on execute) are NOT committed or pushed.
Run `npm run restart` after any source change (wired to `systemctl --user restart trader-svelte.service`).

## Investigate
- Vite HMR: when is a full restart needed vs HMR sufficient? (for `.svelte`, `.ts` in `$lib/`, new routes, config changes)
- Why does `execute()` sometimes get a different `plannedTrade` than what `plan()` logged
