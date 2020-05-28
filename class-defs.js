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
  detachedUnrefDelayMs:1000,
  inheritEnv:true,
  assignToEnv:{}
};

class SpawnCmdError extends Error {
  constructor(message){
    super(message);
  }
}

class SpawnCmdParams {
  // suitable for read/write from file
  constructor(
    prog=null,
    args=[], // nested allowed, e.g., [['a','b'],['c']], in which case concat'ed
    stdin={
      filename:"",text:""
    }, //code checks for filename first
    opts=spawnCmdParams_defaultOpts
  )
  {
    this.prog=prog;
    this.args=args;
    this.stdin=stdin;
    this.opts=Object.assign({},spawnCmdParams_defaultOpts);
    Object.assign(this.opts,opts);
  }
}

const specialOpts_default={
  ...spawnCmdParams_defaultOpts,
  logFunction:console.log.bind(console),
  logStream:null,
};

class SpawnCmd {
  constructor(
    prog=null,
    args=[],
    stdio={
      args:'pipe',
      after:[null,null,null]
    },
    specialOpts=specialOpts_default,
    passThroughOpts={}
  ){
    // let opts_default={
    //   detached:false,
    //   detachedUnrefDelayMs:0,
    //   noErrorOnCmdNonZeroReturn:false,
    //   logFunction:console.log.bind(console),
    //   logStream:null,
    //   inheritEnv:false,
    //   assignToEnv:null,
    // }; 
    this.prog=prog;
    this.args=args;
    this.stdio=stdio;
    Object.keys(specialOpts).forEach((k)=>{
      if (!Object.keys(specialOpts_default).includes(k))
        throw new Error(`incorrect specialOpts property: ${k}`);
    });
    this.specialOpts={...specialOpts_default, ...specialOpts};
    this.passThroughOpts=passThroughOpts;
    for (const check of ['stdio','env','detached'])
      if (Object.keys(this.passThroughOpts).includes(check))
        throw new Error(`${check} is not an allowed property in passThroughArgs`);
  }

  makeCmdLogStr(){
    let envDiff = this.passThroughOpts.env;
    if (envDiff)
      for (const k of Object.keys(process.env))
        if (Object.keys(envDiff).includes(k))
          delete envDiff[k];
    let s = `START CMD:
detached:${this.specialOpts.detached},
detachedUnrefDelayMs:${this.specialOpts.detachedUnrefDelayMs},
noErrorOnCmdNonZeroReturn:${this.specialOpts.noErrorOnCmdNonZeroReturn},
inheritEnv:${this.specialOpts.inheritEnv},
assignToEnv:${JSON.stringify(this.specialOpts.assignToEnv,2)}
${this.prog} ${this.args.join(' ')}
END CMD\n`;
    return s;
  }
  makeError(msg) {
    return new SpawnCmdError(
      msg
    ); 
  }
  async call(){
    async function log_(m){
      if (this.specialOpts.logFunction)
        await this.specialOpts.logFunction(m);
      if (this.specialOpts.logStream)
        await new Promise((res)=>{
          let cb=()=>{res();};
          this.specialOpts.logStream.write(m,cb);
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
    spawnOpts.detached = this.specialOpts.detached; // historical back compat
    spawnOpts.stdio = stdio;
    // the spread operator comes in handy 
    spawnOpts.env = { 
      ...(this.specialOpts.inheritEnv ? process.env : {}), 
      ...this.specialOpts.assignToEnv};
    
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
          if (code==0 || this.specialOpts.noErrorOnCmdNonZeroReturn)
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
      if (this.specialOpts.detached){
        if (!this.specialOpts.detachedUnrefDelayMs){
          proc.unref();
          resolve();
        } else {
          setTimeout(()=>{
            proc.unref();
            resolve();
          },this.specialOpts.detachedUnrefDelayMs);
        }
      }
    });    
    return await procPromise;
  }

  // deprecated
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
    if (spawnCmdParams.args && Array.isArray(spawnCmdParams.args[0]))
      that.args=spawnCmdParams.args.flat(); // flat would actually work for both cases
    else
      that.args=spawnCmdParams.args;
    // these are the options
    that.specialOpts={...that.specialOpts,...spawnCmdParams.opts};
    // that.specialOpts.detached=spawnCmdParams.opts.detached;
    // that.specialOpts.detachedUnrefDelayMs=spawnCmdParams.opts.detachedUnrefDelayMs;
    // that.specialOpts.noErrorOnCmdNonZeroReturn=spawnCmdParams.opts.noErrorOnCmdNonZeroReturn;
    // that.specialOpts.inheritEnv=spawnCmdParams.opts.inheritEnv;
    // that.specialOpts.assignToEnv=spawnCmdParams.opts.assignToEnv;
    // currently only adds or replaces keys, cannot remove keys.
    // if (spawnCmdParams.opts.assignToEnv 
    //   && Object.keys(spawnCmdParams.opts.assignToEnv).length){
    //   let newEnv = Object.assign({},process.env);
    //   that.passThroughOpts.env = Object.assign(newEnv,spawnCmdParams.opts.assignToEnv);
    // }
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


} // class SpawnCmd

async function spawnCmd(
  prog=null,
  args=[],
  stdio={
    args:'pipe',
    after:[null,null,null]
  },
  specialOpts=specialOpts_default,
  passThroughOpts={}
){
  return new SpawnCmd(prog,args,stdio,specialOpts,passThroughOpts).call();
}

async function execSpawnCmdParams(spawnCmdParamsIn,stdioOverrides=null){
  function waitOpen(h){
    return new Promise((resolve,reject)=>{
      h.on('open',resolve)
        .on('error',(e)=>{reject(e);});
    });
  }
  let spawnCmdParams = Object.assign({},spawnCmdParamsIn); 
  spawnCmdParams.stdio=[
    spawnCmdParamsIn.stdin,
    spawnCmdParamsIn.stdout, // usually undefined
    spawnCmdParamsIn.stderr, // usually undefined
  ];
  let that={};
  that.prog=spawnCmdParams.prog;
  // if spawnCmdParams.args are nested arrays then concatenate inner
  if (spawnCmdParams.args && Array.isArray(spawnCmdParams.args[0]))
    that.args=spawnCmdParams.args.flat(); // flat would actually work for both cases
  else
    that.args=spawnCmdParams.args;
  that.specialOpts={...that.specialOpts,...spawnCmdParams.opts};
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
  //return that;
  return await spawnCmd(
    that.prog,
    that.args,
    that.stdio,
    that.specialOpts,
    that.passThroughOpts
  );
}




exports.SpawnCmd=SpawnCmd;
exports.spawnCmd=spawnCmd;
exports.SpawnCmdParams=SpawnCmdParams;
exports.syscmd=syscmd;
exports.execSpawnCmdParams=execSpawnCmdParams;


