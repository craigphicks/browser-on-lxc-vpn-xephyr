#!/bin/bash
# Fingerprintless browsing ?? Serve X11 with Xephyr on local A, run Firefox on headless B, proxy HTTP to headless C

KEYFILE1a=/home/craig/.ssh/id-ub1804-2
KEYFILE1b=/home/ubuntu/.ssh/id-ub1804-2
USERREMOTE1=ubuntu@10.185.64.195
REMOTE2_IP=173.255.212.76
USERREMOTE2=sonoko@$REMOTE2_IP
PROXYPORT12=8765
#SCREENSIZE=1280x800
SCREENSIZE=1920x1200

# KEYFILE1a=
# KEYFILE1b=
# USERREMOTE1=
# REMOTE2_IP=
# USERREMOTE2=
# PROXYPORT12=8765
# #SCREENSIZE=1280x800
# SCREENSIZE=1920x1200

# setup key for ssh from 1 to 2, only needs to be done once
#ssh-keygen -q -t rsa -f $KEYFILE1a -N ''
#scp $KEYFILE1a $USERREMOTE1:$KEYFILE1b
#ssh $USERREMOTE1 "ssh-copy-id -i $KEYFILE1b $USERREMOTE2"
#cat ${KEYFILE1a}.pub | ssh $USERREMOTE2 "cat >> ~/.ssh/authorized_keys"

Xephyr -ac -screen $SCREENSIZE -br -reset -terminate  :2 &

if $(exit 0) ; then
	(
		DISPLAY=:2 ssh -Y $USERREMOTE1 "/bin/bash" <<EOF
ssh -N -D $PROXYPORT12 -i $KEYFILE1b \
 -o UserKnownHostsFile=/dev/null -o StrictHostKeyChecking=no $USERREMOTE2 &
pid1=\$!
echo pid1=\$pid1
DISPLAY=:10 firefox &
pid2=\$!
echo pid2=\$pid2
wait \$pid2
sudo kill -9 \$pid1
EOF
	) &
	(
		DISPLAY=:2 ssh -Y $USERREMOTE1 "/bin/bash" <<EOF
sleep 3
DISPLAY=:10 xdotool search --onlyvisible --class Firefox windowsize 95% 95%
EOF
	) &

else
	# this debug branch enables entering manual commands in the X sesson 
	echo "ssh -N -D $PROXYPORT12 -i $KEYFILE1b \
 -o UserKnownHostsFile=/dev/null -o StrictHostKeyChecking=no $USERREMOTE2"
	echo "DISPLAY=:10 firefox"
	DISPLAY=:2 ssh -Y $USERREMOTE1
fi

# problems with vanish FF contenxt menus
# sol1: echo "#contentAreaContextMenu{ margin: 5px 0 0 5px }" > ~/.mozilla/firefox/<###>.default/chrome/userChrome.css
# sol2: about:config ui.context_menus.after_mouseup- > true
# sol3: about:profiles click [restart in safe mode]  
# only sol3 was reliable
# even without menu can reach settings via about:preferences

echo "please set up SOCKS5 proxy on firefox to 127.0.0.1:8765"
