# Phase 3: AppEngine Lifecycle State Machine

## Goal

Encode the app lifecycle (BOOTING → AUTH_CHECK → LOADING → READY → SLEEPING) in Rust so that invalid transitions are compile errors. JS handles browser events (visibility, connectivity, deep sleep sentinel) and feeds them as commands to the Rust state machine.

## Current Problem

In TypeScript, nothing prevents:
- Calling `boot()` when already READY
- Calling `handleResume()` when in BOOTING state
- Dispatching `TRADE_EXECUTED` while the app is SLEEPING
- Checking session validity while the WebSocket is disconnecting

These are bugs that only surface under specific timing conditions (iOS background/foreground, network flaps). They're hard to reproduce and hard to test.

## Rust State Machine

```rust
// crates/tendies-core/src/engine/state.rs

use wasm_bindgen::prelude::*;

/// Every possible state the app can be in.
/// Fields on each variant represent data ONLY available in that state.
#[wasm_bindgen]
pub struct EngineState {
    phase: EnginePhase,
    has_session: bool,
    has_account: bool,
    is_online: bool,
    is_visible: bool,
}

#[wasm_bindgen]
#[derive(Clone, Copy, Debug, PartialEq)]
pub enum EnginePhase {
    /// App just started, nothing initialized
    Booting,
    /// Checking if stored session is still valid
    AuthCheck,
    /// Session valid, loading accounts and market data
    Loading,
    /// Fully operational
    Ready,
    /// App is backgrounded / screen locked (iOS PWA)
    Sleeping,
    /// Recoverable error state
    Error,
    /// No session, must log in
    LoginRequired,
}

/// Commands are the ONLY way to change state.
/// They represent events from the outside world.
#[wasm_bindgen]
#[derive(Clone, Copy, Debug)]
pub enum EngineCommand {
    /// App boot initiated
    Boot,
    /// Stored session was found and validated
    SessionValid,
    /// No stored session or session expired
    SessionInvalid,
    /// Accounts and market data loaded successfully
    DataLoaded,
    /// Data loading failed
    DataLoadFailed,
    /// User logged in successfully
    LoginSuccess,
    /// App went to background (visibilitychange / iOS suspend)
    AppBackgrounded,
    /// App came to foreground
    AppForegrounded,
    /// Deep sleep detected (iOS sentinel timer gap > 3s)
    DeepSleepDetected,
    /// Network went offline
    ConnectionLost,
    /// Network came back online
    ConnectionRestored,
    /// User explicitly logged out
    Logout,
}

/// Effects tell JS what to do. The Rust machine decides WHAT happens,
/// JS decides HOW (because it has access to browser APIs).
#[wasm_bindgen]
#[derive(Clone, Copy, Debug, PartialEq)]
pub enum EngineEffect {
    /// Validate stored session tokens
    ValidateSession,
    /// Load accounts and market data
    LoadData,
    /// Start all services (poller, market feed, risk)
    StartServices,
    /// Stop all services gracefully
    StopServices,
    /// Navigate to login screen
    ShowLogin,
    /// Navigate to main chart screen
    ShowChart,
    /// Re-validate session after sleep/reconnect
    RevalidateSession,
    /// Clear all stored tokens
    ClearSession,
    /// No action needed (transition was valid but no side effect)
    None,
    /// Log a warning — invalid transition attempted
    InvalidTransition,
}

#[wasm_bindgen]
impl EngineState {
    #[wasm_bindgen(constructor)]
    pub fn new() -> Self {
        Self {
            phase: EnginePhase::Booting,
            has_session: false,
            has_account: false,
            is_online: true,
            is_visible: true,
        }
    }

    pub fn phase(&self) -> EnginePhase {
        self.phase
    }

    pub fn is_ready(&self) -> bool {
        self.phase == EnginePhase::Ready
    }

    /// The core transition function.
    /// Takes a command, returns an effect.
    /// EVERY valid transition is explicitly listed.
    /// Missing transitions return InvalidTransition.
    pub fn dispatch(&mut self, cmd: EngineCommand) -> EngineEffect {
        use EnginePhase::*;
        use EngineCommand::*;
        use EngineEffect::*;

        match (self.phase, cmd) {
            // --- Boot sequence ---
            (Booting, Boot) => {
                self.phase = AuthCheck;
                ValidateSession
            }

            // --- Auth outcomes ---
            (AuthCheck, SessionValid) => {
                self.has_session = true;
                self.phase = Loading;
                LoadData
            }
            (AuthCheck, SessionInvalid) => {
                self.has_session = false;
                self.phase = LoginRequired;
                ShowLogin
            }

            // --- Loading outcomes ---
            (Loading, DataLoaded) => {
                self.has_account = true;
                self.phase = Ready;
                StartServices
            }
            (Loading, DataLoadFailed) => {
                self.phase = Error;
                StopServices
            }

            // --- Login ---
            (LoginRequired, LoginSuccess) => {
                self.has_session = true;
                self.phase = Loading;
                LoadData
            }

            // --- Background/foreground (only from Ready or Sleeping) ---
            (Ready, AppBackgrounded) | (Ready, DeepSleepDetected) => {
                self.phase = Sleeping;
                StopServices
            }
            (Sleeping, AppForegrounded) => {
                self.is_visible = true;
                self.phase = AuthCheck;
                RevalidateSession
            }
            (Sleeping, DeepSleepDetected) => {
                // Already sleeping, no-op
                None
            }

            // --- Connectivity (any active state) ---
            (Ready, ConnectionLost) => {
                self.is_online = false;
                StopServices
            }
            (Ready, ConnectionRestored) => {
                // Already online and ready, no-op
                None
            }
            (_, ConnectionLost) => {
                self.is_online = false;
                None // will retry when restored
            }
            (phase, ConnectionRestored) if phase != Ready => {
                self.is_online = true;
                // If we were sleeping and came back online, revalidate
                if phase == Sleeping {
                    self.phase = AuthCheck;
                    RevalidateSession
                } else {
                    None
                }
            }

            // --- Logout (from any state) ---
            (_, Logout) => {
                self.has_session = false;
                self.has_account = false;
                self.phase = LoginRequired;
                ClearSession
            }

            // --- Invalid transitions ---
            _ => InvalidTransition,
        }
    }
}
```

