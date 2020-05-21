'strict';

const { 
  SpawnCmdParams 
} = require('./class-defs.js');
const { DefaultParams } = require('./default-params.js');

const postInitScript= `\
export PATH="$HOME/.local/bin:$PATH"
sudo apt-get -qq -y install firefox pulseaudio || exit 10
[[ -f Anaconda3-2020.02-Linux-x86_64.sh ]] || \
  wget https://repo.anaconda.com/archive/Anaconda3-2020.02-Linux-x86_64.sh || exit 20
bash Anaconda3-2020.02-Linux-x86_64.sh -b || exit 30
export PATH="/home/ubuntu/anaconda3/bin:$PATH"
conda init || exit 40
source .bashrc || exit 50
conda upgrade -y -q anaconda || exit 60
pip install --upgrade tensorflow || exit 70
exit 0
`;
const serveScript=`\
export PATH="/home/ubuntu/anaconda3/bin:$PATH"
source .bashrc || exit 110
jupyter notebook stop 8888 2>&1 >/dev/null 
jupyter notebook stop 8889 2>&1 >/dev/null 
PULSE_SERVER=tcp:localhost:44713 BROWSER=firefox jupyter notebook || exit 120
`;

class ParamsAnacTf extends DefaultParams {
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
    //this.rsyncBackups[0].contDir = 'work/';
    //this.rsyncBackups[0].hostDir = `~/lxc-backup/${contName}/work/`;
    this.gits = {
      default: {
        repo: 'git@github.com:craigphicks/lxcserv_anac-tf_work.git', 
        contDir: 'work', // relative to container user home directory
      }
    };
  }
}

exports.ParamsAnacTf = ParamsAnacTf;