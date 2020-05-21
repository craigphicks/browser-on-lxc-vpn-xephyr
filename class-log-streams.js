`strict`;
const fs = require('fs');
const stream = require('stream');

function createLineXstream(that, which){
  let xstream=new stream.Transform({objectMode:true});
  xstream._transform=function(chunk,_enc,done){
    let str=chunk.toString();
    if (this._leftover)
      str=this._leftover+str;
    let lines=str.split('\n');
    this._leftover=lines.splice(-1,1)[0];
    lines.forEach((line)=>{this.push(line+'\n');});
    if (which=='out')
      that.outn+=lines.length;
    else 
      that.errn+=lines.length;
    process.stdout.write(
      `\rlines (stdout,stderr)=(${that.outn},${that.errn})`,
      done);
  };
  xstream._flush=function(done){
    if (this._leftover)
      this.push(this._leftover);
    this.leftover=null;
    if (which=='out')
      that.outn++;
    else 
      that.errn++;
    process.stdout.write(
      `\rlines (stdout,stderr)=(${that.outn},${that.errn}) [flush ${which}]\n`,
      done);
  };
  return xstream;
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
  async writeOut(t) {
    this.outn++;
    let e = await this._write(this.stdout,t).catch((e)=>{ return e; });
    if (e) {
      this.outNumErrors++;
      process.stdout.write(`LogStreams ERROR: ${e.message}\n`);
    } 
  }
  async writeErr(t) { 
    this.errn++;
    let e = await this._write(this.stderr,t).catch((e)=>{ return e; });
    if (e) {
      this.errNumErrors++;
      process.stderr.write(`LogStreams ERROR: ${e.message}\n`);
    } 
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
  outStream(){
    let x=createLineXstream(this, 'out');
    x.pipe(this.stdout, {end:false});
    return x;
  }    
  errStream(){
    let x=createLineXstream(this, 'err');
    x.pipe(this.stderr, {end:false});
    return x;
  }
}

exports.LogStreams=LogStreams;
