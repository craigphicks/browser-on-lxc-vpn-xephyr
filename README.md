# browser-on-lxc-vpn-zephyr

Javascript module to create (from virgin generic ub18 lxc) a turnkey linux container running firefox, vpn, and the X-server zephyr.

Tested on host running Ubuntu 18.04.  Requires ufw to be running on the host.

Not yet released to NPM.

# Usage

  node index.js init
     -intialiize container
  node index.js browse
    - restart a stopped container and start browser
    - NOTE: program will not exit until browser or Xephyr/browser are closed.
      You may run in background "node iundex.js browse &" to free up terminal.
      
# Parameters

Hard coded at top of index.js
To run without Xephyr, change `XServerXephyr` to  `false`.
The default 
