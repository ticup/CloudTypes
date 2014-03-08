/**
 * Created by ticup on 08/03/14.
 */

// Test Example
////////////////
var CloudTypes = require('../../../server/main.js');

function declareThings(server) {
   var Thing1 = server.declare('Thing1', Table([{'key1': 'string'}], {'column1': 'CInt', 'column2': 'Thing1'}));
   var Thing2 = server.declare('Thing2', Table([{'key1': 'Thing1'}], {'column1': 'CInt', 'column2': 'Thing1'}));
   var Thing3 = server.declare('Thing3', Table([{'key1': 'Thing2'}], {'column1': 'CInt'}));
   var Thing4 = server.declare('Thing4', Table([], {'column1': 'Thing1', 'column2': 'Thing2', 'column3': 'Thing3'}));
   return server;
}

module.exports = declareThings; 