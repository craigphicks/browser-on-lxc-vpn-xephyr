'strict';
const assert = require('assert').strict;
//const util = require('util');
const { execSync, exec, spawn } = require('child_process');
//exec = util.promisify(exec)
const fs = require('fs');
//const url = require('url');
const yaml = require('js-yaml');
const http = require('http');
const { parse } = require('querystring');
const events = require('events'); 
const stream = require(`stream`);

class sshCmdAsync_opts {
  constructor(){
    this.ssh="ssh";
    this.addSshArgs=[];
    this.stdin={
      isFilename:false,
      text:""
    };
    this.stdout=null;
    this.stderr=null;
  }
  addSshArg(arg){
    this.addSshArgs=this.addSshArgs.append(arg);
  }
  addLPipe(localPort, remotePort){
    this.addSshArgs=this.addSshArgs.concat(
      ['-L', `${localPort}:localhost:${remotePort}`]);
  }
  addRPipe(remotePort, localPort){
    this.addSshArgs=this.addSshArgs.concat(
      ['-R', `${remotePort}:localhost:${localPort}`]);
  }
  setStdinToText(text){
    this.stdin.isFilename=false;
    this.stdin.text=text;
  }
  setStdinToFile(fn){
    this.stdin.isFilename=true;
    this.stdin.text=fn;
  }
  setStdoutToParent(){
    //this.stdout='inherit';
    this.stdout='stdout';
  }
  setStderrToParent(){
    this.stderr='stderr';
  }
}

async function onExitOrError(proc){
  proc.once('exit', (code, signal) => {
    if (code === 0) {
      return;
    } else {
      throw new Error(`(onExitOrError) error code [${code}], signal [${signal}]`);
    }
  });
  proc.once('error', (e) => {
    proc.removeAllListeners(['exit']);
    throw new Error(`(onExitOrError) error [${e}]`);
  });
}

async function readUntilClose(source, func){
  source.on('data', (data)=> {
    func(data.toString('utf8'));
  });
  await new Promise((resolve)=>{
    source.on('close', ()=>{
      source.removeAllListeners(['data']);
      resolve();
    });
  });
}

async function sshCmdAsync(prms, contip, opts=sshCmdAsync_opts){ 
  //const addPath = 'export PATH="$HOME/.local/bin:$PATH"\n'
  function *genLines(text) {
    let lines = text.split(/\r\n|\r|\n/); // handles windows, old macs, linux/new macs EOLs
    for (const line of lines)
      yield line;
    return;
  }
  const stdArgs = [
    "-o", "UserKnownHostsFile=/dev/null",
    "-o", "StrictHostKeyChecking=no",
    "-i", `${prms.sshKeyFilename}`, `${prms.contUsername}@${contip}`,
    //"-T", 
    //"bash", "-s"
    //"cat"
  ];
  
  let readable=null;
  if (opts.stdin.text){
    if (opts.stdin.isFilename){
      readable = fs.createReadStream(opts.stdin.text,'utf8');
      // spawn requires the file be read-ready or it will fail so ... 
      await events.once(readable,'readable'); 
    } else {
      var g =  genLines(opts.stdin.text);
      readable = new stream.Readable({
        object:true,
        encoding:'utf8',
        //detached:true,
        autoDestroy : true,
        read() { 
          let next = g.next();
          if (next.done)
            this.push(null);
          else
            this.push(next.value+'\n');
        }
      });
      //readable.push(opts.stdin.text); // should it be done line by line?
      //console.log('TEST: ', readable.read()); // just a test
    }
  }
  
  let prog = opts.ssh || "ssh";
  let args = [];
  if (opts.addSshArgs && opts.addSshArgs.length)
    args = opts.addSshArgs;
  args = args.concat(stdArgs);
  //let cmdstr = [prog].concat(args).join(' ');
  console.log(prog,' ',args.join(' '));
  let proc = spawn(
    prog, args,
    {
      stdio: [
        readable?'pipe':'ignore', 
        opts.stdout?'pipe':'ignore', // 'inherit' not working
        opts.stderr?'pipe':'ignore'  // 'inherit' not working
      ]
    }
  );

  if (readable)
    readable.pipe(proc.stdin);
  let stdoutp=null,stderrp=null;
  if (opts.stdout)
    stdoutp=readUntilClose(proc.stdout, process.stdout.write.bind(process.stdout));
  if (opts.stderr)
    stderrp=readUntilClose(proc.stderr, process.stderr.write.bind(process.stderr));   
  let endp = await onExitOrError(proc);

  await Promise.all([stdoutp,stderrp,endp]);

  // await new Promise((resolve)=>{
  //   process.stdout.write('STDOUT\n',()=>{ resolve(); });
  // });
  // await new Promise((resolve)=>{
  //   process.stderr.write('STDERR\n',()=>{ resolve(); });
  // });
  //process.stderr.flush()
}

