# browser-on-lxc-vpn-xephyr

Javascript module to create (from virgin generic ub18 lxc) a turnkey linux container (on the host) running firefox, vpn, and the X-server Xephyr.

# Requirements

Tested on host running Ubuntu 18.04.  
Requires ufw to be running on the host.
You should have already set up VPN (e.g. on a rented VPS)
and placed the client key in a file on the host: 
`/home/$USER/ffvpn-client.ovpn`.

# Usage

 - node index.js init
   - intialiizes container
 - node index.js browse
   - restarts a stopped container and start browser
   - NOTE: program will not exit until Xephyr and the browser are closed.
      (Or in no-Xephyr mode, until the browser is closed).
      You may run in background "node index.js browse &" to free up terminal.
      
# Parameters

Hard coded at top of index.js
To run without Xephyr, change `XServerXephyr` to  `false`.
The default screen size is 
```
const SCREENSIZE = '1920x1200'
```
so adjust as necessary.
Otherwise, not necessary to change.

# Todo

- Publish on NPM.
- 
