'strict'

const util = require('util')
const { execSync, exec } = require('child_process')
//exec = util.promisify(exec)
const fs = require('fs')
const yaml = require('js-yaml');


function syscmd(cmd) {
	var so=''
	try {
		so = execSync(cmd, { encoding: 'utf-8' })
		//  console.log("SUCCESS")
		return so
	} catch (e) {
		console.log('command fail:\n', cmd)
		console.log('command output:\n', so)
		console.log('command error:\n', e)
		throw e
	}
}


function getContainerIp4AddressFromListJSON(json,name){
	// var aa = json.find(c=>c.name==name).state.network.eth0.addresses
	// for (a of aa)
	// 	console.log(a)
	return json.find(c=>c.name==name)
		.state.network.eth0.addresses.find(a=>a.family=='inet')
		.address
}
	

async function createProfile(
	copyProfileName,
	profileName,
	cloudInitJSON,
	authorizedPubKeyFilename,
	phoneHomeURL,
	overrideFileContent, overrideContFilename
) {

	// embed ssh public key which will be used to send into the ffvpn container
	cloudInitJSON.ssh_authorized_keys= [
		fs.readFileSync(authorizedPubKeyFilename, "utf8")
	]
	cloudInitJSON.package_upgrade = true
	cloudInitJSON.phone_home = {
	 	"url": phoneHomeURL,
	 	"post": "all",
	 	"tries": 10
	}
	cloudInitJSON.write_files = [
		{
			"content": overrideFileContent,
			"path":overrideContFilename,
			"permissions":'0644'
		}
	]
	

	// convert the cloud init instructions to yaml format, which is a string.
	var cldinit_yml = yaml.safeDump(cloudInitJSON)
	// CRITICAL!!!! The first line of the yaml must be "#cloud-config"
	// It's not just a pretty comment!
	cldinit_yml = "#cloud-config\n" + cldinit_yml
	//console.log(cldinit_yml)

	// check if new profile name already exist and delete it if so.
	var profs = syscmd('lxc profile list --format yaml')
	profs = yaml.safeLoad(profs)
	for (p of profs) {
		//console.log(p)
		//console.log(p.name)
		if (p.name == profileName) 
			syscmd('lxc profile delete ' + profileName)
	}
	
	// create the new profile as a copy of the default profile
	syscmd('lxc profile copy default ' + profileName)
	var prof_ffvpn_yml=syscmd('lxc profile show '+ profileName)
	var prof_ffvpn_json = yaml.safeLoad(prof_ffvpn_yml)

	// the cloud init data is added as a string of yaml to json, confusing but true.
	// So when the whole is converted to yaml cloudinit should be a string, not yaml
	prof_ffvpn_json["config"]["user.user-data"]=cldinit_yml

	prof_ffvpn_json.description = "profile for ffvpn project"

	//console.log("after assignment of cloud init data\n", JSON.stringify(prof_ffvpn_json))

	// now we write it back out as a new lxc profile using the lxc edit call

	await new Promise((resolve, reject)=>{
		
		var proc = exec('lxc profile edit ' + profileName, (error, stdout, stderr) => {
			if (error) {
				reject(`edit error: ${error}`)
			}
			//console.log(`edit success, stdout:\n ${stdout}`);
			//console.log(syscmd('lxc profile show ' + profileName))
			//  console.error(`stderr: ${stderr}`);
			resolve()
		});

		// write the profile data to stdin
		if (!proc.stdin.write(JSON.stringify(prof_ffvpn_json)))
			reject('edit error, stdin write failed')
		proc.stdin.end()
	})					 
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

exports.createProfile =  createProfile
exports.syscmd = syscmd
exports.getContainerIp4AddressFromListJSON = getContainerIp4AddressFromListJSON