async function runPostInitScript(name,params) {
  const contip = getContainerIp4Address(name);
  let opts = new sshCmdAsync_opts();
  opts.setStdinToText(`touch ~/.hushlogin`);
  //opts.setStdoutToParent();
  //opts.setStderrToParent();
  await sshCmdAsync(params, contip, opts);  
}
async function runServe(name,params,serveIdx=0) {
  const contip = getContainerIp4Address(name);
  let opts = new sshCmdAsync_opts();
  await sshCmdAsync(params, contip, opts);
}
async function runTestServe(name,params) {
  const contip = getContainerIp4Address(name);
  let opts = new sshCmdAsync_opts();
  opts.setStdinToText(`\
export PATH=$HOME/.local/bin:$PATH
echo $PATH
echo this is from stdout >&1
echo this is from stderr >&2
`);
  //opts.addRPipe(3001,4001);
  opts.setStdoutToParent();
  opts.setStderrToParent();
  await sshCmdAsync(params, contip, opts);
}



function syscmd(cmd) {
  var so='';
  try {
    so = execSync(cmd, { encoding: 'utf-8' });
    //  console.log("SUCCESS")
    return so;
  } catch (e) {
    console.log('command fail:\n', cmd);
    console.log('command output:\n', so);
    console.log('command error:\n', e);
    throw e;
  }
}
// function syscmdAsync(cmd) {
  
//   return new Promise((resolve, reject)=>{
//     let cmda = cmd.split(/\s*\s/);
//     let proc = spawn(cmda[0], cmda.slice(1));
//     let outstr = "";
//     let errstr = "";
//     proc.stdout.on('data', (data) => {
//       outstr += `${data}\n`;
//     });
    
//     proc.stderr.on('data', (data) => {
//       errstr += `${data}\n`;
//     });
    
//     proc.on('close', (code) => {
//       console.log(
//         `${cmd} exited with code ${code}, but might have been forked/spawned, etc.`);
//       if (code==0)
//         resolve(outstr);
//       else
//         reject(errstr);
//     });	
//   });
// }
  


function DefaultParams(name,tz) { 
  return {
    sshKeyFilename : `/home/${process.env.USER}/.ssh/to-${name}`,
    openVPN : {
      enable:false,
      vpnClientCertFilename : `/home/${process.env.USER}/client-${name}.ovpn`
    },
    lxcImageSrc : `ubuntu:18.04`,
    contUsername : 'ubuntu',
    lxcImageAlias : `ub18-im`,
    lxcCopyProfileName : 'default',
    lxcContBridgeName : 'lxdbr0',
    phoneHome : {
      autoLXCBridge: true,
      ufwRule : {
        enable: true,
      },
      port:3000
    },
    postInitScript : {
      addSshArgs : [],
      stdin : {
        isFilename: false,
        text : ""
      }
    },
    serveScripts :[
      {
        addSshArgs : [],
        stdin : {
          isFilename: false,
          text : ""
        },
        stdOutToConsole:false,
        stdErrToConsole:false
      }
    ],
    cloudInit : { 
      timezone: tz,
      locale: process.env.LANG, 
      packages : [],
      runcmd : [
      ],
    },
  };
}

function DefaultSettingsContent() {
  let tz="";
  try { 
    tz = fs.readFileSync(`/etc/timezone`,'utf8');
    tz = tz.slice(0,-1); // gte rid of EOL
  } catch (e) {
    console.log(`WARNING: couldn't read user timezone, ${e}`);
  }  
  let settings = {
    "dflt" : DefaultParams("dflt",tz)
  };
  return settings;	
}

