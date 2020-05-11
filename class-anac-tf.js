'strict';

const { ParamsDefault } = require('./class-defs.js');

class ParamsAnacTf extends ParamsDefault {
  constructor(tz,phoneHomePort)  {
    super('tensorflow-jupyter',tz);
    this.phoneHome.port = phoneHomePort;
    let opts = this.postInitScript.cmdOpts;
    opts.setStdinToText(`\
export PATH="$HOME/.local/bin:$PATH"
sudo apt-get -qq -y install firefox pulseaudio || exit 10
[[ -f Anaconda3-2020.02-Linux-x86_64.sh ]] || \
  wget https://repo.anaconda.com/archive/Anaconda3-2020.02-Linux-x86_64.sh || exit 20
bash Anaconda3-2020.02-Linux-x86_64.sh -b || exit 30
export PATH="/home/ubuntu/anaconda3/bin:$PATH"
conda init || exit 40
source .bashrc || exit 50
env
conda upgrade -y -q anaconda || exit 60
pip install --upgrade tensorflow || exit 70
exit 0
`   );
    opts = this.serveScripts['default'].cmdOpts;
    opts.addPipeForX11();
    opts.addRPipe(44713,4713); // only works when pulse audo configured to read 4173 on host
    opts.setStdinToText(`\
export PATH="/home/ubuntu/anaconda3/bin:$PATH"
source .bashrc || exit 110
env
PULSE_SERVER=tcp:localhost:44713 BROWSER=firefox jupyter notebook || exit 120
`);
  }
}

exports.ParamsAnacTf = ParamsAnacTf;