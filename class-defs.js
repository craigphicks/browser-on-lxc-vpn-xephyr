'strict';

const fs = require('fs');
const child_process=require('child_process');

function sshConfigFileArgs(){
  return ['-F', `${process.env.HOME}/.ssh/config-lxc`];
}
function sshXDisplayArgs(){
  return ['-Y'];
}
function sshAudioArgs(){
  return ['-R',  '44713:localhost:4713'];
}

class SpawnCmdParams {
  constructor(
    prog=null,
    args=[],
    stdin={
      filename:"",text:""
    }, //code checks for filename first
    opts={
      detached:false,
      noErrorOnCmdNonZeroReturn:false
    }
  )
  {
    this.prog=prog;
    this.args=args;
    this.stdin=stdin;
    this.opts=opts;    
  }
}

class SpawnCmdError extends Error {
  constructor(message){
    super(message);
  }
}


class SpawnCmd {
  constructor(
    prog=null,
    args=[],
    stdio={
      args:'pipe',
      after:[null,null,null]
    },
    //    stdin={isFilename:false,text:""},
    opts={
      detached:false,
      //outStream:null,
      //errStream:null,
      noErrorOnCmdNonZeroReturn:false
    }
  ){
    this.prog=prog;
    this.args=args;
    //this.stdin=stdin;
    this.stdio=stdio;
    //this.stdio.after=stdio.after;
    this.detached=opts.detached;
    //this.outStream=opts.outStream;
    //this.errStream=opts.errStream;
    this.noErrorOnCmdNonZeroReturn=opts.noErrorOnCmdNonZeroReturn;
  }
  async setFromParams(spawnCmdParamsIn,stdioOverrides=null){
    function waitOpen(h){
      return new Promise((resolve,reject)=>{
        h.on('open',resolve)
          .on('error',(e)=>{reject(e);});
      });
    }
    let spawnCmdParams = JSON.parse(JSON.stringify(spawnCmdParamsIn));
    spawnCmdParams.stdio=[
      spawnCmdParamsIn.stdin,
      spawnCmdParamsIn.stdout, // usually undefined
      spawnCmdParamsIn.stderr, // usually undefined
    ];
    this.prog=spawnCmdParams.prog;
    this.args=spawnCmdParams.args;
    this.detached=spawnCmdParams.opts.detached;
    this.noErrorOnCmdNonZeroReturn=spawnCmdParams.opts.noErrorOnCmdNonZeroReturn;
    //if (stdioOverrides) 
    //  this.stdio=stdioOverrides;
    //else
    this.stdio.args=['ignore','ignore','ignore'];
    if (!spawnCmdParams.stdio)
      ;
    else if (spawnCmdParams.stdio=='inherit')
      this.stdio=['inherit','inherit','inherit'];
    {
      this.stdio.after=[null,null,null];
      for (const i of [0,1,2]){
        if (stdioOverrides.args&&stdioOverrides.args[i]){
          this.stdio.args[i]=stdioOverrides.args[i];
          //Object.assign(this.stdio.args[i],stdioOverrides.args[i]);
          if (stdioOverrides.after&&stdioOverrides.after[i])
            this.stdio.after[i]=stdioOverrides.after[i];
            //Object.assign(this.stdio.after[i],stdioOverrides.after[i]);
        }
        else if (!spawnCmdParams.stdio[i] || spawnCmdParams.stdio[i]=='ignore')
          ;
        else if (spawnCmdParams.stdio[i]=='inherit')
          this.stdio[0]='inherit';
        else if (spawnCmdParams.stdio[i].filename && spawnCmdParams.stdio[i].filename.length){
          let stream= (i==0?
            fs.createReadStream(spawnCmdParams.stdio[0].filename,'utf8')
            : fs.createWriteStream(spawnCmdParams.stdio[0].filename,'utf8'));  
          this.stdio.args[0]= await waitOpen(stream);          
        } else if (i==0 && spawnCmdParams.stdio[0].text && spawnCmdParams.stdio[0].text.length){
          this.stdio.after[0]=spawnCmdParams.stdio[0].text;
          this.stdio.args[0]='pipe';
        }
      }
    }
    return this;
  }
  makeCmdLogStr(){
    let s = (this.stdio[0]) ? '<pipe input> | ' : '';
    return s+`${this.prog} ${this.args.join(' ')}`;
  }
  makeError(msg) {
    return new SpawnCmdError(
      msg + ' : ' + this.makeCmdLogStr()
    ); 
  }
  async call(){
    if (!this.prog)
      throw this.makeError('No program name');
    let stdio=null;
    if (!this.stdio.args)
      stdio='pipe';
    else if (typeof this.stdio.args == 'string')
      stdio=this.stdio.args;
    else 
      stdio=this.stdio.args.map((x)=>x);
    // if (this.stdin.isFilename){
    //   if (!this.stdin.text || !this.stdin.text.length)
    //     throw this.makeError('input filename not provided');
    //   stdin = fs.createReadStream(this.stdin.Filename);
    //   stdio[0]='pipe';
    // } else if (this.stdin.text && this.stdin.text.length) {
    //   stdin = this.stdin.text;
    //   stdio[0]='pipe';
    // }
    {
      let logstr=this.makeCmdLogStr();
      console.log(logstr);
      //if (stdio[1]) stdio[1].write(logstr);
      //if (stdio[2]) stdio[2].write(logstr);
    }
    let proc=null;
    let procPromise = new Promise((resolve, reject)=>{
      proc=child_process.spawn(
        this.prog, this.args, {stdio:stdio, detached:this.detached} 
      )
        .on('error', (e)=>{
          reject(this.makeError(e.message));
        })
        .on('exit',(code,signal)=>{
          console.log(`on exit, code=${code}, signal=${signal}`);
        })
        .on('close',(code,signal)=>{
          console.log(`on close, code=${code}, signal=${signal}`);
          if (code==0 || this.noErrorOnCmdNonZeroReturn)
            resolve();
          else
            reject(this.makeError(`on close, code=${code}, signal=${signal}`));
        });
      if (this.stdio.after){
        if (this.stdio.after[1])
          proc.stdout.pipe(this.stdio.after[1]);
        if (this.stdio.after[2])
          proc.stdout.pipe(this.stdio.after[2]);
        if (this.stdio.after[0]){
          if (typeof this.stdio.after[0]=='string'){
            proc.stdin.write(this.stdio.after[0]);
            proc.stdin.end();
          } else 
            this.stdio.after[0].pipe(proc.stdin);
        }
      }
      if (this.detached){
        proc.unref();
        resolve();
        // setTimeout(()=>{ 
        //   try { 
        //     proc.unref();
        //     resolve();
        //   }
        //   catch(e){}
        // }, 0);
      }
    });
    
    return await procPromise;
    // let unrefProm=null;
    // if (this.detached)
    //   unrefProm=new Promise((resolve,reject)=>{
    //     setTimeout(()=>{
    //       try{
    //         proc.unref();
    //       // eslint-disable-next-line no-empty
    //       }catch(e){}
    //       resolve();
    //     },1);
    // });
    // return await Promise.all(procPromise,unrefProm);
  }
} // class SpawnCmd

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
    //this.echoRemoteIn=true;
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
        //copyFiles: [
        //  {isFilename:false, text:"echo ${argv[@]}\n",dest:"~/.hushlogin"},
        //],
        cmdOpts : new sshCmdAsync_opts(),
        ///
        spawnCmdParams : new SpawnCmdParams()
      },
      serveScripts :{
        default: {
          cmdOpts : new sshCmdAsync_opts(),
          spawnCmdParams : new SpawnCmdParams()
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
      rsyncBackups : [
        {
          contDir : null, // relative to container user home directory
          hostDir : null
        }
      ],
      gits: {
        default: {
          repo : null, 
          contDir : null // relative to container user home directory
        }        
      },
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
exports.SpawnCmd=SpawnCmd;
exports.SpawnCmdParams=SpawnCmdParams;
exports.sshConfigFileArgs=sshConfigFileArgs;
exports.sshXDisplayArgs=sshXDisplayArgs;
exports.sshAudioArgs=sshAudioArgs;




