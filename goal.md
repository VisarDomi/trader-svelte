# Goal: Optimistic State Updates on Trade Confirmation + Reduced Polling

## Intent
Fix the app's state management so that trade confirmations immediately update local state (balance, position) instead of waiting for the poller. Then reduce poller frequency since it's no longer the primary state source.

## Why
During rapid open/close cycles, the account balance and position state are stale until the next poll (2-3s lag). This causes:
- Size calculation based on old balance → RC_NOT_ENOUGH_MARGIN rejections
- Position state flickering (hasPos=True/False alternating) during transitions
- Unnecessary polling traffic every 2s

## The fix
When TradeExecutor gets a confirmation from Capital.com:
1. **Immediately** update account balance: subtract marginRequired on open, add back margin + PnL on close
2. **Immediately** set/clear the active position from the confirmation data
3. Keep the poller but at much lower frequency (once per 10-15s) as background reconciliation only

## Implementation
1. Trace the confirmation flow: TradeExecutor.execute() → TradeStore.execute() → gets confirmation
2. Make TradeExecutor/TradeStore update AccountStore.balance immediately from the confirmation
3. Make TradeStore immediately set PositionStore.activePosition from the confirmation (already partially done via bus.emit(EVENTS.TRADE_EXECUTED))
4. For closes: PositionStore.close() already has the confirmation + PnL — update balance there too
5. Reduce PositionPoller interval and log when reconciliation detects a mismatch

## Done when
- Opening a trade instantly updates the displayed balance without waiting for poll
- Closing a trade instantly shows the new balance with PnL applied
- Consecutive open→close→open works without margin rejections
- Poller runs at lower frequency for background reconciliation only

## Tried and failed
- (to be logged)
