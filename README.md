# Tendies

Tendies is a self-hosted trading PWA built around Capital.com market data and execution. It is optimized for mobile Safari and standalone iOS PWA use, with real-time charting, position planning, background-resume handling, and a custom chart orchestration layer on top of TradingView Lightweight Charts.

## Stack

- SvelteKit 2
- Svelte 5
- TypeScript
- TradingView Lightweight Charts
- IndexedDB for local candle cache and state restore
- Node adapter for self-hosted deployment

## What is interesting here

- iOS PWA resilience: the app handles resume, visibility gaps, and background wake-up edge cases that appear in real mobile usage.
- Functional core / imperative shell chart integration: Svelte reactivity captures intent, while a single RAF flush owns chart mutations.
- Structured runtime telemetry: chart, viewport, resume, and trading flows emit typed logs to make production-only timing bugs diagnosable.
- Local-first UX: the app keeps enough local state to restore quickly after reloads and intermittent mobile suspension.

The architectural rationale lives in [architectural_decisions.md](./architectural_decisions.md) and [decisions.md](./decisions.md).

## Getting started

### Requirements

- Node.js 20+
- npm
- A Capital.com account

### Install

```bash
npm install
```

### Run in development

```bash
npm run dev
```

The Vite dev server binds to `0.0.0.0:24536`. If mkcert certificates exist under `~/.local/share/mkcert/pwa/`, HTTPS is enabled automatically for local iPhone/PWA testing.

### Build

```bash
npm run build
```

This project uses `@sveltejs/adapter-node`. For a production-style local run after build:

```bash
node build
```

## Authentication and local env

This repo does not ship live credentials.

For local development, you can optionally create a `.env` from `.env.example` to prefill the login form:

```bash
cp .env.example .env
```

These values are for local development only. Do not commit `.env`, and do not use this `PUBLIC_*` autofill path as a public demo deployment strategy.

## iPhone / PWA testing

iOS standalone PWA behavior was a core design target for this project. For HTTPS-based local testing:

1. Generate a local certificate with `mkcert`.
2. Place the generated files at `~/.local/share/mkcert/pwa/key.pem` and `~/.local/share/mkcert/pwa/cert.pem`.
3. Start the dev server and open the app from your iPhone on the same network.
4. If you need the mkcert root CA, the app exposes it from `/api/cert` for manual installation on the test device.

## Current status

- Personal tool, not a multi-tenant product
- No formal test suite yet
- Documentation focuses on design decisions and runtime observability
