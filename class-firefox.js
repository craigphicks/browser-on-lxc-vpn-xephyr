'strict';

const {   
  SpawnCmdParams,
} = require('./class-defs.js');
const { DefaultParams } = require('./default-params.js');


const postInitScript=`\
export PATH="$HOME/.local/bin:$PATH"
sudo apt-get -qq -y install firefox pulseaudio
`;

const serveScript=`\
export PATH="$HOME/.local/bin:$PATH"
PULSE_SERVER=tcp:localhost:44713 firefox
`;

class ParamsFirefox extends DefaultParams {
  constructor(contName,shared,phoneHomePort)  {
    super(contName,shared,phoneHomePort);
    this.postInitScript.spawnCmdParams=new SpawnCmdParams(
      shared.sshProg(), 
      shared.sshArgs(contName,true),
      {filename:null,text:postInitScript},
      {detached:false, noErrorOnCmdNonZeroReturn:false}
    );
    this.serveScripts['default'] = { spawnCmdParams:new SpawnCmdParams(
      shared.sshProg(), 
      shared.sshArgs(contName,false),
      {filename:null, text:serveScript},
      {
        detached:true, 
        noErrorOnCmdNonZeroReturn:false,
      },
    )};
  }
}

exports.ParamsFirefox = ParamsFirefox;
