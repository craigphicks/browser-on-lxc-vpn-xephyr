'strict';

const fs = require('fs');
const child_process = require('child_process');

async function mount() {
  let sshfsErrLog = fs.createWriteStream('./sshfs-err-log.log');
  await new Promise((res,rej)=>{sshfsErrLog.on('error',rej).on('open',res);});
  let args = ['-o', 'sshfs_debug', '-d', '-o', 'UserKnownHostsFile=/dev/null', '-o', 
    'StrictHostKeyChecking=no', '-o', 'idmap=user', '-o', 'reconnect', '-o', 
    'IdentityFile=/home/craig/.ssh/to-tensorflow-jupyter', 'ubuntu@10.64.64.138:', 
    '/home/craig/mnt/tensorflow-jupyter'
  ];
  let stdio = [ 'ignore', 'ignore', sshfsErrLog ];
  let proc=child_process.spawn('sshfs',args,{ stdio: stdio, detach:true });   
  return await new Promise((resolve, reject)=>{
    proc.on('error',(e)=>{
      reject(e);
    }).on('exit',(code,signal)=>{
      if (code || signal) 
        reject(new Error(`sshfsMount code(${code}), signal(${signal})`));
      console.log('exit event');
      resolve();
    }).on('disconnect',()=>{
      console.log('disconnect event');
      resolve();
    }).on('close',()=>{
      console.log('close event');
      resolve();
    });
    setTimeout(()=>{proc.unref();},1000); // <- disappears here when 'sshfs ...' succeeds.
  });
}

async function unmount() {
  let args = [
    '-u','/home/craig/mnt/tensorflow-jupyter'
  ];
  let stdio = [ 'ignore', 'pipe', 'pipe' ];
  let proc=child_process.spawn('fusermount',args,{ stdio: stdio, detached:true });   
  let procPromise = new Promise((resolve, reject)=>{
    proc.on('error',(e)=>{
      reject(e);
    }).on('exit',(code,signal)=>{
      if (code || signal) 
        reject(new Error(`unmount code(${code}), signal(${signal})`));
      resolve();
    });
  });
  let stdoutPromise = new Promise((resolve,reject)=>{
    proc.stdout.pipe(process.stdout, {end:false})
      .on('error',reject).on('end',resolve);
  });
  let stderrPromise = new Promise((resolve,reject)=>{
    proc.stderr.pipe(process.stderr, {end:false})
      .on('error',reject).on('end',resolve);
  });
  return await Promise.all([procPromise,stdoutPromise,stderrPromise]);
}

async function sub() {

  switch (process.argv[2]) {
  case 'm' : 
    await mount().then(
      ()=>{console.log('success return from mount()');},
      (e)=>{console.log('error return from mount(): '+e.message);}
    );
    break;
  case 'u' : 
    await unmount().then(
      ()=>{console.log('success return from unmount()');},
      (e)=>{console.log('error return from unmount()'+e.message);}
    );
    break;
  }
}

sub();
