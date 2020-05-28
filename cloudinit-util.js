'strict';

const yaml = require('js-yaml');
const fs = require('fs');
const { syscmd,spawnCmd } = require('./class-defs.js');

const cloudInitUserDataDefault = {
  // just a few options necessary for basic operation
  // More options:
  // https://cloudinit.readthedocs.io/en/latest/topics/modules.html
  packages:[],
  package_upate: true,
  ssh_authorized_keys: [], // for the default user, not root
  write_files:[], //
  locale: process.env.LANG,
  timezone:'',
  runcmd:[], // to run as user, 'sudo -u ubuntu -H ..'
};

// eslint-disable-next-line no-unused-vars
const writeFileDefaultOptions = {
  path:"", // (string) Path of the file to which content is decoded and written
  content:"", //(string) Optional content to write to the provided path. When content is present and encoding is not ‘text/plain’, decode the content prior to writing. Default: ‘’
  owner:"root:root", //(string) Optional owner:group to chown on the file. Default: root:root
  permissions:"0644", //(string) Optional file permissions to set on path represented as an octal string ‘0###’. Default: ‘0644’
  encoding:'text/plain',// (string) Optional encoding type of the content. Default is text/plain and no content decoding is performed. Supported encoding types are: gz, gzip, gz+base64, gzip+base64, gz+b64, gzip+b64, b64, base64.
  append:false // (boolean) Whether to append content to existing file if path exists. Default: false.
};

class CloudInitUserData {
  static _readUsersTimezone() {
    let tztmp = fs.readFileSync(`/etc/timezone`,'utf8');
    return tztmp.slice(0,-1); // gte rid of EOL
  }
  constructor(ci=cloudInitUserDataDefault) {
    Object.assign(this,ci);
    try {
      this.timezone = this._readUsersTimezone();
    // eslint-disable-next-line no-empty
    } catch(e){}
  }
  addWriteFile(path,content,owner,permission='0644'){
    this.write_files.push({
      path:path,content:content,
      owner:`${owner}:${owner}`,permission:permission
    });
  }
  addRuncmd(cmd,username=null){
    let pre = [];
    if (username)
      pre = ['sudo', '-u', `${username}`, `-H` ];
    if (Array.isArray(cmd))
      this.runcmd.push(pre.concat(cmd));
    else {
      if (pre)
        cmd = pre.join(' ')+' '+cmd;
      this.runcmd.push(cmd); 
    }
  }
}


function cloudInitUserDataYamlPrefixString(){
  return "#cloud-config\n";
}

function cloudInitUserDataToYaml(ci){
  return cloudInitUserDataYamlPrefixString()  
  + yaml.safeDump(ci,{lineWidth:999,skipInvalid:true,noRefs:true});
}
function yamlToCloudInitUserData(yml){
  return yaml.safeLoad(yml);
}

function writeCloudInitUserDataToFile(ci,fn){
  fs.writeFile(fn,cloudInitUserDataToYaml(ci));
}
function readCloudInitUserDataFromFile(fn){
  return yamlToCloudInitUserData(fs.readFile(fn));  
}
function setLXCProfileFromCloudInitUserDataFile(profileName,ciFileName){
  syscmd(`lxc profile set ${profileName} user.user-data - < ${ciFileName}`);
}
async function setLXCProfileFromCloudInitUserData(profileName,ci, showOutput=false){
  let op = showOutput ? 'inherit':'ignore';
  return await new spawnCmd(
    'lxc',[
      'profile', 'set', `${profileName}`, 'user.user-data', '-',
    ],
    { 
      args: [ 'pipe',op,op ], 
      after : [ cloudInitUserDataToYaml(ci),null,null]
    }
  );
}

exports.writeCloudInitUserDataToFile=writeCloudInitUserDataToFile;
exports.readCloudInitUserDataFromFile=readCloudInitUserDataFromFile;
exports.setLXCProfileFromCloudInitUserDataFile=setLXCProfileFromCloudInitUserDataFile;
exports.setLXCProfileFromCloudInitUserData=setLXCProfileFromCloudInitUserData;
exports.CloudInitUserData=CloudInitUserData;