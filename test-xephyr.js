'strict';

const child_process = require('child_process');

async function run(){

  let prom=new Promise((resolve,reject)=>{
    let proc = child_process.spawn(
      "Xephyr",
      [
        '-ac', '-screen', '1920x1200', '-br', '-reset', '-zap', ':2'
      ],
      { stdio:'ignore', detach:true}
    )
      .on('error',(e)=>reject(e))
      .on('close',(code,sig)=>{
        console.log(`on close: ${code} ${sig}`);
        if (code) reject(Error(`${code}`));
        resolve();
      });
    proc.unref();
    resolve();
  });
  return await prom;
}

run().then(
  ()=>{ console.log('SUCESS');},
  (e)=>{ console.log(`FAIL: ${e.message}`);}
);
