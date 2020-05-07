'strict';
//const assert = require('assert').strict;
const fs = require('fs');
const { LogStreams } = require('./class-defs.js');
const { initialize, 
  runPostInitScript,
  runServe,
  runTestServe,
  makeUfwRule,
  getNetworkInfo,
  readSettingFile,
  writeDefaultSettingFile,
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
wrote non-existant setting file "${file}",
change if required and restart
`);
    return;
  }

  if (!lxcContName){
    if (settings.keys().length==1)
      lxcContName = settings.keys()[0];
    else if (settings.keys().includes('default'))
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
      let params = settings[lxcContName];
      logStreams = new LogStreams(settings.shared.logdir, 
        `${lxcContName}-out.log`, `${lxcContName}-err.log`);
      switch (cmd){
      case 'init':
        await initialize(lxcContName, 
          params, logStreams,
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
        await runServe(lxcContName, 
          params, logStreams,
          process.argv.slice(argOff));
        break;
      case 'post-init-serve':
        await runPostInitScript(lxcContName, 
          params, logStreams,
          process.argv.slice(argOff));
        await runServe(lxcContName, 
          params, logStreams,
          process.argv.slice(argOff));
        break;
      case 'autoUfwRule':
        console.log(makeUfwRule(getNetworkInfo(params)));
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
    process.exitCode=0;
    console.log("SUCCESS");
  })
  .catch(e => {
    process.exitCode=1;
    console.error("FAIL",e);
  })	
  .finally(()=>{
    console.log("EXIT");
  });
