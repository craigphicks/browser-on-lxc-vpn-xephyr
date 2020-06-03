'strict';

const fs = require('fs');
const cp = require('child_process');
//const { execBashScript } = require('./exec-bash-script.js');

async function loggerSync(m){
  try {
    var str=`logger -t ${process.argv0} -- ${m}`;
    cp.execSync(str);
  } catch (e) {
    console.error(`Error when executing ${str}, ${e.message}`);
  }
}


// eslint-disable-next-line no-unused-vars
function parsePartialMatch(partial,token){
  return partial.length<=token.length
    && partial==token.slice(0,partial.length);
}

class ParseToken {
  constructor(){}
  parse(w){ return w;}
  // eslint-disable-next-line no-unused-vars
  completion(w) { return []; }
  // eslint-disable-next-line no-unused-vars
  hint(w){ return null; }
}

class ParseInt extends ParseToken {
  constructor(){super();}
  parse(w){ 
    if (!(/^-?\d+$/.test(w)) || isNaN(w))
      throw new Error(`not a valid Integer: ${w}`);
    let n = Number(w);
    if (n<Number.MIN_SAFE_INTEGER || n>Number.MAX_SAFE_INTEGER)
      throw new Error(`Integer magnitude too large ${w}`);
    return Number(w);
  }
  hint(){ return 'Integer'; }
}
class ParseBigInt extends ParseToken {
  constructor(){super();}
  parse(w){ 
    if (!(/^-?\d+$/.test(w)))
      throw new Error(`not a valid BigInt: ${w}`);
    // eslint-disable-next-line no-undef
    return BigInt(w);
  }
  hint(){ return 'BigInt'; }
}

class ParseFloat extends ParseToken {
  constructor(){super();}
  parse(w){ 
    if (isNaN(w))
      throw new Error(`not an valid Float: ${w}`);
    let n = Number(w);
    // Beware!
    // Number.MAX_VALUE+1 > Number.MAX_VALUE -> false
    // Number.MAX_VALUE*2 > Number.MAX_VALUE -> true
    if (n<Number.MIN_VALUE || n>Number.MAX_VALUE)
      throw new Error(`float magnitude too large ${w}`);
    return Number(w);
  }
  hint(){ return 'Float'; }
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


/////////////////////////////////////
// For details on compgen see
// https://www.gnu.org/software/bash/manual/html_node/Programmable-Completion-Builtins.html
// #Programmable-Completion-Builtins
class ParseFilenameViaCompgen extends ParseToken {
  constructor(opts=ParseFilenameViaCompgen.defaultOpts){
    super();
    this.opts={...ParseFilenameViaCompgen.defaultOpts};
    if (opts._noFiles)
      this.opts._noFiles=true;
    if (opts.compOpts){
      if (typeof opts.compOpts=='string'){
        if (opts.compOpts=='disable')
          this.opts.compOpts=null;
        else 
          throw new Error(`${opts.compOpts} is not a valid string value `
            + `for opt.compOpts, must be 'disable' or an object with options`);
      } else {
        for (const k of Object.keys(opts.compOpts))
          if (Object.keys(this.opts.compOpts).includes(k))
            this.opts.compOpts[k]=!!opts.compOpts[k];
          else 
            throw new Error(`${k} is not a valid compopt option`);
      }
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
  complete(partial){
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
      return 'Directory';
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

class ParseDirectorynameViaCompgen extends ParseFilenameViaCompgen {
  constructor(){
    let opts={...ParseFilenameViaCompgen.defaultOpts};
    opts._noFiles=true;
    super(opts);
  }
  // inherit everything
}

class ParseViaCompgen extends ParseToken {
  constructor(compgenArgs, regexp, hint=null){
    super();
    this.compgenArgs=compgenArgs;
    this.hint=hint;
    if (regexp instanceof RegExp)
      this.regexp=regexp;
    else 
      throw new Error(`${regexp} is not instanceof RegExp`);
  }

  complete(partial){
    let cands=spawnCompgen(this.CompgenArgs, partial);
    if (this.regexp)
      cands.filter(this.regexp.test.bind(this.regexp));
    return cands;
  }
  parse(token){
    let cands=spawnCompgen(this.CompgenArgs, token);
    if (!cands.includes(token))
      throw new Error(`${token} is not a valid token`);
    return token;
  }
  hint(){
    if (!this.hint)
      return this.compgenArgs.join(' ');
    else
      return this.hint;
  }
}

exports.ParseToken=ParseToken;
exports.ParseInt=ParseInt;
exports.ParseBigInt=ParseBigInt;
exports.ParseFloat=ParseFloat;
exports.ParseFilenameViaCompgen=ParseFilenameViaCompgen;
exports.ParseDirectorynameViaCompgen=ParseDirectorynameViaCompgen;
exports.ParseViaCompgen=ParseViaCompgen;
