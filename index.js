'strict'
const { /*execSync,*/ exec, spawn } = require('child_process')
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


// Obviated by using openbox window manager
// const dropDownFixMsg = 
// 	  `#### NOTE! ####
// You may find that when clicking on firefox menu icon the menu doesn't appear correctly.
// To fix that try typing 'about:profiles' into the address bar, and then clicking on
// "Restart without addons".  When Firefox reopens, the menu *might* work.
// `




// package_upgrade: true, ssha_authorized_keys, timezone
// will be added internally
var cloudInitJSON = {
	//	"locale": "en_US.UTF-8", 
	"locale": process.env.LANG, 
	"packages": [
		"python3-dev", "jupyter"
	 	// "firefox", 
		// "pulseaudio",
		// "xsel",
		// "openbox",
	 	// "openvpn",
		// "xdotool", // necessary only when XServerXephyr will be 'true' at browse time. 
		// "xserver-xephyr"
	],
	"runcmd": [
	]
}

function getNetworkInfo(){
	let networkFromCDN = yaml.safeLoad(syscmd(`lxc network show ${lxcContBridgeName}`)).
		config['ipv4.address']
	let networkToAddr = networkFromCDN.split('/')[0]
	return {
		fromCDN:networkFromCDN,
		toAddr:networkToAddr
	}
}

function makeUfwRule(networkInfo){
	let ret = 
		`sudo ufw allow from ${networkInfo.fromCDN} to ${networkInfo.toAddr} ` 
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

	// let xServerXephyr=true
	// if (args.indexOf('-nxephyr')>=0)
	// 	xServerXephyr = false;
	
	let openVPN=false
	if (args.indexOf('-openvpn')>=0)
	 	openVPN = true;

	// if (xServerXephyr) {
	// 	cloudInitJSON.packages.push("xdotool");
	// 	cloudInitJSON.packages.push("xserver-xephyr");
	// }
	// if (openVPN) {
	// 	cloudInitJSON.packages.push("openvpn");
	// }

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

	networkInfo = getNetworkInfo();

	// the file containing the fix for openvpn-client to run in, and where it should go
	let overrideContFn = `/etc/systemd/system/openvpn-client\@.service.d/override.conf`

	// create profile
	await createProfile(
		lxcCopyProfileName,
		lxcProfileName,
		cloudInitJSON,
		`${sshKeyFilename}.pub`,
		networkInfo, phoneHomePort,
		noCopyHostTimezone,
		openVPN,
		'[Service]\nLimitNPROC=infinity\n',
		overrideContFn,
	)

	console.log("PROFILE done ...")

	// copy the lxc image (if already exists does not fail)
	if (JSON.parse(syscmd(`lxc image list ${lxcImageAlias} --format json`)).length==0) {
		syscmd(`lxc image copy ${lxcImageSrc} local: --alias ${lxcImageAlias}`)
	}
	console.log("IMAGE done ...")

	if (doUfwRule){
		//console.log(phoneHomeInfo)
		//console.log('DEBUG: ',makeUfwRule(networkInfo))
		let ufwRuleCmd = makeUfwRule(networkInfo)
		console.log(`ADDING UFW RULE for phome_home:\n${ufwRuleCmd}`)
		console.log(syscmd(ufwRuleCmd))
	}
	
	// set up receiver for cloud init phone home signalling cloud init end
	var promPhoneHome = waitPhoneHome(networkInfo.toAddr, phoneHomePort)

	// create the container with cloud init customization
	syscmd(`lxc launch ${lxcImageAlias} ${lxcContName} -p ${lxcProfileName}`)

	console.log("LAUNCH executed, waiting for phone home to signal cloud init finished ...")

	await promPhoneHome;

	// wait until cloud init has finished
	console.log("CONTAINER has finished cloud init")

	var contip4 = getContainerIp4Address(lxcContName)

	console.log("CONTAINER ip4 address is " + contip4)

	if (openVPN) {
		// Copy the vpn client cert to container.
		// For privacy's sake we didn't put cert in cloud-init data.
		syscmd(`lxc file push  ${vpnClientCertFilename} ` + 
			   `${lxcContName}/etc/openvpn/client/client.conf --gid 0 --uid 0`)

		console.log(syscmd(`lxc exec ${lxcContName} -- systemctl start openvpn-client@client`))
	}

}

async function rsyscmd(cmd, contip4) {
	let proc = spawn(
		"ssh",
		[
			"-o", "UserKnownHostsFile=/dev/null",
			"-o", "StrictHostKeyChecking=no",
			"-L", "5678:localhost:5678", 
			"-i", `${sshKeyFilename}`, `ubuntu@${contip4}`,
			`${cmd}`
		]
	);
	proc.stdout.on('data', (data) => {
		console.log(`stdout: ${data}`);
	});

	proc.stderr.on('data', (data) => {
		console.error(`stderr: ${data}`);
	});

	proc.on('close', (code) => {
		console.log(`CLOSE event with code=${code}`);
		if (code==0)
			return 0;
		else
			throw `error ${code} remote command: ${cmd}`
	});
}

