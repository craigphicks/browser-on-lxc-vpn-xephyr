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
sudo apt-get -qq -y install \
  firefox pulseaudio dbus-x11 xserver-xephyr openbox || exit 10
`;

const serveScripts={
  "wm": `\
DISPLAY=:10 PULSE_SERVER=tcp:localhost:44713 openbox-session || exit 100
`,
  "default":`
#export PATH="$HOME/.local/bin:$PATH"
DISPLAY=:10 PULSE_SERVER=tcp:localhost:44713 firefox || exit 150
`,
};


const contName='ff-ncb';
class ParamsFfNcb extends ParamsDefault {
  constructor(tz,phoneHomePort)  {
    super(contName,tz);
    this.phoneHome.port = phoneHomePort;
    this.postInitScript.spawnCmdParams=new SpawnCmdParams(
      "ssh", 
      sshConfigFileArgs().concat([contName]),
      {filename:null,text:postInitScript},
      {detached:false, noErrorOnCmdNonZeroReturn:false}
    );
    this.serveScripts['wm'] = {spawnCmdParams:new SpawnCmdParams(
      "ssh", 
      sshConfigFileArgs()
        .concat(sshXDisplayArgs())
        .concat(sshAudioArgs())
        .concat([contName]),
      {filename:null, text:serveScripts['wm']},
      {
        detached:true, 
        noErrorOnCmdNonZeroReturn:false,
        assignToEnv:{DISPLAY:':2'}
      },
      {env:(Object.assign({},process.env)).DISPLAY=':2'}
    )};
    this.serveScripts['default'] = { spawnCmdParams:new SpawnCmdParams(
      "ssh", 
      sshConfigFileArgs()
        .concat(sshXDisplayArgs())
        .concat(sshAudioArgs())
        .concat([contName]),
      {filename:null, text:serveScripts['default']},
      {
        detached:true, 
        noErrorOnCmdNonZeroReturn:false,
        assignToEnv:{DISPLAY:':2'}
      },
    )};
  }
}

exports.ParamsFfNcb = ParamsFfNcb;
exports.FF_NCB_CONT_NAME = contName;
