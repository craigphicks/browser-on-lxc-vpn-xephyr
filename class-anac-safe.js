'strict';
const { 
  SpawnCmdParams 
} = require('./class-defs.js');
const { DefaultParams } = require('./default-params.js');

const postInitScript= `\
export PATH="$HOME/.local/bin:$PATH"
sudo apt-get -qq -y install tree x11-xserver-utils\
  firefox pulseaudio dbus-x11 openbox || exit 10
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
// eslint-disable-next-line no-unused-vars
const serveScript_defaultXXX=`\
export PATH="/home/ubuntu/anaconda3/bin:$PATH"
source .bashrc || exit 110
jupyter notebook stop 8888 2>&1 >/dev/null 
jupyter notebook stop 8889 2>&1 >/dev/null
export DISPLAY=:10 
export PULSE_SERVER=tcp:localhost:44713
export BROWSER=firefox
ps -aux | grep -v grep | grep openbox
if [[ $? ]] ; then  openbox-session || exit 115
jupyter notebook || exit 120
`;


const sysdUnitFileText=`\
[Unit]
Description=openbox session systemd service.

[Service]
Type=simple
ExecStart=/usr/bin/openbox-session 
#Restart=always

[Install]
WantedBy=default.target
`;

const sysdEnvFileText=`\
DISPLAY=:10
PULSE_SERVER=tcp:localhost:44713
BROWSER=firefox
PATH=/home/ubuntu/anaconda3/bin:/home/ubuntu/anaconda3/condabin:$PATH
CONDA_EXE=/home/ubuntu/anaconda3/bin/conda
CONDA_PREFIX=/home/ubuntu/anaconda3
CONDA_PYTHON_EXE=/home/ubuntu/anaconda3/bin/python
`;


const openboxEnvFileText=`\
export DISPLAY=:10
export PULSE_SERVER=tcp:localhost:44713
export BROWSER=firefox
export PATH=/home/ubuntu/anaconda3/bin:/home/ubuntu/anaconda3/condabin:$PATH
export CONDA_EXE=/home/ubuntu/anaconda3/bin/conda
export CONDA_PREFIX=/home/ubuntu/anaconda3
export CONDA_PYTHON_EXE=/home/ubuntu/anaconda3/bin/python
`;
const openboxAutostartShText=`\
xsetroot -solid blue &
/home/ubuntu/anaconda3/bin/jupyter notebook &
`;

function systemctlStartServiceText(serviceName){
  return `\
systemctl --user is-active ${serviceName} \
|| systemctl --user start ${serviceName} || exit 10
`;
}


// All the user services will be placed in ~/.config/systemd/user/. 
// If you want to run services on first login, execute systemctl --user enable service

// For users with a $HOME directory, 
// create a .conf file in the ~/.config/environment.d/ directory 
// with lines of the form NAME=VAL. Affects only that user's user unit. 

// On log in, openbox-session will run the ~/.config/openbox/autostart.sh script 
// if it exists, 
// and will run the system-wide script /etc/xdg/openbox/autostart.sh otherwise. 

class ParamsAnacSafe extends DefaultParams {
  constructor(contName,shared,phoneHomePort)  {
    super(contName,shared,phoneHomePort);

    this.openboxSysd_serviceName='openboxd.service';

    this.postInitScript.copyFiles=[
      {
        src: {text:sysdUnitFileText},
        dst: {
          dir:`.config/systemd/user`,
          filename:`${this.openboxSysd_serviceName}`,
          options:{mode:'0o644'}
        }
      },{
        src:{text:openboxEnvFileText},
        dst: {
          dir:`.config/openbox`,
          filename: 'environment',
          options:{mode:'0o644'}
        }
      },{
        src:{text:sysdEnvFileText},
        dst: {
          dir:`.config/environment.d`,
          filename: `${this.openboxSysd_serviceName}.conf`,
          options:{mode:'0o644'}
        }
      },{
        src:{text:openboxAutostartShText},
        dst: {
          dir:`.config/openbox`,
          filename: 'autostart',
          options:{mode:'0o644'}
        }
      }

    ];
    

    this.postInitScript.spawnCmdParams= [
      new SpawnCmdParams(
        shared.sshProg(), 
        shared.sshArgs(contName,true),
        {filename:null,text:postInitScript},
        {detached:false, noErrorOnCmdNonZeroReturn:false}
      ),
      // new SpawnCmdParams(
      //   shared.sshProg(), 
      //   shared.sshArgs(contName,true)
      //     .concat([
      //       'systemctl', '--user', 'enable',
      //       this.openboxSysd_serviceName
      //     ]),
      //   {},
      //   {detached:false, noErrorOnCmdNonZeroReturn:false}
      // ),
    ];
    // this.serveScripts['default'] = { spawnCmdParams:new SpawnCmdParams(
    //   shared.sshProg(), 
    //   shared.sshArgs(contName,false),
    //   {filename:null, text:serveScript_default},
    //   {
    //     detached:true, 
    //     noErrorOnCmdNonZeroReturn:false,
    //     assignToEnv:{DISPLAY:':2'}
    //   },
    // )};
    this.serveScripts['default'] = { spawnCmdParams:new SpawnCmdParams(
      shared.sshProg(), 
      shared.sshArgs(contName,false),
      {
        filename:null, 
        text:systemctlStartServiceText(this.openboxSysd_serviceName)
      },
      {
        detached:true, 
        noErrorOnCmdNonZeroReturn:false,
        assignToEnv:{DISPLAY:':2'}
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

exports.ParamsAnacSafe = ParamsAnacSafe;