#!/usr/bin/env node --inspect-brk
/* eslint-disable no-unused-vars */
'strict';
const { 
  parse, completion, symbols, parseToken, loggerSync 
} = require('./parse-cli.js');

// exports.parse=parse;
// exports.completion=completion;
// exports.parseToken=parseToken; // forwarded from parse-token.js 
// exports.symbols=symbols;
// exports.loggerSync=loggerSync; // forwarded from logger.js


function makeRootTable(){
  let table0 = [
    ['xephyr', 0],
    ['test-env',0],
    ['clip-xfer', { 
      positionals: [symbols.symInt,symbols.symInt],
    }],
    ['config-ssh',0],
    ['config-pulse-audio',0 ],
    ['delete-own-config-files',0 ],
  ];
  let table1_1 = [
    ['init', 0],
    ['post-init',{
      flags:[
        ['--copyOnly',0]
      ]
    }],
    ['serve',{
      flags:[['--log',0]]
    }],
    ['sshfs-mount',0],
    ['sshfs-unmount',0],
    ['git-restore',0],
    ['git-push',0],
  ];
  let table1 = [
    ["anac-safe",{
      recurse:table1_1
    }]
  ];

  let rootTable = {
    flags:[
      ['--log', symbols.symDirectoryname],
      ['--conf', symbols.symFilename],
      ['--help', 0],
    ],
    postitionals:null,
    recurse: table0.concat(table1),
  };
  return rootTable;
}

const testdata0 = [
  null,
  //  '',
  '--log /tmp/',
  '--conf test-parse-cli.js',
  'xephyr', 
  'test-env',
  'clip-xfer 0 2', 
  'clip-xfer 2 0', 
  'config-ssh',
  'config-pulse-audio',
  'delete-own-config-files', 
  '--conf test-parse-cli.js anac-safe sshfs-umount'
];

const rootTable=makeRootTable();
for (const str of testdata0) {
  if (str=='')
    throw new Error(
      'zero length string is not alowable test data, use null instead');
  const a = !str ? [] : str.split(/\s+/);
  // eslint-disable-next-line no-constant-condition
  if (true) {
    console.error(`---> parse ${str}`);
    let testParseItem = { type:'parse', input: a};
    try {
      testParseItem.parsed=parse(rootTable,a);
    } catch(e) {
      testParseItem.errorMessage=e.message;
    }
    console.log(JSON.stringify(testParseItem,null,2));
  }
  //continue;
  for (let n=0; n<=a.length; n++ ) {
    //console.log(`---> ${n}, ${str}`);
    console.error(`---> completion ${n}, ${str}`);
    let testCompItem = { type:'completion', input: [n,a]};
    let output={};
    {
      let r= completion(rootTable, n,a);
      if (r.error)
        output.errorMessage=r.error.message;
      else if (r.parseError)
        output.parseErrorMessage=r.parseError.message;
      else {
        output.tokens = r.tokens;
        output.compOpts = r.compOpts;
      }
      testCompItem.output=output;
    //catch(e) 
    //  output.unexpectedError.message=e.message;
    }
    console.log(JSON.stringify(testCompItem,null,2));
  }
}


// async function main_sub(){  
//   switch (process.argv[2]){
//   case 'completion':
//     //if (process.argv[3]!=process.argv.length-4)
//     //  throw new Error('something wrong');
//     await completion(process.argv.slice(5));
//     break;
//   default:
//     await parse(process.argv[2]);
//   }
// }

// async function main(){
//   try {
//     await main_sub();
//     //await writeStdOut("SUCCESS");
//   } catch(e) {
//     await logger('testParseToken', `test-parse-token.js: ${e.message}`);
//   }
// }

// main();