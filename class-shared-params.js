`strict`;

const fs = require('fs');
const { syscmd} = require('./class-defs.js');
const { getNetworkInfo }=require('./default-params.js');
const yaml = require('js-yaml');

const ownAppName='cmgr';

class SharedParams {
  constructor(filename=null){
    if (filename){
      // read from filename
      Object.assign(this,yaml.safeLoad(fs.readFileSync(filename)));
    } else {
      try {
        this.networkInfo = getNetworkInfo();
      } catch(e) {
        console.error(e.message);
        this.networkInfo = null;
      }
      this.ufwPortRange='3000:3050,4713';
      this.xephyrDisplay=':2';
      this.sshConfigLxcFilename=`${process.env.HOME}/.ssh/config-${ownAppName}`;
      this.sshKeyFileDir=`${process.env.HOME}/.ssh`;
      this.sshfsMountRootDir=`${process.env.HOME}/mnt-${ownAppName}`;

      this.userRootConfigDir=`${process.env.HOME}/.config`;
      this.appConfigDir=`${this.userRootConfigDir}/${ownAppName}`;

      //this.contUserRootConfigDir=`/home/${shared.contUsername}/.config/
      try { 
        let tztmp = fs.readFileSync(`/etc/timezone`,'utf8');
        this.tz = tztmp.slice(0,-1); // gte rid of EOL
      } catch (e) {
        console.error(`WARNING: couldn't read user timezone, ${e}`);
        this.tz='';
      }
      Object.assign(this,
        {
          logdir: `/tmp/log/${ownAppName}`,
          ssh : {
            prog : 'ssh',
            configArgs : ["-F", ],
            audioArgs : ['-R',  '44713:localhost:4713'],
            xArgs: ['-X'],
          }, 
          sshfsMount : {
            prog : 'sshfs',
            configArgs : [
              "-F", 
            ],
            otherArgs : [
              '-o','idmap=user', 
              '-o','reconnect',
            ],
          }, 
          sshfsUnmount : {
            prog : 'fusermount',
            args : [
              '-u',
            ],
          },
          //   "xephyr": Xephyr -ac -screen 1920x1200 -br -reset -zap :2
          xephyr: {
            prog: 'Xephyr',
            args:[
              '-resizeable',
            ]
          }
        });
      try {
        let screensize = 
          syscmd(`xdpyinfo | grep dimensions`).split(' ').find(w => w.match(/^[\d]+x[\d]+$/));
        this.xephyr.args = ['-screen',screensize].concat(this.xephyr.args);
        // eslint-disable-next-line no-empty
      } catch(e){}
    }
  } // constructor
  writeToFile(filename){
    let yml = yaml.safeDump(this,{lineWidth:999,skipInvalid:true,noRefs:true} );
    fs.writeFileSync(filename,yml,'utf8');
  }
  sshProg(){ return this.ssh.prog; }  
  // sshConfigOnlyArgs(contName){ 
  //   return this.ssh.configArgs.concat([this.sshConfigLxcFilename])
  // }
  sshArgs(contName,nomedia=false){ 
    let a=this.ssh.configArgs.concat([this.sshConfigLxcFilename]);
    if (!nomedia)
      a=a.concat(this.ssh.audioArgs).concat(this.ssh.xArgs);
    return a.concat(contName);
  }
  sshKeyFilename(contName){
    return this.sshKeyFileDir + '/' + `to-${contName}`;
  }
  sshfsMountDir(contName) { return `${this.sshfsMountRootDir}/${contName}`; } 
  sshfsMountProg() { return this.sshfsMount.prog; }
  sshfsMountArgs(contName) { 
    return this.sshfsMount.configArgs.concat([this.sshConfigLxcFilename])
      .concat(this.sshfsMount.otherArgs)
      .concat([`${contName}:`, this.sshfsMountDir(contName)]);
  }
  sshfsUnmountProg() { return this.sshfsUnmount.prog; }
  sshfsUnmountArgs(contName) { 
    return this.sshfsUnmount.args
      .concat([this.sshfsMountDir(contName)]);
  }
  xephyrProg() { return this.xephyr.prog; }
  xephyrArgs() { return this.xephyr.args.concat([this.xephyrDisplay]); }
  hostUserRootConfigDir() { return this.userRootConfigDir; }
  hostUserAppConfigDir() { return this.appConfigDir;}
  completionShellScriptFilename() { 
    return this.hostUserAppConfigDir()+'/'+`${ownAppName}_completion`;
  }
} // class SharedSettings

exports.SharedParams=SharedParams;
exports.ownAppName=ownAppName;
