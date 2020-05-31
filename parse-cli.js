`strict`;
//const assert = require('assert');

const symInt = Symbol ('symInt');
const symFloat = Symbol ('symFloat');

function deepCopyEnumerable(x){
  if (x===undefined)
    throw new Error('undefined value found in tree');
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
  // boolean, string, number, symbol, function, bigint -> expected and ok
  return x;
}


class ParseError extends Error {
  constructor(args){
    super(args);
  }
}

class ParseCli {
  constructor(table=null, words=null, completionCWord=-1){
    this._table=null;
    this.state = null;
    this.completion=null;
    if (table)
      this.setTable(table);
    if (words)
      this.setWords(words, completionCWord);
  }
  setTable(tableIn){
    let table = ParseCli.createInternalTable(tableIn);
    this._table=table;
  }
  //table(){return this._table; }
  setWords(words, completionCWord=-1){
    if (!words || !Array.isArray(words) 
    || !words.every((x)=>{return typeof x=='string' && x;}))
      throw new Error('input words must be array of non empty strings');
    if (completionCWord>words.length){
      throw new Error(
        `completion word index (${completionCWord})`
        +` cannot be greater than the number of words (${words.length})`);
    }
    if (completionCWord<-1){
      throw new Error(
        `illegal completion word index value (${completionCWord})`);
    }
    this.state = {
      completed:[],
      words:words.slice(),
      wordsIn:Object.freeze(words.slice()),
    };
    if (completionCWord>=0)
      this.completion={
        active:(completionCWord>=0),
        cword:completionCWord,
        done:false,
        candidates:[],
      };
  }

  static deepFreezeTable(t){
    if (t && typeof t=='object'){
      for (const k of Object.keys(t))
        this.deepFreezeTable(t[k]);
      Object.freeze(t);
    }
  }

  static createInternalTable(table){
    function normalize(t){
      // recursively normalize any tables under recurse
      if (Array.isArray(t))
        throw new Error(
          `incorrect table structure, found array: ${JSON.stringify(t),null,2}`);
      if (t && typeof t=='object' && t.recurse) {
        if (!Array.isArray(t.recurse))
          throw new Error(
            `recurse value must be array , but is instead `+
            `${JSON.stringify(t.recurse),null,2}`);
      } else
        return; 
      for (let entry of t.recurse) {
        if (!Array.isArray(entry) || entry.length!=2)
          throw new Error('recurse table entry is not array length 2. instead is '
          + JSON.stringify(entry),null,2);
        if (typeof entry[0]=='string')
          entry[0] = {action:{key:entry[0],function:null}};
        else if (Array.isArray(entry[0]) && entry[0].length==2 && typeof entry[0][0]=='string') 
          entry[0] = {action:{key:entry[0][0],function:entry[0][1]}};
        else if (!(typeof entry[0]=='object' 
        && entry[0].action && typeof entry[0].action == 'object'
        && entry[0].action.key && typeof entry[0].action.key=='string'))
          throw new Error(
            `incorrect recurse table entry structure ${JSON.stringify(entry[0]),null,2}`);

        normalize(entry[1]);
      }
    }
    let t = deepCopyEnumerable(table);
    normalize(t);
    ParseCli.deepFreezeTable(t);
    return t;
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
    return this.completion && this.completion.active 
      && this.completion.cword==this.wordIndex();
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
    return this.completionDo() && this.completion.done;
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
      if (!w || !(/^-?\d+$/.test(w)) || isNaN(w))
        throw this.createParseError(`not an integer ${w}`);
      return Number(w);
    case symFloat:
      if (!w || (isNaN(w))) 
        throw this.createParseError(`not a float ${w}`);
      return Number(w);
    default:
      // also is parse error if w is empty, but unknown symbol takes precedence 
      throw new Error(`unexpected type ${t}`);  
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
      if (!word)
        throw this.createParseError('missing positional argument');
      acc.push((args[0])(word));
    }
    this.popWord();
    return this.parsePositionals(args.slice(1),acc);
  }
  parseFlags(flags,acc=[]){
    while (this.nextWord()){
      let word=this.nextWord();
      if (this.completionDo()){
        for (const [k] of flags){
          if (ParseCli.completionMatch(word,k))
            this.completionAddCand(k);
        }
        return null;
      }
      let item=flags.find((x)=>{return x[0]==word;});
      if (!item) // not finding a flag is not a parse error, break
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
      retObj.recurse=this.parseTableRecurse(obj.recurse);
    }
    return retObj; 
  }

  parseTableRecurse(lut){
    //  return ((table.customFunction)());
    let word=this.nextWord();
    if (this.completionDo()){
      lut.forEach((item)=>{
        if (ParseCli.completionMatch(word,item[0].action.key))
          this.completionAddCand(item[0].action.key);
      });
      return null;
    }
    if (!word)
      return null;
    let item = lut.find((x)=>{return (x[0].action.key==word);});
    if (!item) {
      let keys=lut.reduce((acc,x)=>{acc.push(x[0].action.key);},[]);
      throw this.createParseError(`expecting one of ${keys.join(',')}`);
    }
    this.popWord();
    // iwozere
    if (!item[1])
      return item[0];
    else {
      let item2Rtn = this.parseTableItem(item[1]);
      //return [item[0],item2Rtn];
      return {...item[0],...item2Rtn};
    }
  }
  parse(suppressCompletionParseErrors=false){
    if (!this._table)
      throw new Error('table not set');
    if (!this.state)
      throw new Error('words not set');
    if (this.state.completed.length)
      throw new Error('words not reset after last run');
    if (!this.completion)
      return this.parseTableItem(this._table);
    else {
      try {
        this.parseTableItem(this._table);
      // eslint-disable-next-line no-empty
      } catch (e) {
        if (e instanceof ParseError){
          if (!suppressCompletionParseErrors)
            throw e; 
        } else 
          throw e;
      }
      return this.completionGetCandidates();
    }
  }
}
ParseCli.symInt=symInt;
ParseCli.symFloat=symFloat;

const symbols ={ 
  symInt:symInt,
  symFloat:symFloat,
};
Object.freeze(symbols);

function parse(table,words){
  let pc = new ParseCli(table,words);
  return pc.parse();
}

function completion(table, completionIndex, words, suppressCompletionParseErrors=true){
  if (typeof completionIndex != 'number' && completionIndex>=0){
    throw new Error(
      `completionIndex argument expecting number>=0 but found ${completionIndex}`);
  }
  let pc = new ParseCli(table, words,completionIndex);
  return pc.parse(suppressCompletionParseErrors);
}

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



//exports.ParseCli=ParseCli;
exports.parse=parse;
exports.completion=completion;
exports.symbols=symbols;

