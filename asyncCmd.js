'strict';

const child_process = require('child_process');

class AsyncCmdHandlers {
  constructor(writeable,begin=null,end=null){
    this.writeable;
    this.begin=begin;
    this.end=end;
  }
}

class AsyncCmdOptions {
  constructor(arg){
    Object.assign(this,{
      nodeFunctionName: 'spawn', // string - only 'spawn' accepted
      prog:"",
      args:[],
      stdin: null, 
      stdoutHandlers: new AsyncCmdHandlers(process.stdout),
      stderrHandlers: new AsyncCmdHandlers(process.stderr),
      opts : {} // other options pass to exec (or spawn), e.g., 'detach'
    });
    if (arg) {
      Object.assign(arg); // overrides
    }
  }
}

async function asyncCmd(opts){

  let passOpts = opts.opts;
  // override stdio if it was there !!!
  passOpts.stdio = 
      [
        opts.stdin?'pipe':'ignore', 
        opts.stdout?'pipe':'ignore', // 'inherit' == default handlers case ...
        opts.stderr?'pipe':'ignore'  //    ditto
      ];

  let proc = child_process.spawn(opts.prog, opts.args, passOpts);

  let stdinPromise = Promise.resolve(0);
  if (typeof opts.stdin == 'string') {
    stdinPromise = new Promise((resolve, reject)=>{
      proc.stdin.on('error', (e)=>{ reject(e); });
      proc.stdin.write(opts.stdin, ()=>{ resolve(); });
    });
  } else {
    Object.prototype.hasOwnProperty(opts.stdin,'read')
    stdinPromise = new Promise((resolve, reject)=>{
      proc.stdin.once('error', (e)=>{ reject(e); });
      opts.stdin.once('error', (e)=>{ reject(e); });
      opts.stdin.once('close', (e)=>{ 
        proc.stdin.end();
        resolve(e); 
      });
      opts.stdin.pipe(proc.stdin);
    });
  }

  let makePromise=(src,sink)=>{
    return new Promise((resolve,reject)=>{
      if (sink.begin)
        sink.begin();
      src.once('error',(e)=>{
        if (sink.end)
          sink.end(e);
        reject(e);
      });
      src.once('end',(e)=>{
        if (sink.end)
          sink.end(e);
        resolve();
      });
      src.on('data',(data)=>{
        new Promise((rslv,rjct)=>{
          sink.writeable.write(data,(e)=>{
            // sink.end(e) is called in the catch below 
            if (e) rjct(e); 
            else rslv(e);
          });
        }).catch((e)=>{
          if (sink.end)
            sink.end(e);
          reject(e);
        });
      });
    });
  };
  let stdoutPromise = Promise.resolve(0);
  let stderrPromise = Promise.resolve(0);
  if (opts.stdoutHandlers) 
    stdoutPromise = makePromise(proc.stdout,opts.stdoutHandlers);
  if (opts.stderrHandlers) 
    stderrPromise = makePromise(proc.stderr,opts.stderrHandlers);


  let procPromise = new Promise((resolve, reject)=>{
    proc.once('exit', (code, signal) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`(asyncCmd) error code [${code}], signal [${signal}]`));
      }
    });
    proc.once('error', (e) => {
      proc.removeAllListeners(['exit']);
      reject(new Error(`(asynCmd) error [${e}]`));
    });
  });
    
  return await Promise.all([stdinPromise,stdoutPromise,stderrPromise,procPromise]);
}


exports.asyncCmd = asyncCmd;
exports.AsyncCmdOptions = AsyncCmdOptions;
exports.AsyncCmdHandlers = AsyncCmdHandlers;