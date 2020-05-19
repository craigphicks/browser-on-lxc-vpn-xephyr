'strict';
const { ParamsDefault } = require('./class-defs.js');
//const { ParamsSagemath_v8, ParamsSagemath_v9 } = require('./class-sagemath.js');
const { ParamsSagemath_v9 } = require('./class-sagemath.js');
//const { ParamsTensorflowJupyter } = require('./class-tensorflow-jupyter.js');
const { ParamsFirefox} = require('./class-firefox.js');
const { ParamsFfNcb} = require('./class-ff-ncb.js');
const { ParamsAnacTf } = require('./class-anac-tf.js');
const fs = require('fs');

class DefaultSettings {
  constructor() {
    let tz="";
    try { 
      tz = fs.readFileSync(`/etc/timezone`,'utf8');
      tz = tz.slice(0,-1); // gte rid of EOL
    } catch (e) {
      console.error(`WARNING: couldn't read user timezone, ${e}`);
    }
    Object.assign(this,
      {
        shared : {
          logdir: "./log",
          sshArgs : {
            prog : 'ssh',
            args : [
              '-o','UserKnownHostsFile=/dev/null',  
              '-o','StrictHostKeyChecking=no',
            ],
          }, // currently not used
          sshfsMountArgs : {
            prog : 'sshfs',
            args : [
              '-o','UserKnownHostsFile=/dev/null',  
              '-o','StrictHostKeyChecking=no',
              '-o','idmap=user', 
              '-o','reconnect',
            ],
          }, 
          sshfsUnmountArgs : {
            prog : 'fusermount',
            args : [
              '-u',
            ],
          },
          //   "xephyr": Xephyr -ac -screen 1920x1200 -br -reset -zap :2
          xephyrArgs: {
            prog: 'Xephyr',
            args:[
              '-ac', '-screen', '1920x1200', '-br', '-reset', '-zap', ':2'
            ]
          }

        },
        "default" : new ParamsDefault("default",tz,3000),
        "firefox" : new ParamsFirefox(tz,3010),
        "ff-ncb" : new ParamsFfNcb(tz,3015),
        //"sagemath-v8" : new ParamsSagemath_v8(tz,3020),
        "sagemath-v9" : new ParamsSagemath_v9(tz,3025),
        //"tensorflow-jupyter" : new ParamsTensorflowJupyter(tz,3030),
        "anac-tf" : new ParamsAnacTf(tz,3040),
      });
  }
}

exports.DefaultSettings = DefaultSettings;