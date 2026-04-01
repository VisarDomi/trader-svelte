# Architecture Decisions

## Data Authority & Ownership

**Two ownership contexts for candle data**:

1. **Completed candles (past minutes)**: API is the absolute source of truth for all four fields (open, high, low, close). Any mismatch is immediately overwritten by API data. The 30th-second sync enforces this — if the timeline has stale or tick-built data from a resume gap, the API corrects it.

2. **Live candle (current minute)**: Four-field ownership split because the API snapshot is seconds stale while ticks are real-time:
   - **Close** — tick owns. Always. The latest tick price is more current than any API snapshot.
   - **Open** — API owns. The API saw the first trade of the minute; the tick stream may have connected mid-candle.
   - **High/Low** — intelligent merge, no single owner. `Math.max(tick.high, api.high)`, `Math.min(tick.low, api.low)`. Tick may have seen spikes the API missed, or vice versa.

**CandleAggregator implements the live candle rules**: `merge(frame)` applies API open, best-of high/low, and never touches close. This is the only place live candle ownership is enforced.

**CandleTimeline.merge is non-destructive**: Replaces overlapping bars with API data (full overwrite for completed candles) and extends if API has newer bars. Never trims — existing bars beyond the new data's range are preserved. This prevents the sync (which splits off the current bar) from deleting the last completed bar in the timeline.

**MarketStore mergeLatestHistory skips publishHistory if boundaries unchanged**: If the merge didn't extend the timeline and didn't trim anything, the chart already has the correct data — skip the publishHistory + setData cycle to save CPU. The merge still runs (API overwrites completed candles) but the chart isn't re-rendered needlessly.

**MarketStore mergeLatestHistory does not call recalcLiveState**: The live candle is maintained by the feed aggregator via updateLive(). Overwriting it with the last history candle causes the chart to briefly lose the current-minute bar, and series.update() re-adding it shifts the view right by one bar.

**AccountStore localStorage as source of truth**: AccountStore loads accounts from the API but enforces localStorage as the absolute source of truth for which account is active. Server session may not match our localStorage selection (e.g. after a fresh login created a default-account session) — we detect this mismatch and call switchAccount to fix it.

**MarketStore backing arrays are never aliased to reactive state**: `_bidHistory`/`_askHistory` are private mutable arrays. `publishHistory()` always creates a new array via spread when assigning to `history` ($state.raw). This prevents the aliased-mutation bug where in-place `.push()` on the backing array is invisible to Svelte's reference-equality tracking. High-frequency ticks only update `lastCandle` via `publishLiveCandle()` — no history snapshot needed. Candle completion (once/minute) is the only tick-path that calls `publishHistory()`.

**ChartRenderer uses historyVersion, not array heuristics**: The chart tracks `renderedVersion` against `marketStore.historyVersion` to decide when to call `setData()`. No epic comparison, no `hasInitializedView` flag, no `lastFirstTime` — just version mismatch = render.

**ChartStateManager owns staleness check**: This class owns the saved state, so it owns the staleness check. If the last data at save time is >24h old, the view is stale — discard it rather than restoring a misleading viewport.

**LiveEdgePlugin is a sensor, not an actor**: It detects new data and notifies the Camera. It does NOT manipulate the chart directly. The Camera owns the viewport.

**PositionPoller injects initialBalance**: Business logic injects the initial balance into each position because the API doesn't provide it. This relies on accountStore being up to date.

## iOS PWA Workarounds

**Chart history prepend scroll correction**: LWC resets the view to Index 0 when data is prepended via setData(). MarketStore stamps each prepend with its `historyVersion` in a private Map (`_prependAtVersion`). ChartRenderer calls `consumePrependCount(version)` — a plain method, not a $state read — to atomically retrieve and delete the count for that specific version. This avoids $state read-after-write in the effect (Svelte 5 pitfall #6), eliminates the race where unrelated `publishHistory()` calls could clobber a shared `pendingPrependCount`, and ensures each prepend count is consumed exactly once by the version that produced it.

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

**Prepend observability chain**: Three log events form a complete audit trail for back-history scroll correction: (1) `prepend-stamp` — store logs the version-to-count binding when created, (2) `chart-render` — effect logs that it consumed the prepend count for a given version, (3) `prepend-apply` — effect logs the viewport logical range before/after `maintainScrollPosition`. A canary `log.warn` fires if candle count grows by >100 with no prepend found — the signature of a regression where the count was lost or consumed by the wrong version.

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

## Rotation / Resize View Preservation

**ChartUI owns physical dimensions, Camera owns logical viewport**: ChartUI tracks `lastWidth`/`lastHeight` as plain fields (not $state) and provides `onBeforeResize`/`onAfterResize` callbacks. Camera's `captureViewport()`/`applyResize()` handle the logical viewport transition. No cross-ownership.

**ChartUI tracks previous dimensions as plain fields**: The resize `$effect` fires because `viewportService.width`/`height` $state already changed. Reading viewport in `onBeforeResize` returns the new value, not old. ChartUI tracks `lastWidth`/`lastHeight` as plain fields updated at the end of each resize cycle, passed as old dimensions to `onBeforeResize`.

**barSpacing is set once at init, never on resize**: `ChartUI.initBarSpacing()` sets `barSpacing` on chart creation. `updateTimeScaleOptions()` only updates `minimumHeight` on resize (legitimately changes between landscape/portrait). barSpacing is the user's zoom state — overwriting it on resize destroys the view.

**chart.resize() is asynchronous**: LWC's `chart.resize()` does not reflow synchronously. The logical range and `timeScale().width()` remain stale until LWC's deferred reflow (~50ms later). Any corrections must account for this — barSpacing set via `applyOptions` before the reflow will be respected by the deferred reflow.

**LWC priceScale.getVisibleRange() lies after resize**: The API returns stale values that don't match what's rendered on screen. `series.coordinateToPrice()` returns pixel-truth but operates in a different coordinate system (full chartElement height including time scale) than `setVisibleRange` (price area only). Mixing the two compounds errors on every rotation.

**Price capture and restore must use the same coordinate system**: Capture with `priceScale.getVisibleRange()` (API), restore with `priceScale.setVisibleRange()` (API). The API is internally consistent — lies cancel out in the round-trip. Never mix `coordinateToPrice` (pixel truth) with `setVisibleRange` (API truth) — different coordinate systems cause compounding drift.

**Price range scales by height ratio to preserve bar aspect ratio**: `newSpan = oldSpan × (newPriceAreaH / oldPriceAreaH)`, centered on the same midpoint. Price area height = `chartElement().clientHeight - timeScale().height()`. This keeps price-per-pixel constant — bars maintain their visual height. Landscape chops top/bottom of the price range, portrait extends it.

**barSpacing preservation keeps bar width constant**: Camera captures `timeScale().options().barSpacing` before resize and restores it via `applyOptions` after `chart.resize()`. LWC's deferred reflow respects this value and adjusts the visible logical range to fit — more bars visible in landscape, fewer in portrait. The right edge stays pinned, the left edge extends/contracts.
