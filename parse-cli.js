`strict`;
//const assert = require('assert');

const symInt = Symbol ('symInt');
const symFloat = Symbol ('symFloat');


function deepCopyEnumerable(x){
  if (x===null) 
    return x;
  if (Array.isArray(x)){
    let y=x.slice();
    for (const k in y)
      y[k]=deepCopyEnumerable(y[k]);
    return y;
  }
  if (typeof x=='object'){
    let y={...x};
    for (const k of Object.keys(y)){
      y[k]=deepCopyEnumerable(y[k]);
    }
    return y;
  }
  return x;
}


class ParseError extends Error {
  constructor(args){
    super(args);
  }
}

class ParseCli {
  constructor(words, completionCWord=-1){
    this.state = { 
      completed:[],
      words:words.slice(),
      wordsIn:Object.freeze(words.slice()),
      table:null,
    };
    this.completion={
      active:false,
      cword:completionCWord,
      done:false,
      candidates:[],
    };
    this.completion.active=(completionCWord>=0);
  }
  static deepFreezeTable(t){
    if (t && typeof t=='object'){
      for (const k of Object.keys(t))
        this.deepFreezeTable(t[k]);
      Object.freeze(t);
    }
  }

  setParseTable(table){
    function normalize(t){
      if (!Array.isArray(t) || t.length!=2)
        throw new Error('table structure is not array length 2. instead is '
          + JSON.stringify(t),null,2);
      if (typeof t[0]=='string')
        t[0] = {action:{key:t[0],function:null}};
      else if (Array.isArray(t[0]) && t[0].length==2 && typeof t[0][0]=='string') 
        t[0] = {action:{key:t[0][0],function:t[0][1]}};
      else if (!(typeof t[0]=='object' 
        && t[0].action && typeof t[0].action == 'object'
        && t[0].action.key && typeof t[0].action.key=='string'))
        throw new Error(
          `incorrect table head structure ${JSON.stringify(t[0]),null,2}`);
      // recursively normalize any tables under recurse
      if (Array.isArray(t[1]))
        throw new Error(
          `incorrect table tail structure ${JSON.stringify(t[1]),null,2}`);
      if (t[1] && typeof t[1]=='object' && t[1].recurse) {
        if (!Array.isArray(t[1].recurse))
          throw new Error(
            `recurse value must be array , but is instead `+
            `${JSON.stringify(t[1].recurse),null,2}`);

        for (let tt of t[1].recurse)
          normalize(tt);
      }
    }
    let t = deepCopyEnumerable(table);
    normalize(t);
    this.state.table=t;
  }

  createParseError(msg) {
    return new ParseError(
      `"${this.state.completed} (ERR=>) ${this.state.words}", ${msg}`
    );
  }
  wordIndex(){
    return this.state.completed.length;
  }
  nextWord(){
    if (!this.state.words.length){
      if (this.completionDo())
        return '';
      else
        return null;
    }
    return this.state.words[0];
  }
  popWord(){
    if (!this.state.words.length)
      throw new Error('no word left to pop');
    this.state.completed.push(this.state.words.splice(0,1));
  }
  completionDo(){
    return this.completion.active 
      && this.completion.cword>=this.wordIndex();
  }
  // completionWordToComplete(){
  //   let cword = Math.max(0,this.completion.cword);
  //   if (cword >= this.completion.wordsIn.length)
  //     return '';
  //   else 
  //     return this.state.wordsIn[cword];
  // }
  static completionMatch(partial,cand){
    return cand.length >= partial.length 
      && cand.substring(0,partial.length)==partial;
  }
  // completionMatch(cand){
  //   let partial = this.completionWordToComplete();
  //   return cand.length >= partial.length 
  //     && cand.substring(0,partial.length)==partial;
  // }
  completionDone(){
    return this.completion.done;
  }
  completionSetDone(){
    return this.completion.done=true;
  }
  completionAddCand(c){
    if (Array.isArray(c))
      this.completion.candidates.concat(c);
    else
      this.completion.candidates.push(c);
  }
  completionGetCandidates(){
    return this.completion.candidates;
  }