var test_start = 0
var test_end = 999
async function test() {
	// setup coomands to be run as user
	let contip4 = getContainerIp4Address(lxcContName)
	let rcmds = [
//		`"echo \\"export PATH=/home/ubuntu/.local/bin:\\$PATH\\" > ./pathfix "`,
//		`"echo \\"source ./pathfix\\" >> ./.bashrc "`, 
		"env | grep -e PATH -e ENV -e BASH",
		`\
if ! [[ -f get-pip.py ]] ; then \
	wget https://bootstrap.pypa.io/get-pip.py &&\
	sudo python3 get-pip.py ;\
fi`,
		"pip install jupyterlab",
		"pip install jupyter_http_over_ws",
		"jupyter serverextension enable --py jupyter_http_over_ws",
		"pip install matplotlib",
		"pip install setuptools --upgrade",
		"pip install tensorflow",
		"sudo ln -s /usr/bin/python3 /usr/bin/python",
	];
	let i=0
	for (const rc of rcmds) {
		if (i<test_start)
			continue;
		if (i>=test_end)
			break;
		i++;
		let c= 	`ssh  -o UserKnownHostsFile=/dev/null -o StrictHostKeyChecking=no `
			+ `-i ${sshKeyFilename}   ubuntu@${contip4} `
		+ `bash --login -c '"${rc}"'`;
		console.log(rc)
		console.log(c)
		console.log(syscmd(c))
	}
}

async function serve(args) {
	var contip4 = getContainerIp4Address(lxcContName)
	var jupstr = `PATH=$PATH:$HOME/.local/bin /usr/bin/jupyter notebook --NotebookApp.allow_origin='https://colab.research.google.com' `
		+ '--port 5678 --NotebookApp.port_retries=0 --no-browser --debug';
	// 	var cmdstr = `ssh -o UserKnownHostsFile=/dev/null -o StrictHostKeyChecking=no `
	// 		+ `-f -L 8765:localhost:5678 ` 
	// 		+ `-i ${sshKeyFilename} ubuntu@${contip4} `
	// 		+  `"${jupstr}"`;
	var proc=null;
	await new Promise((resolve, reject)=>{
		proc = spawn(
			"ssh",
			[
				"-o", "UserKnownHostsFile=/dev/null",
				"-o", "StrictHostKeyChecking=no",
				"-L", "5678:localhost:5678", 
				"-i", `${sshKeyFilename}`, `ubuntu@${contip4}`,
				`${jupstr}`
			]
		);
		
		proc.stdout.on('data', (data) => {
			console.log(`JUP[1]:${data}`);
		});

		proc.stderr.on('data', (data) => {
			console.error(`JUP[2]: ${data}`);
		});

		proc.on('close', (code) => {
			console.log(`child process exited with code ${code}, but server may be still running`);
			if (code==0)
				resolve(0);
			else
				reject(code)
		});
		proc.on('disconnect', () => {
			// nope
			console.log(`DISCONNECT - child process notified that parent process is exiting`);
			proc.exit(0);
		});
		proc.on('SIGTERM', () => {
			// nope 
			console.log(`SIGTERM - child process notified that parent process is exiting`);
			proc.exit(0);
		});
		proc.on('SIGINT', () => {
			// nope
			console.log(`SIGINT - child process notified that parent process is exiting`);
			proc.exit(0);
		});
		
	})

	console.log(syscmd( `ssh -o UserKnownHostsFile=/dev/null -o StrictHostKeyChecking=no `
						+ `-i ${sshKeyFilename} ubuntu@${contip4} `
						+  `"jupyter notebook stop 5678"`))
		
	//console.log('Jupyter server closed')		
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

	configPulseAudioOnHost();
	
	const setTimeoutPromise = util.promisify(setTimeout);
	var contip4 = getContainerIp4Address(lxcContName)
	if (XServerXephyr) {
//		console.log(dropDownFixMsg)
		let rcmd = `
Xephyr -ac -screen ${SCREENSIZE} -resizeable -br -zap ${xephyrPassThruArgs} :2 &
sleep 1
DISPLAY=:2 openbox &
DISPLAY=:2 PULSE_SERVER=tcp:localhost:44713 firefox &
#sleep 3
#DISPLAY=:2 xdotool search --onlyvisible --class Firefox windowsize 100% 100%
`			
		console.log('starting firefox on Xephyr')
		syscmd(`ssh -Y -o UserKnownHostsFile=/dev/null -o StrictHostKeyChecking=no `
			   + `-R 44713:localhost:4713 `
			   + `-i ${sshKeyFilename}  ubuntu@${contip4} /bin/bash "${rcmd}" &`)
		console.log('firefox on Xephyr finished')
		
	} else {  // XServerXephyr == false 
		syscmd(`ssh -Y -o UserKnownHostsFile=/dev/null -o StrictHostKeyChecking=no `
			   + `-R 44713:localhost:4713 `
			   + `-i ${sshKeyFilename} ubuntu@${contip4} `
			   +  `PULSE_SERVER=tcp:localhost:44713 firefox &`)
		console.log('Firefox started (no Xephyr)')		
	}
}

