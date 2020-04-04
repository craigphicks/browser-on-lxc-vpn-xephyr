'strict'
const util = require('util')
const fs = require('fs')
const url = require('url')
const yaml = require('js-yaml');

const { createProfile,
		syscmd,
		waitPhoneHome,
		getContainerIp4Address
	  }
	  = require('./ffvpn-prof.js')


/////////////////////////////////////////////////////////////
// Parameters:
const timezone = ""
const sshKeyFilename = `/home/${process.env.USER}/.ssh/to-ffvpn`
const vpnClientCertFilename = `/home/${process.env.USER}/ffvpn-client.ovpn`
const lxcImageSrc = `ubuntu:18.04`
const lxcImageAlias = `ub18-im`
const lxcContName = `ub18-ffvpn`
const lxcCopyProfileName = 'default'
const lxcProfileName = 'ffvpn-prof'
const lxcContBridgeName = 'lxdbr0'
const phoneHomePort = 3000
const contUsername = 'ubunutu'
// end of Parameters
//////////////////////////////////////////

////////////
// Currently the following two values may not be changed:
const XServerXephyr_host0_cont1 = 1
const XServerXephyr_manual = false
////////////

const dropDownFixMsg = 
	  `#### NOTE! ####
You may find that when clicking on firefox menu icon the menu doesn't appear correctly.
To fix that try typing 'about:profiles' into the address bar, and then clicking on
"Restart without addons".  When Firefox reopens, the menu *might* work.
`


// package_upgrade: true, ssha_authorized_keys: ...
// will be added internally
var cloudInitJSON = {
	//	"locale": "en_US.UTF-8", 
	"locale": process.env.LANG, 
	"timezone": timezone, 
	"packages": [
	 	"firefox", 
	 	"openvpn",
		"xdotool", // necessary only when XServerXephyr will be 'true' at browse time. 
		"xserver-xephyr"
	], 
	"runcmd": [
		[
			"touch", 
			"/home/ubuntu/iwozere"
		]
	]
}

function getPhoneHomeInfo(){
	let phoneHomeFromCDN = yaml.safeLoad(syscmd(`lxc network show ${lxcContBridgeName}`)).
		config['ipv4.address']
	let phoneHomeToAddr = phoneHomeFromCDN.split('/')[0]
	let phoneHomeURL = `http://${phoneHomeToAddr}:${phoneHomePort}`
	return {
		fromCDN:phoneHomeFromCDN,
		toAddr:phoneHomeToAddr,
		URL:phoneHomeURL
	}
}

function makeUfwRule(phoneHomeInfo){
	let ret = 
		`sudo ufw allow from ${phoneHomeInfo.fromCDN} to ${phoneHomeInfo.toAddr} ` 
		+ `port ${phoneHomePort} proto tcp`;
	return ret
}


