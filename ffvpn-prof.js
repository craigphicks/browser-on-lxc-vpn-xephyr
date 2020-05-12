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

const { sshCmdAsync_opts } = require('./class-defs.js');
const { DefaultSettings } = require('./class-default-settings.js');

//const asyncCmd = require('./async-cmd.js');


async function onExitOrError(proc){
  return await new Promise((resolve, reject)=>{
    proc.once('exit', (code, signal) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`(onExitOrError) error code [${code}], signal [${signal}]`));
      }
    });
    proc.once('error', (e) => {
      proc.removeAllListeners(['exit']);
      reject(new Error(`(onExitOrError) error [${e}]`));
    });
  });
}

async function readUntilClose(source, writeAsync){
  source.on('data', async (data)=> {
    await writeAsync(data.toString('utf8'))
      .catch((e)=>{
        console.error(`readUntilClose UNEXPECTED ERROR: ${e}`);
      });
  });
  return await new Promise((resolve)=>{
    source.on('error', ()=>{
      source.removeAllListeners(['data']);
      resolve();
    });
    source.on('close', ()=>{
      source.removeAllListeners(['data']);
      resolve();
    });
  });
}

async function sshCmdAsync(prms, contip, logStreams, opts){ 
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

  let remoteCommandsIn='';
  let readable=null;
  if (opts.stdin.text){
    if (opts.stdin.isFilename){
      remoteCommandsIn = fs.readFileSync(opts.stdin.text,'utf8');
      readable = fs.createReadStream(opts.stdin.text,'utf8');
      // spawn requires the file be read-ready or it will fail so ... 
      await events.once(readable,'readable'); 
    } else {
      remoteCommandsIn = opts.stdin.text;
      var g =  genLines(opts.stdin.text);
      readable = new stream.Readable({
        object:true,
        encoding:'utf8',
        //detached:true,
        //autoDestroy : true,
        read() { 
          let next = g.next();
          if (next.done)
            this.push(null);
          else
            this.push(next.value+'\n');
        }
      });
    }
  }

  let prog = opts.ssh || "ssh";
  let args = [];
  if (opts.addSshArgs && opts.addSshArgs.length)
    args = opts.addSshArgs;
  args = args.concat(stdArgs);
  if (opts.remoteCmd && opts.remoteCmd.length)
    args = args.concat(opts.remoteCmd);

  let logText = `\
--- local command line ---
  ${prog} ${args.join(' ')}
+++ remote input begin +++
${remoteCommandsIn||''}
+++ remote input end +++
`;

  if (opts.echoRemoteIn)
    console.log(logText);
  await logStreams.writeBoth(logText);

  let proc = spawn(
    prog, args,
    {
      stdio: [
        readable?'pipe':'ignore', 
        opts.stdout=='inherit'?'pipe':'ignore', // 'inherit' does not allow ...
        opts.stderr=='inherit'?'pipe':'ignore'  // ... waiting for 'close' - so not used
      ]
    }
  );

  if (readable)
    readable.pipe(proc.stdin);


  let stdoutp=null,stderrp=null;
  if (opts.stdout)
    stdoutp=readUntilClose(proc.stdout,
      logStreams.writeOut.bind(logStreams)
      //process.stdout.write.bind(process.stdout)
    );
  if (opts.stderr)
    stderrp=readUntilClose(proc.stderr, 
      logStreams.writeErr.bind(logStreams)
      //process.stderr.write.bind(process.stderr)
    );
  
  // only the outcome of onExitOrError is important
  let [err, res] = await onExitOrError(proc).then(r=>[null,r],e=>[e,null]); 
  await Promise.all([stdoutp,stderrp]).catch(e=>console.log('ignored error:',e));
  // because deep inside LogStreams we have been writing lines ending with `\r` we must add `\n'
  process.stdout.write('\n');
  process.stderr.write('\n');
  if (err) throw err; 
  else return res;
}

