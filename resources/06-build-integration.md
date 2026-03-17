# Build Integration: wasm-pack + Vite + SvelteKit

## Prerequisites

```bash
# Install Rust (if not already)
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# Add WASM target
rustup target add wasm32-unknown-unknown

# Install wasm-pack
cargo install wasm-pack

# Optional: wasm-opt for smaller binaries (part of binaryen)
# On Ubuntu/Debian:
sudo apt install binaryen
```

## Project Setup

### Directory Structure

```
trader-svelte/
├── crates/
│   └── tendies-core/
│       ├── Cargo.toml
│       ├── src/
│       │   └── lib.rs
│       └── tests/
├── src/
│   └── lib/
│       └── wasm/          # wasm-pack output lands here
│           ├── tendies_core.js
│           ├── tendies_core.d.ts
│           ├── tendies_core_bg.wasm
│           └── package.json
├── package.json
├── vite.config.ts
└── svelte.config.js
```

### Cargo.toml

```toml
[package]
name = "tendies-core"
version = "0.1.0"
edition = "2021"

[lib]
crate-type = ["cdylib", "rlib"]
# cdylib: produces .wasm for wasm-pack
# rlib: allows `cargo test` (native Rust tests, no browser needed)

[dependencies]
wasm-bindgen = "0.2"
serde = { version = "1", features = ["derive"] }
serde_json = "1"
serde-wasm-bindgen = "0.6"

# Optional: better panic messages in browser console
console_error_panic_hook = { version = "0.1", optional = true }

[dev-dependencies]
wasm-bindgen-test = "0.3"

[features]
default = ["console_error_panic_hook"]

[profile.release]
opt-level = "z"       # Optimize for size (smallest WASM)
lto = true            # Link-time optimization
codegen-units = 1     # Single codegen unit (better optimization)
strip = true          # Strip debug info
panic = "abort"       # Smaller panic handling (no unwinding)
```

### lib.rs Entry Point

```rust
// crates/tendies-core/src/lib.rs

use wasm_bindgen::prelude::*;

mod types;
mod trade;
mod market;
mod position;
mod account;
mod engine;

/// Initialize WASM module. Call once at app boot.
#[wasm_bindgen(start)]
pub fn init() {
    // Better panic messages in browser console
    #[cfg(feature = "console_error_panic_hook")]
    console_error_panic_hook::set_once();
}

// Re-export public API
pub use trade::planner::*;
pub use trade::risk::*;
pub use trade::executor::*;
pub use market::state::*;
pub use position::state::*;
pub use account::state::*;
pub use engine::state::*;
pub use types::*;
```

## Build Commands

### package.json Scripts

```json
{
  "scripts": {
    "wasm:build": "wasm-pack build crates/tendies-core --target web --out-dir ../../src/lib/wasm --out-name tendies_core",
    "wasm:build:dev": "wasm-pack build crates/tendies-core --target web --dev --out-dir ../../src/lib/wasm --out-name tendies_core",
    "wasm:watch": "cargo watch -w crates/tendies-core/src -s 'npm run wasm:build:dev'",
    "dev": "npm run wasm:build:dev && vite dev",
    "build": "npm run wasm:build && vite build",
    "preview": "npm run wasm:build && vite preview",
    "check": "npm run wasm:build && svelte-kit sync && svelte-check --tsconfig ./tsconfig.json",
    "test:rust": "cd crates/tendies-core && cargo test",
    "test:rust:watch": "cd crates/tendies-core && cargo watch -x test"
  }
}
```

### wasm-pack Flags Explained

| Flag | Purpose |
|---|---|
| `--target web` | Produces ES module output (compatible with Vite) |
| `--dev` | Debug build, no optimizations (faster compile, ~2s) |
| `--out-dir ../../src/lib/wasm` | Output into SvelteKit's importable path |
| `--out-name tendies_core` | Controls output filenames |

**Do NOT use `--target bundler`** — it produces CommonJS-style imports that require a bundler plugin. `--target web` works natively with Vite's ES module handling.

## Vite Configuration

### vite.config.ts Changes

```typescript
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
    plugins: [sveltekit()],
    server: {
        port: 24536,
        host: '0.0.0.0',
        https: {
            key: '...', // existing mkcert config
            cert: '...',
        },
        // Allow WASM file serving
        fs: {
            allow: ['src/lib/wasm'],
        },
    },
    // WASM support
    optimizeDeps: {
        exclude: ['tendies-core'], // Don't pre-bundle WASM
    },
    build: {
        target: 'esnext', // Required for top-level await (WASM init)
    },
});
```

### SvelteKit Config

