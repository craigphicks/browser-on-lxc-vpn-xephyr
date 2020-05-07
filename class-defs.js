'strict';

const fs = require('fs');

class sshCmdAsync_opts {
  constructor(){
    this.ssh="ssh";
    this.addSshArgs=[];
    this.remoteCmd=[];
    this.stdin={// piped script
      isFilename:false,
      text:""
    };
    this.echoRemoteIn=true;
    this.stdout='inherit';
    this.stderr='inherit';
  }
  addSshArg(arg){
    this.addSshArgs=this.addSshArgs.append(arg);
    return this;
  }
  addPipeForX11() {
    this.addSshArgs=this.addSshArgs.concat(['-Y']); 
    return this;
  }
  addLPipe(localPort, remotePort){
    this.addSshArgs=this.addSshArgs.concat(
      ['-L', `${localPort}:localhost:${remotePort}`]);
    return this;
  }
  addRPipe(remotePort, localPort){
    this.addSshArgs=this.addSshArgs.concat(
      ['-R', `${remotePort}:localhost:${localPort}`]);
    return this;
  }
  setRemoteCommand(remoteCmd){
    this.remoteCmd=remoteCmd;
    return this;
  }
  setStdinToText(text){
    this.stdin.isFilename=false;
    this.stdin.text=text;
    return this;
  }
  setStdinToFile(fn){
    this.stdin.isFilename=true;
    this.stdin.text=fn;
    return this;
  }
  setStdoutToParent(){
    this.stdout='inherit';
    return this;
  }
  setStderrToParent(){
    this.stderr='inherit';
    return this;
  }
}

class ParamsDefault {
  constructor(name,tz,phoneHomePort){
    Object.assign(this, {
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
        port:phoneHomePort
      },
      postInitScript : {
        copyFiles: [
          {isFilename:false, text:"echo ${argv[@]}\n",dest:"~/.hushlogin"},
        ],
        cmdOpts : new sshCmdAsync_opts()
      },
      serveScripts :{
        default: {
          cmdOpts : new sshCmdAsync_opts()
        }
      },
      cloudInit : { 
        timezone: tz,
        locale: process.env.LANG, 
        packages : [],
        runcmd : [
        ],
      },
    });
  }  
}

class LogStreams {
  constructor(dir, filenameStdout, filenameStderr) {
    fs.mkdirSync(dir,{recursive:true});
    this.stdout = fs.createWriteStream(`${dir}/${filenameStdout}`,'utf8');
    this.stderr = fs.createWriteStream(`${dir}/${filenameStderr}`,'utf8');
  }
  async _write(s,t) {
    // https://nodejs.org/api/events.html#events_error_events    
    // When an error occurs within an EventEmitter instance, the typical action is for an 'error' 
    // event to be emitted. These are treated as special cases within Node.js.
    // If an EventEmitter does not have at least one listener registered for the 'error' event, 
    // and an 'error' event is emitted, the error is thrown, a stack trace is printed, 
    // and the Node.js process exits.    
    return await new Promise((resolve,reject)=>{
      let cb1 = (e)=>{ reject(e);};
      let cb2 = ()=>{ reject(Error(`stream closed before write complete ${t}`));};
      s.once('error', cb1);
      s.once('close', cb2);
      s.write(t, (e) => {
        s.removeListener('error',cb1);
        s.removeListener('close',cb2);
        if (e) reject(e);
        else resolve();        
      });
    }).catch(()=>{}); // after all that, simply ignore the errors!  
  }
  async writeOut(t) { return await this._write(this.stdout,t); }
  async writeErr(t) { return await this._write(this.stderr,t); }
  async writeBoth(t) { 
    return Promise.all([this._write(this.stdout,t), this._write(this.stderr,t)]);
  }
  async _close(s) {
    return new Promise((resolve)=>{
      s.on('error', ()=>{resolve();});
      s.close('CLOSING STREAM', ()=>{ 
        s.removeAllListeners('error');
        resolve();
      });
    });
  }
  async close() {
    return Promise.all([this._close(this.stdout), this._close(this.sterr)]);
  }

}

exports.sshCmdAsync_opts = sshCmdAsync_opts;
exports.ParamsDefault = ParamsDefault;
exports.LogStreams = LogStreams;





