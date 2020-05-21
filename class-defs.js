'strict';

const fs = require('fs');
const child_process=require('child_process');

// function sshConfigFileArgs(){
//   return ['-F', `${process.env.HOME}/.ssh/config-lxc`];
// }
// function sshXDisplayArgs(){
//   return ['-X'];
// }
// function sshAudioArgs(){
//   return ['-R',  '44713:localhost:4713'];
// }

function syscmd(cmd) {
  var so = '';
  // eslint-disable-next-line no-useless-catch
  try {
    console.log(cmd);
    so = child_process.execSync(cmd, { encoding: 'utf-8' });
    //console.log(so);
    return so;
  } catch (e) {
    // console.log('command fail:\n', cmd);
    // console.log('command output:\n', so);
    // console.log('command error:\n', e);
    throw e;
  }
}

const spawnCmdParams_defaultOpts={
  detached:false,
  noErrorOnCmdNonZeroReturn:false,
  detachUnrefDelayMs:1000,
  assignToEnv:{}
};
class SpawnCmdParams {
  constructor(
    prog=null,
    args=[],
    stdin={
      filename:"",text:""
    }, //code checks for filename first
    opts=spawnCmdParams_defaultOpts
  )
  {
    this.prog=prog;
    this.args=args;
    this.stdin=stdin;
    this.opts=spawnCmdParams_defaultOpts;
    Object.assign(this.opts,opts);
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
    opts={
      detached:false,
      detachUnrefDelayMs:0,
      noErrorOnCmdNonZeroReturn:false,
      logFunction:console.log.bind(console),
      logStream:null,
    },
    passThroughOpts={}
  ){
    let opts_default={
      detached:false,
      detachUnrefDelayMs:0,
      noErrorOnCmdNonZeroReturn:false,
      logFunction:console.log.bind(console),
      logStream:null
    }; 
    this.prog=prog;
    this.args=args;
    this.stdio=stdio;
    Object.assign(this,opts_default);
    for (const k of Object.keys(opts)){
      if (Object.keys(opts_default).includes(k))
        this[k]=opts[k];
      else
        throw Error(`incorrect option ${k}`);
    }
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
    // these are the options
    that.detached=spawnCmdParams.opts.detached;
    that.detachUnrefDelayMs=spawnCmdParams.opts.detachUnrefDelayMs;
    that.noErrorOnCmdNonZeroReturn=spawnCmdParams.opts.noErrorOnCmdNonZeroReturn;
    // currently only adds or replaces keys, cannot remove keys.
    if (spawnCmdParams.opts.assignToEnv 
      && Object.keys(spawnCmdParams.opts.assignToEnv).length){
      let newEnv = Object.assign({},process.env);
      that.passThroughOpts.env = Object.assign(newEnv,spawnCmdParams.opts.assignToEnv);
    }
    that.stdio.args=['ignore','ignore','ignore'];
    {
      that.stdio.after=[null,null,null];
      for (const i of [0,1,2]){
        let hadOverride=false;
        if (stdioOverrides&&stdioOverrides.args&&stdioOverrides.args[i]){
          that.stdio.args[i]=stdioOverrides.args[i];
          hadOverride=true;
        }
        if (stdioOverrides&&stdioOverrides.after&&stdioOverrides.after[i]){
          that.stdio.after[i]=stdioOverrides.after[i];
          // must be pipe - allowing the caller to omit it
          that.stdio.args[i]='pipe';
          hadOverride=true;
        }
        if (hadOverride)
          continue;
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
        // eslint-disable-next-line no-unused-vars
        .on('exit', async (code,signal)=>{
          //await log(`on exit, code=${code}, signal=${signal}`);
        })
        .on('close', async (code,signal)=>{
          //await log(`on close, code=${code}, signal=${signal}`);
          if (code==0 || this.noErrorOnCmdNonZeroReturn)
            resolve();
          else
            reject(this.makeError(`on close, code=${code}, signal=${signal}`));
        });
      if (this.stdio.after){
        if (this.stdio.after[1])
          proc.stdout.pipe(this.stdio.after[1]);
        if (this.stdio.after[2])
          proc.stderr.pipe(this.stdio.after[2]);
        if (this.stdio.after[0]){
          if (typeof this.stdio.after[0]=='string'){
            proc.stdin.write(this.stdio.after[0]);
            proc.stdin.end();
          } else {
            this.stdio.after[0].pipe(proc.stdin);
          }
        }
      }
      if (this.detached){
        if (!this.detachUnrefDelayMs){
          proc.unref();
          resolve();
        } else {
          setTimeout(()=>{
            proc.unref();
            resolve();
          },this.detachUnrefDelayMs);
        }
      }
    });    
    return await procPromise;
  }
} // class SpawnCmd


exports.SpawnCmd=SpawnCmd;
exports.SpawnCmdParams=SpawnCmdParams;
// exports.sshConfigFileArgs=sshConfigFileArgs;
// exports.sshXDisplayArgs=sshXDisplayArgs;
// exports.sshAudioArgs=sshAudioArgs;
exports.syscmd=syscmd;



