Craig P Hicks copyright 2020 
see LICENSE.md for license

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

- `node` version `v10.16.3` or higher

- `npm` version `6.14.4` or higher

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
where `<a.b.c.d>/<n>`is an ip4 network range in CIDR format, e.g.
```
10.64.64.1/24
```



# Usage

 - `node index.js init [-nufw] [-ntz]`<br/>
   Initialize container
   - `-nufw` 
     Don't automatically add ufw rule.  
	 Use when ufw is not the host firewall, or when sudo requires a password. 
	 
   - `-ntz` 
     Don't use host /etc/timezone in container, the default is UTC.

 - `node index.js browse [-nxephyr] [-screen <W>x<H>] [-xephyrargs <string of pass thru args>]`<br/>
   Launch Firefox browser
   - `-nxephyr`<br/>
     Don't use Xephyr on container, use host Xserver directly
   - `screen <W>x<H>`<br/>
       Initial size of Xephyr screen. Default is taken from host screen size.
   - `-xephyrargs <string of pass thru args>`<br/>
     Pass addition args directly to invocation of Xephyr

 - `node index.js ufwRule`<br/>
   Print out what the ufw rule would be to allow container to 'phone home' on init completion.

# TL;DR notes on usage

- Re: `init`
 1. Container only needs to be initialized once.  It will automatically reboot.
 1. Two reasons for not adding the ufw rule - <br/>
   a)  `ufw` is not installed on the system <br/>
   b)  `sudo` requires a password <br/>
	 If the rule is not added, the user must ensure that the *phone home* action signaling the containers end of initialization is not blocked by a firewall.


- Re: `browse`
 1. `browse` requires <br/>
   a) That the container be in the running state. <br/>
   b) That another Xephyr instance is not already running on the container.
 1. Xeprhyr acts a thin Xserver, but Xephyr sends some X requests in the reverse direction over ssh  to the host X server.
 1. Running without Xephyr causes all X requests to be sent in the reverse direction over ssh directly to the host X server. 
 1. When using the `-xephyrargs <xephyr args string>` option the following values for `<xephyr args string>` may be of interest:
    - `-reset -terminate` as a pair will cause Xephyr to terminate when firefox is shutdown.  However, that means a Firefox restart will cause Xephyr to shutdown.
    - `-fullscreen` will cause Xephyr to use the whole screen.  However, that means the Xephyr close 'x' icon will not be visible.
 1.  The program will not exit until Xephyr and the browser are closed.
      (Or in no-Xephyr mode, until the browser is closed).
      You may run in the background with "node index.js browse &" to free up the terminal.
 1.  *Only when using Xephyr* - You may find that when clicking on firefox menu icon the menu doesn't drop down correctly.  To fix that try typing 'about:profiles' into the address bar, and then clicking on "Restart without addons".  When Firefox reopens, the menu *might* work.  Otherwise, `<ctrl>+<shift>+w` will close firefox, and the setting page can be accessed with `about:preferences`.
 1.  VPN function can be confirmed by searching for `myip` with the browser- the VPN address should appear. 



# Other Parameters

Other parameters and some default values are hard coded at the top of index.js. 
Most likely there is no need to change these.


# Setting up VPN on a VPS

This is a quick and dirty way to set up a VPN server on a VPS.

 - *Linode* currently offers a *nanode* vanilla VPS for $5 a month at an hourly rate.
 The hourly rate means saving money by deleting and the recreating if it is not going to be used
 for some time.
 - Linenode allows specifying root password and ssh public key to go in `authorized_keys`before creating the node.
 - Once the node is created, set up firewall rules on the VPS:<br/>
   `ufw allow 22`<br/>
   `ufw allow 1194`
 - If using port 443 instead of 1194 as the VPN post then write 443 instead of 1194.
 - Enable the firewall<br/>
   `ufw enable`
 - Browser search for *"github road warrior"* for instuctions on the one liner for 
 an intereactive install. It is
   - `wget https://git.io/vpn -O openvpn-install.sh && bash openvpn-install.sh`
   - You might want to change the VPN port from the default `1194` to `443`.
   - Set client name to `ffvpn-client`
 - From your local host, as your normal user, use <br/>
 `scp root@<vps address>:/home/root/ffvpn-client.ovpn ~/`<br/>
 to copy the certificate to the necessary local host location.
 

# References used in enabling pulse audio over ssh

https://superuser.com/a/311830, https://askubuntu.com/a/857458,
https://lists.linuxcontainers.org/pipermail/lxc-users/2016-January/010802.html, https://www.systutorials.com/docs/linux/man/5-pulse-daemon.conf/,
https://askubuntu.com/questions/70556/how-do-i-forward-sound-from-one-computer-to-another-over-the-lan

In the end most if wasn't neccesary. 

# Todo

- Publish on NPM.
- Add test suite.
- Clean up.
- Other browser types
