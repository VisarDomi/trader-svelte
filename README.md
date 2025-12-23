# trader-svelte

Click on the graph to open a position with all of your deposited cash. Stop loss at 50%.

## bugs
* resizing on pwa
* should not be able to open a second position on the same account, even if we change instruments
* position viewing breaks if leverage is changed - we need to save the leverage when opening a position instead of calling the api
* localstorage is bloated - do a better job of handling data
* performance: lower the number of cpu cycles, because phone battery


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

## dev backend notes:
this repo sets up the https on localhost

we can pwa the app even though it is on local network

flow:
use mkcert to create rootca and the cert for 192.168.1.197, i don't know how, ask a chatbot
serve this express app, go to iphone to https://192.168.1.197:37984/cert to download the cert
you may need to go through some hoops to download it on the iphone, but you can do it
install the profile
important hidden step - go to general-about-certificate settings - trust the certificate (again...)
https is now ready for 192.168.1.197 - pwa and hls is unlocked for local network

## notes
the yellow line should be called break even point
