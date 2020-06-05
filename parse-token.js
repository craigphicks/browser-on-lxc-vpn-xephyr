'strict';

const fs = require('fs');
const cp = require('child_process');
const { loggerSync } = require('./logger.js');
//const { execBashScript } = require('./exec-bash-script.js');



// eslint-disable-next-line no-unused-vars
function parsePartialMatch(partial,token){
  return partial.length<=token.length
    && partial==token.slice(0,partial.length);
}

class ParseToken {
  constructor(){}
  parse(w){ return w;}
  // eslint-disable-next-line no-unused-vars
  completion(partial) { return []; }
  // eslint-disable-next-line no-unused-vars
  hint(w){ return 'String'; }
}

class ParseString extends ParseToken {
  constructor(opts={hint:'hint'}){
    super();
    this.opts={...opts};
  }
  parse(w){ return w;}
  completion(partial) { 
    if (partial[partial.length-1]=='')
      return ['hint:', this.hint()]; 
    else
      return [];
  }
  // eslint-disable-next-line no-unused-vars
  hint(){ return `[[${this.hintStr}]]`; }
}


class ParseInt extends ParseString {
  constructor(opts={hint:'Int'}){super(opts);}
  parse(w){ 
    if (!(/^-?\d+$/.test(w)) || isNaN(w))
      throw new Error(`not a valid Integer: ${w}`);
    let n = Number(w);
    if (n<Number.MIN_SAFE_INTEGER || n>Number.MAX_SAFE_INTEGER)
      throw new Error(`Integer magnitude too large ${w}`);
    return Number(w);
  }
}
class ParseBigInt extends ParseString {
  constructor(opts={hint:'BigInt'}){super(opts);}
  parse(w){ 
    if (!(/^-?\d+$/.test(w)))
      throw new Error(`not a valid BigInt: ${w}`);
    // eslint-disable-next-line no-undef
    return BigInt(w);
  }
}

class ParseFloat extends ParseString {
  constructor(opts={hint:'Float'}){super(opts);}
  parse(w){ 
    if (isNaN(w))
      throw new Error(`not a valid Float: ${w}`);
    let n = Number(w);
    // Beware!
    // Number.MAX_VALUE+1 > Number.MAX_VALUE -> false
    // Number.MAX_VALUE*2 > Number.MAX_VALUE -> true
    if (n<Number.MIN_VALUE || n>Number.MAX_VALUE)
      throw new Error(`float magnitude too large ${w}`);
    return Number(w);
  }
}

// function execCompgenish(cmd,partial){
//   if (!partial)
//     partial = '';
//   try {
//     // problematic, returns 1 (failure) for the case of no matches        
//     var r = cp.execSync(`${cmd} ${partial}`,{shell:'/bin/bash',encoding:'utf8'});
//   } catch(e) {
//     r = "";
//   }
//   let candarr = r.split(/\s+/);
//   candarr=candarr.filter((x)=>{return !!x;});
//   return candarr;
// }

function spawnCompgen(args,partial){
  if (!partial)
    partial = '';
  try {
    var r;
    var retObj = cp.spawnSync('compgen',
      args.concat([partial]),
      {shell:'/bin/bash',encoding:'utf8'});
    if (retObj.status) {
      loggerSync(retObj.error.message + ', ' + retObj.stderr);
      r="";
    } else if (retObj.signal){
      r="";
    } else {
      r = retObj.stdout;
    }
  } catch(e) {
    r = "";
  }
  let candarr = r.split(/\s+/);
  candarr=candarr.filter((x)=>{return !!x;});
  return candarr;
}


const validCompOptions = [
  "bashdefault",
  "default",
  "dirnames",
  "filenames",
  "noquote",
  "nosort",
  "nospace",
  "plusdirs",
];
Object.freeze(validCompOptions);

function defaultCompOpts(){
  let r={};
  for (const k of validCompOptions)
    r[k]=false;
  return r;
}

function assignCompOpts(dest,src){
  for (const k of Object.keys(src)){
    if (!validCompOptions.includes(k))
      throw new Error(`${k} is not a valid compopt option, `+
      `must be one of ${JSON.stringify(validCompOptions,null,2)}`);
    dest[k]=!!src[k];
  }
}

