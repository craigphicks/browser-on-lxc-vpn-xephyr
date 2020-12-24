'strict';
const { DefaultParams } = require('./default-params.js');
//const { ParamsSagemath_v8, ParamsSagemath_v9 } = require('./class-sagemath.js');
const { ParamsSagemath_v9 } = require('./class-sagemath.js');
//const { ParamsTensorflowJupyter } = require('./class-tensorflow-jupyter.js');
const { ParamsFirefox} = require('./class-firefox.js');
const { ParamsFfNcb} = require('./class-ff-ncb.js');
const { ParamsChromiumNcb} = require('./class-chromium-ncb.js');
const { ParamsAnacTf } = require('./class-anac-tf.js');
const { ParamsAnacSafe } = require('./class-anac-safe.js');
const { ParamsVerda } = require('./class-verda.js');
const fs = require('fs');
const yaml = require('js-yaml');


class ContParams {
  constructor(shared,filename) {
    if (filename){
      Object.assign(this,
        yaml.safeLoad(fs.readFileSync(filename,'utf8')));
    } else {
      Object.assign(this,
        {
          "default" : new DefaultParams("default",shared,3000),
          "ff-ncb" : new ParamsFfNcb("ff-ncb",shared,3010),
          "chromium-ncb" : new ParamsChromiumNcb("chromium-ncb",shared,3011),
          "anac-safe" : new ParamsAnacSafe("anac-safe",shared,3015),
          "verda" : new ParamsVerda("verda",shared,3020),
        //"firefox" : new ParamsFirefox("firefox",shared,3010),
        //"sagemath-v9" : new ParamsSagemath_v9("sagemath-v9",shared,3025),
        //"anac-tf" : new ParamsAnacTf("anac-tf",shared,3040),
        });
    }
  }
  writeToFile(filename){
    let yml = yaml.safeDump(this,{lineWidth:999,skipInvalid:true,noRefs:true});
    fs.writeFileSync(filename,yml,'utf8');
  }
}

exports.ContParams = ContParams;