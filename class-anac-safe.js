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

const sysdUnitFileText=`\
[Unit]
Description=openbox session systemd service.

[Service]
Type=simple
ExecStart=/usr/bin/env /usr/bin/openbox-session 
#Restart=always

[Install]
WantedBy=default.target
`;

const sysdEnvFileText=`\
PULSE_SERVER=tcp:localhost:44713
BROWSER=firefox
PATH=/home/ubuntu/anaconda3/bin:/home/ubuntu/anaconda3/condabin:$PATH
CONDA_EXE=/home/ubuntu/anaconda3/bin/conda
CONDA_PREFIX=/home/ubuntu/anaconda3
CONDA_PYTHON_EXE=/home/ubuntu/anaconda3/bin/python
OPENBOXD_SYSD_ENV=1
`;


const openboxEnvFileText=`\
export PULSE_SERVER=tcp:localhost:44713
export BROWSER=firefox
export PATH=/home/ubuntu/anaconda3/bin:/home/ubuntu/anaconda3/condabin:$PATH
export CONDA_EXE=/home/ubuntu/anaconda3/bin/conda
export CONDA_PREFIX=/home/ubuntu/anaconda3
export CONDA_PYTHON_EXE=/home/ubuntu/anaconda3/bin/python
export OPENBOX_ENV=1
`;
const openboxAutostartShText=`\
env
xsetroot -solid blue &
#/home/ubuntu/anaconda3/bin/jupyter notebook &
`;

function defaultServeScript(openboxService){

  return `\
source .bashrc || exit 10
export ORIGINAL_DISPLAY="$DISPLAY"
if [ -z "$DISPLAY" ] || [[ "$DISPLAY" == ":0" ]] ; then 
  export DISPLAY=:10
fi
export PULSE_SERVER=tcp:localhost:44713
export PATH=/home/ubuntu/anaconda3/bin:/home/ubuntu/anaconda3/condabin:$PATH
env
/home/ubuntu/anaconda3/bin/jupyter notebook stop 
RNDSTR=\`cat /dev/urandom | tr -dc 'a-zA-Z0-9' | fold -w 32 | head -n 1 | tr -d '\n'\`
JUPYTER_TOKEN=$RNDSTR /home/ubuntu/anaconda3/bin/jupyter notebook --no-browser &
systemctl --user start ${openboxService} || exit 20
firefox --no-remote http://localhost:8888/?token=$RNDSTR
##### will block here preventing pipe from disconnecting
systemctl --user stop ${openboxService} || exit 40
xsetroot -solid black
/home/ubuntu/anaconda3/bin/jupyter notebook stop 
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
      new SpawnCmdParams(
        shared.sshProg(), 
        shared.sshArgs(contName,true)
          .concat([
            'systemctl', '--user', 'enable',
            this.openboxSysd_serviceName
          ]),
        {},
        {detached:false, noErrorOnCmdNonZeroReturn:false}
      ),
      new SpawnCmdParams(
        shared.sshProg(), 
        shared.sshArgs(contName,true)
          .concat([
            'systemctl', '--user', 'disable',
            this.openboxSysd_serviceName
          ]),
        {},
        {detached:false, noErrorOnCmdNonZeroReturn:false}
      ),
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
        text:defaultServeScript(this.openboxSysd_serviceName)
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