# trader-svelte

Click on the graph to open a position with all deposited cash.

## missing features
* engine restart if the pwa gets paused by ios
* visual stuff

## dev notes: pwa
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
<meta name="apple-mobile-web-app-capable" content="yes" />
<link rel="manifest" href="/manifest.json" />
manifest.json
{
    "start_url": "/"
}
* also some magic to get the correct dimensions for pwa and safari ios
* no need for html for the icons

