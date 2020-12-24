'strict';

const {   
  SpawnCmdParams,
} = require('./class-defs.js');
const { DefaultParams } = require('./default-params.js');

const postInitScript=`\
export PATH="$HOME/.local/bin:$PATH"
sudo apt-get -qq -y install pulseaudio dbus-x11 openbox || exit 10
sudo apt-get -qq -y install chromium-browser || exit 20
`;

const serveScripts={
//  "wm": `\
//DISPLAY=:10 PULSE_SERVER=tcp:localhost:44713 openbox-session || exit 100
//`,
  "default":`\
  export QT_X11_NO_MITSHM=1
  export _X11_NO_MITSHM=1
  export _MITSHM=0
  DISPLAY=:10 PULSE_SERVER=tcp:localhost:44713 \
    openbox --startup chromium-browser || exit 150
`,
};


class ParamsChromiumNcb extends DefaultParams {
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
      {filename:null, text:serveScripts['default']},
      {
        detached:true, 
        noErrorOnCmdNonZeroReturn:false,
        assignToEnv:{DISPLAY:':2'}
      },
    )};
  }
}

exports.ParamsChromiumNcb = ParamsChromiumNcb;
//exports.FF_NCB_CONT_NAME = contName;
