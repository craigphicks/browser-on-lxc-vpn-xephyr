#!/usr/bin/env node
`strict`;
const child_process = require('child_process');

// TODO: write unviewable error messasges to system log

function notifySend(title, msg){
  title = title.replace(/"/g, '\\"');
  msg = msg.replace(/"/g, '\\"');
  //msg = msg.replace(/'/g, '\\'')
  try {
    child_process.execSync(`notify-send "${title}" "${msg}"`);
  } catch(e) {
    console.log(`system call "notify-send" failed with ${e.message}`);
  }
}

async function clipXferSub(fromDispNum,toDispNum){
  var clipValue;
  let cmd1 = `xsel --display :${fromDispNum} --clipboard --output`;
  let cmd2 = `xsel --display :${toDispNum} --clipboard --input`;
  try {
    clipValue = child_process.execSync(cmd1, { encoding: 'utf-8' });
  } catch(e) {
    throw Error(`Display ${fromDispNum} clipboard is empty`);
  }
  await new Promise((resolve, reject)=>{		
    // eslint-disable-next-line no-unused-vars
    var proc = child_process.exec(cmd2, (error, stdout, stderr) => {
      //if (stdout) console.log(stdout);
      //if (stderr) console.log(stderr);
      if (error) {
        reject(Error(`${error.message}`));
      }
      resolve();
    });
    if (!proc.stdin.write(clipValue))
      reject(Error('clipToCont(), pipe write failed'));
    proc.stdin.end();
  });					 
}

async function ClipXfer(fromDispNum,toDispNum){
  let f = (outcome)=>{
    notifySend("clipXfer",  `${fromDispNum} => ${toDispNum} ${outcome}`);
  }; 
  await clipXferSub(fromDispNum,toDispNum)
    .then(f('SUCCESS'))
    .catch((e)=>{f(`FAILURE, ${e.message}`); throw e;});
}

async function main()
{
  let argOff=2;
  if (process.argv.length-argOff<2)
    throw Error('clip-xfer requires two arguments: fromDispNum, toDispNum');
  let fromDispNum = process.argv[argOff];
  let toDispNum = process.argv[argOff+1];
  argOff+=2;
  ClipXfer(fromDispNum,toDispNum);
}

//console.log(process.argv);
//console.log(process.env);
main()
  .then(()=>{process.exitCode=0;})
  .catch((e)=>{
    console.log(e);
    process.exitCode=1;
  });

exports.ClipXfer=ClipXfer;