/////////////////////////////////////
// For details on compgen see
// https://www.gnu.org/software/bash/manual/html_node/Programmable-Completion-Builtins.html
// #Programmable-Completion-Builtins
class ParseFilenameViaCompgen extends ParseToken {
  constructor(opts=ParseFilenameViaCompgen.defaultOpts){
    super();
    this.opts={...ParseFilenameViaCompgen.defaultOpts};
    this.opts.compOpts={...ParseFilenameViaCompgen.defaultOpts.compOpts};
    if (opts._noFiles)
      this.opts._noFiles=true;
    if (opts.compOpts){
      assignCompOpts(this.opts.compOpts,opts.compOpts);
    }
    if (opts.regexp)
      if (opts.regexp instanceof RegExp)
        this.opts.regexp=opts.regexp;
      else 
        throw new Error(`${opts.regexp} is not instanceof RegExp`);    
  }
  static getFilePart(fn){
    let li=fn.lastIndexOf('/');
    if (li>=0)
      fn=fn.slice(li+1);
    return fn;
  }
  testRegexp(fn){
    fn=ParseFilenameViaCompgen.getFilePart(fn);
    return this.opts.regexp.test(fn);
  }
  completion(partial){
    if (this.opts._noFiles)
      return {tokens:[],compOpts:this.opts.compOpts};

    //    let af = execCompgenish(`compgen -A file ${partial}`);
    let af = spawnCompgen(['-A', 'file'], partial);

    if (this.opts.regexp) {
      af=af.filter(this.testRegexp.bind(this));
    }
    af.filter((fn,index)=>{
      try {
        var realPath = fs.realpathSync(fn);
      } catch (e) {
        return false;
      }
      if (!fs.existsSync(realPath))
        return false;
      if (fs.lstatSync(realPath).isDirectory())  
        if (fn[fn.length-1]!='/')
          af[index]+='/';
    });
    return  {tokens:af,compOpts:this.opts.compOpts}; 
  }
  parse(path){
    try {
      var realPath = fs.realpathSync(path);
    } catch(e) {
      throw new Error(`cannot get real path: ${path}, ${e.message}`);
    }
    if (!fs.existsSync(realPath))
      throw new Error(`does not exist: ${path}`);

    if (this.opts._noFiles) {
      if (!fs.lstatSync(realPath).isDirectory())
        throw new Error(`is not a directory: ${path}`);
      return path;
    }

    if (!fs.lstatSync(realPath).isFile())
      throw new Error(`is not a file: ${path}`);
    if (this.opts.regexp)
      if (!this.testRegexp(path))
        throw new Error(
          `filename (${ParseFilenameViaCompgen.getFilePart(path)}) `
          + `does not match regexp (${this.regexpFilename})`);
    return path;
  }
  hint(){
    if (this.opts._noFiles)
      return 'Directoryname';
    else 
      return 'Filename';
  }
}
ParseFilenameViaCompgen.defaultOpts={
  _noFiles:false, // to turn this into a directory selector instead of file selector
  regexp:null, 
  compOpts:{
    bashdefault:false,
    default:false,
    dirnames:false,
    filenames:true,
    noquote:false,
    nosort:false,
    nospace:true,
    plusdirs:true,
  }
};
Object.freeze(ParseFilenameViaCompgen.defaultOpts);

class ParseDirectorynameViaCompgen extends ParseFilenameViaCompgen {
  constructor(){
    let opts={...ParseFilenameViaCompgen.defaultOpts};
    opts._noFiles=true;
    super(opts);
  }
  // inherit everything
}

class ParseViaCompgen extends ParseToken {
  constructor(opts=ParseViaCompgen.defaultOpts){
    super();
    this.opts={...ParseViaCompgen.defaultOpts,...opts};
    this.opts.compgenArgs = this.opts.compgenArgs.slice();
    this.opts.compOpts = {...ParseViaCompgen.defaultOpts.compOpts};
    if (opts.compOpts)
      assignCompOpts(this.opts.compOpts,opts.compOpts);
    if (this.opts.regexp && !(this.opts.regexp instanceof RegExp))
      throw new Error(`${this.opts.regexp} is not instanceof RegExp`);
  }
  completion(partial){
    let cands=spawnCompgen(this.CompgenArgs, partial);
    if (this.regexp)
      cands.filter(this.regexp.test.bind(this.regexp));
    return {tokens:cands,compOpts:this.opts.compOpts};
  }
  parse(token){
    if (!this.regexp.test(token))
      throw new Error(`token (${token}) does not satisfy regexp ${this.regexp}`);
    let cands=spawnCompgen(this.CompgenArgs, token);
    if (!cands.includes(token))
      throw new Error(
        `token (${token}) is not among those returned by compgen ${this.compgenArgs}`);
    return token;
  }
  hint(){
    if (!this.hint)
      return this.compgenArgs.join(' ');
    else
      return this.hint;
  }
}
ParseViaCompgen.defaultOpts={
  hint:null,
  regexp:null, 
  compgenArgs:[],
  compOpts:defaultCompOpts(),
};
Object.freeze(ParseViaCompgen.defaultOpts);

exports.defaultCompOpts=defaultCompOpts;
exports.assignCompOpts=assignCompOpts;
exports.ParseToken=ParseToken;
exports.ParseInt=ParseInt;
exports.ParseBigInt=ParseBigInt;
exports.ParseFloat=ParseFloat;
exports.ParseFilenameViaCompgen=ParseFilenameViaCompgen;
exports.ParseDirectorynameViaCompgen=ParseDirectorynameViaCompgen;
exports.ParseViaCompgen=ParseViaCompgen;
