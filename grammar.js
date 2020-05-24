'strict';
const assert=require('assert');

const symFin = Symbol('symFin');

class ParseMap extends Map {
  constructor(table) {
    super();
    assert(Array.isArray(table),'table must be an Array');
    for (const [k,v] of table){
      // k,v must satisfy one of 
      //   typeof k == 'string' && (v===symFin || v instanceof ParseMap)
      //   k is a function returning a ParseMap, v is null
      this.set(k,v);
    }
  }
}

class Grammar {
  constructor(args){
    this.args=args;
    this.state = {
      completed:[]
    };
    let table = [];
    for (const s of 
      [
        'xephyr','test-env','clip-xfer','config-ssh',
        'config-pulse-audio','show-ufw-rule','config-ufw-rule',  
        'delete-own-config-files'
      ]){
      table.push([s,symFin]);
    }
    table.push([this.__proto__.dynContainerNames.bind(this),null]);
    this.mapTop = new ParseMap(table);
  }
  dynContainerNames(){
    let table=[];
    for (let k of Object.keys(this.args.allParams))
    {
      let v = this.containerActions(k);
      table.push([k,v]);
    }
    return new ParseMap(table);
  }
  // eslint-disable-next-line no-unused-vars
  containerActions(contName){
    // TODO: let the contents of table depend upon the state of container 'contName'
    // TODO: flag handling
    let table=[];
    for (const [k,v] of 
      [
        ['init',symFin],
        ['post-init',symFin],
        ['serve',symFin],
        ['sshfs-mount',symFin],
        ['sshfs-unmount',symFin],
        ['git-restore',symFin],
        ['git-push',symFin],
      ]){
      table.push([k,v]);
    }
    return new ParseMap(table);
  }
  lateralExpansionLookup(w,parseMap){
    if (parseMap===symFin)
      return null;
    for (const [k,v] of parseMap) {
      if (typeof k == 'string'){
        if (w==k)
          return v;
      } else {
        let vv=this.lateralExpansionLookup(w,k());
        if (vv) // symFin or ParseMap instance
          return vv;
      } 
    }
    return null;
  }
  lateralExpansionCollectCandidates(w,parseMap,candidates=[]){
    if (parseMap===symFin)
      return candidates;
    // eslint-disable-next-line no-unused-vars
    for (const [k,v] of parseMap) {
      if (typeof k == 'string'){
        if (k.length>=w.length && w==k.substring(0,w.length))
          candidates.push(k);
      } else {
        this.lateralExpansionCollectCandidates(w,k(),candidates);
      } 
    }
    return candidates;
  }
  completion(cursorIndex,words){
    let completed=this.state.completed; // array of completed words
    // Loop inputs:  'words', 
    //      outputs: 'completed', partial', 'wordIndex', 'map'
    // Unmatched words remaining in 'words' do not cause an error
    // Invariant:   input 'words' == output concat of 'completed', ['partial'], 'words' 
    let wordIndex=-1;
    let nextMap=this.mapTop;
    let map = null;
    let w=null;
    while (words.length) {
      wordIndex++;
      map=nextMap;
      nextMap=null;
      w = words.shift();
      let v = this.lateralExpansionLookup(w,map);
      if (v) {
        completed.push(w);
        nextMap=v;
      } else {
        // map does NOT get updated
      }
      if (!v || v===symFin)
        break;
    } // while (words.length)
    // 'cursorIndex' depends whether the cursor is on the first space after the word, 
    // or the second space after the word, the latter indicating a request for next words. 
    
    if (cursorIndex < wordIndex || cursorIndex > wordIndex+1) {
      // TODO: consider handling these cases 
      return []; 
    }
    let partial='';
    if (cursorIndex==wordIndex){
      // treat last word as 'partial' even if it was a perfect match, map stays as is.
      // and collect all candidates beginning with w from map
      partial = w;
    } else if (cursorIndex==wordIndex+1) {
      if (!nextMap) {
        // ambiguous because there is no nextMap.  Do nothing. 
        // User should move cursor back to end of partial word
        return [];
      } else {
        partial='';
        map=nextMap;
      }
    }
    if (map===symFin) 
      return [];
    let candidates=this.lateralExpansionCollectCandidates(partial,map);
    return candidates;
  } // completion
} // class Grammar

function completion(index,words, args){
  let nextCandidates = new Grammar(args).completion(index,words);
  process.stdout.write(nextCandidates.join(' '));
}

exports.completion=completion;

