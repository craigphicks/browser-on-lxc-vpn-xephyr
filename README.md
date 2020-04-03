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
using the `<a.b.c.d>/<n>` (e.g.,`10.64.64.1/24`) specified in `lxdbr0`.  .

  - See *Usage* below for conditions relating to `<a.b.c.d>/<n>`


# Usage

 - `node index.js init [-nufw]`
   - intialiizes container
   - use argument `-nufw` to suppress adding the `ufw` rule mentioned above, instead taking care of it manually.  Two reasons for doing so:
    - `ufw` is not installed on the system
    - `sudo` requires a password
 - `node index.js browse`
   - restarts a stopped container and start browser
   - NOTE: program will not exit until Xephyr and the browser are closed.
      (Or in no-Xephyr mode, until the browser is closed).
      You may run in background "node index.js browse &" to free up terminal.

      
# Parameters

Other parameters are currently hard coded at the top of index.js .
The ones you might need or want to change are:

 - `XServerXephyr`
   - default: `true`
   - If `true` then the broswer sends X reuests to a Xephyr instance run on the container and acting as an X server, and the Xephyr instance passes some requests back through the ssh pipe to the host true X-server.
   If `false` then the browser on the container will pipe X requests directly back through the ssh pipe to the host true X-server.  
 - `SCREENSIZE`
  - default: `1920x1200`
  - Values are written `<w>x<h>`, e.g. `600x800`

so adjust as necessary.
Otherwise, not necessary to change.

# Todo

- Move hard coded params to args.
- Clean up.
- Publish on NPM.
