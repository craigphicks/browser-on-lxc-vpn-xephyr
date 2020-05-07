'strict';

const { ParamsDefault } = require('./class-defs.js');

class ParamsFirefox extends ParamsDefault {
  constructor(tz,phoneHomePort)  {
    super('firefox',tz);
    this.phoneHome.port = phoneHomePort;
    let opts = this.postInitScript.cmdOpts;
    opts.setStdinToText(`\
export PATH="$HOME/.local/bin:$PATH"
sudo apt-get -qq -o Dpkg::-D=0 install firefox pulseaudio | grep -v pack
`   );
    opts = this.serveScripts['default'].cmdOpts;
    opts.addPipeForX11();
    opts.addRPipe(44713,4713); // only works when pulse audo configured to read 4173 on host
    opts.setStdinToText(`\
export PATH="$HOME/.local/bin:$PATH"
PULSE_SERVER=tcp:localhost:44713 firefox
`);
  }
}

exports.ParamsFirefox = ParamsFirefox;