  convertType(w,t, completionDo=false){
    // When completionDo is true, return array of candidates matching w,
    // currently no action for completionDo,
    // but will be for, e.g. Symbol('dir')
    if (completionDo)
      return [];
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
  parsePositionals(args,acc=[]){
    let word=this.nextWord();
    if (!args.length)
      return acc;
    if (this.completionDo()){
      if (typeof args[0] =='symbol') 
        this.completionAddCand(
          this.convertType(word,args[0],true));
      else // function
        this.completionAddCand((args[0])(word,args[0],true));
      this.completionSetDone();
      return null;
    }
    if (!word)
      throw this.createParseError('premature end of input');

    if (typeof args[0] =='symbol') {
      acc.push(this.convertType(word,args[0]));
    } else {
      // (args[0])( )
      acc.push((args[0])(word,args[0]));
    }
    this.popWord();
    return this.parsePositionals(args.slice(1),acc);
  }
  parseFlags(table,acc=[]){
    while (this.nextWord()){
      let word=this.nextWord();
      if (this.completionDo()){
        for (const [k] of table){
          if (ParseCli.completionMatch(word,k))
            this.completionAddCand(k);
        }
        return null;
      }
      let item=table.find((x)=>{return x[0]==word;});
      if (!item)
        break;
      this.popWord();

      // get the value corresponding to the key
      word=this.nextWord();
      if (this.completionDo()){
        if (item[1]){
          if (typeof item[1]=='symbol'){
            this.completionAddCand(
              this.convertType(word,item[1], true));
          } else {
            this.completionAddCand((item[1])(word, true));
          }
        }
        this.completionSetDone();
        return;
      }
      let value=null;
      if (item[1]){
        if (typeof item[1]=='symbol'){
          value = this.convertType(word,item[1]);
        } else {
          value = (item[1])(word);
        }
      }
      this.popWord();
      if (value)
        acc.push([item[0],value]);      
    }
    return acc;
  }
  parseTableItem(obj){
    // should be an object with optional keys: flags, positionals, recurse
    let retObj={};
    if (obj.flags){
      retObj.flags=this.parseFlags(obj.flags);
    }
    if (this.completionDone())
      return;
    if (obj.positionals){
      retObj.positionals=this.parsePositionals(obj.positionals);
    }
    if (this.completionDone())
      return;
    if (obj.recurse){
      retObj.recurse=this.parseTable(obj.recurse);
    }
    return retObj; 
  }

  parseTable(table){
    // function matcher(word,eq=(a,b)=>{return a==b;}){
    //   return (x)=>{ return( 
    //     (typeof x[0]== 'string' && eq(word,x[0])) 
    //     || (typeof x[0]!= 'string' && eq(word,x[0].action.key))
    //   );};
    // }
    // function eqComp(w,k){return ParseCli.completionMatch(w,k)}
    if (table.customFunction)
      return ((table.customFunction)());
    let word=this.nextWord();
    if (this.completionDo()){
      for (const [k] of table){
        let str = (typeof k == 'string') ? k : k.action.key;
        if (ParseCli.completionMatch(word,str))
          this.completionAddCand(str);
      }
      return null;
    }
    let item = table.find((x)=>{return (
      (typeof x[0]== 'string' && x[0]==word) 
      || (typeof x[0]!= 'string' && x[0].action.key==word)
    );});
    if (!item)
      return null;
    this.popWord();
    // iwozere
    let retObj={action:{key:item[0],function:item[1]}};
    if (!item[1])
      return retObj;
    else {
      let retObj2 = this.parseTableItem(item[1]);
      return {...retObj,...retObj2};
    }
  }
}
ParseCli.symInt=symInt;
ParseCli.symFloat=symFloat;

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

exports.ParseCli=ParseCli;