function writeDefaultSettingFile(fn){
  let yml = yaml.safeDump(DefaultSettingsContent());
  fs.writeFileSync(fn, yml, 'utf8');
}

function readSettingFile(fn){
  let yml = fs.readFileSync(fn, 'utf8');
  return yaml.safeLoad(yml);
}

function getNetworkInfo(prms){
  let networkFromCDN = yaml.safeLoad(syscmd(
    `lxc network show ${prms.lxcContBridgeName}`)).
    config['ipv4.address'];
  let networkToAddr = networkFromCDN.split('/')[0];
  return {
    fromCDN:networkFromCDN,
    toAddr:networkToAddr
  };
}

function makeUfwRule(params, networkInfo){
  let ret = 
    `sudo ufw allow from ${networkInfo.fromCDN} to ${networkInfo.toAddr} ` 
    + `port ${params.phoneHome.port} proto tcp`;
  return ret;
}



function getContainerIp4Address(lxcContName){
  return JSON.parse(syscmd(`lxc list --format json`))
    .find(c=>c.name==lxcContName)
    .state.network.eth0.addresses
    .find(a=>a.family=='inet')
    .address;
}


//   let overrideContFn = `/etc/systemd/system/openvpn-client@.service.d/override.conf`;
//   let lxcProfileName = `${lxcContName}-prof`;
//   // create profile
//   await createProfile(
//     lxcProfileName, params,
//     networkInfo, 
// //    openVPN,
// //    '[Service]\nLimitNPROC=infinity\n', // openvpn related


async function createProfile(profileName, params, networkInfo){


  // deep copy of the read-in parameters
  var cloudInitJSON = JSON.parse(JSON.stringify(params.cloudInit));

  // Embed ssh public key which will be used to send into the ffvpn container.
  // It will go the default users ~/.ssh directory
  cloudInitJSON.ssh_authorized_keys= [
    fs.readFileSync(params.sshKeyFilename+".pub", "utf8")
  ];
  cloudInitJSON.package_upgrade = true;

  // phone home is eesential to program operation,
  // and currently it is assumed that container is on local lxcBridge
  assert(params.phoneHome.autoLXCBridge,"case not implemented"); 
  cloudInitJSON.phone_home = {
    "url": `http://${networkInfo.toAddr}:${params.phoneHome.port}`,
    "post": "all",
    "tries": 10
  };

  if (params.openVPN.enable) {
    const overrideFileContent = '[Service]\nLimitNPROC=infinity\n'; 
    const overrideContFilename = `/etc/systemd/system/openvpn-client@.service.d/override.conf`; 
    cloudInitJSON.write_files = [
      { // for lxd - openvpn compatibility bug fix
        "content": overrideFileContent,
        "path":overrideContFilename,
        "permissions":'0644'
      }
    ];
    cloudInitJSON.packages.push("openvpn");
  }

  // convert the cloud init instructions to yaml format, which is a string.
  var cldinit_yml = yaml.safeDump(cloudInitJSON);
  // CRITICAL!!!! The first line of the yaml must be "#cloud-config"
  // It's not just a pretty comment!
  cldinit_yml = "#cloud-config\n" + cldinit_yml;
  //console.log(cldinit_yml)

  // check if new profile name already exist and delete it if so.
  var profs = syscmd('lxc profile list --format yaml');
  profs = yaml.safeLoad(profs);
  for (const p of profs) {
    //console.log(p)
    //console.log(p.name)
    if (p.name == profileName) 
      syscmd('lxc profile delete ' + profileName);
  }
  
  // create the new profile as a copy of the default profile
  syscmd('lxc profile copy default ' + profileName);
  var prof_ffvpn_yml=syscmd('lxc profile show '+ profileName);
  var prof_ffvpn_json = yaml.safeLoad(prof_ffvpn_yml);

  // the cloud init data is added as a string of yaml to json, confusing but true.
  // So when the whole is converted to yaml cloudinit should be a string, not yaml
  prof_ffvpn_json["config"]["user.user-data"]=cldinit_yml;

  prof_ffvpn_json.description = "profile for ffvpn project";

  // now we write it back out as a new lxc profile using the lxc edit call
  await new Promise((resolve, reject)=>{
    
    // eslint-disable-next-line no-unused-vars
    var proc = exec('lxc profile edit ' + profileName, (error, stdout, stderr) => {
      if (error) {
        reject(`edit error: ${error}`);
      }
      //console.log(`edit success, stdout:\n ${stdout}`);
      //console.log(syscmd('lxc profile show ' + profileName))
      //  console.error(`stderr: ${stderr}`);
      resolve();
    });

    // write the profile data to stdin
    if (!proc.stdin.write(JSON.stringify(prof_ffvpn_json)))
      reject('edit error, stdin write failed');
    proc.stdin.end();
  });					 
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
        });
      }
    };
    
    const server = http.createServer(requestHandler);

    server.listen(phoneHomePort, phoneHomeToAddr, (err) => {
      if (err) {
        reject('waitPhoneHome server.listen callback, ERROR:\n' + err);
      }
      //console.log(`waitPhoneHome server.listen callback, not error but unexpected`)
    });
  });
}

