#!/usr/bin/env node --inspect-brk
'strict';
const { 
  ParseCli, 
} = require('./parse-cli.js');

class MyParseCli extends ParseCli {
  constructor(...args){
    super(...args);
  }
  parseConfFilename(w,continueDo=false){
    if (continueDo)
      return [];
    return w;
  }
  parse(){
    // parse top flags
    var words=this.state.words;
    let table0 = [
      ['xephyr', 0],
      ['test-env',0],
      ['clip-xfer', { 
        positionals: [ParseCli.symInt,ParseCli.symInt],
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

    let rootTableItem = {
      action:{key:null,function:null},
      flags:[
        ['--log', 0],
        ['--conf', this.parseConfFilename],
        ['--help', 0],
      ],
      postitionals:null,
      recurse: table0.concat(table1),
    };
    MyParseCli.deepFreezeTable(rootTableItem);

    let res = this.parseTableItem(rootTableItem,words);
    if (this.completionDo())
      return this.completionGetCandidates();
    else
      return res;
  }
}

////////////////////////////////////////////////////////////////////

function completion(cword,words){
  let pc = new MyParseCli(words,cword);
  let nextCandidates = pc.parse(); // result not used for completion
  return nextCandidates;
}

function parse(words){
  let pc = new MyParseCli(words);
  return pc.parse(); // result not used for completion
}

////////////////////////////////////////////////////////////////////

const testdata0 = [
  null,
  '',
  'xephyr', 
  'test-env',
  'clip-xfer 0 2', 
  'clip-xfer 2 0', 
  'config-ssh',
  'config-pulse-audio',
  'delete-own-config-files', 
];


for (const str of testdata0) {
  const a = !str ? [] : str.split(/\s+/);
  console.error(`---> parse ${str}`);
  let testParseItem = { type:'parse', input: [a]};
  try {
    testParseItem.parsed=parse(a);
  } catch(e) {
    testParseItem.errorMessage=e.message;
  }
  console.log(JSON.stringify(testParseItem,null,2));
  continue;
  for (let n=0; n<=a.length; n++ ) {
    //console.log(`---> ${n}, ${str}`);
    console.error(`---> completion ${n}, ${str}`);
    let testCompItem = { type:'completion', input: [n,a]};
    try {
      testCompItem.completions=completion(n,a);
    } catch(e) {
      testCompItem.errorMessage=e.message;
    }
    console.log(JSON.stringify(testCompItem,null,2));
  }
}