## Svelte Binding

```typescript
// src/lib/bindings/engine.svelte.ts
import {
    EngineState,
    EngineCommand,
    EngineEffect,
    EnginePhase,
} from '$lib/wasm/tendies_core';
import { bus } from '$lib/core/events/globalBus';

class EngineBinding {
    private core = new EngineState();

    // Reactive state for UI
    phase = $state<EnginePhase>(EnginePhase.Booting);
    isReady = $state(false);

    /** Dispatch a command and execute the resulting effect */
    dispatch(cmd: EngineCommand): EngineEffect {
        const effect = this.core.dispatch(cmd);
        this.phase = this.core.phase();
        this.isReady = this.core.is_ready();
        this.executeEffect(effect);
        return effect;
    }

    private executeEffect(effect: EngineEffect) {
        switch (effect) {
            case EngineEffect.ValidateSession:
            case EngineEffect.RevalidateSession:
                // JS handles the actual HTTP call
                this.validateSession();
                break;
            case EngineEffect.LoadData:
                this.loadData();
                break;
            case EngineEffect.StartServices:
                bus.emit('START_SERVICES');
                break;
            case EngineEffect.StopServices:
                bus.emit('STOP_SERVICES');
                break;
            case EngineEffect.ShowLogin:
                // SvelteKit navigation
                goto('/login');
                break;
            case EngineEffect.ShowChart:
                goto('/chart');
                break;
            case EngineEffect.ClearSession:
                sessionManager.clear();
                goto('/login');
                break;
            case EngineEffect.InvalidTransition:
                console.warn('Invalid engine transition attempted');
                break;
            case EngineEffect.None:
                break;
        }
    }

    private async validateSession() {
        try {
            const valid = await authService.validate();
            this.dispatch(valid ? EngineCommand.SessionValid : EngineCommand.SessionInvalid);
        } catch {
            this.dispatch(EngineCommand.SessionInvalid);
        }
    }

    private async loadData() {
        try {
            await accountService.loadAll();
            this.dispatch(EngineCommand.DataLoaded);
        } catch {
            this.dispatch(EngineCommand.DataLoadFailed);
        }
    }
}

export const engineBinding = new EngineBinding();
```

## Browser Event Adapters (stay in JS)

```typescript
// src/lib/services/BrowserEventAdapter.ts
// These convert browser events to Rust commands. Nothing else.

export function setupBrowserAdapters(engine: EngineBinding) {
    // Visibility change
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') {
            engine.dispatch(EngineCommand.AppBackgrounded);
        } else {
            engine.dispatch(EngineCommand.AppForegrounded);
        }
    });

    // Connectivity
    window.addEventListener('online', () => {
        engine.dispatch(EngineCommand.ConnectionRestored);
    });
    window.addEventListener('offline', () => {
        engine.dispatch(EngineCommand.ConnectionLost);
    });

    // iOS deep sleep sentinel (the timer trick stays in JS)
    let lastTick = Date.now();
    setInterval(() => {
        const now = Date.now();
        const delta = now - lastTick;
        lastTick = now;
        if (delta > 3000 && document.visibilityState === 'visible') {
            engine.dispatch(EngineCommand.DeepSleepDetected);
        }
    }, 1000);
}
```