async function initialize(args) {
	// create an instance of a container from that image

	let doUfwRule = true;
	if (args.indexOf('-nufw')>=0)
		doUfwRule = false;

	let noCopyHostTimezone = false;
	if (args.indexOf('-ntz')>=0)
		noCopyHostTimezone = false;

	// if name exists delete it
	let clist = JSON.parse(syscmd(`lxc list --format json`))
	if (clist.find(c=>c.name==lxcContName))
		syscmd(`lxc delete --force ${lxcContName}`) 

	// create key
	if (!(fs.existsSync(`${sshKeyFilename}.pub`) &&
		  fs.existsSync(`${sshKeyFilename}`))) {
		if (fs.existsSync(`${sshKeyFilename}.pub`))
			fs.unlinkSync(`${sshKeyFilename}.pub`)
		if (fs.existsSync(`${sshKeyFilename}`))
			fs.unlinkSync(`${sshKeyFilename}`)
		syscmd(`ssh-keygen -f ${sshKeyFilename} -N ''`)
	}
	if (!(fs.existsSync(`${sshKeyFilename}.pub`) &&
		  fs.existsSync(`${sshKeyFilename}`))) {
		throw `failed to create ssh key ${sshKeyFilename}`
	}

	console.log("KEY done ...")

	// determine cloud init phone_home post destination and ufw rule to allow it
	// (depends on bridge ${lxcContBridgeName})
	//console.log(yaml.safeLoad(syscmd(`lxc network show ${lxcContBridgeName}`)))

	phoneHomeInfo = getPhoneHomeInfo();
	// let phoneHomeFromCDN = yaml.safeLoad(syscmd(`lxc network show ${lxcContBridgeName}`)).
	// 	config['ipv4.address']
	// let phoneHomeToAddr = phoneHomeFromCDN.split('/')[0]
	// let phoneHomeURL = `http://${phoneHomeToAddr}:${phoneHomePort}`

	// the file containing the fix for openvpn-client to run in, and where it should go
	let overrideContFn = `/etc/systemd/system/openvpn-client\@.service.d/override.conf`

	// create profile
	await createProfile(
		lxcCopyProfileName,
		lxcProfileName,
		cloudInitJSON,
		`${sshKeyFilename}.pub`,
		phoneHomeInfo.URL,
		'[Service]\nLimitNPROC=infinity\n',
		overrideContFn,
		noCopyHostTimezone
	)

	console.log("PROFILE done ...")

	// copy the lxc image (if already exists does not fail)
	if (JSON.parse(syscmd(`lxc image list ${lxcImageAlias} --format json`)).length==0) {
		syscmd(`lxc image copy ${lxcImageSrc} local: --alias ${lxcImageAlias}`)
	}
	console.log("IMAGE done ...")

	if (doUfwRule){
		//console.log(phoneHomeInfo)
		console.log('DEBUG: ',makeUfwRule(phoneHomeInfo))
		let ufwRuleCmd = makeUfwRule(phoneHomeInfo)
		// `sudo ufw allow from ${phoneHomeInfo.fromCDN} to ${phoneHomeInfo.toAddr} ` 
		// + `port ${phoneHomePort} proto tcp`;
		console.log(`ADDING UFW RULE for phome_home:\n${ufwRuleCmd}`)
		console.log(syscmd(ufwRuleCmd))
	}
	
	// set up receiver for cloud init phone home signalling cloud init end
	var promPhoneHome = waitPhoneHome(phoneHomeInfo.toAddr, phoneHomePort)

	// create the container with cloud init customization
	syscmd(`lxc launch ${lxcImageAlias} ${lxcContName} -p ${lxcProfileName}`)

	console.log("LAUNCH executed, waiting for phone home to signal cloud init finished ...")

	await promPhoneHome;

	// wait until cloud init has finished
	console.log("CONTAINER has finished cloud init")

	var contip4 = getContainerIp4Address(lxcContName)

	console.log("CONTAINER ip4 address is " + contip4)

	// Copy the vpn client cert to container.
	// For privacy's sake we didn't put cert in cloud-init data.
	syscmd(`lxc file push  ${vpnClientCertFilename} ` + 
		   `${lxcContName}/etc/openvpn/client/client.conf --gid 0 --uid 0`)

	//syscmd(`lxc exec ${lxcContName} -- systemctl start openvpn-client@client`)

	console.log(syscmd(`lxc exec ${lxcContName} -- systemctl start openvpn-client@client`))
	//console.log('STATUS of openvpn-client on CONTAINER:\n',
	//			syscmd(`lxc exec ${lxcContName} -- systemctl status openvpn-client@client`))

}

async function browse(args) {
	let XServerXephyr=true
	if (args.indexOf('-nxephyr')>=0)
		XServerXephyr = false;
	
	let xephyrPassThruArgs=''
	if (args.indexOf('-xephyrargs')>=0){
		xephyrPassThruArgs = args[args.indexOf('-xephyrargs')+1]
	}

	let SCREENSIZE = 
		syscmd(`xdpyinfo | grep dimensions`).split(' ').find(w=>w.match(/^[\d]+x[\d]+$/));
	if (args.indexOf('-screen')>=0){	
		SCREENSIZE = args[args.indexOf('-screen')+1]
	} else {
		console.log(`detected host screensize of ${SCREENSIZE}`)
	}

	const setTimeoutPromise = util.promisify(setTimeout);
	var contip4 = getContainerIp4Address(lxcContName)
	if (XServerXephyr) {
		console.log(dropDownFixMsg)
		if (XServerXephyr_host0_cont1==0) {
			throw Error(
				`this combination of settings not currently implemented:
XServerXephyr==true  
XServerXephyr_manual==false  
XServerXephyr_host0_cont1==0`); 
		} else { // XServerXephyr_host0_cont1==1
			let rcmd = `
#Xephyr -ac -screen ${SCREENSIZE} -resizeable -br -reset -terminate -zap ${xephyrPassThruArgs} :2 &
Xephyr -ac -screen ${SCREENSIZE} -resizeable -br -zap ${xephyrPassThruArgs} :2 &
sleep 1
DISPLAY=:2 firefox &
sleep 3
DISPLAY=:2 xdotool search --onlyvisible --class Firefox windowsize 100% 100%
`
			
			console.log('starting firefox on Xephyr')
			syscmd(`ssh -Y -o UserKnownHostsFile=/dev/null -o StrictHostKeyChecking=no `
				   + `-i ${sshKeyFilename}  ubuntu@${contip4} /bin/bash "${rcmd}" &`)
			console.log('firefox on Xephyr finished')
			
			// let rcmd = `Xephyr -ac -screen ${SCREENSIZE} -br -terminate -reset :2 &`
			// syscmd(`ssh -Y ubuntu@${contip4} "${rcmd}"`);
			// console.log('Xephyr started')

			// rcmd = "DISPLAY=:2 firefox &"
			// syscmd(`ssh -Y ubuntu@${contip4} "${rcmd}"`);
			// console.log('firefox started')
		}
	} else {  // XServerXephyr == false 
		// from host ssh execute browser in linux container 
		// while serving X graphics through ssh from host.
		// Graphics are exactly the host graphics,
		// digital fingerprint graphic componeents will certainly be the same.
		syscmd(`ssh -Y -o UserKnownHostsFile=/dev/null -o StrictHostKeyChecking=no `
			   + `-i ${sshKeyFilename} ubuntu@${contip4} firefox &`)
		console.log('Firefox started')		
	}
}




