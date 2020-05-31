'strict';

const fs = require('fs');


function ParsePartialMatch(partial,token){
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


class ParseDirectory extends ParseToken {
  constructor(opts=ParseDirectory.defaultOpts){
    super();
    this.opts={...ParseDirectory.defaultOpts, ...opts};
  }
  parse(w){
    let dirpath = this.opts.prefix+w;
    if (fs.existsSync(dirpath))
      throw new Error(`does not exist: ${dirpath}`);
    if (!fs.lstatSync(dirpath).isDirectory())
      throw new Error(`is not a directory: ${dirpath}`);
    if (this.opts.returnWithPrefix)
      return dirpath;
    else return w; 
  }
  completion(w) {
    function pref(x){ return this.opts.prefix+x; }
    function removePrefix(x) {
      return x.slice(this.opts.prefix.length);
    }
    //let dirpath = this.opts.prefix+w;
    let candidates=[];
    let ludir=null,partial='';
    //if (fs.existsSync(pref(w)) && fs.lstatSync(pref(w)).isDirectory()){
    //  candidates.push(w);
    //  ludir=pref(w);
    //} else 
    {
      let parts=ludir.split('/');
      partial = parts.splice(-1,1);
      ludir = parts.join('/');
    }
    if (!fs.existsSync(ludir) || !fs.lstatSync(ludir))
      throw new Error(`(${ludir}) is not a valid directory`);
    let dirent = fs.readdirSync(ludir,{withFileTypes:true});
    //let dirent = dir.readSync();
    for (const d of dirent){
      if (d.isDirectory())
        if (removePrefix(d))
          candidates.push(removePrefix(d));
    }
    return candidates;
  }
  hint(){ return super.hint() || 'Directory'; }
}
ParseDirectory.defaultOpts={
  prefix:'',
  returnWithPrefix:true
};

class ParseFile extends ParseToken {
  constructor(opts=ParseFile.defaultOpts){
    super();
    this.opts={...ParseFile.defaultOpts, ...opts};
  }
  parse(w){
    let path = this.opts.prefix+w;
    if (fs.existsSync(path))
      throw new Error(`does not exist: ${path}`);
    if (!fs.lstatSync(dirpath).isFile())
      throw new Error(`is not a file: ${path}`);
    if (this.opts.returnWithPrefix)
      return path;
    else return w; 
  }
  completion(w) {
    function pref(x){ return this.opts.prefix+x; }
    function removePrefix(x) {
      return x.slice(this.opts.prefix.length);
    }
    function addBackslash(x) {
      if (x && x[x.length-1]!='/')
        x+='/';
      return x;
    }
    //let dirpath = this.opts.prefix+w;
    let candidates=[];
    let ludir=null,partial='';
    if (fs.existsSync(pref(w)) && fs.lstatSync(pref(w)).isDirectory()){
      let cand=removePrefix(addBackslash(pref(w)));
      candidates.push(cand);
      ludir=addBackslash(pref(w));
    } else {      
      let parts=ludir.split('/');
      partial = parts.splice(-1,1);
      ludir = addBackslash(parts.join('/'));
    }
    if (!fs.existsSync(ludir) || !fs.lstatSync(ludir).isDirectory())
      throw new Error(`(${ludir}) is not a valid directory`);
    let dirent = fs.readdirSync(ludir,{withFileTypes:true});
    for (const d of dirent){
      if (d.isDirectory()){
        if (removePrefix(addBackslash(d.name)))
          candidates.push(removePrefix(addBackslash(d.name)));
      } else if (d.isFile()) {
        if (!this.opts.filenameRegexp
          || this.opts.filenameRegexp.test(d.name))
          if (removePrefix(d.name))
            candidates.push(removePrefix(d.name));
      }
    }
    return candidates;
  }
  hint(){ 
    let r=super.hint();
    if (!r){
      if (!this.opts.filenameRegexp)
        return "File";
      else 
        return `File regexp:${this.opts.filenameRegexp.toString()}`; 
    }
  }
}
ParseFile.defaultOpts={
  prefix:'',
  returnWithPrefix:true,
  filenameRegexp:null,
};

