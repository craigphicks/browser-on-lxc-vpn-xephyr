'strict';
const assert = require('assert').strict;
const fs = require('fs');

const { initialize, 
  runInitScript,
  runServe,
  runTestServe,
  makeUfwRule,
  getNetworkInfo,
  readSettingFile,
  writeDefaultSettingFile
}
    = require('./ffvpn-prof.js');



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

  let cmd, lxcContName, argOff=0;
  // create an instance of a container from that image

  if (process.argv.length>2){
    cmd = process.argv[2];
    argOff = 2;
  }
  if (process.argv.length>3){
    lxcContName = process.argv[3];
    argOff = 3;
  }

  let file = `./params.yml`;

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

  
  
  if (!cmd || !lxcContName)
    help();
  else {
    assert(lxcContName, "must provide container name");
    assert(Object.prototype.hasOwnProperty.call(
      settings,lxcContName), 
    `${lxcContName} not found in settings file`);
    let params = settings[lxcContName];
    switch (cmd){
    case 'init':
      await initialize(lxcContName, 
        params, 
        process.argv.slice(argOff));
      break;
    case 'post-init':
      await runInitScript(lxcContName, 
        params, 
        process.argv.slice(argOff));
      break;
    case 'test-serve':
      await runTestServe(lxcContName, 
        params, 
        process.argv.slice(argOff));
      break;
    case 'serve':
      await runServe(lxcContName, 
        params, 
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
    console.log("FAIL",e);
  })	
  .finally(()=>{
    console.log("EXIT");
  });