/////////////////////////////////////////////////////////////
// Parameters:
//const timezone = ""
//const sshKeyFilename = `/home/${process.env.USER}/.ssh/to-ffvpn`
//const vpnClientCertFilename = `/home/${process.env.USER}/ffvpn-client.ovpn`
//const lxcImageSrc = `ubuntu:18.04`
//const lxcImageAlias = `ub18-im`
//const lxcContName = `ub18-ffvpn`
//var lxcContName = `myCont`
//const lxcCopyProfileName = 'default'
//const lxcProfileName = 'ffvpn-prof'
//const lxcContBridgeName = 'lxdbr0'
//const phoneHomePort = 3000
// end of Parameters
//////////////////////////////////////////



// var params = (()=>{
//   let p={};
//   p.timezone = "";
//   p.sshKeyFilename = `/home/${process.env.USER}/.ssh/to-ffvpn`;
//   p.vpnClientCertFilename = `/home/${process.env.USER}/ffvpn-client.ovpn`;
//   p.lxcImageSrc = `ubuntu:18.04`;
//   p.contUsername = 'ubuntu';
//   p.lxcImageAlias = `ub18-im`;
//   p.lxcCopyProfileName = 'default';
//   p.lxcContBridgeName = 'lxdbr0';
//   p.phoneHomePort = 3000;
//   p.initScript = {
//     filename : "",
//     text: ""
//   };
//   p.serveScript = {
//     addSshArgs : [],
//     filename : "",
//     text: ""
//   };
//   return p;
// })();

