'strict';
//const assert = require('assert').strict;
const fs = require('fs');
const { LogStreams } = require('./class-defs.js');
const { initialize, 
  runPostInitScript,
  runServe,runServe2,
  runTestServe,
  makeUfwRule,
  getNetworkInfo,
  readSettingFile,
  writeDefaultSettingFile,
  containerExists,
  sshfsMount,
  sshfsUnmount,
  createSshConfigLxc
} = require('./ffvpn-prof.js');



function help(){


  let usage=`
================
Usage:

 - node index.js 
        [--name <container alias>] 
        [--file <parameter file name>]
        <command> <extra args>  
   if '--name' ommited, default is 'mycont'
   if '--file' omitted, default is './<container alias>.yml'

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
`;
  console.log(usage);
  
}


async function main(){
  //	console.log(process.argv.length)
  //	console.log(process.argv)

  let cmd, lxcContName, argOff=2;

  let file = `./params.yml`;

  if (process.argv.length>argOff)
    if (process.argv[argOff]=='--file'){
      file = process.argv[argOff+1];
      argOff+=2;
    }
  

  if (process.argv.length>argOff){
    cmd = process.argv[argOff];
    argOff += 1;
  }
  if (process.argv.length>argOff){
    lxcContName = process.argv[argOff];
    argOff += 1;
  }


  let settings; 
  if (fs.existsSync(file))
    settings = readSettingFile(file);
  else {
    writeDefaultSettingFile(file);
    console.error(`\
Setting file "${file}" didn't exist so created one with default values.
`);
    settings = readSettingFile(file);
  }

  switch (cmd) {
  case 'create-ssh-config-lxc':
    createSshConfigLxc(settings);
    return;
  }
  // fall through to other commands

  if (!lxcContName){
    if (Object.keys(settings).length==1)
      lxcContName = Object.keys(settings)[0];
    else if (Object.keys(settings).includes('default'))
      lxcContName = 'default';
    else {
      console.error('ERROR: cannot determine container name uniquely');
      return;
    }
    console.error(`using container name "${lxcContName}"`);
  }
  var logStreams=null;
  try {
    if (!cmd)
      help();
    else {
      if (cmd!='init' && !containerExists(lxcContName)){
        throw new Error(
          `container named '${lxcContName}' doesn't exist, must create with 'init' first`);
      }
      let params = settings[lxcContName];
      logStreams = new LogStreams(settings.shared.logdir, 
        `${lxcContName}-out.log`, `${lxcContName}-err.log`);
      switch (cmd){
      case 'init':
        await initialize(lxcContName, 
          settings, params, logStreams,
          process.argv.slice(argOff));
        break;
      case 'post-init':
        await runPostInitScript(lxcContName, 
          params, logStreams,
          process.argv.slice(argOff));
        break;
      case 'test-serve':
        await runTestServe(lxcContName, 
          params, logStreams,
          process.argv.slice(argOff));
        break;
      case 'serve':
        await runServe2(lxcContName, 
          settings.shared, params, 
          process.argv.slice(argOff));
        // await runServe(lxcContName, 
        //   params, logStreams,
        //   process.argv.slice(argOff));
        break;
      case 'post-init-serve':
        await runPostInitScript(lxcContName, 
          params, logStreams,
          process.argv.slice(argOff));
        await runServe2(lxcContName, 
          settings.shared, params, 
          process.argv.slice(argOff));
        break;
      case 'auto-ufw-rule':
        console.log(makeUfwRule(getNetworkInfo(params)));
        break;
      case 'sshfs-mount':
        await sshfsMount(lxcContName, 
          settings.shared, params, logStreams,
          process.argv.slice(argOff));
        break;
      case 'sshfs-unmount':
        await sshfsUnmount(lxcContName, 
          settings.shared, params, logStreams,
          process.argv.slice(argOff)).then(
          ()=>{ console.log(`DEBUG: sshfsUnmount returned success`);},
          (e)=>{ 
            console.log(`DEBUG: sshfsUnmount return error: ${e.message}`);
            throw e;
          }
        );
        break;
        // the following is for case when Xephyr is being used
        // case 'clip-to-cont':
        // 	await clipNotify(0);
        // 	break;
        // case 'clip-from-cont':
        // 	await clipNotify(1);
        // 	break;
      default: help();
      }
    }
  }
  finally {
    if (logStreams)
      await logStreams.close();
  }
}

async function siggedMain() {
  /* 
  When child_process.exec() is used to call some LXC/D functions (at least 'lxc launch')
  the LXC/D process usurps SIGINT until Ctrl-C is hit 3 times in succession.
  After that, for some obscure priority reason, when calling Promise.race([sigp,mainp])
  the sigp is not yet evaluated as being resolved, so we can't get an exit message saying
  "user generated SIGINT" - instead it looks like an exec'd command failed. 
  The solution was to call Promise.race(...) again using a setImmediate to delay evaluation.
  I'd like to know if this would ever be necessary for more simple child processes 
  (than 'lxc launch ...').
  */  
  let sig = new Promise((resolve,reject)=>{
    process
      .on('SIGTERM', () => {
        console.error('siggedMain: sigterm handler');
        reject(new Error(`user generated SIGTERM`)); 
      })
      .on('SIGINT', () => {
        console.error('siggedMain: sigint handler');
        reject(new Error(`user generated SIGINT`));
      });
  }).catch((e)=>{return e;});
  let mainp = main().then(()=>{return null;}, (e)=>{return e;});
  await Promise.race([sig, mainp]);
  return await new Promise((resolve,reject)=>{
    setImmediate(()=>{
      Promise.race([sig, mainp]).then((r)=>{
        if (r==null) 
          resolve();
        else
          reject(r);
      });
    });
  });
} 

siggedMain()
  .then(()=>{
    process.exitCode=0;
    console.log("SUCCESS");
  })
  .catch(e => {
    //process.exitCode=1;
    console.error("FAIL/EXIT",e.message);
    process.exit(1);
  })	
  .finally(()=>{
    console.log("EXIT");
  });