## What This Prevents

| Bug scenario | TypeScript | Rust |
|---|---|---|
| `boot()` called twice | Silent re-execution | `InvalidTransition` effect |
| Trade dispatched while sleeping | Silently queued, stale data | Caller must check `is_ready()` |
| Resume without revalidation | Possible stale session | Forced through `AuthCheck` phase |
| Disconnect during loading | Undefined behavior | Explicit `ConnectionLost` handling |
| Deep sleep + reconnect race | Hard to test timing | Deterministic: test every (phase, cmd) pair |

## Rust Tests

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn boot_sequence() {
        let mut engine = EngineState::new();
        assert_eq!(engine.phase(), EnginePhase::Booting);

        let effect = engine.dispatch(EngineCommand::Boot);
        assert_eq!(effect, EngineEffect::ValidateSession);
        assert_eq!(engine.phase(), EnginePhase::AuthCheck);

        let effect = engine.dispatch(EngineCommand::SessionValid);
        assert_eq!(effect, EngineEffect::LoadData);
        assert_eq!(engine.phase(), EnginePhase::Loading);

        let effect = engine.dispatch(EngineCommand::DataLoaded);
        assert_eq!(effect, EngineEffect::StartServices);
        assert_eq!(engine.phase(), EnginePhase::Ready);
    }

    #[test]
    fn cannot_boot_twice() {
        let mut engine = EngineState::new();
        engine.dispatch(EngineCommand::Boot);
        engine.dispatch(EngineCommand::SessionValid);
        engine.dispatch(EngineCommand::DataLoaded);
        // Now in Ready state — Boot should be invalid
        let effect = engine.dispatch(EngineCommand::Boot);
        assert_eq!(effect, EngineEffect::InvalidTransition);
    }

    #[test]
    fn sleep_wake_revalidates() {
        let mut engine = ready_engine();

        engine.dispatch(EngineCommand::AppBackgrounded);
        assert_eq!(engine.phase(), EnginePhase::Sleeping);

        let effect = engine.dispatch(EngineCommand::AppForegrounded);
        assert_eq!(effect, EngineEffect::RevalidateSession);
        assert_eq!(engine.phase(), EnginePhase::AuthCheck);
    }

    #[test]
    fn deep_sleep_while_sleeping_is_noop() {
        let mut engine = ready_engine();
        engine.dispatch(EngineCommand::DeepSleepDetected);
        assert_eq!(engine.phase(), EnginePhase::Sleeping);

        let effect = engine.dispatch(EngineCommand::DeepSleepDetected);
        assert_eq!(effect, EngineEffect::None);
        assert_eq!(engine.phase(), EnginePhase::Sleeping);
    }

    #[test]
    fn logout_from_any_state() {
        for &phase in &[EnginePhase::Ready, EnginePhase::Loading, EnginePhase::Sleeping] {
            let mut engine = engine_in_phase(phase);
            let effect = engine.dispatch(EngineCommand::Logout);
            assert_eq!(effect, EngineEffect::ClearSession);
            assert_eq!(engine.phase(), EnginePhase::LoginRequired);
        }
    }

    // Helper to get a Ready engine
    fn ready_engine() -> EngineState {
        let mut e = EngineState::new();
        e.dispatch(EngineCommand::Boot);
        e.dispatch(EngineCommand::SessionValid);
        e.dispatch(EngineCommand::DataLoaded);
        e
    }
}
```

## Migration Checklist

- [ ] Port `AppEngine.svelte.ts` status enum → `EnginePhase` in Rust
- [ ] Define all `EngineCommand` variants from current event handlers
- [ ] Define all `EngineEffect` variants from current side effects
- [ ] Implement `dispatch()` with exhaustive `match`
- [ ] Write tests for every valid transition
- [ ] Write tests for every invalid transition
- [ ] Create `src/lib/bindings/engine.svelte.ts`
- [ ] Create `src/lib/services/BrowserEventAdapter.ts`
- [ ] Move `ConnectionMonitor` logic into `BrowserEventAdapter`
- [ ] Move `SystemController.wakeUp/hibernate` into effect handlers
- [ ] Delete `AppEngine.svelte.ts`, `ConnectionMonitor.svelte.ts`, `SystemController.ts`
- [ ] Test iOS deep sleep → foreground → revalidation flow on device
