# Continue Session — MARGIN_BUFFER_RATIO calibration

## What's been done
- Reverted target-buttons UI + optimistic balance updates (commit `c93318e`)
- Kept logging improvements: tick logging, timingMs, seq, execute-read diagnostics
- Identified root cause of stale-size bug: `plannedTrade` is `$derived` from `accountStore.balance`, so it re-derives between plan() and execute() when balance changes from previous close's applyOptimistic(pnl)

## Margin Factor Investigation — BROKEN the API rate limit
We need to find the exact `MARGIN_BUFFER_RATIO` (currently 0.98) by testing what ratio Capital.com actually rejects.

**What went wrong (DO NOT REPEAT):**
- Automated scripts made hundreds of POST /positions calls without pacing → consumed the 1000 req/hour demo rate limit → HTTP 429 on all subsequent calls
- TopUp calls were also wasted (100/day/account limit)
- Rate will reset ~24h from now (or check if the sliding window has freed up)

**Test script ready:** `/tmp/opencode/test-ratio.mjs`
Usage: `node /tmp/opencode/test-ratio.mjs <ratio> [BUY|SELL]`
It logs in, gets market + balance, calculates size, opens, confirms via GET /confirms, and closes if accepted. One shot per run.

**How to test (manually, one at a time):**
1. Wait for rate limit to reset
2. Test 0.98 BUY → confirm accept/reject
3. Test 0.99 BUY → compare
4. Test 1.00 BUY → find boundary
5. Zoom finer: 0.981, 0.982, ... around the boundary
6. Repeat for SELL

**Key empirical finding so far:** The first automated sweep (before rate limit) showed Capital.com accepted positions at 102% of full margin. This suggests the broker's margin check is not our `size * lotSize * price / leverage` formula. The exact threshold still needs manual determination.

## Key files
- `/tmp/opencode/test-ratio.mjs` — reusable one-shot ratio tester
- `src/lib/shared/constants/trading.ts` — MARGIN_BUFFER_RATIO = 0.98
- `src/lib/features/trade-execution/TradePlanner.ts` — `calculatePositionSize()` uses MARGIN_BUFFER_RATIO
- `decisions.md` — see "Margin Buffer Factor Investigation" section for details
