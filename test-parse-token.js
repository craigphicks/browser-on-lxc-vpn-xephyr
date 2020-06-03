const pt = require('./parse-token.js');

async function writeStdOut(s){
  await new Promise((resolve,reject)=>{
    process.stdout.write(s,(e)=>{
      if (e) 
        reject(e);
      resolve(e);
    });  
  });
}

async function complete(partial){
  let pfn = new pt.ParseFilenameViaCompgen({regexp:/^.+\.js$/});
  let r = pfn.complete(partial);
  let strout='';
  if (Array.isArray(r) || !r.compOpts) {
    // array of tokens
    strout += ( r.join(' ') + '\n' ); // EOL necessary
    strout += '\n'; // empty second line for compopt options  
  } else {
    strout += ( r.tokens.join(' ') + '\n' ); // line with tokens
    strout += ( r.compOpts.join(' ') + '\n' ); // line with compopt options
  }
  await writeStdOut(strout);
}
async function parse(token){
  let pfn = new pt.ParseFilenameViaCompgen();
  let r = pfn.parse(token);
  await writeStdOut(r);
}

async function main_sub(){  
  switch (process.argv[2]){
  case 'completion':
    //if (process.argv[3]!=process.argv.length-4)
    //  throw new Error('something wrong');
    await complete(process.argv.slice(5));
    break;
  default:
    await parse(process.argv[2]);
  }
}

async function main(){
  try {
    await main_sub();
    //await writeStdOut("SUCCESS");
  } catch(e){
    await writeStdOut("\nFAILURE\n");
    await writeStdOut(e.message+'\n');
  }
}

main();