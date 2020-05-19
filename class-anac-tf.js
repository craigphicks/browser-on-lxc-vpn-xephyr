'strict';

const { 
  ParamsDefault, 
  sshConfigFileArgs,
  sshXDisplayArgs,
  sshAudioArgs,
  SpawnCmdParams 
} = require('./class-defs.js');

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

const contName='anac-tf';
class ParamsAnacTf extends ParamsDefault {
  constructor(tz,phoneHomePort)  {
    super(contName,tz);
    this.phoneHome.port = phoneHomePort;
    let opts = this.postInitScript.cmdOpts;
    opts.setStdinToText(postInitScript);
    opts = this.serveScripts['default'].cmdOpts;
    opts.addPipeForX11();
    opts.addRPipe(44713,4713); // only works when pulse audo configured to read 4173 on host
    opts.setStdinToText(serveScript);
    ////
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
    this.rsyncBackups[0].contDir = 'work/';
    this.rsyncBackups[0].hostDir = `~/lxc-backup/${contName}/work/`;
    this.gits = {
      default: {
        repo: 'git@github.com:craigphicks/lxcserv_anac-tf_work.git', 
        contDir: 'work', // relative to container user home directory
      }
    };
  }
}

exports.ParamsAnacTf = ParamsAnacTf;