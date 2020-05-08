'strict';

const { ParamsDefault } = require('./class-defs.js');

class ParamsSagemath_v8 extends ParamsDefault {
  constructor(tz,phoneHomePort)  {
    super('sagemath-v8',tz);
    this.phoneHome.port = phoneHomePort;
    let opts = this.postInitScript.cmdOpts;
    opts.setStdinToText(`\
export PATH="$HOME/.local/bin:$PATH"
sudo apt-get -qq -y install firefox pulseaudio sagemath || exit 10
`   );
    opts = this.serveScripts['default'].cmdOpts;
    opts.addPipeForX11();
    opts.addRPipe(44713,4713); // only works when pulse audio configured to read 4173 on host
    opts.setStdinToText(`\
export PATH="$HOME/.local/bin:$PATH"
PULSE_SERVER=tcp:localhost:44713 BROWSER=firefox sage -n jupyter
`);
  }
}

class ParamsSagemath_v9 extends ParamsDefault {
  constructor(tz,phoneHomePort)  {
    super('sagemath-v9',tz);
    this.phoneHome.port = phoneHomePort;
    let opts = this.postInitScript.cmdOpts;
    opts.setStdinToText(`\
export PATH="$HOME/.local/bin:$PATH"
sudo apt-get -qq -y install firefox pulseaudio || exit 10
mkdir sagedir
cd sagedir
wget files.sagemath.org/linux/64bit/sage-9.0-Ubuntu_18.04-x86_64.tar.bz2 || exit 20
tar -xvzf sage-9.0-Ubuntu_18.04-x86_64.tar.bz2 || exit 30
`   );
    opts = this.serveScripts['default'].cmdOpts;
    opts.addPipeForX11();
    opts.addRPipe(44713,4713); // only works when pulse audio configured to read 4173 on host
    opts.setStdinToText(`\
export PATH="$HOME/.local/bin:$PATH"
cd sagedir
PULSE_SERVER=tcp:localhost:44713 BROWSER=firefox sage -n jupyter
`);
  }
}

exports.ParamsSagemath_v8 = ParamsSagemath_v8;
exports.ParamsSagemath_v9 = ParamsSagemath_v9;
