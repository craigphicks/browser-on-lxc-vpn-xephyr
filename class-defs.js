'strict';

const fs = require('fs');
const child_process=require('child_process');

function sshConfigFileArgs(){
  return ['-F', `${process.env.HOME}/.ssh/config-lxc`];
}
function sshXDisplayArgs(){
  return ['-X'];
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
      noErrorOnCmdNonZeroReturn:false,
      assignToEnv:{}
    },
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
      noErrorOnCmdNonZeroReturn:false,
      logFunction:console.log.bind(console),
      logStream:null
    },
    passThroughOpts={}
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
    this.logFunction=opts.logFunction;
    this.logStream=opts.logStream;
    this.passThroughOpts=passThroughOpts;
  }
  static async setFromParams(spawnCmdParamsIn,stdioOverrides=null){
    function waitOpen(h){
      return new Promise((resolve,reject)=>{
        h.on('open',resolve)
          .on('error',(e)=>{reject(e);});
      });
    }
    let that = new SpawnCmd();
    let spawnCmdParams = Object.assign({},spawnCmdParamsIn); 
    //JSON.parse(JSON.stringify(spawnCmdParamsIn));
    spawnCmdParams.stdio=[
      spawnCmdParamsIn.stdin,
      spawnCmdParamsIn.stdout, // usually undefined
      spawnCmdParamsIn.stderr, // usually undefined
    ];
    that.prog=spawnCmdParams.prog;
    that.args=spawnCmdParams.args;
    that.detached=spawnCmdParams.opts.detached;
    that.noErrorOnCmdNonZeroReturn=spawnCmdParams.opts.noErrorOnCmdNonZeroReturn;
    // currently only adds or replaces keys, cannot remove keys.
    if (spawnCmdParams.opts.assignToEnv 
      && Object.keys(spawnCmdParams.opts.assignToEnv).length){
      let newEnv = Object.assign({},process.env);
      that.passThroughOpts.env = Object.assign(newEnv,spawnCmdParams.opts.assignToEnv);
    }
    //if (stdioOverrides) 
    //  that.stdio=stdioOverrides;
    //else
    that.stdio.args=['ignore','ignore','ignore'];
    //if (!spawnCmdParams.stdio) // always false now
    //  ;
    //else if (spawnCmdParams.stdio=='inherit') // always false now
    //  that.stdio=['inherit','inherit','inherit'];
    {
      that.stdio.after=[null,null,null];
      for (const i of [0,1,2]){
        if (stdioOverrides&&stdioOverrides.args&&stdioOverrides.args[i]){
          that.stdio.args[i]=stdioOverrides.args[i];
          //Object.assign(that.stdio.args[i],stdioOverrides.args[i]);
          if (stdioOverrides.after&&stdioOverrides.after[i])
            that.stdio.after[i]=stdioOverrides.after[i];
            //Object.assign(that.stdio.after[i],stdioOverrides.after[i]);
        }
        else if (!spawnCmdParams.stdio[i] || spawnCmdParams.stdio[i]=='ignore')
          ;
        else if (spawnCmdParams.stdio[i]=='inherit')
          that.stdio[0]='inherit';
        else if (spawnCmdParams.stdio[i].filename && spawnCmdParams.stdio[i].filename.length){
          let stream= (i==0?
            fs.createReadStream(spawnCmdParams.stdio[0].filename,'utf8')
            : fs.createWriteStream(spawnCmdParams.stdio[0].filename,'utf8'));  
          that.stdio.args[0]= await waitOpen(stream);          
        } else if (i==0 && spawnCmdParams.stdio[0].text && spawnCmdParams.stdio[0].text.length){
          that.stdio.after[0]=spawnCmdParams.stdio[0].text;
          that.stdio.args[0]='pipe';
        }
      }
    }
    return that;
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
    async function log_(m){
      if (this.logFunction)
        await this.logFunction(m);
      if (this.logStream)
        await new Promise((res)=>{
          let cb=()=>{res();};
          this.logStream.write(m,cb);
        });
    }
    let log = log_.bind(this);
    if (!this.prog)
      throw this.makeError('No program name');
    let stdio='pipe';
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
      if (this.stdio
        && this.stdio.after
        && this.stdio.after[0]
        && typeof this.stdio.after[0]=='string')
        logstr += `\nSTART INPUT SCRIPT:\n${this.stdio.after[0]}END INPUT SCRIPT`;
      await log(logstr);
    }
    let proc=null;
    let spawnOpts = Object.assign({},this.passThroughOpts);
    spawnOpts.detached = this.detached; // historical back compat
    spawnOpts.stdio = stdio;
    let procPromise = new Promise((resolve, reject)=>{
      proc=child_process.spawn(
        this.prog, this.args, 
        spawnOpts 
      )
        .on('error', async (e)=>{
          try {await log(e.message);}
          // eslint-disable-next-line no-empty
          catch(e){}
          reject(this.makeError(e.message));
        })
        .on('exit', async (code,signal)=>{
          await log(`on exit, code=${code}, signal=${signal}`);
        })
        .on('close', async (code,signal)=>{
          await log(`on close, code=${code}, signal=${signal}`);
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
      }
    });    
    return await procPromise;
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




