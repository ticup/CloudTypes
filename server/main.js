delete require.cache[require.resolve('../shared/Table.js')];
delete require.cache[require.resolve('../shared/State.js')];

var CloudTypeServer = require ('./CloudTypeServer');

exports.createServer = function (state) {
  return new CloudTypeServer(state);
};



exports.CloudType  = require('../shared/CloudType');
exports.CInt       = require('../shared/CInt').CInt;
exports.CString    = require('../shared/CString').CString;
exports.CSet       = require('../shared/CSet').Declaration;
exports.CDate      = require('../shared/CDate').CDate;


exports.Table      = require('../shared/Table').declare;
exports.Index      = require('../shared/Index').declare;
exports.Restricted = require('../shared/Restricted');