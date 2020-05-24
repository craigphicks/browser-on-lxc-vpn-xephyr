#!/usr/bin/env node
const child_process = require('child_process');
function syscmd(cmd) {
  var so = '';
  so = child_process.execSync(cmd, { encoding: 'utf-8' });
  return so;
}

function notifySend(title, msg){
  title = title.replace(/"/g, '\\"');
  msg = msg.replace(/"/g, '\\"');
  //msg = msg.replace(/'/g, '\\'')
  syscmd(`notify-send "${title}" "${msg}"`);
}

notifySend(
  process.argv[2],
  JSON.stringify(process.argv.slice(3)));

async function main(){

  new Promise((resolve,reject)=>{
    let proc=child_process.spawn(
      'node',
      ['index.js','grammar'].concat(process.argv.slice(2)),
      { stdio:['ignore','pipe','pipe'] }
    )
      .on('err',reject)
      .on('close',resolve);
  });
}

main
  .then(()=>{process.exitCode=0;})
  .catch((e)=>{
    notifySend("error", e.message);
    process.exitCode=1;
  });

//process.stdout.write("foo1 foo2 goo3");