async function initialize(lxcContName, params, args) {
    
  //let output = await syscmdAsync('echo $PATH');
  //console.log(output);
  // let xServerXephyr=true
  // if (args.indexOf('-nxephyr')>=0)
  // 	xServerXephyr = false;
  

  // if (xServerXephyr) {
  // 	cloudInitJSON.packages.push("xdotool");
  // 	cloudInitJSON.packages.push("xserver-xephyr");
  // }

  // if name exists delete it
  //console.log(syscmd(`lxc list --format json`));
  let clist = JSON.parse(syscmd(`lxc list --format json`));
  if (clist.find(c=>c.name==lxcContName))
    syscmd(`lxc delete --force ${lxcContName}`); 

  // create key
  if (!(fs.existsSync(`${params.sshKeyFilename}.pub`) &&
      fs.existsSync(`${params.sshKeyFilename}`))) {
    if (fs.existsSync(`${params.sshKeyFilename}.pub`))
      fs.unlinkSync(`${params.sshKeyFilename}.pub`);
    if (fs.existsSync(`${params.sshKeyFilename}`))
      fs.unlinkSync(`${params.sshKeyFilename}`);
    syscmd(`ssh-keygen -f ${params.sshKeyFilename} -N ''`);
  }
  if (!(fs.existsSync(`${params.sshKeyFilename}.pub`) &&
      fs.existsSync(`${params.sshKeyFilename}`))) {
    throw `failed to create ssh key ${params.sshKeyFilename}`;
  }

  console.log("KEY done ...");

  const networkInfo = getNetworkInfo(params);

  let lxcProfileName = `${lxcContName}-prof`;
  // create profile
  await createProfile(
    lxcProfileName, params,
    networkInfo 
  );

  console.log("PROFILE done ...");

  // copy the lxc image (if already exists does not fail)
  if (JSON.parse(syscmd(
    `lxc image list ${params.lxcImageAlias} --format json`)).length==0) {
    // download from LXC servers, may take a while
    console.log(`IMAGE, downloading ${params.lxcImageSrc} from LXC servers ...`);
    syscmd(
      `lxc image copy ${params.lxcImageSrc} local: --alias ${params.lxcImageAlias}`);
  }
  console.log("IMAGE done ...");

  if (params.phoneHome.ufwRule.enable){
    assert(params.phoneHome.autoLXCBridge, "case not implemented");
    let ufwRuleCmd = makeUfwRule(params, networkInfo);
    console.log(`ADDING UFW RULE for phone home:\n${ufwRuleCmd}`);
    console.log(syscmd(ufwRuleCmd));
  }
  
  // set up receiver for cloud init phone home signalling cloud init end
  assert(params.phoneHome.autoLXCBridge, "case not implemented");
  var promPhoneHome = waitPhoneHome(networkInfo.toAddr, params.phoneHome.port);

  // create the container with cloud init customization
  syscmd(`lxc launch ${params.lxcImageAlias} ${lxcContName} -p ${lxcProfileName}`);

  console.log("LAUNCH executed, waiting for phone home to signal cloud init finished ...");

  await promPhoneHome;

  // wait until cloud init has finished
  console.log("CONTAINER has finished cloud init");

  var contip4 = getContainerIp4Address(lxcContName);

  console.log("CONTAINER ip4 address is " + contip4);

  if (params.openVPN.enable) {
    // Copy the vpn client cert to container.
    // For privacy's sake we didn't put cert in cloud-init data.
    syscmd(`lxc file push  ${params.openVPN.vpnClientCertFilename} ` + 
         `${lxcContName}/etc/openvpn/client/client.conf --gid 0 --uid 0`);

    console.log(syscmd(`lxc exec ${lxcContName} -- systemctl start openvpn-client@client`));
  }

}


// var test_start = 0
// var test_end = 999
// async function test() {
// 	// setup coomands to be run as user
// 	let contip4 = getContainerIp4Address(lxcContName)
// 	let rcmds = [
// //		`"echo \\"export PATH=/home/ubuntu/.local/bin:\\$PATH\\" > ./pathfix "`,
// //		`"echo \\"source ./pathfix\\" >> ./.bashrc "`, 
// 		"env | grep -e PATH -e ENV -e BASH",
// 		`\
// if ! [[ -f get-pip.py ]] ; then \
// 	wget https://bootstrap.pypa.io/get-pip.py &&\
// 	sudo python3 get-pip.py ;\
// fi`,
// 		"pip install jupyterlab",
// 		"pip install jupyter_http_over_ws",
// 		"jupyter serverextension enable --py jupyter_http_over_ws",
// 		"pip install matplotlib",
// 		"pip install setuptools --upgrade",
// 		"pip install tensorflow",
// 		"sudo ln -s /usr/bin/python3 /usr/bin/python",
// 	];
// 	let i=0
// 	for (const rc of rcmds) {
// 		if (i<test_start)
// 			continue;
// 		if (i>=test_end)
// 			break;
// 		i++;
// 		let c= 	`ssh  -o UserKnownHostsFile=/dev/null -o StrictHostKeyChecking=no `
// 			+ `-i ${params.sshKeyFilename}   ubuntu@${contip4} `
// 		+ `bash --login -c '"${rc}"'`;
// 		console.log(rc)
// 		console.log(c)
// 		console.log(syscmd(c))
// 	}
// }