async function runPostInitScript(name,params, logStreams) {
  console.log(">>>runPostInitScript()");
  const contip = getContainerIp4Address(name);
  await sshCmdAsync(params, contip, logStreams,
    new sshCmdAsync_opts().setRemoteCommand(['touch', '~/.hushlogin']));  
  await sshCmdAsync(params, contip, logStreams, params.postInitScript.cmdOpts);  
  console.log("<<<runPostInitScript()");
}
async function runServe2(name,shared, params, argsIn) {
  console.log(">>>runServe()");
  let doLog = (argsIn.indexOf('--log')>=0);
  let serveId='default';
  if (argsIn && argsIn.length && argsIn[0][0]!='-'){
    serveId = argsIn[0];
  }
  if (Object.keys(params.serveScripts).indexOf(serveId)<0)
    throw Error(`Found no serveScript for ${name} named ${serveId}`);
  let opts = params.serveScripts[serveId].cmdOpts;
  const contip = getContainerIp4Address(name);
  let stdio = ['pipe','ignore','ignore'];
  if (doLog){
    let datestr=(new Date()).toISOString();
    for (const i of [[1,'out'],[2,'err']]){
      await new Promise((res,rej)=>{
        stdio[i[0]]=fs.createWriteStream(
          shared.logdir+`/${name}-serve-${serveId}-${i[1]}-${datestr}.log`)
          .on('open',res).on('error',rej);
      });
    }
  }
  if (opts.stdin.isFilename)
    stdio[0]=fs.createReadStream(opts.stdin.text);
  let args = shared.sshArgs.args
    .concat(opts.addSshArgs)
    .concat(["-i", `${params.sshKeyFilename}`])
    .concat([`${params.contUsername}@${contip}`])
    .concat(opts.remoteCmd);
  let cmdlogstr = [ opts.ssh ].concat(args).join(' ');
  console.log(cmdlogstr);
  if (doLog){
    stdio[1].write(cmdlogstr+'/n');
    stdio[2].write(cmdlogstr+'/n');
  }

  return await new Promise ((resolve,reject)=>{
    let proc=spawn(opts.ssh, args,{stdio:stdio,detached:true})
      .on('error',reject)
      .on('exit',resolve)
      .on('close',resolve);
    if (!opts.stdin.isFilename)
      proc.stdin.write(opts.stdin.text)
    // eslint-disable-next-line no-empty
    setTimeout(()=>{try{proc.unref();}catch(e){}},1000);
  });
}
async function runServe(name,params,logStreams, args) {
  console.log(">>>runServe()");
  let serveId='default';
  if (args && args.length && args[0][0]!='-'){
    serveId = args[0];
  }
  assert(Object.prototype.hasOwnProperty.call(
    params.serveScripts,serveId), `Found no serveScript named ${serveId}`);
  let opts = params.serveScripts[serveId].cmdOpts;
  const contip = getContainerIp4Address(name);
  await sshCmdAsync(params, contip, logStreams, opts);
  console.log("<<<runServe()");
}
async function runTestServe(name,params,logStreams) {
  //let p = new DefaultParams('test','');
  const contip = getContainerIp4Address(name);
  let opts = new sshCmdAsync_opts();
  opts.setStdinToText(`\
echo \${argv[@]}
export PATH=$HOME/.local/bin:$PATH
echo $PATH
echo this is from stdout >&1
echo this is from stderr >&2
`);
  //opts.addRPipe(3001,4001);
  opts.setStdoutToParent();
  opts.setStderrToParent();
  await sshCmdAsync(params, contip, logStreams, opts);
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


// function ParamsSagemath(tz){
//   let p = DefaultParams("sagemath",tz);
// //  cloudInit.packages.concat([
// //    "sagemath", "firefox", "pulseaudio"
// //  ]);
//   let opts = p.serveScripts.default.cmdOpts;
//   opts.addRPipe(44713,4713);
//   opts.addXPipe();
// }


function writeDefaultSettingFile(fn){
  let yml = yaml.safeDump(new DefaultSettings(), 
    {lineWidth:999});
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

function containerExists(lxcContName){
  return JSON.parse(syscmd(`lxc list --format json`))
    .some(c=>c.name==lxcContName);

}

function getContainerIp4Address(lxcContName){
  let cont = JSON.parse(syscmd(`lxc list --format json`))
    .find(c=>c.name==lxcContName);
  if (!cont)
    throw Error(`no lxc container with {name:${lxcContName}}`);
  try {
    let ip=cont.state.network.eth0.addresses
      .find(a=>a.family=='inet').address;
    return ip;
  } catch(e) {
    throw Error(`lxc container '${lxcContName}' has no ip4 address`);
  }
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

async function initialize(lxcContName, settings, params, logStreams, args) {
  console.log(">>>initialize()");
  let noPostInit=false, noServe=false;
  if (args) {
    noPostInit = args.indexOf('--nopostinit')>=0;
    noServe = args.indexOf('--noserve')>=0;
  } 

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

  if (!noPostInit)
    await runPostInitScript(lxcContName,params,logStreams);
  if (!noServe)
    await runServe(lxcContName,params,logStreams);

  createSshConfigLxc(settings); 
  console.log("<<<intialize()");
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

async function sshfsMount(lxcContName, shared, params, logStreams,argsIn){
//  await sshfsUnmount(lxcContName, shared, params, logStreams).then(
//    ()=>{ console.log(`DEBUG: sshfsUnmount returned success`);},
//    (e)=>{ console.log(`DEBUG: sshfsUnmount return error: ${e.message}`);}
//  );
  let debug = (argsIn.indexOf('-d')>=0);
  let contip4 = getContainerIp4Address(lxcContName);
  if (!fs.existsSync(params.sshfsMountRoot))
    fs.mkdirSync(params.sshfsMountRoot,{recursive:true});
  let mountDir = params.sshfsMountRoot + '/' + lxcContName;
  if (!fs.existsSync(mountDir))
    fs.mkdirSync(mountDir);
  //fs.rmdirSync(mountDir); // will fail if directory not empty
  //if (!fs.existsSync(mountDir))
  //fs.mkdirSync(mountDir,{recursive:true});  
  let prog=shared.sshfsMountArgs.prog;
  let args = [];
  if (debug)
    args=[
      '-o', 'sshfs_debug', '-d'
    ];
  args=args.concat(shared.sshfsMountArgs.args);
  args=args.concat([
    '-o', `IdentityFile=${params.sshKeyFilename}`,
    `${params.contUsername}@${contip4}:`,
    mountDir,
  ]);
  let strcmd = `${prog} ${args.join(' ')}\n`;
  //await logStreams.writeBoth(strcmd);
  console.log(strcmd);
  //  let ostrm='ignore',estrm='ignore';
  let ofn=shared.logdir+`/${lxcContName}-sshfs-out.log`;
  let efn=shared.logdir+`/${lxcContName}-sshfs-err.log`;
  let ostrm = fs.createWriteStream(ofn);
  let estrm = fs.createWriteStream(efn);
  let mp=(x)=>{ return new Promise((res,rej)=>{x.on('error',rej).on('open',res);});};
  await Promise.all([mp(ostrm),mp(estrm)]);
  
  let stdio=['ignore',ostrm,estrm];
  let proc=spawn(prog,args,{ stdio: stdio, detach:false });   

  let procPromise = new Promise((resolve, reject)=>{
    proc.on('error',(e)=>{
      reject(e);
    }).on('exit',(code,signal)=>{
      if (code || signal) 
        reject(new Error(`sshfsMount code(${code}), signal(${signal})`));
      console.log('exit event');
      resolve();
    }).on('disconnect',()=>{
      console.log('disconnect event');
      resolve();
    }).on('close',()=>{
      console.log('close event');
      resolve();
    });
    setTimeout(()=>{proc.unref();},1000);
  });
  let parr = [procPromise];
  // parr.push(new Promise((resolve,reject)=>{
  //   proc.stdout.on('error',reject).on('end',resolve);
  // }));
  // parr.push(new Promise((resolve,reject)=>{
  //   proc.stderr.on('error',reject).on('end',resolve);
  // }));
  return await Promise.all(parr).catch(async (e)=>{ 
    await logStreams.writeBoth(`${e}\n`);
    let errtxt = fs.readFileSync(efn).toString();
    console.error('\n'+errtxt);
    throw e;
  });


  //   let procPromise = new Promise((resolve, reject)=>{
  //   proc.on('error',(e)=>{
  //     reject(e);
  //   }).on('exit');
  //   // try to leave a gap for an error if spawn fails.
  //   setImmediate(()=>{
  //     proc.unref();
  //     setImmediate(()=>{resolve();});
  //   });
  // }).catch(async (e)=>{ 
  //   await logStreams.writeBoth(`${e}\n`);
  //   throw e;
  // });
}

async function sshfsUnmount(lxcContName, shared, params, logStreams){
  //let contip4 = getContainerIp4Address(lxcContName);  
  let prog=shared.sshfsUnmountArgs.prog;
  let args=shared.sshfsUnmountArgs.args.concat([
    `${params.sshfsMountRoot}/${lxcContName}`,
  ]);
  await logStreams.writeBoth(`${prog} ${args.join(' ')}\n`,false);
  console.log(`${prog} ${args.join(' ')}`);
  let proc=spawn(prog,args,{ 
    stdio: ['ignore','pipe','pipe']
  });
  let procPromise = new Promise((resolve, reject)=>{
    proc.on('error',(e)=>{
      reject(e);
    }).on('exit',(code,signal)=>{
      if (code || signal) 
        reject(new Error(`sshfsUnmount code(${code}), signal(${signal})`));
      resolve();
    });
  });
  let stdoutPromise = new Promise((resolve,reject)=>{
    proc.stdout.pipe(logStreams.outStream(), {end:false})
      .on('error',reject).on('end',resolve);
  });
  let stderrPromise = new Promise((resolve,reject)=>{
    proc.stderr.pipe(logStreams.errStream(), {end:false})
      .on('error',reject).on('end',resolve);
  });
  return await Promise.all([procPromise,stdoutPromise,stderrPromise]).catch(async (e)=>{ 
    await logStreams.writeBoth(`${e}\n`,false);
    throw e;
  });
}

// can also be done dynamically with pacman or something - that may be better?
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

function createSshConfigLxc(settings){
  let text = '';
  let list = JSON.parse(syscmd(`lxc list --format json`));
  for (const c of list){
    if (Object.keys(settings).indexOf(c.name)<0)
      continue;
    let params = settings[c.name];
    let contip4;
    try{ contip4 = getContainerIp4Address(c.name); }
    catch(e){ continue; }
    text += `\
Host ${c.name}
    HostName ${contip4}
    User ${params.contUsername}
    IdentityFile ${params.sshKeyFilename}
`;
    fs.writeFileSync(process.env.HOME+'/.ssh/config-lxc',text,{mode:0o644});
  }
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
exports.runServe2 = runServe2;
exports.runTestServe = runTestServe;
exports.containerExists = containerExists;
exports.sshfsMount = sshfsMount;
exports.sshfsUnmount = sshfsUnmount;
exports.createSshConfigLxc=createSshConfigLxc;
// exports.createProfile =  createProfile
// exports.syscmd = syscmd
// exports.getContainerIp4Address = getContainerIp4Address
// exports.waitPhoneHome = waitPhoneHome
