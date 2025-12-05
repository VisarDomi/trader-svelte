for now this subrepo sets up the https on localhost

we can pwa the app even though it is on local network

flow:
use mkcert to create rootca and the cert for 192.168.1.197, i don't know how, ask a chatbot
serve this express app, go to iphone to https://192.168.1.197:37984/cert to download the cert
you may need to go through some hoops to download it on the iphone, but you can do it
install the profile
important hidden step - go to general-about-certificate settings - trust the certificate (again...)
https is now ready for 192.168.1.197 - pwa and hls is unlocked for local network

const IP = '192.168.1.197'
const PORT = 37984;





