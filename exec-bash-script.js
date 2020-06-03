'strict';

const cp=require('child_process');

async function execBashScript(script){
  let buf = Buffer;
  let opts={
    stdin:script,
    //stdio:[null,'pipe','pipe'],
    encoding:'utf8',
  }
  let res = cp.spawnSync('/bin/bash', ['-s'],opts));
  if (res.error)
    throw res.error;
  if (res.status)
    throw new Error(
      `script returned with non-zero (${res.status}) status,`
      + ` stderr: ${res.stderr}`);
  return res.stdout;
}

