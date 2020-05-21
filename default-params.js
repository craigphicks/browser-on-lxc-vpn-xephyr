'strict';

const yaml = require('js-yaml');
const { syscmd,SpawnCmdParams } = require('./class-defs.js');

function getNetworkInfo(bridgeName='lxdbr0') {
  let networkFromCDN = yaml.safeLoad(syscmd(
    `lxc network show ${bridgeName}`)).
    config['ipv4.address'];
  let networkToAddr = networkFromCDN.split('/')[0];
  return {
    fromCDN: networkFromCDN,
    toAddr: networkToAddr
  };
}

function makeUfwRule(networkInfo, port=null, array=false) {
  if (!array) {
    let ret =
    `sudo ufw allow from ${networkInfo.fromCDN} to ${networkInfo.toAddr} `
    + (port? `port ${port} `:'')
    + `proto tcp`;
    return ret;
  } else {
    let a = [
      'sudo', 'ufw', 'allow', 'from', 
      `${networkInfo.fromCDN}`, 'to' ,`${networkInfo.toAddr}`];
    if (port)
      a = a.concat(['port', `${port}`]);
    a=a.concat(['proto', 'tcp']);
    return a;
  }
}


class DefaultParams {
  constructor(name,shared,phoneHomePort){
    Object.assign(this, {
      contName:name,
      sshKeyFilename : `${process.env.HOME}/.ssh/to-${name}`,
      openVPN : {
        enable:false,
        vpnClientCertFilename : `${process.env.HOME}/client-${name}.ovpn`
      },
      lxcImageSrc : `ubuntu:18.04`,
      contUsername : 'ubuntu',
      lxcImageAlias : `ub18-im`,
      lxcCopyProfileName : 'default',
      //      lxcContBridgeName : 'lxdbr0',
      cloudInit : { 
        timezone: shared.tz,
        locale: process.env.LANG, 
        packages : [],
        runcmd : [
        ],
      },
      phoneHomeListen : {
        enable: !!(shared.networkInfo&&phoneHomePort), 
        toAddr: shared.networkInfo?shared.networkInfo.toAddr:null,
        port:phoneHomePort,
      },
      postInitScript : {
        //copyFiles: [
        //  {isFilename:false, text:"echo ${argv[@]}\n",dest:"~/.hushlogin"},
        //],
        //cmdOpts : new sshCmdAsync_opts(),
        ///
        spawnCmdParams : new SpawnCmdParams()
      },
      serveScripts :{
        default: {
          //cmdOpts : new sshCmdAsync_opts(),
          spawnCmdParams : new SpawnCmdParams()
        }
      },
      //sshfsMountRoot : `${process.env.HOME}/mnt`, 
      // rsyncBackups : [
      //   {
      //     contDir : null, // relative to container user home directory
      //     hostDir : null
      //   }
      // ],
      gits: {
        default: {
          repo : null, 
          contDir : null // relative to container user home directory, will access via sshfs
        }        
      },
    });
    if (this.phoneHomeListen.enable){
      this.cloudInit.phone_home = {
        url: `http://${shared.networkInfo.toAddr}:${phoneHomePort}`,
        post: "all",
        tries: 10
      };
      // temporary
      this.phoneHomeListen.addUfwRule= {
        enable:false,
        ruleArray:makeUfwRule(shared.networkInfo,phoneHomePort,true)
      };
    }
  }  
}

exports.getNetworkInfo=getNetworkInfo;
exports.makeUfwRule=makeUfwRule;
exports.DefaultParams = DefaultParams;

