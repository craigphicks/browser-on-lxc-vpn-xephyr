# browser-on-lxc-vpn-xephyr

Javascript module to create (from a virgin generic ubuntu lxc) an unprivileged linux container 
running firefox, vpn, and the X-server Xephyr.  This setup allows
 - VPN-anonymous browing
 - (perhaps some degree of) fingerprint-anonymous browsing 
 - (perhaps some degree of) protection against snooping of Xserver memory
 
The resulting unprivileged linux container has no access to the host filesystem.
 
# Requirements

This software was tested on a host running Ubuntu 18.04. 
It should certainly work on Ubuntu 18.x, 19.x.

- A *openvpn* VPN should already be setup, and the *openvpn* client certificate
should already be placed on the host as a file named <br/>
`/home/<username>/ffvpn-client.ovpn` <br/>
See section *Setting up VPN on a VPS* for more information.

- LXD version 4.0.0 or greater
  - There should be an LXD network configuration `lxdbr0` with the following information:
```
% lxc network show lxdbr0
config:
  ipv4.address: <a.b.c.d>/<n>
  ...
...
```
where `<a.b.c.d>/<n>`is an ip4 network range in CIDR format. 

  - This literal component `<a.b.c.d>` is used in two ways:
    1. The `<a.b.c.d>` component is used as a destination address for the container to 
POST to when initialization is complete.  
    2. By default a `ufw` firewall rule will be added:
```
sudo ufw allow from <a.b.c.d>/<n> to <a.b.c.d> port 3000 proto tcp
```

  - If the literal `<a.b.c.d>` does not allow the usages in the above 1 and 2, then the program will fail.  E.g. a value for `<a.b.c.d.>`  of `10.64.64.1` allows, but if `d` were  `0` or `255` then it would probably fail.  It is easy to check the values by calling `node index.js ufwRule`, as described in the *Usage* section below.


# Usage

 - `node index.js init [-nufw]`
   - Intialiizes container.  Only required once unless hard coded parameters are changed.
   - use argument `-nufw` to suppress adding the `ufw` rule.  There is no harm in adding the rule again if it is already present.  Two reasons for not adding the rule - <br/>
     1.  `ufw` is not installed on the system <br/>
     2.  `sudo` requires a password <br/>
	 If the rule is not added, the user must ensure that the *phone home* action signaling the containers end of initialization is not blocked by a firewall.
     
 - `node index.js browse [-nxephyr] [-xephyrargs <string of pass thru args>]`
   - requires <br/>
     1. That the container be in the running state. <br/>
	 2. That another Xephyr instance is not already running on the container.
   - `-nxephyr` - Used to run a browser in the container without `Xephyr`, instead running 
   directly on the host Xserver via an ssh pipe.  The browsers ip traffic will still be 
   routed through the VPN, but the host Xserver buffer content might be not as protected from 
   snooping, and the browser fingerprint will be more similar to that of a browser 
   running on the host.  Note that even when using `Xephyr`, `Xephyr` tranfers some X requests 
   through the ssh pipe, so some fingerprint similarities may exist anyway.
   - `-screen <W>x<H>`
     - default value: `1920x1200`
	 - specify the Xephyr screensize, e.g. `-screen 1280x800`
   - `-xephyrargs` - Used to pass a string of arguments to `Xephyr`.  Run `Xephyr --help` to see what is available.  The arguments <be/>
   `-ac -br -screen <screensize> -resizeable -reset -terminate -zap`<br/>
   are already hard coded, but <br/>
   `-reset -terminate -zap`<br/>
   do not seem be always working as expected.
   - NOTE1: The program will not exit until Xephyr and the browser are closed.
      (Or in no-Xephyr mode, until the browser is closed).
      You may run in the background with "node index.js browse &" to free up the terminal.
   - NOTE2: *Only when using Xephyr* - You may find that when clicking on firefox menu icon the menu doesn't drop down correctly.  To fix that try typing 'about:profiles' into the address bar, and then clicking on "Restart without addons".  When Firefox reopens, the menu *might* work.  Otherwise, `<ctrl>+<shift>+w` will close firefox, and the setting page can be accessed with `about:preferences`.
   - NOTE3: VPN function can be confirmed by searching for `myip` with the browser- the VPN address should appear. 

 - `node index.js ufwRule`
   - prints out the `ufw` rule whill will be automatically added unless the `-nufw` flag is used with `init`.  The is helpful for checking address and subnet format and value, and for adding a rule manually whenn necesary. 
      
# Other Parameters

Other parameters and some default values are currently hard coded at the top of index.js. 
Most likely there is no need to change these.


# Setting up VPN on a VPS

 - *Linode* currently offers a *nanode* vanilla VPS for $5 a month at an hourly rate.
 The hourly rate means saving money by deleting and the recreating if it is not going to be used
 for some time.
 - Linenode allows specifying root password and ssh public key to go in `authorized_keys`
 - Set up a firewall on the VPS:
   - `ufw allow from <a.b.0.0>/24> to any port 22` to enable ssh access, where `a.b` are the first two parts of your host public ip4 address.  That is because your provider might change your ip4 address regularly, but probably keeps the `a.b` part.  If not then just <br/>
   `ufw allow 22`
   - `ufw enable` to enable the firewall.
 - Browser search for *"github road warrior"* for instuctions on the one liner for 
 an intereactive install. It is
   - `wget https://git.io/vpn -O openvpn-install.sh && bash openvpn-install.sh`
   - You might want to change the VPN port from the default `1194` to `443`.
   - Set client name to `ffvpn-client`
 - From your local host, as your normal user, use <br/>
 `scp root@<vps address>:/home/root/ffvpn-client.ovpn ~/`<br/>
 to copy the certificate to the necessary local host location.
 
You might worry about running as root, but if you used a decent password the biggest risk is getting locked out from `ssh`'ing in as `ufw` when an attacker on the same `a.b` subnet triggers `ssh` lockout. Since you really don't need to log back into the VPS after setup, that might not even be an issue.


# Todo

- Clean up.
- Publish on NPM.
- Allow multi browser types
- Allow multiple browser instances each with own Xephyr to be run simultaneously 
- Perhaps enable remote containers - 
although piping X a long distance might be rather slow - so not worth it?
