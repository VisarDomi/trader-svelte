# Architecture Decisions

## Data Authority & Ownership

**CandleAggregator merge strategy**: API open is authoritative (first trade of the minute). High/low take the best of both sources (tick may have seen extremes API hasn't reported yet, or vice versa). Close is untouched — the latest tick is always more current than the API snapshot.

**MarketStore mergeLatestHistory skip**: Completed candles don't change — tick-built local data is authoritative. If server data doesn't extend beyond what we already have, skip entirely. This prevents unnecessary series.setData() calls that cause chart flicker.

**MarketStore mergeLatestHistory does not call recalcLiveState**: The live candle is maintained by the feed aggregator via updateLive(). Overwriting it with the last history candle causes the chart to briefly lose the current-minute bar, and series.update() re-adding it shifts the view right by one bar.

**AccountStore localStorage as source of truth**: AccountStore loads accounts from the API but enforces localStorage as the absolute source of truth for which account is active. Server session may not match our localStorage selection (e.g. after a fresh login created a default-account session) — we detect this mismatch and call switchAccount to fix it.

**MarketStore backing arrays are never aliased to reactive state**: `_bidHistory`/`_askHistory` are private mutable arrays. `publishHistory()` always creates a new array via spread when assigning to `history` ($state.raw). This prevents the aliased-mutation bug where in-place `.push()` on the backing array is invisible to Svelte's reference-equality tracking. High-frequency ticks only update `lastCandle` via `publishLiveCandle()` — no history snapshot needed. Candle completion (once/minute) is the only tick-path that calls `publishHistory()`.

**ChartRenderer uses historyVersion, not array heuristics**: The chart tracks `renderedVersion` against `marketStore.historyVersion` to decide when to call `setData()`. No epic comparison, no `hasInitializedView` flag, no `lastFirstTime` — just version mismatch = render.

**ChartStateManager owns staleness check**: This class owns the saved state, so it owns the staleness check. If the last data at save time is >24h old, the view is stale — discard it rather than restoring a misleading viewport.

**LiveEdgePlugin is a sensor, not an actor**: It detects new data and notifies the Camera. It does NOT manipulate the chart directly. The Camera owns the viewport.

**PositionPoller injects initialBalance**: Business logic injects the initial balance into each position because the API doesn't provide it. This relies on accountStore being up to date.

## iOS PWA Workarounds

**Chart history prepend scroll correction**: LWC resets the view to Index 0 when data is prepended via setData(). MarketStore tracks `pendingPrependCount` and ChartRenderer calls `camera.maintainScrollPosition()` in the same effect that calls setData() — both happen in one Svelte effect tick, so the viewport shift is atomic from the user's perspective.

**TOP_LABEL_OFFSET is 50px**: Increased from 20 to provide iOS safe area inset for the chart HUD.

**ChartController crosshair guard**: LWC attaches mousemove/pointermove listeners to the document, not just its canvas. iOS fires synthetic mouse events from overlay touches that reach those document-level listeners. Instead of fighting DOM events, we let LWC process them but immediately clear the crosshair result when overlays are active.

**ChartHud and TradePopup crosshair blocking**: Block crosshair + chart pointer-events while position is closing or trade popup is open. When close completes, the position section unmounts — iOS fires synthetic events at that point. TradePopup leaves chart pointer-events enabled so the user can tap elsewhere on the chart to re-plan at a different price.

**AppEngine background sentinel**: iOS PWA visibilitychange often doesn't fire on screen unlock. The sentinel interval timer gets frozen by iOS when JS is suspended. When iOS resumes JS, the interval fires with a large time delta — the most reliable wake signal. Only acts if page is actually visible (screen unlocked) and status is still BACKGROUND.

**ConnectionMonitor backup signals**: pageshow and focus events are backup signals for iOS PWA when visibilitychange doesn't fire on screen unlock.

**Service worker no-op fetch handler**: The fetch listener must exist for iOS 18 PWA installability, but not calling respondWith() lets the browser handle requests natively. Calling respondWith(fetch()) would break ES module caching and cause triple module evaluation.

## State Machine & Resume

**AppEngine Exit/Enter pattern**: Hibernate only on EXIT from READY, wakeUp only on ENTER to READY. This prevents double-starts or double-stops when transitioning between non-READY states.

**AppEngine single resume entry point**: All signals (visibility, focus, pageshow, sentinel, online) funnel through handleResume(). Re-entrancy guard prevents concurrent recovery from rapid-fire signals.

**AppEngine no eager data fetches on resume**: MarketDataPump's first-tick-after-reconnect handles position + history sync. Session validation is the only blocking call.

**AuthStore validates both modes**: validateSession validates BOTH Real and Demo modes so that loadAll() doesn't fail with stale tokens for the non-active mode.

## Logging

**No log.info — all server logging goes through typed serverLog events**: `log.info` was removed. If something is worth logging to the server, it must have a typed `LogEntry` variant in the discriminated union. `log.warn` and `log.error` remain for boundary failures that can't be predicted at design time. `history-publish` and `chart-render` events are throttled to only fire on initial load, first sync, or significant candle count changes.

**LogBuffer ownership model**: buffer[] holds entries waiting to be sent. inFlight[] holds entries currently in a fetch() call (temporarily transferred). On fetch success, inFlight is dropped. On fetch failure, inFlight is reclaimed back into buffer. On page hide, getAllPending() (inFlight + buffer) is persisted to sessionStorage and beacon-flushed — no entry is ever unowned.

**LogBuffer queueMicrotask on visibilitychange:hidden**: Ensures logs pushed by other visibilitychange handlers (AppEngine, ConnectionMonitor) are captured before the persist + beacon flush runs.

**LogBuffer coalesced persist**: Multiple push() calls within the same microtask result in a single sessionStorage write, avoiding thrash during rapid-fire logging (7 entries in 1 second during resume).

## Trading Logic

**AccountStore optimistic update**: Immediate local balance update ensures TradePlanner sees correct funds instantly after a trade closes. Assumes single-position mode: floating PnL is reset to 0, available = deposit.

**RiskService waitForBrokerPosition**: Polls the broker until the dealId appears in the positions list. Prevents 404s when the broker hasn't persisted the position yet. Uses exponential backoff: 100, 200, 400, 800, 1600, 3200ms (~6.3s total).

**TradePlanner stop loss safety**: Stop loss must result in loss strictly <= 50% of balance.

**TradingDomain click direction**: Click ABOVE offer = Buy (expecting price to go up from offer). Click BELOW bid = Sell (expecting price to go down from bid). Click between bid and offer = ambiguous, ignored for safety.

**CurrentPrice two modes**: Default (no position) = native crosshair line ON, custom line OFF. Active trading = native line OFF, custom PnL-colored line ON.

## API & Architecture

**MarketRepository date format**: API requires YYYY-MM-DDTHH:mm:ss with no milliseconds and no 'Z' suffix.

**MarketRepository request pattern**: We send 'to' and 'max' (not 'from'). The server counts backwards 'max' rows from 'to'.

**AccountApiService uses raw fetch**: getPreferences and updatePreferences hit the Node proxy backend, not Capital directly. They use raw fetch instead of ApiClient.

**Environment variables use dynamic/public**: Uses SvelteKit's PUBLIC_ prefix to avoid build-time hardcoding.

**calcPriceLine is a pure function**: Replaces a class implementation to reduce object allocation in the hot render loop.

**ChartCamera passive follow**: If strict tracking is active, force the reset layout position. If NOT tracking, check if the live candle is visible. If visible, shift the view forward by the time delta to keep it in view. This makes the chart appear to "flow" without snapping the user's zoom or offset.
