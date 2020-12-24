'strict';

const {   
  SpawnCmdParams,
} = require('./class-defs.js');
const { DefaultParams } = require('./default-params.js');

const postInitScript=`\
curl -L https://raw.githubusercontent.com/tj/n/master/bin/n -o n || exit 10
sudo bash n lts || exit 20
npm install verdaccio || npm install verdaccio || exit 30
mkdir ~/.config/verdaccio || exit 40
cat << EOF > ~/.config/verdaccio/config.yaml
storage: ./storage
auth:
  htpasswd:
    file: ./htpasswd
uplinks:
  npmjs:
    url: https://registry.npmjs.org/
packages:
  '@*/*':
    access: $all
    publish: $authenticated
    proxy: npmjs
  '**':
    proxy: npmjs
logs:
  - {type: stdout, format: pretty, level: http}
EOF
./node_modules/.bin/verdaccio -i || exit 50
`;

const serveScripts={
//  "wm": `\
//DISPLAY=:10 PULSE_SERVER=tcp:localhost:44713 openbox-session || exit 100
//`,
  "default":`\
  ./node_modules/.bin/verdaccio --config $HOME/.config/verdaccio/config.yaml \
    &>verdaccio.log || exit 100
`,
};


//const contName='ff-ncb';
class ParamsVerda extends DefaultParams {
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
      ['-L','44873:127.0.0.1:4873'].concat(shared.sshArgs(contName,true)),
      {filename:null, text:serveScripts['default']},
      {
        detached:true, 
        noErrorOnCmdNonZeroReturn:false,
        assignToEnv:{DISPLAY:':2'}
      },
    )};
  }
}

exports.ParamsVerda = ParamsVerda;
//exports.FF_NCB_CONT_NAME = contName;
