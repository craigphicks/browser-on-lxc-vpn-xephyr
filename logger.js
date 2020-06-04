
const cp = require('child_process');

function loggerSync(m){
  try {
    var str=`logger -t ${process.argv0} -- ${m}`;
    cp.execSync(str);
  } catch (e) {
    console.error(`Error when executing ${str}, ${e.message}`);
  }
}
exports.loggerSync=loggerSync;
