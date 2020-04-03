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
//const vpnClientKeySrcFilename = `/tmp/client.ovpn`
const contUsername = 'ubunutu'
//const SCREENSIZE = '1280x800'
//const SCREENSIZE = '1920x1200'
//const SCREENSIZE = '2020x1300'

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
		overrideContFn
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

	if args.indexOf('-screen')>=0){
		SCREENSIZE = args[args.indexOf('-screen')+1]
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
Xephyr -ac -screen ${SCREENSIZE} -resizeable -br -reset -terminate -zap ${xephyrPassThruArgs} :2 &
sleep 1
DISPLAY=:2 firefox &
sleep 3
DISPLAY=:2 xdotool search --onlyvisible --class Firefox windowsize 95% 95%
`
			
			console.log('starting firefox on Xephyr')
			syscmd(`ssh -Y -o UserKnownHostsFile=/dev/null -o StrictHostKeyChecking=no`
				   + ` ubuntu@${contip4} /bin/bash "${rcmd}" &`)
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
		syscmd(`ssh -Y -o UserKnownHostsFile=/dev/null -o StrictHostKeyChecking=no`
			   + ` ubuntu@${contip4} firefox &`)
		console.log('Firefox started')		
	}
}




function help(){
	console.log(`usage: 
  node index.js init [-nufw]
     -intialiize container
  node index.js browse [-nxephyr] [-xephyrargs <string>]
    - restart a stopped container and start browser
    - NOTE: program will not exit until browser or Xephyr/browser are closed.
      You may run in background "node iundex.js browse &" to free up terminal.
  node index.js ufwRule
    - Show the ufw rule command that would be written - for your information.  

${dropDownFixMsg}
`)
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