// async function serve(args) {
// 	var contip4 = getContainerIp4Address(lxcContName)
// 	var jupstr = `PATH=$PATH:$HOME/.local/bin /usr/bin/jupyter notebook --NotebookApp.allow_origin='https://colab.research.google.com' `
// 		+ '--port 5678 --NotebookApp.port_retries=0 --no-browser --debug';
// 	// 	var cmdstr = `ssh -o UserKnownHostsFile=/dev/null -o StrictHostKeyChecking=no `
// 	// 		+ `-f -L 8765:localhost:5678 ` 
// 	// 		+ `-i ${params.sshKeyFilename} ubuntu@${contip4} `
// 	// 		+  `"${jupstr}"`;
// 	var proc=null;
// 	await new Promise((resolve, reject)=>{
// 		proc = spawn(
// 			"ssh",
// 			[
// 				"-o", "UserKnownHostsFile=/dev/null",
// 				"-o", "StrictHostKeyChecking=no",
// 				"-L", "5678:localhost:5678", 
// 				"-i", `${params.sshKeyFilename}`, `ubuntu@${contip4}`,
// 				`${jupstr}`
// 			]
// 		);
    
// 		proc.stdout.on('data', (data) => {
// 			console.log(`JUP[1]:${data}`);
// 		});

// 		proc.stderr.on('data', (data) => {
// 			console.error(`JUP[2]: ${data}`);
// 		});

// 		proc.on('close', (code) => {
// 			console.log(`child process exited with code ${code}, but server may be still running`);
// 			if (code==0)
// 				resolve(0);
// 			else
// 				reject(code)
// 		});
// 		proc.on('disconnect', () => {
// 			// nope
// 			console.log(`DISCONNECT - child process notified that parent process is exiting`);
// 			proc.exit(0);
// 		});
// 		proc.on('SIGTERM', () => {
// 			// nope 
// 			console.log(`SIGTERM - child process notified that parent process is exiting`);
// 			proc.exit(0);
// 		});
// 		proc.on('SIGINT', () => {
// 			// nope
// 			console.log(`SIGINT - child process notified that parent process is exiting`);
// 			proc.exit(0);
// 		});
    
// 	})

// 	console.log(syscmd( `ssh -o UserKnownHostsFile=/dev/null -o StrictHostKeyChecking=no `
// 						+ `-i ${params.sshKeyFilename} ubuntu@${contip4} `
// 						+  `"jupyter notebook stop 5678"`))
    
// 	//console.log('Jupyter server closed')		
// }



//      await browse(lxcContName, settings.params, process.argv.slice(3+argOff));

async function browse(lxcContName, params, args) {
  let XServerXephyr=false;
  if (args.indexOf('-xephyr')>=0)
    XServerXephyr = true;
  
  let xephyrPassThruArgs='';
  if (args.indexOf('-xephyrargs')>=0){
    xephyrPassThruArgs = args[args.indexOf('-xephyrargs')+1];
  }

  // screensize is just for xephyr
  let SCREENSIZE = 
    syscmd(`xdpyinfo | grep dimensions`).split(' ').find(w=>w.match(/^[\d]+x[\d]+$/));
  if (args.indexOf('-screen')>=0){	
    SCREENSIZE = args[args.indexOf('-screen')+1];
  } else {
    console.log(`detected host screensize of ${SCREENSIZE}`);
  }

  configPulseAudioOnHost();
  
  //const setTimeoutPromise = util.promisify(setTimeout);
  var contip4 = getContainerIp4Address(lxcContName);
  if (XServerXephyr) {
    //		console.log(dropDownFixMsg)
    let rcmd = `
Xephyr -ac -screen ${SCREENSIZE} -resizeable -br -zap ${xephyrPassThruArgs} :2 &
sleep 1
DISPLAY=:2 openbox &
DISPLAY=:2 PULSE_SERVER=tcp:localhost:44713 firefox &
#sleep 3
#DISPLAY=:2 xdotool search --onlyvisible --class Firefox windowsize 100% 100%
`;			
    console.log('starting firefox on Xephyr');
    syscmd(`ssh -Y -o UserKnownHostsFile=/dev/null -o StrictHostKeyChecking=no `
         + `-R 44713:localhost:4713 `
         + `-i ${params.sshKeyFilename}  ubuntu@${contip4} /bin/bash "${rcmd}" &`);
    console.log('firefox on Xephyr finished');
    
  } else {  // XServerXephyr == false 
    syscmd(`ssh -Y -o UserKnownHostsFile=/dev/null -o StrictHostKeyChecking=no `
         + `-R 44713:localhost:4713 `
         + `-i ${params.sshKeyFilename} ubuntu@${contip4} `
         +  `PULSE_SERVER=tcp:localhost:44713 firefox &`);
    console.log('Firefox started (no Xephyr)');		
  }
}

