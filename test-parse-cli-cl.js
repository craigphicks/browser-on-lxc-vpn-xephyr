/* eslint-disable no-unused-vars */
'strict';

const { 
  parse, 
  completion, 
  completionAsync, 
  symbols, loggerSync,
  defaultCompletionErrorHandling,
  generateCompletionInterfaceScript
} = require('./parse-cli.js');
const pt = require('./parse-token.js');
const fs=require('fs');

function buildTable(){
  var tableRoot={
    flags:[
      ['--int', symbols.symInt],
      ['--bigint', symbols.symBigInt],
      ['--float', symbols.symFloat],
      ['--filename', symbols.symFilename],
      ['--directoryname',symbols.symDirectoryname],
    ]
  };
  return tableRoot;
}

// function completion(
//   table, completionIndex, words, 
//   completionErrorHandling={toOutput:false,toLogging:true,suppressParseError:false}
// )


async function main_sub(){  
  var table=buildTable();

  switch (process.argv[2]){
  case '__generate_completion_interface_script__':{
    generateCompletionInterfaceScript(
      './tmp/register-completion.sh',
      'testParseCliCl',
      'test-parse-cli-cl',
      'node ./test-parse-cli-cl.js',
      {loggerDbgInitialValue:2}
    );
    // the following is just for debugging 
    generateCompletionInterfaceScript(
      './tmp/register-completion-i.sh',
      'testParseCliCl_i',
      'test-parse-cli-cl-i',
      'node --inspect-brk ./test-parse-cli-cl.js',
      {loggerDbgInitialValue:2}
    );
    break;
  }
  case '__completion__':{
    //if (process.argv[3]!=process.argv.length-4)
    //  throw new Error('something wrong');
    let eh={...defaultCompletionErrorHandling};
    eh.parseErrorToLogging=true; 
    //  errorToOutput:true,errorToLogging:true,
    //  parseErrorToOutput:true,parseErrorToLogging:false,
    let cword = Number(process.argv[3]-1);
    let words=process.argv.slice(5);
    await completionAsync(process.stdout,process.stderr,table,cword,words,eh);
    break;
  } 
  default:{
    let words=process.argv.slice(3);
    parse(table,words);
  }
  }
}

async function main(){
  try {
    await main_sub();
    //await writeStdOut("SUCCESS");
  } catch(e) {
    //await loggerSync(`${e.message}`);
    console.error(JSON.stringify(e,null,2));
    console.error(e.message);
  }
}

main();