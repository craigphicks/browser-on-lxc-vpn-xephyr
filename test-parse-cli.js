#!/usr/bin/env node --inspect-brk
'strict';
const { 
  parse, completion, symbols, parseToken, 
} = require('./parse-cli.js');


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
      ['--log', 0],
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
  'xephyr', 
  'test-env',
  'clip-xfer 0 2', 
  'clip-xfer 2 0', 
  'config-ssh',
  'config-pulse-audio',
  'delete-own-config-files', 
];

const rootTable=makeRootTable();
for (const str of testdata0) {
  if (str=='')
    throw new Error(
      'zero length string is not alowable test data, use null instead');
  const a = !str ? [] : str.split(/\s+/);
  // eslint-disable-next-line no-constant-condition
  if (false) {
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
    try {
      testCompItem.completions=completion(rootTable, n,a);
    } catch(e) {
      testCompItem.errorMessage=e.message;
    }
    console.log(JSON.stringify(testCompItem,null,2));
  }
}
