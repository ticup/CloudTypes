var CloudTypeServer = require ('./CloudTypeServer');


exports.createServer = function (state) {
  return new CloudTypeServer(state);
};

exports.CInt    = require('../shared/CInt').CInt;
exports.CString = require('../shared/CString').CString;
exports.CSet    = require('../shared/CSet').Declaration.declare;
exports.CDate   = require('../shared/CDate').CDate;

exports.Table = require('../shared/Table').declare;
exports.Index  = require('../shared/Index').declare;