function configPulseAudioOnHost() {
	//set pulseaudio to accept audio from host
	let networkInfo = getNetworkInfo()

	// audio on host side
	// create a new ~/.config/pulse/default.pa file
	let defPa = fs.readFileSync(`/etc/pulse/default.pa`)
	defPa = defPa + 
		`load-module module-native-protocol-tcp `
		+ `port=4713 auth-ip-acl=127.0.0.1`
		+ `\n`
	;
	fs.mkdirSync(`/home/${process.env.USER}/.config/pulse`, { recursive: true });
	fs.writeFileSync( `/home/${process.env.USER}/.config/pulse/default.pa`, defPa)
	// kill pulseaudio, it will load the new config and self reboot
	syscmd(`pulseaudio --kill`)
}


function notify_send(title, msg){
	title = title.replace(/"/g, '\\"');
	msg = msg.replace(/"/g, '\\"');
	//msg = msg.replace(/'/g, '\\'')
	syscmd(`notify-send "${title}" "${msg}"`);
}

async function clipToCont(){
	var contip4 = getContainerIp4Address(lxcContName)
	var clipValue
	try {
		clipValue = syscmd('xsel --clipboard --output');
	} catch(e) {
		throw 'host clipboard empty';
	}
	let cmd2 = `ssh -o UserKnownHostsFile=/dev/null -o StrictHostKeyChecking=no  ubuntu@${contip4} 'xsel --clipboard --input --display :2'`;
	await new Promise((resolve, reject)=>{		
		var proc = exec(cmd2, (error, stdout, stderr) => {
			if (error) {
				reject(error);
			}
			resolve()
		});
		if (!proc.stdin.write(clipValue))
			reject('pipe write failed')
		proc.stdin.end()
	})					 
}

async function clipFromCont(){
	var contip4 = getContainerIp4Address(lxcContName)
	var clipValue
	let cmd1 = `ssh -o UserKnownHostsFile=/dev/null -o StrictHostKeyChecking=no  ubuntu@${contip4} 'xsel --clipboard --output --display :2'`;
	let cmd2 = `xsel --clipboard --input`;
	let clipVal = syscmd(cmd1)
	await new Promise((resolve, reject)=>{
		var proc = exec(cmd2, (error, stdout, stderr) => {
			if (error) {
				reject(error);
			}
			resolve()
		});
		if (true) {
			if (!proc.stdin.write(clipVal))
				reject('pipe write failed')
			proc.stdin.end()
		}
	})	
}

async function clipNotify(to0from1){
	let f = to0from1 ? clipFromCont : clipToCont;
	let n = to0from1 ? "clipFromCont" : "clipToCont";
	let err;
	await f()
		.then(()=>{
			notify_send(n + ": SUCCESS", "")
		})
		.catch((e)=>{
			notify_send(n +  ": FAIL", e.toString())
			err=e
		})
	if (err) throw err;
}			  

function help(){


let usage=`
================
Usage:

 - node index.js init [-nufw] [-ntz] [-screen]
   Initialize container.  When done, browser will appear automatically, with Xephyr.
   -nufw: 
     Don't automatically add ufw rule required for container init-completion phone-home signal.
     Use when ufw is not the host firewall, or when sudo requires a password. 
   -ntz: 
     Don't use host /etc/timezone in container, the default is UTC.
   -nxephyr: 
     Don't install xephyr package.    
   -openvpn 
     Install openvpn package and set up as client with key found at XXXX

 - node index.js browse [-nxephyr] [-xephyrargs <string of pass thru args>]
   Launch Firefox browser
   -nxephyr: 
     Don't use Xephyr on container, host Xserver directly  
   -xephyrargs <string of pass thru args>]
     Pass string of args directly to invocation of Xephyr
   -screen <W>x<H>
       Initial size of Xephyr screen. Default is taken from host screen size.

 - node index.js ufwRule
   Print out what the ufw rule would be to allow container 'phone-home' on init-completion.

 - node index.js clip-to-cont
   Copy the content from the host clipboard to the container clipboard.
   It is expected this call would be mapped to a shortcut key.
   Only necessary when using Xephyr.

 - node index.js clip-from-cont
   Copy the content from the container clipboard to the host clipboard. 
   It is expected this call would be mapped to a shortcut key.
   Only necessary when using Xephyr.
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
			break;
		case 'test':
			await test()
			break;
		case 'serve':
			await serve(process.argv.slice(3));
			break;
		case 'browse':
			await browse(process.argv.slice(3));
			break;
		case 'ufwRule':
			console.log(makeUfwRule(getNetworkInfo()));
			break;
			// case 'test':
			// 	configPulseAudioOnHost();
			// 	break;
		case 'clip-to-cont':
			await clipNotify(0);
			break;
		case 'clip-from-cont':
			await clipNotify(1);
			break;
		default: help();
		}
	}
}

process
	.on('SIGTERM', () => {
		console.log(`SIGTERM received`);
		//proc.exit(0);
	})
	.on('SIGINT', () => {
		console.log(`SIGINT received`);
		//proc.exit(0);
	})
;


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
