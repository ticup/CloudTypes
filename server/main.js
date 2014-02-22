var CloudTypeServer = require ('./CloudTypeServer');


exports.createServer = function (state) {
  return new CloudTypeServer(state);
};

exports.CInt    = require('../shared/CInt').CInt;
exports.CString = require('../shared/CString').CString;
exports.CSet    = require('../shared/CSet').Declaration;
exports.CDate   = require('../shared/CDate').CDate;

exports.Table = require('../shared/Table');
exports.Index  = require('../shared/Index');