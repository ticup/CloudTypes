/**
 * Created by ticup on 18/03/14.
 */

// CloudTypes Grocery Example Server
////////////////////////////////////
var CloudTypes = require('../../../server/main.js');

function declare(server) {
  var Group   = server.declare('Group',   new CloudTypes.index([{name: 'CString', CloudTypes.CSet('SysUser')}));
  var Grocery = server.declare('Grocery', new CloudTypes.Index([{group: 'Group'}, {name: 'string'}], {toBuy: 'CInt'}));

  var MyGroups = server.view('MyGroups', 'Group', function (group, context) {
      if (group.get('users').contains(context.current_user)) {
         return true;
      }
   });

  server.revoke('ALL', 'Group', 'Guest');
  // server.deny('ALL', 'OtherGroups', 'Guest');
}

module.exports = declare;