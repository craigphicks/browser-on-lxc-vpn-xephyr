'strict';
//const assert = require('assert').strict;
const fs = require('fs');
const { LogStreams } = require('./class-log-streams.js');
const { SharedParams }=require('./class-shared-params.js');
const { ContParams }=require('./class-cont-params.js');
const {SpawnCmd}=require('./class-defs.js');
const { initialize, 
  //runPostInitScript,
  runPostInitScript2,
  //runServe,runServe2,
  runServe3,
  //runTestServe,
  //readSettingFile,
  //writeDefaultSettingFile,
  containerExists,
  sshfsMount,
  sshfsUnmount,
  //rsyncBackup,
  gitRestore, gitPush,
  createSshConfigLxc,
  setUserPulseAudioConfigFile,
  runXephyr,
  clipXfer,
  testEnv,
} = require('./ffvpn-prof.js');
const {makeUfwRule,getNetworkInfo} = require('./default-params.js');



const appConfigDir = `${process.env.HOME}/.config/luwp`;

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
  
  let lxcContName, argOff=2;
  
  let sharedParamsFilename = `${appConfigDir}/shared-params.yml`;
  let contParamsFilename = `${appConfigDir}/cont-params.yml`;
  
  // if (process.argv.length>argOff)
  //   if (process.argv[argOff]=='--file'){
  //     file = process.argv[argOff+1];
  //     argOff+=2;
  //   }
  
  
  if (!fs.existsSync(appConfigDir)){
    fs.mkdirSync(appConfigDir,{recursive:true});
  }
  
  if (!fs.existsSync(sharedParamsFilename)){
    new SharedParams().writeToFile(sharedParamsFilename);
    console.error(`\
    File "${sharedParamsFilename}" didn't exist so created one with default values.
    `);
  }
  var shared = new SharedParams(sharedParamsFilename);
  if (!fs.existsSync(contParamsFilename)){
    new ContParams(shared).writeToFile(contParamsFilename);
    console.error(`\
    File "${contParamsFilename}" didn't exist so created one.
    `);
  }
  var contParams = new ContParams(shared,contParamsFilename);

  let nextArg;
  if (process.argv.length>argOff){
    nextArg = process.argv[argOff];
    argOff += 1;
  } else {
    help();
    return;
  }
  
  switch (nextArg) {
  case 'xephyr':
    await runXephyr(shared,process.argv.slice(argOff));
    return;
  case 'test-env':
    await testEnv();
    return;
  case 'clip-xfer':
    if (process.argv.length-argOff<2)
      throw Error('clip-xfer requires two arguments: fromDispNum, toDispNum');
    await clipXfer(process.argv[argOff],process.argv[argOff+1]);
    argOff+=2;
    return;
  case 'config-ssh':
    createSshConfigLxc(shared.sshConfigLxcFilename);
    return;
  case 'config-pulse-audio':
    setUserPulseAudioConfigFile();
    return;
  case 'show-ufw-rule':
    console.log(makeUfwRule(getNetworkInfo(),shared.ufwPortRange));
    return;
  case 'config-ufw-rule':
    {
      let ufwRule = makeUfwRule(getNetworkInfo(),shared.ufwPortRange,true);
      await new SpawnCmd(ufwRule[0],ufwRule.slice(1),{stdio:'inherit'}).call();
    } 
    return;
  }
  
  
  // fall through to other commands
  lxcContName = nextArg;
  
  if (!Object.keys(contParams).includes(lxcContName))
    throw Error(`could not find parameters for container name ${lxcContName}`);

  console.error(`using container name "${lxcContName}"`);

  if (process.argv.length<=argOff){
    help();
    return;
  }


  let cmd = process.argv[argOff];
  argOff += 1;

  if (cmd!='init' && !containerExists(lxcContName))
    throw new Error(
      `lxc container named '${lxcContName}' doesn't exist, must create with 'init' first`);
  let params = contParams[lxcContName];
  
  try {
    var logStreams = new LogStreams(shared.logdir, 
      `${lxcContName}-${cmd}-out.log`, `${lxcContName}-${cmd}-err.log`);
      
      
    switch (cmd){
    case 'init':
      await initialize(lxcContName, 
        shared, contParams, params, logStreams,
        process.argv.slice(argOff));
      break;
    case 'post-init':
      await runPostInitScript2(lxcContName, 
        shared, contParams, params, logStreams,
        process.argv.slice(argOff));
      break;
      // case 'test-serve':
      //   await runTestServe(lxcContName, 
      //     params, logStreams,
      //     process.argv.slice(argOff));
      //   break;
    case 'serve':
      await runServe3(lxcContName, 
        shared, contParams, params, 
        process.argv.slice(argOff));
      // await runServe(lxcContName, 
      //   params, logStreams,
      //   process.argv.slice(argOff));
      break;
      // case 'post-init-serve':
      //   await runPostInitScript2(lxcContName, 
      //     params, logStreams,
      //     process.argv.slice(argOff));
      //   await runServe3(lxcContName, 
      //     shared, params, 
      //     process.argv.slice(argOff));
      //   break;
    case 'sshfs-mount':
      await sshfsMount(lxcContName, 
        shared, params, logStreams,
        process.argv.slice(argOff));
      break;
    case 'sshfs-unmount':
      await sshfsUnmount(lxcContName, 
        shared, params, logStreams,
        process.argv.slice(argOff));
      break;
    case 'git-restore':
      await gitRestore(lxcContName,shared,params);
      break;
    case 'git-push':
      await gitPush(lxcContName,shared,params);
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
    console.error("FAIL/EXIT detail",e);
    console.error("FAIL/EXIT",e.message);
    process.exit(1);
  })	
  .finally(()=>{
    console.log("EXIT");
  });


