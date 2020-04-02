'strict'

const fs = require('fs')
const url = require('url')
const http = require('http')
const { parse } = require('querystring');
const yaml = require('js-yaml');

const { createProfile, syscmd, getContainerIp4AddressFromListJSON }
	  = require('./ffvpn-prof.js')



const sshKeyFilename = '/home/craig/.ssh/to-ffvpn'
const vpnClientCertFilename = '/home/craig/ffvpn-dev/ffvpn-client1.ovpn'
const lxcImageSrc = `ubuntu:18.04`
const lxcImageAlias = `ub18-im`
const lxcContName = `ub18-ffvpn`
const lxcCopyProfileName = 'default'
const lxcProfileName = 'ffvpn-prof'
const lxcContBridgeName = 'lxdbr0'
const phoneHomePort = 3000
const vpnClientKeySrcFilename = `/tmp/client.ovpn`
const contUsername = 'ubunutu'


// package_upgrade: true, ssha_authorized_keys: ...
// will be added internally
var cloudInitJSON = {
	"locale": "en_US.UTF-8", 
	"timezone": "America/Los_Angeles", 
	"packages": [
	 	"firefox", 
	 	"openvpn"
	], 
	"runcmd": [
		[
			"touch", 
			"/home/ubuntu/iwozere"
		]
	]
}

async function main(){
	// create an instance of a container from that image
	// check name already 
	var clist = JSON.parse(syscmd(`lxc list --format json`))
	//console.log(clist)
	for (c of clist) {
		if (c.name==lxcContName)
			//throw `container ${lxcContName} already exists`
			syscmd(`lxc delete --force ${lxcContName}`) 
		//console.log(c.name, ' !== ', lxcContName) 
	}
	
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
	let phoneHomeFromCDN = yaml.safeLoad(syscmd(`lxc network show ${lxcContBridgeName}`)).
		config['ipv4.address']
	let phoneHomeToAddr = phoneHomeFromCDN.split('/')[0]
	let phoneHomeURL = `http://${phoneHomeToAddr}:${phoneHomePort}`

	// the file containing the fix for openvpn-client to run in, and where it should go
	let overrideContFn = `/etc/systemd/system/openvpn-client\@.service.d/override.conf`
	
	// create profile
	await createProfile(
		lxcCopyProfileName,
		lxcProfileName,
		cloudInitJSON,
		`${sshKeyFilename}.pub`,
		phoneHomeURL,
		'[Service]\nLimitNPROC=infinity\n',
		overrideContFn
	)

	console.log("PROFILE done ...")
	
	// copy the lxc image (if already exists does not fail)
	if (JSON.parse(syscmd(`lxc image list ${lxcImageAlias} --format json`)).length==0) {
		syscmd(`lxc image copy ${lxcImageSrc} local: --alias ${lxcImageAlias}`)
	}
	console.log("IMAGE done ...")

	let ufwRuleCmd =
		`sudo ufw allow from ${phoneHomeFromCDN} to ${phoneHomeToAddr} ` 
		+ `port ${phoneHomePort} proto tcp`;
	console.log(`ADDING UFW RULE for phome_home:\n${ufwRuleCmd}`)
	console.log(syscmd(ufwRuleCmd))
	
	// set up receiver for cloud init phone home signalling cloud init end
	var promPhoneHome = waitPhoneHome(phoneHomeToAddr, phoneHomePort)

	// create the container with cloud init customization
	syscmd(`lxc launch ${lxcImageAlias} ${lxcContName} -p ${lxcProfileName}`)

	console.log("LAUNCH executed, waiting for phone home to signal cloud init finished ...")

	await promPhoneHome;

	// wait until cloud init has finished
	console.log("CONTAINER has finished cloud init")

	var contip4 = getContainerIp4AddressFromListJSON(
		JSON.parse(syscmd(`lxc list --format json`)), lxcContName
	)

	console.log("CONTAINER ip4 address is " + contip4)

	// copy the vpn client cert to container
	//  we didn't put cert in cloud-init for privacy's sake.
	syscmd(`lxc file push  ${vpnClientKeySrcFilename} ` + 
		   `${lxcContName}/etc/openvpn/client/client.conf --gid 0 --uid 0`)

	syscmd(`lxc exec ${lxcContName} -- systemctl start openvpn-client@client`)

	console.log(syscmd(`lxc exec ${lxcContName} -- systemctl start openvpn-client@client`))
	console.log('STATUS of openvpn-client on CONTAINER:\n',
		syscmd(`lxc exec ${lxcContName} -- systemctl status openvpn-client@client`))
	
		   
		   
		   
}


async function waitPhoneHome(phoneHomeToAddr, phoneHomePort){
	return new Promise( (resolve, reject) => {

		function collectRequestData(request, callback) {
			const FORM_URLENCODED = 'application/x-www-form-urlencoded';
			if(request.headers['content-type'] === FORM_URLENCODED) {
				let body = '';
				request.on('data', chunk => {
					body += chunk.toString();
				});
				request.on('end', () => {
					callback(parse(body));
				});
			}
			else {
				callback(null);
			}
		}		
		///var server=null;
		const requestHandler = (request, response) => {
			//console.log(request.method)
			if (request.method === 'POST') {
				collectRequestData(request, result => {
					//console.log("phone_home result:\n:", result);
					console.log("phone_home signal received");
					response.end();
					server.close();
					resolve(result);
				})
			}
        }
		
		const server = http.createServer(requestHandler)

		server.listen(phoneHomePort, phoneHomeToAddr, (err) => {
			if (err) {
				reject('waitPhoneHome server.listen callback, ERROR:\n' + err)
			}
			//console.log(`waitPhoneHome server.listen callback, not error but unexpected`)
		})
	})
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