function help(){


let usage=`
================
Usage:

 - node index.js init [-nufw] [-ntz]
   Initialize container
   -nufw: 
     Don't automatically add ufw rule.
   -ntz: 
     Don't use host /etc/timezone in container, the default is UTC.

 - node index.js browse [-nxephyr] [-xephyrargs <string of pass thru args>]
   Launch Firefox browser
   -nxephyr: 
     Don't use Xephyr on container, use host Xserver directly  
   -xephyrargs <string of pass thru args>]
     Pass string of args directly to invocation of Xephyr

 - node index.js ufwRule
   Print out what the ufw rule would be to allow container 'phone home' on init completion.

================
TL;DR
 - node index.js init [-nufw]
   - Intialiizes container. Only required once unless changing parameters.
     Container automatically runs upon host reboot. View with "lxc list".
   - "-nufw"
     use argument "-nufw" to suppress adding the ufw rule.  
     There is no harm in adding the rule again if it is already present.  
     Two reasons for not adding the rule - <br/>
     1.  ufw is not installed on the system <br/>
     2.  sudo requires a password <br/>
	 If the rule is not added, the user must ensure that the *phone home* action signaling the containers end of initialization is not blocked by a firewall.
   - "-ntz"
     use argument -ntz to prevent host '/etc/timezone' from being copied to container.  
     This will make UTC the container timezone.
     
 - node index.js browse [-nxephyr] [-screen <W>x<H>] [-xephyrargs <string of pass thru args>]
   - requires 
     1. That the container be in the running state.
	 2. That another Xephyr instance is not already running on the container.
   - "-nxephyr" 
   Used to run a browser in the container without Xephyr, instead running 
   directly on the host Xserver via an ssh pipe.  The browsers ip traffic will still be 
   routed through the VPN, but the host Xserver buffer content might be not as protected from 
   snooping, and the browser fingerprint will be more similar to that of a browser 
   running on the host.  Note that even when using Xephyr, Xephyr tranfers some X requests 
   through the ssh pipe, so some fingerprint similarities may exist anyway.
   - "-screen <W>x<H>"
     - default value: "1920x1200"
	 - specify the Xephyr screensize, e.g. "-screen 1280x800"
   - "-xephyrargs <pass thru args for Xephyr>"
     Used to pass a string of arguments to Xephyr.  Run "Xephyr --help" to see what is available.  
     The arguments
      "-ac -br -screen <screensize> -resizeable -reset -terminate -zap"
      are already hard coded   

   - NOTE1: The program will not exit until Xephyr and the browser are closed.
	 (Or in no-Xephyr mode, until the browser is closed).
	 You may run in the background with "node index.js browse &" to free up the terminal.

   - NOTE2: Keys to close Firefox '<ctrl>+<shift>+w' 

   - NOTE3: Keys to close Xephyr window '<ctrl>+<alt>+<backspace>' 

   - NOTE4: *Only when using Xephyr* - You may find that when clicking on firefox 
	 menu icon the menu doesn't drop down correctly.  To fix that try typing 'about:profiles' 
	 into the address bar, and then clicking on "Restart without addons".  
	 When Firefox reopens, the menu *might* work.  

   - NOTE5: VPN function can be confirmed by searching for "myip" with the browser
     The VPN address should appear. 

 - node index.js ufwRule
   - prints out the 'ufw' rule whill will be automatically added unless 
     the '-nufw' flag is used with 'init'.  
     The is helpful for checking address and subnet format and value, 
     and for adding a rule manually whenn necesary. 

`
	console.log(usage)
	
}

async function main(){
	//	console.log(process.argv.length)
	//	console.log(process.argv)
	if (process.argv.length < 3)
		help();
	else {
		switch (process.argv[2]){
		case 'init':
			await initialize(process.argv.slice(3))
			// continue to browse
		case 'browse':
			await browse(process.argv.slice(3));
			break;
		case 'ufwRule':
			console.log(makeUfwRule(getPhoneHomeInfo()));
			break;
		default: help();
		}
	}
}

main()
	.then(()=>{
		process.exitCode=0
		console.log("SUCCESS")
	})
	.catch(e => {
		process.exitCode=1
		console.log("FAIL",e)
	})	
	.finally(()=>{
		console.log("EXIT")
	})
