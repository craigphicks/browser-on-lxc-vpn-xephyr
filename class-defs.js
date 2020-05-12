'strict';

const fs = require('fs');


class sshCmdAsync_opts {
  constructor(){
    this.ssh="ssh";
    this.addSshArgs=[];
    this.afterDestination='';
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
      sshKeyFilename : `${process.env.HOME}/.ssh/to-${name}`,
      openVPN : {
        enable:false,
        vpnClientCertFilename : `${process.env.HOME}/client-${name}.ovpn`
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
      sshfsMountRoot : `${process.env.HOME}/mnt`, 
    });
  }  
}

class LogStreams {
  constructor(dir, filenameStdout, filenameStderr) {
    fs.mkdirSync(dir,{recursive:true});
    this.stdout = fs.createWriteStream(`${dir}/${filenameStdout}`,'utf8');
    this.stderr = fs.createWriteStream(`${dir}/${filenameStderr}`,'utf8');
    this.outn = 0; // number of lines
    this.errn = 0; // number of lines
    this.outNumErrors=0;
    this.errNumErrors=0;
  }
  outStream(){return this.stdout;}
  errStream(){return this.stderr;}
  async _write(s,t) {
    // https://nodejs.org/api/events.html#events_error_events    
    // When an error occurs within an EventEmitter instance, the typical action is for an 'error' 
    // event to be emitted. These are treated as special cases within Node.js.
    // If an EventEmitter does not have at least one listener registered for the 'error' event, 
    // and an 'error' event is emitted, the error is thrown, a stack trace is printed, 
    // and the Node.js process exits.    
    return await new Promise((resolve,reject)=>{
      let cb1 = (e)=>{ reject(e);};
      //      let cb2 = ()=>{ reject(Error(`stream closed before write complete ${t}`));};
      s.once('error', cb1);
      //      s.once('close', cb2);
      s.write(t, (e) => {
        //        s.removeListener('error',cb1);
        s.removeAllListeners('error');
        //        s.removeListener('close',cb2);
        if (e) 
          reject(e);
        else 
          resolve(null);        
      });
    });
  }
  async writeOut(t,std=true) {
    this.outn++;
    let e = await this._write(this.stdout,t).catch((e)=>{ return e; });
    if (e) {
      this.outNumErrors++;
      process.stdout.write(`LogStreams ERROR: ${e.message}\n`);
    } 
    if (std)
      process.stdout.write(`\
\r# of (chunks,write errors):\
stdout(${this.outn},${this.outNumErrors}), \
stderr(${this.errn},${this.errNumErrors})`);
    return null;
  }
  async writeErr(t,std=true) { 
    this.errn++;
    let e = await this._write(this.stderr,t).catch((e)=>{ return e; });
    if (e) {
      this.errNumErrors++;
      process.stderr.write(`LogStreams ERROR: ${e.message}\n`);
    } 
    if (std)
      process.stderr.write(`\
\r# of (chunks,write errors):\
stdout(${this.outn},${this.outNumErrors}), \
stderr(${this.errn},${this.errNumErrors})`);

    return null;
  }
  async writeBoth(t,std=true) { 
    return await Promise.all([this.writeOut(t,std),this.writeErr(t,std)]);
  }
  async _close(s) {
    return await new Promise((resolve)=>{
      s.on('error', ()=>{resolve();});
      s.end('END OF FILE\n', 'utf8', ()=>{ 
        //s.removeAllListeners('error');
        resolve();
      });
    });
  }
  async close() {
    return await Promise.all([this._close(this.stdout), this._close(this.stderr)]);
  }

}

exports.sshCmdAsync_opts = sshCmdAsync_opts;
exports.ParamsDefault = ParamsDefault;
exports.LogStreams = LogStreams;