No changes needed to `svelte.config.js`. The WASM files in `src/lib/wasm/` are treated as regular ES module imports by SvelteKit.

## WASM Initialization in the App

### Boot Sequence

```typescript
// src/lib/wasm/init.ts
import init from '$lib/wasm/tendies_core';

let initialized = false;
let initPromise: Promise<void> | null = null;

export async function initWasm(): Promise<void> {
    if (initialized) return;
    if (initPromise) return initPromise;

    initPromise = init().then(() => {
        initialized = true;
    });

    return initPromise;
}

export function assertWasmReady(): void {
    if (!initialized) {
        throw new Error('WASM not initialized. Call initWasm() first.');
    }
}
```

### Integration with AppEngine Boot

```typescript
// In the app boot sequence (layout or engine binding)
import { initWasm } from '$lib/wasm/init';

// Add WASM init as the first step in boot
async function boot() {
    await initWasm();  // ~5-20ms on first load
    engineBinding.dispatch(EngineCommand.Boot);
}
```

## Development Workflow

### Option A: Manual Rebuild

```bash
# Terminal 1: Vite dev server
npm run dev

# Terminal 2: Rebuild WASM when Rust changes
npm run wasm:build:dev
# Then Vite hot-reloads because src/lib/wasm/ files changed
```

### Option B: Auto-Watch (recommended)

```bash
# Install cargo-watch
cargo install cargo-watch

# Terminal 1: Watch Rust changes → rebuild WASM → Vite picks up changes
npm run wasm:watch

# Terminal 2: Vite dev server
npm run dev
```

`cargo-watch` watches `crates/tendies-core/src/` and re-runs `wasm-pack build` on any change. Vite detects the updated `.js`/`.wasm` files in `src/lib/wasm/` and triggers HMR.

**Incremental compile time (dev):** ~2-4 seconds for Rust changes.
**Vite HMR after WASM rebuild:** <500ms.
**Total feedback loop:** ~3-5 seconds.

### Option C: Parallel Development

When working on UI-only changes (Svelte components, CSS, chart overlays), you don't need to rebuild WASM at all. The WASM module is a static import — changes to `.svelte` files trigger instant HMR as before.

Only Rust source changes require WASM rebuild.

## Production Build

```bash
npm run build
```

This runs:
1. `wasm-pack build` (release mode, ~15-30s)
   - `opt-level = "z"` for smallest binary
   - `lto = true` for cross-crate optimization
   - `wasm-opt` runs automatically (further size reduction)
2. `vite build` (SvelteKit production build)
   - WASM binary is included in the output bundle
   - Vite handles content hashing for cache busting

### Expected Bundle Sizes

| Component | Size (gzipped) |
|---|---|
| WASM binary (tendies_core_bg.wasm) | ~30-80 KB |
| JS glue (tendies_core.js) | ~2-5 KB |
| Svelte app (existing) | ~50-150 KB |
| **Total** | ~80-235 KB |

The WASM binary is small because tendies-core is pure logic — no heavy crates like `regex`, `chrono`, or `tokio`. Just math, enums, and state machines.

## .gitignore Additions

```gitignore
# WASM build output (regenerated from Rust source)
src/lib/wasm/

# Rust build artifacts
crates/tendies-core/target/
crates/tendies-core/pkg/
```

**Note:** Do NOT commit `src/lib/wasm/` — it's generated output. CI/CD should run `npm run wasm:build` before `npm run build`.

## Troubleshooting

### "wasm-bindgen version mismatch"

The `wasm-bindgen` CLI version must match the crate version exactly:

```bash
# Check crate version
grep wasm-bindgen crates/tendies-core/Cargo.toml

# Check CLI version
wasm-bindgen --version

# Fix: install matching version
cargo install wasm-bindgen-cli --version 0.2.XXX
```

Or let `wasm-pack` manage it (it downloads the correct version automatically).

### "Cannot find module '$lib/wasm/tendies_core'"

Run `npm run wasm:build:dev` — the output files don't exist yet.

### "Top-level await is not available"

Add `target: 'esnext'` to `vite.config.ts` build options. WASM init uses top-level await in the generated glue code.

### Large WASM binary

Check which crates are pulling in heavy dependencies:

```bash
# Install cargo-bloat
cargo install cargo-bloat

# Analyze binary
cd crates/tendies-core
cargo bloat --release --target wasm32-unknown-unknown -n 20
```

Common bloat sources:
- `serde_json` pulls in `itoa` + `ryu` (~15KB) — acceptable
- `chrono` pulls in timezone data (~100KB) — avoid, use f64 timestamps
- `regex` adds ~500KB — avoid, do string matching in JS
