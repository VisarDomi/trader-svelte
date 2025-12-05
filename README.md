# trader-svelte

this repo is a rewrite of the old repo from the beginning.

## base options
* pwa - local for dev and netlify for prod
* chart - history + live
* open position

## bonus options
* credentials
* select other tickers
* change account
* change leverage
* open position in time

## tech stack
* frontend is svelte
* backend is node
* if anything is bottlenecked in performace, use go

* playright and vitest - i need these to stop rewriting the apps everytime
* sveltekit-adapter - i need this to push to netlify frontend
* devtools-json - not now
* drizzle - not needed. the backend is decoupled from this. not even in a monorepo
* mdsvex - i don't need markdown now
* storybook - i don't need help in creating ui
* mcp - i don't need a model context protocol - maybe later when i do the gemini hack

## notes
* one of credentials (real/demo) is tied to the websocket. so if we use demo for opening a position, we have to use the real credentials to show the chart

## more
- get a pwa up and running
