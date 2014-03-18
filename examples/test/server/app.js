/**
 * Created by ticup on 08/03/14.
 */

// Test Example
////////////////
var CloudTypes = require('../../../server/main.js');
var Table = CloudTypes.Table;

function declareThings(server) {
   var Thing1 = server.declare('Thing1', Table([{'key1': 'string'}], {'column1': 'CInt', 'column2': 'CString', 'column3': 'Thing1'}));
   var Thing2 = server.declare('Thing2', Table([{'key1': 'Thing1'}], {'column1': 'CInt', 'column2': 'Thing1'}));
   var Thing3 = server.declare('Thing3', Table([{'key1': 'Thing2'}], {'column1': 'CInt'}));
   var Thing4 = server.declare('Thing4', Table([], {'column1': 'Thing1', 'column2': 'Thing2', 'column3': 'Thing3'}));
   var LittleThing1 = server.view('LittleThing1', 'Thing1', function (thing, context) {
      if (thing.get('column1').get() < 5) {
         return true;
      }
   });
   var t1 = Thing1.create('thing1');
   Thing1.create('thing11');
   Thing1.create('thing111');
   var t2 = Thing2.create(t1);
   var t3 = Thing3.create(t2);
   var t4 = Thing4.create();
   var t40 = Thing4.create();
   t1.set('column1', 10)
     .set('column2', 'foo')
     .set('column3', t1);
   t2.set('column2', t1);
   t4.set('column1', t1);
   t4.set('column2', t2);
   t4.set('column3', t3);
   t40.set('column1', t1);
   return server;
}

module.exports = declareThings; 