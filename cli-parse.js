`strict`;
//const assert = require('assert');

const symInt = Symbol ('symInt');
const symFloat = Symbol ('symFloat');

class ParseError extends Error {
  constructor(args){
    super(args);
  }
}


class ParseCli {
  constructor(words, completionCWord=-1){
    this.state = { 
      completed:[],
      words:words,
    };
    this.completion={
      active:false,
      cword:completionCWord,
      done:false,
    };
    this.completion.active=(completionCWord>=0);
    this.completionCWord=completionCWord;
  }
  createParseError(msg) {
    return new ParseError(
      `"${this.state.completed} (ERR=>) ${this.words}", ${msg}`
    );
  }
  wordIndex(){
    return this.state.completed.length;
  }
  doCompletion(){
    return this.completion.active 
      && this.completion.cword==this.wordIndex();
  }
  wordToComplete(){
    let cword = Math.max(0,this.completion.cword);
    if (cword >= this.completion.words.length)
      return '';
    else 
      return this.completion.words[cword];
  }
  completionMatch(cand){
    let x = this.wordToComplete();
    return cand.length >= x.length 
      && cand.substring(0,x.length)==x;
  }
  completionDone(){
    return this.completion.done;
  }
  completionSetDone(){
    return this.completion.done=true;
  }

  static convertType(w,t){
    switch (t){
    case symInt:
      if (!(/^-?\d+$/.test(w)) || isNaN(w))
        throw this.createParseError(`not an integer ${w}`);
      return Number(w);
    case symFloat:
      if ((isNaN(w))) 
        throw this.createParseError(`not a float ${w}`);
      return Number(w);
    default:
      throw this.createParseError(`unknown type ${t}`);  
    }
  }
  parsePositionals(args,words,acc=[]){
    if (!args.length)
      return acc;
    if (this.doCompletion()){
      if (typeof args[0] !='symbol') {
        this.addCompletionCand((args[0])(words[0],args[0],true));
        this.completionSetDone();
      }
      return null;
    }
    if (!words.length)
      throw this.createParseError('premature end of input');

    if (typeof args[0] =='symbol') {
      acc.push(this.convertType(words[0],args[0]));
    } else {
      // (args[0])( )
      acc.push((args[0])(words[0],args[0]));
    }
    this.state.completed.push(words.slice(0,1));
    return this.parsePositionalsFn(args.slice(0,1))(words,acc);
  }
  parseFlags(table,words,acc=[]){
    while (words.length){
      if (this.doCompletion()){
        for (const [k] of table){
          if (this.completionMatch(k))
            this.addCompletionCand(k);
        }
        return null;
      }
      let item=table.find((x)=>{return x[0]=words[0];});
      if (!item)
        break;
      this.state.completed.push(words.slice(0,1));
      if (this.doCompletion()){
        this.addCompletionCand((item[1])(words[0],true));
        this.completionSetDone();
        return;
      }
      let value = (item[1])(words[0]);
      this.state.completed.push(words.slice(0,1));
      acc.push([item[0],value]);      
    }
    return acc;
  }
  parseTableItem(obj,words){
    // should be an object with optional keys: flags, positionals, recurse
    let retObj=[];
    if (obj.flags){
      retObj.flags=this.parseFlags(obj.flags,words);
    }
    if (this.completionDone())
      return;
    if (obj.positionals){
      retObj.positionals=this.parsePositionals(obj.positionals,words);
    }
    if (this.completionDone())
      return;
    if (obj.recurse){
      retObj.recurse=this.parseTable(obj.recurse, words);
    }
    return retObj; 
  }

  parseTable(table,words){
    if (table.customFunction)
      return ((table.customFunction)(words));
    if (this.doCompletion()){
      for (const [k] of table){
        let str = (typeof k == 'string') ? k : k.action.key;
        if (this.completionMatch(str))
          this.addCompletionCand(str);
      }
      return null;
    }
    let item = table.find((x)=>{return (
      (typeof x[0]== 'string' && x[0]==words[0]) 
      || (typeof x[0]!= 'string' && x[0].action.key==words[0])
    );});
    if (!item)
      return null;
    this.state.completed.push(words.slice(0,1));
    let retObj={action:{key:item[0]}};
    if (!item[1])
      return retObj;
    else {
      let retObj2 = this.parseTableItem(item[1],words);
      return {...retObj,...retObj2};
    }
  }
}

//const symFin = Symbol ('symFin');

/*
  <returnObject> ::== { 
    action : { 
      key: <string>,
      function: <executable function> | null
    }
    flags: [<flagObj>,...] | null,
    positionals: [<positionalValue>,...] | null,
    recurse: <returnObject> | null,
  }
  flagObj ::== { key:<string>, value: <any> }
  positionalValue ::== <any>
*/
class MyParseCli extends ParseCli {
  constructor(args){
    super(args);
  }
  //////////////////////////////////////////////////////////////
  parseConfFilename(words){
    return words[0];
  }
  parseRoot(words){
    // parse top flags
    
    let table0 = [
      ['xephyr', 0],
      ['test-env',0],
      ['clip-xfer', { 
        positionals: [symInt,symInt],
      }],
      ['config-ssh',0],
      ['config-pulse-audio',0 ],
      //['show-ufw-rule',0 ],
      //['config-ufw-rule',0 ],  
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
    let res = this.parseTableItem(rootTableItem,words);
    return res;
  }
}



