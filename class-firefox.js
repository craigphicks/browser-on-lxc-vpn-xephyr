'strict';

const {   
  sshConfigFileArgs,
  sshXDisplayArgs,
  sshAudioArgs,
  SpawnCmdParams,
  ParamsDefault 
} = require('./class-defs.js');

const postInitScript=`\
export PATH="$HOME/.local/bin:$PATH"
sudo apt-get -qq -y install firefox pulseaudio
`;

const serveScript=`\
export PATH="$HOME/.local/bin:$PATH"
PULSE_SERVER=tcp:localhost:44713 firefox
`;

const contName='firefox';
class ParamsFirefox extends ParamsDefault {
  constructor(tz,phoneHomePort)  {
    super(contName,tz);
    this.phoneHome.port = phoneHomePort;
    let opts = this.postInitScript.cmdOpts;
    opts.setStdinToText(`\
export PATH="$HOME/.local/bin:$PATH"
sudo apt-get -qq -y install firefox pulseaudio
`   );
    opts = this.serveScripts['default'].cmdOpts;
    opts.addPipeForX11();
    opts.addRPipe(44713,4713); // only works when pulse audo configured to read 4173 on host
    opts.setStdinToText(`\
export PATH="$HOME/.local/bin:$PATH"
PULSE_SERVER=tcp:localhost:44713 firefox
`);
    this.postInitScript.spawnCmdParams=new SpawnCmdParams(
      "ssh", 
      sshConfigFileArgs().concat([contName]),
      {filename:null,text:postInitScript},
      {detached:false, noErrorOnCmdNonZeroReturn:false}
    );
    this.serveScripts['default'].spawnCmdParams=new SpawnCmdParams(
      "ssh", 
      sshConfigFileArgs()
        .concat(sshXDisplayArgs())
        .concat(sshAudioArgs())
        .concat([contName]),
      {filename:null, text:serveScript},
      {detached:true, noErrorOnCmdNonZeroReturn:false}
    );
  }
}

exports.ParamsFirefox = ParamsFirefox;
