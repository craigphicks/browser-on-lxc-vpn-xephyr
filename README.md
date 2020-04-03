# browser-on-lxc-vpn-xephyr

Javascript module to create (from virgin generic ub18 lxc) a turnkey linux container (on the host) running firefox, vpn, and the X-server Xephyr.

# Requirements

This software was tested on a host running Ubuntu 18.04. 
It will certainly work on Ubuntu 18.x, 19.x but other software is uncertain.

- LXD version 4.0.0 or greater

- There should be an LXD network configuration `lxdbr0` with the following information:
```
% lxc network show lxdbr0
config:
  ipv4.address: <a.b.c.d>/<n>
  ...
...
```
where `<a.b.c.d>/<n>`is an ip4 network range in CIDR format.  This address is used in two ways:

1. The `<a.b.c.d>` component is used as a destination address for the container to 
POST to when initialization is complete.  While testing this was `10.64.64.1`, but if it 
ended in `0` or `255` then it would probably fail.

2. By default a `ufw` firewall rule will be added:
```
sudo ufw allow from <a.b.c.d>/<n> to <a.b.c.d> port 3000 proto tcp
```
using the `<a.b.c.d>/<n>` specified in `lxdbr0`.  

-- If `ufw` cannot or should not be used, then
add the *-nufw* argument to *init* (see *usage* below) and ensure no firewall is blocking that route, e.g., by adding such a rule another way.

-- If `sudo` requires a password on the host, then add the *-nufw* argument to *init* (see *usage* below) and add the rule manually. 

- You should have already set up VPN (e.g. on a rented VPS, not on the host)
and placed the client key in a file on the host: `/home/$USER/ffvpn-client.ovpn`.

# Usage

 - node index.js init
   - intialiizes container
 - node index.js browse
   - restarts a stopped container and start browser
   - NOTE: program will not exit until Xephyr and the browser are closed.
      (Or in no-Xephyr mode, until the browser is closed).
      You may run in background "node index.js browse &" to free up terminal.

      
# Parameters

Parameters are currently hard coded at the top of index.js .
The ones you might need or want to change are:

 - XServerXephyr
   - default: `true`
   - If `true` then a Xephyr instance is run on the container and the browser used that instance as it's X server. The 
   If `false` then the browser on the container will pipe X requests back through an ssh pipe to the host.  

The default screen size is 
```
const SCREENSIZE = '1920x1200'
```
so adjust as necessary.
Otherwise, not necessary to change.

# Todo

- Publish on NPM.
- 