function configPulseAudioOnHost() {
  //set pulseaudio to accept audio from host
  //let networkInfo = getNetworkInfo();

  // audio on host side
  // create a new ~/.config/pulse/default.pa file
  let defPa = fs.readFileSync(`/etc/pulse/default.pa`);
  defPa = defPa + 
    `load-module module-native-protocol-tcp `
    + `port=4713 auth-ip-acl=127.0.0.1`
    + `\n`
  ;
  fs.mkdirSync(`/home/${process.env.USER}/.config/pulse`, { recursive: true });
  fs.writeFileSync( `/home/${process.env.USER}/.config/pulse/default.pa`, defPa);
  // kill pulseaudio, it will load the new config and self reboot
  syscmd(`pulseaudio --kill`);
}


// function notify_send(title, msg){
// 	title = title.replace(/"/g, '\\"');
// 	msg = msg.replace(/"/g, '\\"');
// 	//msg = msg.replace(/'/g, '\\'')
// 	syscmd(`notify-send "${title}" "${msg}"`);
// }

// async function clipToCont(){
// 	var contip4 = getContainerIp4Address(lxcContName)
// 	var clipValue
// 	try {
// 		clipValue = syscmd('xsel --clipboard --output');
// 	} catch(e) {
// 		throw 'host clipboard empty';
// 	}
// 	let cmd2 = `ssh -o UserKnownHostsFile=/dev/null -o StrictHostKeyChecking=no  ubuntu@${contip4} 'xsel --clipboard --input --display :2'`;
// 	await new Promise((resolve, reject)=>{		
// 		var proc = exec(cmd2, (error, stdout, stderr) => {
// 			if (error) {
// 				reject(error);
// 			}
// 			resolve()
// 		});
// 		if (!proc.stdin.write(clipValue))
// 			reject('pipe write failed')
// 		proc.stdin.end()
// 	})					 
// }

// async function clipFromCont(){
// 	var contip4 = getContainerIp4Address(lxcContName)
// 	var clipValue
// 	let cmd1 = `ssh -o UserKnownHostsFile=/dev/null -o StrictHostKeyChecking=no  ubuntu@${contip4} 'xsel --clipboard --output --display :2'`;
// 	let cmd2 = `xsel --clipboard --input`;
// 	let clipVal = syscmd(cmd1)
// 	await new Promise((resolve, reject)=>{
// 		var proc = exec(cmd2, (error, stdout, stderr) => {
// 			if (error) {
// 				reject(error);
// 			}
// 			resolve()
// 		});
// 		if (true) {
// 			if (!proc.stdin.write(clipVal))
// 				reject('pipe write failed')
// 			proc.stdin.end()
// 		}
// 	})	
// }

// async function clipNotify(to0from1){
// 	let f = to0from1 ? clipFromCont : clipToCont;
// 	let n = to0from1 ? "clipFromCont" : "clipToCont";
// 	let err;
// 	await f()
// 		.then(()=>{
// 			notify_send(n + ": SUCCESS", "")
// 		})
// 		.catch((e)=>{
// 			notify_send(n +  ": FAIL", e.toString())
// 			err=e
// 		})
// 	if (err) throw err;
// }			  

exports.writeDefaultSettingFile = writeDefaultSettingFile;
exports.readSettingFile = readSettingFile;
exports.initialize = initialize;
//exports.browse = browse;
exports.makeUfwRule = makeUfwRule;
exports.getNetworkInfo = getNetworkInfo;
exports.runPostInitScript = runPostInitScript;
exports.runServe = runServe;
exports.runTestServe = runTestServe;


// exports.createProfile =  createProfile
// exports.syscmd = syscmd
// exports.getContainerIp4Address = getContainerIp4Address
// exports.waitPhoneHome = waitPhoneHome
