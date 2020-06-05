/* eslint-disable no-unused-vars */
'strict';

const { 
  parse, completion, symbols, loggerSync 
} = require('./parse-cli.js');

const pt = require('./parse-token.js');

// create a table

var tableConfig=null;
var tableFile={
  recurse:[
    ['new-clout-init', {
      positionals: [
        new pt.ParseString('name'),        
      ]
    }],
  ]
};
var tableCont={
  recurse:[
    ['init', {
      positionals: [
        new pt.ParseFilenameViaCompgen({regexp:/^[.]+.ci.yml$/}),        
      ]
    }],
    ['exec-script', {
      positionals: [
        new pt.ParseString(),        
      ]
    }]
  ]
};


var rootTable={
  flags:[
    ['--conf', new pt.ParseFilenameViaCompgen(/^lxcu[^\s.]+.conf$/)],
    ['--log',0],
  ],
  recurse: [
    ['config', tableConfig ],
    ['file', tableFile ],
    ['cont', tableCont ],
  ]
};

//lxcutil.conf