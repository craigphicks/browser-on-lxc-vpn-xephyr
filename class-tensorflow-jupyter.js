'strict';

const { ParamsDefault } = require('./class-defs.js');

class ParamsTensorflowJupyter extends ParamsDefault {
  constructor(tz,phoneHomePort)  {
    super('tensorflow-jupyter',tz);
    this.phoneHome.port = phoneHomePort;
    let opts = this.postInitScript.cmdOpts;
    opts.setStdinToText(`\
export PATH="$HOME/.local/bin:$PATH"
sudo apt-get -qq -y install firefox pulseaudio || exit 10
sudo apt-get -qq -y install python3-dev python3-distutils jupyter || exit 15
[[ -f get-pip.py ]] || wget https://bootstrap.pypa.io/get-pip.py || echo 20 
which pip || sudo python3 get-pip.py || exit 25
pip install jupyterlab || exit 30
pip install jupyter_http_over_ws || exit 40
jupyter serverextension enable --py jupyter_http_over_ws || exit 50
pip install matplotlib || exit 60
pip install setuptools --upgrade || exit 70
pip install tensorflow || exit 80
sudo ln -s /usr/bin/python3 /usr/bin/python || exit 90
exit 0
`   );
    opts = this.serveScripts['default'].cmdOpts;
    opts.addPipeForX11();
    opts.addRPipe(44713,4713); // only works when pulse audo configured to read 4173 on host
    opts.setStdinToText(`\
export PATH="$HOME/.local/bin:$PATH"
PULSE_SERVER=tcp:localhost:44713 BROWSER=firefox jupyter notebook
`);
  }
}

exports.ParamsTensorflowJupyter = ParamsTensorflowJupyter;